import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Activity } from './activity.entity';

export enum WhatsAppDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum WhatsAppMessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  LOCATION = 'location',
}

export enum WhatsAppMessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

@Entity('whatsapp_messages')
@Index('idx_whats_app_activity', ['activity_id'])
@Index('idx_whats_app_thread', ['thread_id'])
@Index('idx_whats_app_phone', ['phone_number'])
@Index('idx_whats_app_direction', ['direction'])
export class WhatsAppMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  activity_id: string;

  @Column({ type: 'varchar', length: 50 })
  phone_number: string;

  @Column({ type: 'text' })
  message: string;

  // WhatsApp specifics
  @Column({
    type: 'enum',
    enum: WhatsAppDirection,
  })
  direction: WhatsAppDirection;

  @Column({
    type: 'enum',
    enum: WhatsAppMessageType,
    default: WhatsAppMessageType.TEXT,
  })
  message_type: WhatsAppMessageType;

  // Media
  @Column({ type: 'varchar', length: 500, nullable: true })
  media_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnail_url: string;

  // Status
  @Column({
    type: 'enum',
    enum: WhatsAppMessageStatus,
    nullable: true,
  })
  status: WhatsAppMessageStatus;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  delivered_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  read_at: Date;

  // Next steps
  @Column({ type: 'boolean', default: false })
  follow_up_required: boolean;

  @Column({ type: 'timestamp', nullable: true })
  follow_up_date: Date;

  // Threading
  @Column({ type: 'varchar', length: 255, nullable: true })
  thread_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToOne(() => Activity, (activity) => activity.whatsapp_message, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;
}
