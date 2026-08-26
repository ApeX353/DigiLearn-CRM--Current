import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('account_security')
export class AccountSecurity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index({ unique: true })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  password_hash: string;

  @Column({ type: 'timestamp', nullable: true })
  password_changed_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  password_expires_at: Date;

  // 2FA Configuration
  @Column({ default: false })
  two_factor_enabled: boolean;

  @Column({ type: 'text', nullable: true })
  two_factor_secret: string | null; // Encrypted TOTP secret

  @Column({ type: 'json', nullable: true })
  two_factor_backup_codes: string[] | null; // Hashed backup codes

  // Email-based 2FA
  @Column({ type: 'text', nullable: true })
  email_2fa_code: string | null; // Hashed code

  @Column({ type: 'timestamp', nullable: true })
  email_2fa_code_expires: Date | null;

  // SMS-based 2FA
  @Column({ type: 'text', nullable: true })
  sms_2fa_code: string | null; // Hashed code

  @Column({ type: 'timestamp', nullable: true })
  sms_2fa_code_expires: Date | null;

  // Login Attempts & Account Lockout
  @Column({ default: 0 })
  failed_login_attempts: number;

  @Column({ type: 'timestamp', nullable: true })
  locked_until: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  last_failed_login_at: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  last_failed_login_ip: string | null;

  // Password Reset
  @Column({ type: 'text', nullable: true })
  reset_password_token: string | null; // Hashed token

  @Column({ type: 'timestamp', nullable: true })
  reset_password_expires_at: Date | null;

  // First-time/Forced Password Change
  @Column({ default: false })
  requires_password_change: boolean;

  // Email Verification
  @Column({ default: false })
  email_verified: boolean;

  @Column({ type: 'text', nullable: true })
  email_verification_token: string; // Hashed token

  @Column({ type: 'timestamp', nullable: true })
  email_verification_expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
