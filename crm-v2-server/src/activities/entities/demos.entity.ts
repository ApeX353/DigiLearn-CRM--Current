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

/**
 * `demos` — sub-table 1:1 with Activity for demo lifecycle activities
 * (DEMO_BOOKING, DEMO_DELIVERY, DEMO_FOLLOWUP). Mirrors the Meeting
 * sub-table pattern: one row per parent activity, joined by
 * `activity_id`, cascade-deleted when the parent goes.
 *
 * Why a sub-table:
 *  - The structured fields the school-sales team needs to capture
 *    (mode, attendees, products, decision-maker presence, payment
 *    plan, SDC discussion, quantities) are demo-specific and would
 *    pollute Activity if added directly.
 *  - The same row supports BOOKING (planned attendees + agenda) and
 *    DELIVERY (actuals + outcomes). For DELIVERY rows we also store
 *    the commercial-intent signals captured in the form.
 *  - DEMO_FOLLOWUP rows reuse the table for `channel` + the required
 *    `next_activity_date` so the SLA cron has one place to check.
 *
 * All fields except `activity_id` are nullable so existing rows
 * remain valid as the form evolves. JSON arrays are stored as
 * jsonb (Postgres) so we can query "demos that demonstrated LMS"
 * later without parsing strings.
 */

export enum DemoMode {
  ON_SITE = 'on_site',
  VIRTUAL = 'virtual',
}

export enum DemoFollowupChannel {
  CALL = 'call',
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  MEETING = 'meeting',
}

@Entity('demos')
@Index('idx_demos_activity', ['activity_id'])
@Index('idx_demos_planned_at', ['planned_at'])
@Index('idx_demos_actual_at', ['actual_at'])
export class Demo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  activity_id: string;

  // ----- Booking ------------------------------------------------
  /** When the demo is scheduled to happen. Required for BOOKING. */
  @Column({ type: 'timestamp', nullable: true })
  planned_at: Date | null;

  @Column({ type: 'enum', enum: DemoMode, nullable: true })
  mode: DemoMode | null;

  /**
   * Expected attendee roles. Stored as a string[] so we can search
   * "demos with bursar invited but not present" later. Free-form
   * "Other" notes go in `attendee_notes`.
   */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'::jsonb" })
  expected_attendees: string[] | null;

  @Column({ type: 'text', nullable: true })
  agenda: string | null;

  // ----- Delivery -----------------------------------------------
  /** Actual demo date (may differ from planned_at on reschedule). */
  @Column({ type: 'timestamp', nullable: true })
  actual_at: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'::jsonb" })
  attendees_present: string[] | null;

  /**
   * Products demonstrated during DELIVERY. Used by the dashboard
   * "demo product breakdown" report.
   */
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'::jsonb" })
  products_demonstrated: string[] | null;

  @Column({ type: 'text', nullable: true })
  key_questions: string | null;

  @Column({ type: 'text', nullable: true })
  pain_points: string | null;

  @Column({ type: 'boolean', nullable: true })
  decision_makers_present: boolean | null;

  /**
   * Quantity discussed (devices/licenses). Free-form to allow
   * "30-50 tablets" style ranges. Presence of any value is one of
   * the commercial-intent signals.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  quantity_discussed: string | null;

  @Column({ type: 'boolean', nullable: true })
  payment_plan_discussed: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  sdc_discussion: boolean | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  attendee_notes: string | null;

  // ----- Follow-up ----------------------------------------------
  @Column({ type: 'enum', enum: DemoFollowupChannel, nullable: true })
  followup_channel: DemoFollowupChannel | null;

  /**
   * Required for DEMO_FOLLOWUP unless outcome = NOT_INTERESTED.
   * The Demo Follow-up SLA cron uses this to check that a real
   * follow-up exists (not just notes).
   */
  @Column({ type: 'timestamp', nullable: true })
  next_activity_date: Date | null;

  // ----- Timestamps ---------------------------------------------
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  deleted_at: Date | null;

  // ----- Relations ----------------------------------------------
  @OneToOne(() => Activity, (activity) => activity.demo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;
}
