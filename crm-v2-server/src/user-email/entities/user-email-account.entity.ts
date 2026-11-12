import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Provider for outgoing email on behalf of a user. Section 3 of the
 * spec calls for "unified email communication" — the composer sends
 * using the rep's own account so replies land in their inbox.
 *
 * Three tiers are supported:
 *   - smtp       : user provides SMTP host/port/user/pass (works today)
 *   - gmail      : OAuth to Gmail (added when we ship Google integration)
 *   - microsoft  : OAuth to Microsoft Graph (added with Outlook integration)
 *
 * Tokens are stored encrypted; the column only carries the opaque
 * ciphertext. The decryption key lives in the infra layer.
 */
export enum UserEmailProvider {
  SMTP = 'smtp',
  GMAIL = 'gmail',
  MICROSOFT = 'microsoft',
}

@Entity('user_email_accounts')
@Index('idx_user_email_account_user', ['user_id'])
@Index('uq_user_email_account_address', ['user_id', 'email_address'], {
  unique: true,
})
export class UserEmailAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: UserEmailProvider })
  provider: UserEmailProvider;

  /** "From" address shown on outgoing mail. */
  @Column({ type: 'varchar', length: 320 })
  email_address: string;

  /** Optional human display name, e.g. "Jane Doe (Sales)". */
  @Column({ type: 'varchar', length: 200, nullable: true })
  display_name: string | null;

  /**
   * Encrypted blob holding provider-specific config. For SMTP this is
   * `{ host, port, secure, auth: { user, pass } }`. For OAuth providers
   * this is `{ access_token, refresh_token, expires_at, scope }`.
   * Always AES-256-GCM before persistence.
   */
  @Column({ type: 'text' })
  encrypted_credentials: string;

  /** Set to true when the user marks an account as the default sender. */
  @Column({ type: 'boolean', default: false })
  is_default: boolean;

  /** Disabled accounts are kept for audit but cannot send mail. */
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  /** Last time we successfully sent mail on this account. */
  @Column({ type: 'timestamp', nullable: true })
  last_verified_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
