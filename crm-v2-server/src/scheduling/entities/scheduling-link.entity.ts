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
 * Where the meeting happens. We keep this enumerated rather than free
 * text so the booking page can render an appropriate label ("Zoom link
 * will be sent", "At the office", etc.) without guessing.
 */
export enum SchedulingLinkLocation {
  ZOOM = 'zoom',
  GOOGLE_MEET = 'google_meet',
  TEAMS = 'teams',
  PHONE = 'phone',
  IN_PERSON = 'in_person',
  CUSTOM = 'custom',
}

/**
 * Weekly availability window — the JSON shape persisted on
 * `availability`.  Days are 0..6 (Sunday=0) to match `Date#getDay()`.
 * Multiple windows per day are supported so "9-12, 13-17" with a lunch
 * break works out of the box.
 */
export interface WeeklyAvailabilityWindow {
  day_of_week: number; // 0 = Sunday
  start_minutes_from_midnight: number; // 9 * 60 => 540
  end_minutes_from_midnight: number;
}

/**
 * Public booking URL for a rep — the CRM side of a Calendly-style flow.
 * The invitee never authenticates; `slug` is the public identifier and
 * the per-slot "hold" protects against double-booking during the brief
 * window between "I picked 3pm" and "I've filled in my email".
 */
@Entity('scheduling_links')
@Index('uq_scheduling_link_slug', ['slug'], { unique: true })
@Index('idx_scheduling_link_owner', ['owner_user_id'])
export class SchedulingLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  owner_user_id: string;

  @Column({ type: 'varchar', length: 80 })
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 40 })
  location_type: SchedulingLinkLocation;

  /** Free-text details: an address, a Zoom host id, a custom blurb. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  location_detail: string | null;

  @Column({ type: 'int' })
  duration_minutes: number;

  @Column({ type: 'int', default: 0 })
  buffer_before_minutes: number;

  @Column({ type: 'int', default: 0 })
  buffer_after_minutes: number;

  /** Minutes of "lead time" — can't book a meeting in the next N minutes. */
  @Column({ type: 'int', default: 60 })
  min_notice_minutes: number;

  /** How far into the future the public page will render slots. */
  @Column({ type: 'int', default: 30 })
  max_days_ahead: number;

  @Column({ type: 'jsonb', nullable: true })
  availability: WeeklyAvailabilityWindow[] | null;

  @Column({ type: 'varchar', length: 60, default: 'UTC' })
  timezone: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  owner: User;
}
