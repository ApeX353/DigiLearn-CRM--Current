import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ClientEventKind =
  | 'js_error'
  | 'unhandled_rejection'
  | 'render_error'
  | 'failed_request'
  | 'console_error';

/**
 * What went wrong in the browser, reported by the client itself. This is the
 * side the users never report: a rep who hits the same error three times and
 * gives up leaves three rows here and nothing anywhere else.
 */
@Entity('client_events')
@Index(['created_at'])
@Index(['user_id', 'created_at'])
@Index(['api_reference'])
export class ClientEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'varchar', length: 30 })
  kind: ClientEventKind;

  @Column({ type: 'text' })
  message: string;

  /** At most 4 KB. */
  @Column({ type: 'text', nullable: true })
  stack: string | null;

  @Column({ name: 'page_url', type: 'varchar', length: 500, nullable: true })
  page_url: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  user_agent: string | null;

  @Column({ name: 'app_commit', type: 'varchar', length: 40, nullable: true })
  app_commit: string | null;

  /** The ERR-… code the API answered with, when the event is a failed request. */
  @Column({ name: 'api_reference', type: 'varchar', length: 16, nullable: true })
  api_reference: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  request_id: string | null;

  @Column({ name: 'status_code', type: 'smallint', nullable: true })
  status_code: number | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  /** When it happened in the browser (the row is written later, in a batch). */
  @Column({ name: 'occurred_at', type: 'timestamptz', nullable: true })
  occurred_at: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
