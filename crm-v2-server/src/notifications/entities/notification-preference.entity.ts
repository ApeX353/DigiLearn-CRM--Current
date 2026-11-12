import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

/**
 * Per-user toggles for notification delivery. Keyed by
 * (user_id, event_type, channel) — a user has at most one row per
 * event+channel combo. Shape mirrors the frontend's
 * `NotificationPreference` type exactly so the GET response is
 * consumed with no remapping.
 */
@Entity('notification_preferences')
@Index('idx_np_user_event_channel', ['user_id', 'event_type', 'channel'], {
  unique: true,
})
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 80 })
  event_type: string;

  @Column({ type: 'varchar', length: 20 })
  channel: NotificationChannel;

  @Column({ type: 'boolean', default: true })
  is_enabled: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  severity_min: 'info' | 'warning' | 'critical' | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
