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
import { SchedulingLink } from './scheduling-link.entity';

/**
 * Lifecycle of a hold:
 *
 *   PENDING   — invitee clicked a slot; we've reserved the time but they
 *               haven't submitted the form yet. Rendered "grayed out" on
 *               other invitees' pages so two people don't race to the
 *               same 3pm slot.
 *   CONFIRMED — invitee finished the booking; we've created a real
 *               Activity/Meeting and pushed to the rep's calendar.
 *   CANCELLED — invitee bailed, or the owner removed the link/meeting.
 *   EXPIRED   — the PENDING window timed out (see expires_at). The
 *               reconciler will flip these on the next pass; we don't
 *               rely on a background process for correctness, though —
 *               the slot-query also filters by `expires_at > now()`.
 */
export enum SchedulingHoldStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Entity('scheduling_holds')
@Index('idx_scheduling_hold_link_time', ['link_id', 'start_at'])
export class SchedulingHold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  link_id: string;

  /** The actual booked slot — owner's timezone applied upstream. */
  @Column({ type: 'timestamp' })
  start_at: Date;

  @Column({ type: 'timestamp' })
  end_at: Date;

  /**
   * Captured when the invitee first picks a slot (optional — we let them
   * pick first, fill their email second). Not a foreign key because the
   * public booking flow doesn't assume the invitee is a CRM contact.
   */
  @Column({ type: 'varchar', length: 320, nullable: true })
  invitee_email: string | null;

  /**
   * Absolute wall-clock deadline for the PENDING state. We set a short
   * (~5 minute) TTL so a distracted invitee who closes the tab doesn't
   * lock the slot for an hour. Confirm endpoint ignores expired holds.
   */
  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({
    type: 'enum',
    enum: SchedulingHoldStatus,
    default: SchedulingHoldStatus.PENDING,
  })
  status: SchedulingHoldStatus;

  /**
   * Populated when the hold is promoted to an Activity/Meeting. Left as
   * a plain UUID (no FK) because we don't want Activity deletes to
   * cascade into historical hold records we use for analytics.
   */
  @Column({ type: 'uuid', nullable: true })
  activity_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => SchedulingLink, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'link_id' })
  link: SchedulingLink;
}
