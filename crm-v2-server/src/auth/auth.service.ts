import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from '@node-rs/argon2';
import { randomBytes, createHash } from 'crypto';
import { NotificationsService } from '../notifications';
import { User } from '../users/entities/user.entity';
import { AccountSecurity } from './entities/account-security.entity';
import { AuthSession } from './entities/auth-session.entity';
import { Role } from './entities/role.entity';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/password-reset.dto';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  roles: string[];
  sessionId: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
  };
  requires_password_change?: boolean;
}

@Injectable()
export class AuthService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 15;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(AccountSecurity)
    private accountSecurityRepository: Repository<AccountSecurity>,
    @InjectRepository(AuthSession)
    private authSessionRepository: Repository<AuthSession>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {
  }

  // Inject TwoFactorService later to avoid circular dependency
  private twoFactorService: any;

  setTwoFactorService(twoFactorService: any) {
    this.twoFactorService = twoFactorService;
  }

  async register(
    registerDto: RegisterDto,
    ipAddress?: string,
    requirePasswordChange: boolean = false,
    origin?: string,
  ): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.usersRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(registerDto.password);

    // Create user
    const user = this.usersRepository.create({
      email: registerDto.email,
      first_name: registerDto.first_name,
      last_name: registerDto.last_name,
      is_active: true,
    });

    // Assign default role (e.g., 'sales_rep')
    const defaultRole = await this.roleRepository.findOne({
      where: { name: 'sales_rep' },
    });

    if (defaultRole) {
      user.roles = [defaultRole];
    }

    await this.usersRepository.save(user);

    // Create account security record
    const accountSecurity = this.accountSecurityRepository.create({
      user_id: user.id,
      password_hash: passwordHash,
      password_changed_at: new Date(),
      email_verified: false,
      failed_login_attempts: 0,
      requires_password_change: requirePasswordChange,
    });

    // Set password expiration if not requiring immediate change
    if (!requirePasswordChange) {
      this.setPasswordExpiration(accountSecurity, 90);
    }

    await this.accountSecurityRepository.save(accountSecurity);

    // Send registration success email
    try {
      const appUrl =
        this.configService.get('APP_URL') || origin || 'http://localhost:3000';
      await this.notificationsService.sendRegistrationSuccess(
        user.email,
        user.first_name,
        user.email.split('@')[0], // Use email prefix as username
        {
          role: defaultRole?.name,
          needsVerification: !accountSecurity.email_verified,
          verificationLink: `${appUrl}/verify-email?email=${user.email}`,
          loginLink: `${appUrl}/login`,
          supportEmail:
            this.configService.get('SUPPORT_EMAIL') || 'support@digilearn.com',
          appName: 'DigiLearn',
        },
      );
    } catch (error) {
      // Log error but don't fail registration if email fails
      console.error('Failed to send registration email:', error.message);
    }

    // Generate tokens and create session
    const authResponse = await this.createAuthResponse(user, ipAddress);

    // Add password change flag if required
    if (requirePasswordChange) {
      authResponse.requires_password_change = true;
    }

    return authResponse;
  }

  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    // Find user with relations
    const user = await this.usersRepository.findOne({
      where: { email: loginDto.email },
      relations: ['roles'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Get account security
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: user.id },
    });

    if (!accountSecurity) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (
      accountSecurity.locked_until &&
      accountSecurity.locked_until > new Date()
    ) {
      const remainingMinutes = Math.ceil(
        (accountSecurity.locked_until.getTime() - new Date().getTime()) / 60000,
      );
      throw new UnauthorizedException(
        `Account is locked. Try again in ${remainingMinutes} minutes`,
      );
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(
      accountSecurity.password_hash,
      loginDto.password,
    );

    if (!isPasswordValid) {
      await this.handleFailedLogin(accountSecurity, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if 2FA is enabled
    if (accountSecurity.two_factor_enabled) {
      if (!loginDto.two_factor_code) {
        throw new UnauthorizedException(
          'Two-factor authentication code required',
        );
      }

      // Verify 2FA code
      if (this.twoFactorService) {
        const is2FAValid = await this.twoFactorService.verify2FA(
          user.id,
          loginDto.two_factor_code,
        );

        if (!is2FAValid) {
          throw new UnauthorizedException(
            'Invalid two-factor authentication code',
          );
        }
      }
    }

    // Reset failed attempts on successful login
    if (accountSecurity.failed_login_attempts > 0) {
      accountSecurity.failed_login_attempts = 0;
      accountSecurity.locked_until = null;
      accountSecurity.last_failed_login_at = null;
      accountSecurity.last_failed_login_ip = null;
      await this.accountSecurityRepository.save(accountSecurity);
    }

    // Check if password change is required (forced or expired)
    const passwordExpired = this.checkPasswordExpired(accountSecurity);
    const requiresPasswordChange =
      accountSecurity.requires_password_change || passwordExpired;

    // Generate tokens and create session
    const authResponse = await this.createAuthResponse(
      user,
      ipAddress,
      userAgent,
    );

    // Add password change flag if required
    if (requiresPasswordChange) {
      authResponse.requires_password_change = true;
    }

    return authResponse;
  }

  async refreshToken(
    refreshTokenDto: RefreshTokenDto,
    ipAddress?: string,
  ): Promise<AuthResponse> {
    const tokenHash = await this.hashToken(refreshTokenDto.refresh_token);

    // Find active session
    const session = await this.authSessionRepository.findOne({
      where: {
        refresh_token_hash: tokenHash,
        is_active: true,
        expires_at: MoreThan(new Date()),
      },
      relations: ['user', 'user.roles'],
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!session.user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Update session activity
    session.last_activity_at = new Date();
    if (ipAddress) {
      session.ip_address = ipAddress;
    }
    await this.authSessionRepository.save(session);

    // Generate new access token
    const payload: JwtPayload = {
      sub: session.user.id,
      email: session.user.email,
      roles: session.user.roles?.map((r: any) => r.name) || [],
      sessionId: session.id,
    };

    const jwtExpirationDays = parseInt(this.configService.get('JWT_EXPIRATION') || '7', 10);
    const access_token = this.jwtService.sign(payload, {
      expiresIn: `${jwtExpirationDays}d`,
    });

    return {
      access_token,
      refresh_token: refreshTokenDto.refresh_token,
      expires_in: jwtExpirationDays * 24 * 60 * 60,
      user: {
        id: session.user.id,
        email: session.user.email,
        first_name: session.user.first_name,
        last_name: session.user.last_name,
        roles: session.user.roles?.map((r: any) => r.name) || [],
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = await this.hashToken(refreshToken);

    const session = await this.authSessionRepository.findOne({
      where: { refresh_token_hash: tokenHash },
    });

    if (session) {
      session.is_active = false;
      session.revoked_at = new Date();
      session.revoke_reason = 'User logout';
      await this.authSessionRepository.save(session);
    }
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await this.authSessionRepository.update(
      { user_id: userId, is_active: true },
      {
        is_active: false,
        revoked_at: new Date(),
        revoke_reason: 'Logout all sessions',
      },
    );
  }

  async requestPasswordReset(
    dto: RequestPasswordResetDto,
    origin?: string,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal if user exists
      return;
    }

    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: user.id },
    });

    if (!accountSecurity) {
      return;
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');

    const resetTokenHash = createHash('sha256')
      .update(resetToken)
      .digest('hex');
    // Store plain token (it's temporary and single-use)
    accountSecurity.reset_password_token = resetTokenHash;
    accountSecurity.reset_password_expires_at = new Date(Date.now() + 3600000); // 1 hour

    await this.accountSecurityRepository.save(accountSecurity);

    // Send password reset email
    try {
      const appUrl =
        this.configService.get('APP_URL') || origin || 'http://localhost:3000';
      const resetLink = `${appUrl}/reset-password?token=${resetToken}`;

      await this.notificationsService.sendPasswordReset(
        user.email,
        user.first_name,
        resetLink,
        {
          token: resetToken,
          expiryHours: 1,
          appName: 'DigiLearn',
        },
      );
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to send password reset email:', error.message);
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const resetTokenHash = createHash('sha256').update(dto.token).digest('hex');

    // Find account with matching plain token (not hashed for comparison)
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: {
        reset_password_token: resetTokenHash,
        reset_password_expires_at: MoreThan(new Date()),
      },
    });

    if (!accountSecurity) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash new password
    const passwordHash = await this.hashPassword(dto.new_password);

    accountSecurity.password_hash = passwordHash;
    accountSecurity.password_changed_at = new Date();
    accountSecurity.reset_password_token = null;
    accountSecurity.reset_password_expires_at = null;

    await this.accountSecurityRepository.save(accountSecurity);

    // Revoke all sessions
    await this.logoutAllSessions(accountSecurity.user_id);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const accountSecurity = await this.accountSecurityRepository.findOne({
      where: { user_id: userId },
    });

    if (!accountSecurity) {
      throw new NotFoundException('Account security record not found');
    }

    // Check if password change is required (first-time or expired)
    const passwordChangeRequired =
      accountSecurity.requires_password_change ||
      this.checkPasswordExpired(accountSecurity);

    // Verify current password ONLY if not a required password change
    if (!passwordChangeRequired) {
      if (!dto.current_password) {
        throw new BadRequestException('Current password is required');
      }

      const isCurrentPasswordValid = await this.verifyPassword(
        accountSecurity.password_hash,
        dto.current_password,
      );

      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    // Hash new password
    const passwordHash = await this.hashPassword(dto.new_password);

    accountSecurity.password_hash = passwordHash;
    accountSecurity.password_changed_at = new Date();

    // Clear password change requirement flag
    accountSecurity.requires_password_change = false;

    // Set new password expiration (90 days from now)
    this.setPasswordExpiration(accountSecurity, 90);

    await this.accountSecurityRepository.save(accountSecurity);

    // Revoke all sessions to force re-login with new password
    await this.logoutAllSessions(userId);
  }

  private async createAuthResponse(
    user: User,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponse> {
    // Generate refresh token
    const refreshToken = randomBytes(64).toString('hex');
    const refreshTokenHash = await this.hashToken(refreshToken);

    // Create session
    const refreshExpirationDays = parseInt(this.configService.get('JWT_REFRESH_EXPIRATION') || '15', 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpirationDays);

    const session = this.authSessionRepository.create({
      user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      expires_at: expiresAt,
      is_active: true,
      ip_address: ipAddress,
      user_agent: userAgent,
      last_activity_at: new Date(),
    });

    await this.authSessionRepository.save(session);

    // Generate JWT payload
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles?.map((r: any) => r.name) || [],
      sessionId: session.id,
    };

    const jwtExpirationDays = parseInt(this.configService.get('JWT_EXPIRATION') || '7', 10);
    const access_token = this.jwtService.sign(payload, {
      expiresIn: `${jwtExpirationDays}d`,
    });

    return {
      access_token,
      refresh_token: refreshToken,
      expires_in: jwtExpirationDays * 24 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        roles: user.roles?.map((r: any) => r.name) || [],
      },
    };
  }

  private async handleFailedLogin(
    accountSecurity: AccountSecurity,
    ipAddress?: string,
  ): Promise<void> {
    accountSecurity.failed_login_attempts += 1;
    accountSecurity.last_failed_login_at = new Date();
    accountSecurity.last_failed_login_ip = ipAddress || '';

    if (accountSecurity.failed_login_attempts >= this.MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = new Date();
      lockoutUntil.setMinutes(
        lockoutUntil.getMinutes() + this.LOCKOUT_DURATION_MINUTES,
      );
      accountSecurity.locked_until = lockoutUntil;
    }

    await this.accountSecurityRepository.save(accountSecurity);
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  private async verifyPassword(
    hash: string,
    password: string,
  ): Promise<boolean> {
    try {
      return argon2.verify(hash, password);
    } catch (error) {
      return false;
    }
  }

  private async hashToken(token: string): Promise<string> {
    return argon2.hash(token);
  }

  /**
   * Check if password has expired
   */
  private checkPasswordExpired(accountSecurity: AccountSecurity): boolean {
    if (!accountSecurity.password_expires_at) {
      return false;
    }
    return accountSecurity.password_expires_at < new Date();
  }

  /**
   * Set password expiration date (e.g., 90 days from now)
   */
  private setPasswordExpiration(
    accountSecurity: AccountSecurity,
    days: number = 90,
  ): void {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days);
    accountSecurity.password_expires_at = expirationDate;
  }
}
