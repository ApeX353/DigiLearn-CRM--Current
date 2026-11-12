import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import * as argon2 from '@node-rs/argon2';
import { randomBytes, randomInt } from 'crypto';
import { NotificationsService } from '../notifications';
import { AccountSecurity } from './entities/account-security.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(AccountSecurity)
    private accountSecurityRepository: Repository<AccountSecurity>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Generate 2FA secret and QR code for a user
   */
  async generate2FASecret(userId: string): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity) {
      throw new BadRequestException('Account security record not found');
    }

    if (accountSecurity.two_factor_enabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    // Generate TOTP secret
    const totp = new OTPAuth.TOTP({
      issuer: 'DigiLearn School',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(
        OTPAuth.Secret.fromUTF8(randomBytes(20).toString('hex')).base32,
      ),
    });

    const secret = totp.secret.base32;

    // Generate QR code
    const otpauthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    // Generate backup codes
    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
      hashedBackupCodes.push(await argon2.hash(code));
    }

    // Save secret (but don't enable 2FA yet)
    accountSecurity.two_factor_secret = secret;
    accountSecurity.two_factor_backup_codes = hashedBackupCodes;
    accountSecurity.two_factor_enabled = false; // Will be enabled after verification

    await this.accountSecurityRepository.save(accountSecurity);

    return {
      secret,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Enable 2FA after verifying the code
   */
  async enable2FA(userId: string, code: string): Promise<void> {
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity) {
      throw new BadRequestException('Account security record not found');
    }

    if (accountSecurity.two_factor_enabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    if (!accountSecurity.two_factor_secret) {
      throw new BadRequestException(
        '2FA secret not generated. Call generate endpoint first',
      );
    }

    // Verify the code
    const isValid = this.verify2FACode(accountSecurity.two_factor_secret, code);

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    // Enable 2FA
    accountSecurity.two_factor_enabled = true;
    await this.accountSecurityRepository.save(accountSecurity);
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId: string, code: string): Promise<void> {
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity) {
      throw new BadRequestException('Account security record not found');
    }

    if (!accountSecurity.two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Verify the code (or backup code)
    const isValid = await this.verify2FA(userId, code);

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    // Disable 2FA
    accountSecurity.two_factor_enabled = false;
    accountSecurity.two_factor_secret = '';
    accountSecurity.two_factor_backup_codes = [];

    await this.accountSecurityRepository.save(accountSecurity);
  }

  /**
   * Verify 2FA code or backup code
   */
  async verify2FA(userId: string, code: string): Promise<boolean> {
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity || !accountSecurity.two_factor_enabled) {
      return false;
    }

    // Try to verify as TOTP code
    const isValidTOTP = this.verify2FACode(
      accountSecurity.two_factor_secret ?? '',
      code,
    );

    if (isValidTOTP) {
      return true;
    }

    // Try to verify as backup code
    if (accountSecurity.two_factor_backup_codes) {
      for (const hashedCode of accountSecurity.two_factor_backup_codes) {
        try {
          const isValidBackup = await argon2.verify(hashedCode, code);
          if (isValidBackup) {
            // Remove used backup code
            accountSecurity.two_factor_backup_codes =
              accountSecurity.two_factor_backup_codes.filter(
                (c) => c !== hashedCode,
              );
            await this.accountSecurityRepository.save(accountSecurity);
            return true;
          }
        } catch (error) {
          // Continue checking other codes
        }
      }
    }

    return false;
  }

  /**
   * Verify TOTP code
   */
  private verify2FACode(secret: string, token: string): boolean {
    try {
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      // Allow 1 period (30 seconds) of time drift
      const delta = totp.validate({ token, window: 1 });

      return delta !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity || !accountSecurity.two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Generate new backup codes
    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];

    for (let i = 0; i < 10; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
      hashedBackupCodes.push(await argon2.hash(code));
    }

    accountSecurity.two_factor_backup_codes = hashedBackupCodes;
    await this.accountSecurityRepository.save(accountSecurity);

    return backupCodes;
  }

  /**
   * Generate and send a 2FA code via email
   */
  async sendEmailCode(userId: string, ipAddress?: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity || !accountSecurity.two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Generate a 6-digit code
    // AUD-H03: crypto-secure OTP. Math.random() is a predictable PRNG and
    // must never mint a security code. randomInt is uniform over 0–999999.
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);

    // Store the code temporarily (expires in 10 minutes)
    accountSecurity.email_2fa_code = codeHash;
    accountSecurity.email_2fa_code_expires = new Date(Date.now() + 600000);
    await this.accountSecurityRepository.save(accountSecurity);

    // Send email
    try {
      await this.notificationsService.send2FACode(
        user.email,
        user.first_name,
        code,
        {
          expiryMinutes: 10,
          appName: 'DigiLearn',
          ipAddress,
        },
      );
    } catch (error) {
      throw new BadRequestException('Failed to send 2FA code via email');
    }
  }

  /**
   * Generate and send a 2FA code via SMS
   */
  async sendSmsCode(userId: string, phoneNumber: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity || !accountSecurity.two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Generate a 6-digit code
    // AUD-H03: crypto-secure OTP. Math.random() is a predictable PRNG and
    // must never mint a security code. randomInt is uniform over 0–999999.
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await argon2.hash(code);

    // Store the code temporarily (expires in 10 minutes)
    accountSecurity.sms_2fa_code = codeHash;
    accountSecurity.sms_2fa_code_expires = new Date(Date.now() + 600000);
    await this.accountSecurityRepository.save(accountSecurity);

    // Send SMS
    try {
      await this.notificationsService.send2FACodeSms(phoneNumber, code, {
        expiryMinutes: 10,
        appName: 'DigiLearn',
      });
    } catch (error) {
      throw new BadRequestException('Failed to send 2FA code via SMS');
    }
  }

  /**
   * Verify email-based 2FA code
   */
  async verifyEmailCode(userId: string, code: string): Promise<boolean> {
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity) {
      return false;
    }

    // Check if code exists and not expired
    if (
      !accountSecurity.email_2fa_code ||
      !accountSecurity.email_2fa_code_expires ||
      accountSecurity.email_2fa_code_expires < new Date()
    ) {
      return false;
    }

    // Verify code
    try {
      const isValid = await argon2.verify(
        accountSecurity.email_2fa_code,
        code,
      );

      if (isValid) {
        // Clear the code after successful verification
        accountSecurity.email_2fa_code = null;
        accountSecurity.email_2fa_code_expires = null;
        await this.accountSecurityRepository.save(accountSecurity);
        return true;
      }
    } catch (error) {
      return false;
    }

    return false;
  }

  /**
   * Verify SMS-based 2FA code
   */
  async verifySmsCode(userId: string, code: string): Promise<boolean> {
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity) {
      return false;
    }

    // Check if code exists and not expired
    if (
      !accountSecurity.sms_2fa_code ||
      !accountSecurity.sms_2fa_code_expires ||
      accountSecurity.sms_2fa_code_expires < new Date()
    ) {
      return false;
    }

    // Verify code
    try {
      const isValid = await argon2.verify(accountSecurity.sms_2fa_code, code);

      if (isValid) {
        // Clear the code after successful verification
        accountSecurity.sms_2fa_code = null;
        accountSecurity.sms_2fa_code_expires = null;
        await this.accountSecurityRepository.save(accountSecurity);
        return true;
      }
    } catch (error) {
      return false;
    }

    return false;
  }
}
