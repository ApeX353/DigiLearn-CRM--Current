import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { UserNotification } from './user-notification.entity';

export const NOTIFICATION_CHANNELS = [
  'sms',
  'push',
  'whatsapp',
  'in-app',
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_SEVERITIES = [
  'info',
  'success',
  'warning',
  'error',
] as const;

export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

@Entity('notifications')
@Index(['entity', 'entity_id'])
@Index(['dedupe_key'], { unique: true })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  message: string;

  @Column({
    type: 'enum',
    enum: NOTIFICATION_CHANNELS,
    default: 'in-app',
  })
  channel: NotificationChannel;

  @Column({
    type: 'enum',
    enum: NOTIFICATION_SEVERITIES,
    default: 'info',
  })
  severity: NotificationSeverity;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entity: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entity_id: string | null;

  @Column({
    name: 'dedupe_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  dedupe_key: string | null;

  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true })
  action_url: string | null;

  @Column({ name: 'context_json', type: 'json', nullable: true })
  context_json: Record<string, any> | null;

  @Column({ name: 'notification_options', type: 'json', nullable: true })
  notification_options: Record<string, any> | null;

  @OneToMany(
    'UserNotification',
    (userNotification: UserNotification) => userNotification.notification,
  )
  user_notifications: Relation<UserNotification[]>;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
