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
import { UserCalendarConnection } from './user-calendar-connection.entity';

/**
 * Bridge between our internal `activities` rows (specifically meetings)
 * and the remote calendar event. Every push creates one, and incoming
 * webhooks look up by (connection_id, external_event_id) to decide
 * whether the change came from us (no-op) or from outside (apply).
 *
 * `etag` is what the provider hands us on create/update. We send it
 * back with If-Match on subsequent PATCHes so we don't overwrite
 * changes we haven't seen yet — the classic optimistic-concurrency
 * pattern.
 */
@Entity('calendar_event_links')
@Index('idx_cel_connection', ['connection_id'])
@Index('idx_cel_activity', ['activity_id'])
@Index('uq_cel_external', ['connection_id', 'external_event_id'], {
  unique: true,
})
export class CalendarEventLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  connection_id: string;

  /** The CRM activity this link points at (usually a meeting). */
  @Column({ type: 'uuid' })
  activity_id: string;

  /** Provider-assigned event id (Google event.id / MSGraph event.id). */
  @Column({ type: 'varchar', length: 255 })
  external_event_id: string;

  /** Optimistic-concurrency token from the provider. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  etag: string | null;

  /** Web link the provider returns for the user to click into the event. */
  @Column({ type: 'text', nullable: true })
  html_link: string | null;

  /** Last time we pushed a change; null means external-only. */
  @Column({ type: 'timestamp', nullable: true })
  last_pushed_at: Date | null;

  /** Last time we pulled and found it changed externally. */
  @Column({ type: 'timestamp', nullable: true })
  last_pulled_at: Date | null;

  /** Track cancellations coming from the provider. */
  @Column({ type: 'boolean', default: false })
  cancelled_externally: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => UserCalendarConnection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection: UserCalendarConnection;
}
