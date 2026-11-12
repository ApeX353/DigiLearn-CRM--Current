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
 * Which external calendar provider a connection is backed by. Section 2
 * of the spec requires Google + Microsoft parity; Apple iCloud is out
 * of scope for this pass (their CalDAV endpoint doesn't support
 * webhook-based sync).
 */
export enum CalendarProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
}

/**
 * Per-user OAuth binding for external calendar sync. We store the
 * provider's calendar id too — most users care about their *primary*
 * calendar, but CRMs in multi-brand orgs sometimes want to push to a
 * dedicated "Sales" calendar.
 *
 * `encrypted_token_payload` holds
 *   { access_token, refresh_token, expires_at, scope }
 * encrypted with AES-256-GCM (see CredentialsCipher in user-email).
 */
@Entity('user_calendar_connections')
@Index('idx_user_calendar_user', ['user_id'])
@Index('uq_user_calendar_provider', ['user_id', 'provider'], { unique: true })
export class UserCalendarConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: CalendarProvider })
  provider: CalendarProvider;

  /** Provider-specific account identifier (usually the email address). */
  @Column({ type: 'varchar', length: 320 })
  provider_account_id: string;

  /** Which remote calendar we sync to. NULL = primary. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  calendar_id: string | null;

  /** AES-256-GCM encrypted OAuth payload. See CredentialsCipher. */
  @Column({ type: 'text' })
  encrypted_token_payload: string;

  /**
   * Sync-token / watch-channel details from the provider. Google sends
   * a `syncToken` we replay on the next incremental pull; Microsoft
   * returns a `deltaLink`. We stash whichever applies.
   */
  @Column({ type: 'text', nullable: true })
  sync_token: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  watch_channel_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  watch_expires_at: Date | null;

  /** Last successful incremental pull — used by the reconciler cron. */
  @Column({ type: 'timestamp', nullable: true })
  last_sync_at: Date | null;

  /** Set to false on token revocation; we keep the row for audit. */
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
