import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type { Notification } from './notification.entity';

@Entity('user_notifications')
export class UserNotification {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  userId: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  notificationId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @ManyToOne('Notification', (notification: Notification) => notification.user_notifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notificationId' })
  notification: Relation<Notification>;

  @Column({ type: 'tinyint', width: 3, default: 0 })
  isRead: number; // MySQL TINYINT(3) for boolean
}
