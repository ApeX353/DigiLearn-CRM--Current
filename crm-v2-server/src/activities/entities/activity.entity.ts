// src/entities/activity.entity.ts
import { Contact } from '../../contacts/entities/contact.entity';
import { Deal } from '../../deals/entities/deal.entity';
import { Lead } from '../../leads/entities';
import { User } from '../../users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ActivityAttachment } from './activity-attachments.entity';
import { ActivityComment } from './activity-comments.entity';
import { Call } from './calls.entity';
import { Email } from './emails.entity';
import { Meeting } from './meetings.entity';
import { Note } from './notes.entity';
import { Task } from './tasks.entity';
import { WhatsAppMessage } from './whats-app.entity';

export enum ActivityType {
  NOTE = 'note',
  TASK = 'task',
  EMAIL = 'email',
  CALL = 'call',
  MEETING = 'meeting',
  WHATSAPP = 'whatsapp',
}

export enum ActivityStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

@Entity('activities')
@Index('idx_type', ['type'])
@Index('idx_status', ['status'])
@Index('idx_lead', ['lead_id'])
@Index('idx_deal', ['deal_id'])
@Index('idx_contact', ['contact_id'])
@Index('idx_created_by', ['created_by_id'])
@Index('idx_assigned_to', ['assigned_to_id'])
@Index('idx_scheduled_at', ['scheduled_at'])
@Index('idx_due_at', ['due_at'])
@Index('idx_lead_deal', ['lead_id', 'deal_id'])
@Index('idx_assigned_due', ['assigned_to_id', 'due_at'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  type: ActivityType;

  @Column({
    type: 'enum',
    enum: ActivityStatus,
    default: ActivityStatus.SCHEDULED,
  })
  status: ActivityStatus;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // Entity References (Polymorphic)
  @Column({ type: 'uuid', nullable: true })
  lead_id: string;

  @Column({ type: 'uuid', nullable: true })
  deal_id: string;

  @Column({ type: 'uuid', nullable: true })
  contact_id: string;

  // Ownership & Assignment
  @Column({ type: 'uuid' })
  created_by_id: string;

  @Column({ type: 'uuid', nullable: true })
  assigned_to_id: string;

  // Scheduling
  @Column({ type: 'timestamp', nullable: true })
  scheduled_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  due_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date;

  @Column({ type: 'int', nullable: true, comment: 'Duration in minutes' })
  duration: number;

  // Metadata
  @Column({ type: 'boolean', default: false })
  is_automated: boolean;

  @Column({ type: 'boolean', default: false })
  is_pinned: boolean;

  // Timestamps
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  archived_at: Date;

  // Relations
  @ManyToOne(() => Lead, (lead) => lead.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @ManyToOne(() => Deal, (deal) => deal.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deal_id' })
  deal: Deal;

  @ManyToOne(() => Contact, (contact) => contact.activities, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @ManyToOne(() => User, (user) => user.createdActivities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;

  @ManyToOne(() => User, (user) => user.assignedActivities, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'assigned_to_id' })
  assigned_to: User;

  // One-to-one with specific activity types
  @OneToOne(() => Task, (task) => task.activity, { cascade: true })
  task: Task;

  @OneToOne(() => Note, (note) => note.activity, { cascade: true })
  note: Note;

  @OneToOne(() => Email, (email) => email.activity, { cascade: true })
  email: Email;

  @OneToOne(() => Call, (call) => call.activity, { cascade: true })
  call: Call;

  @OneToOne(() => Meeting, (meeting) => meeting.activity, { cascade: true })
  meeting: Meeting;

  @OneToOne(() => WhatsAppMessage, (whatsapp) => whatsapp.activity, {
    cascade: true,
  })
  whatsapp_message: WhatsAppMessage;

  // One-to-many
  @OneToMany(() => ActivityComment, (comment) => comment.activity)
  comments: ActivityComment[];

  @OneToMany(() => ActivityAttachment, (attachment) => attachment.activity)
  attachments: ActivityAttachment[];
}
