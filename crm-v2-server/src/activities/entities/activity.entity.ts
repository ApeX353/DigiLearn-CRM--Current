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
import { Demo } from './demos.entity';

export enum ActivityType {
  NOTE = 'note',
  TASK = 'task',
  EMAIL = 'email',
  CALL = 'call',
  MEETING = 'meeting',
  WHATSAPP = 'whatsapp',
  // ----- Demo lifecycle (added with the Demo + Commercial-Intent
  // feature). Demos used to be detected by `subject ILIKE '%demo%'`
  // on meeting activities — fragile and frequently overcounted. The
  // three explicit types replace that pattern: Booking → Delivery →
  // Follow-up. Each has dedicated structured data on the `demos`
  // sub-table (1:1 with Activity, same pattern as `meetings`).
  DEMO_BOOKING = 'demo_booking',
  DEMO_DELIVERY = 'demo_delivery',
  DEMO_FOLLOWUP = 'demo_followup',
}

export enum ActivityStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

/**
 * Discipline-rule enum: every newly-completed activity must record
 * one of these outcomes. The set is generic enough to apply to
 * calls, meetings, tasks, emails, and WhatsApp — the UI picks
 * defaults per type but never leaves the field blank. Notes are
 * log entries and don't transition through "completed".
 *
 * The enum is split across two semantic buckets:
 *
 *   Pipeline outcomes (9)      — deal/lead-level interactions that
 *                                 continue to drive a commercial
 *                                 conversation; choosing one of these
 *                                 KEEPS the mandatory-next-step rule
 *                                 in play.
 *
 *   Relationship outcomes (7)  — school/account-level touchpoints that
 *                                 legitimately have no commercial
 *                                 follow-up (training delivered,
 *                                 information shared, referral). These
 *                                 SATISFY the next-step rule on their
 *                                 own and close the interaction.
 *
 * The UI picks which bucket to offer based on the source activity's
 * scope — see the client `isRelationshipTerminalOutcome` helper.
 */
export enum ActivityOutcome {
  // --- Pipeline ---------------------------------------------------
  SUCCESSFUL = 'successful',
  UNSUCCESSFUL = 'unsuccessful',
  NO_RESPONSE = 'no_response',
  RESCHEDULED = 'rescheduled',
  INTERESTED = 'interested',
  NOT_INTERESTED = 'not_interested',
  WAITING_FOR_APPROVAL = 'waiting_for_approval',
  PROPOSAL_SENT = 'proposal_sent',
  FOLLOW_UP_NEEDED = 'follow_up_needed',
  // --- Relationship / account-level -------------------------------
  INFORMATION_SHARED = 'information_shared',
  RELATIONSHIP_TOUCHPOINT_COMPLETE = 'relationship_touchpoint_complete',
  AWAITING_FUTURE_NEED = 'awaiting_future_need',
  NO_IMMEDIATE_COMMERCIAL_ACTION = 'no_immediate_commercial_action',
  TRAINING_COMPLETED = 'training_completed',
  REFERRED_INTERNALLY = 'referred_internally',
  INFORMATIONAL_ENGAGEMENT_CLOSED = 'informational_engagement_closed',
  // --- Demo lifecycle (Demo + Commercial-Intent feature) ----------
  // These outcomes apply to the new DEMO_BOOKING / DEMO_DELIVERY /
  // DEMO_FOLLOWUP activity types. The commercial-intent derivation
  // logic on activity completion checks these specific values to
  // decide whether to flip lead.commercial_intent.
  DEMO_SCHEDULED = 'demo_scheduled',
  DEMO_RESCHEDULED = 'demo_rescheduled',
  DEMO_CANCELLED = 'demo_cancelled',
  DEMO_COMPLETED = 'demo_completed',
  DECISION_MAKER_ABSENT = 'decision_maker_absent',
  STRONG_INTEREST = 'strong_interest',
  QUOTE_REQUESTED = 'quote_requested',
  SDC_MEETING_REQUESTED = 'sdc_meeting_requested',
  PAYMENT_PLAN_DISCUSSION_REQUESTED = 'payment_plan_discussion_requested',
  REACHED = 'reached',
  NOT_REACHED = 'not_reached',
  NEEDS_TIME = 'needs_time',
}

@Entity('activities')
@Index('idx_activity_type', ['type'])
@Index('idx_activity_status', ['status'])
@Index('idx_activity_lead', ['lead_id'])
@Index('idx_activity_deal', ['deal_id'])
@Index('idx_activity_contact', ['contact_id'])
@Index('idx_activity_created_by', ['created_by_id'])
@Index('idx_activity_assigned_to', ['assigned_to_id'])
@Index('idx_activity_scheduled_at', ['scheduled_at'])
@Index('idx_activity_due_at', ['due_at'])
@Index('idx_activity_lead_deal', ['lead_id', 'deal_id'])
@Index('idx_activity_assigned_due', ['assigned_to_id', 'due_at'])
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

  /**
   * The mandatory outcome captured when an activity transitions to
   * `completed`. Nullable so legacy rows completed before the rule
   * existed stay readable; new completions MUST populate this — the
   * service + DTO enforce it.
   */
  @Column({
    type: 'enum',
    enum: ActivityOutcome,
    nullable: true,
  })
  completion_outcome: ActivityOutcome | null;

  /** Free-form note captured alongside the outcome (optional). */
  @Column({ type: 'text', nullable: true })
  completion_note: string | null;

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

  /**
   * Demo sub-row for DEMO_BOOKING / DEMO_DELIVERY / DEMO_FOLLOWUP
   * activities. Holds structured demo data (mode, attendees,
   * products, decision-maker presence, payment plan, etc.) so
   * Activity stays generic.
   */
  @OneToOne(() => Demo, (demo) => demo.activity, { cascade: true })
  demo: Demo;

  // One-to-many
  @OneToMany(() => ActivityComment, (comment) => comment.activity)
  comments: ActivityComment[];

  @OneToMany(() => ActivityAttachment, (attachment) => attachment.activity)
  attachments: ActivityAttachment[];
}
