// ============================================================================
// EMAILS
// ============================================================================

import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from "typeorm";
import { Activity } from "./activity.entity";

@Entity('emails')
@Index('idx_activity', ['activity_id'])
@Index('idx_thread', ['thread_id'])
@Index('idx_message_id', ['message_id'])
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  activity_id: string;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  // Recipients (JSON arrays)
  @Column({ type: 'text', comment: 'JSON: [{email, name}]' })
to_recipients: string;

  @Column({ type: 'text', nullable: true, comment: 'JSON: [{email, name}]' })
  cc_recipients: string;

  @Column({ type: 'text', nullable: true, comment: 'JSON: [{email, name}]' })
  bcc_recipients: string;

  // Email metadata
  @Column({ type: 'varchar', length: 255 })
  from_email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
message_id: string; // For threading

  @Column({ type: 'varchar', length: 255, nullable: true })
  in_reply_to: string; // Thread parent

  @Column({ type: 'varchar', length: 255, nullable: true })
  thread_id: string; // Email thread grouping

  // Status
  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  delivered_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  opened_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  clicked_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToOne(() => Activity, (activity) => activity.email, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;
}
