import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type SystemEventLevel = 'error' | 'warn' | 'info';

/**
 * What produced the row. Each kind has one producer so a reader knows where
 * to look:
 *   http_5xx            exception filter, unexpected error on a request
 *   http_403            exception filter, a refusal (captured behind a setting)
 *   refused             exception filter, a business rule said no to a write (400/409/422; always)
 *   validation          exception filter, a 400 from the ValidationPipe (setting)
 *   db_constraint       exception filter, a Postgres error translated to 4xx
 *   ws_error            exception filter, WebSocket handler
 *   unhandled_rejection process-level handler
 *   uncaught_exception  process-level handler
 *   logged_error        AppLogger.error() mirror (the 59 "log and continue" sites)
 *   job_failure         JobRunnerService
 *   delivery_failure    provider funnels
 *   custom              DiagnosticsService.recordEvent() from a service
 */
export type SystemEventKind =
  | 'http_5xx'
  | 'http_403'
  /** A business rule said no to a write: 400 with a sentence, 409, 422. */
  | 'refused'
  | 'validation'
  | 'db_constraint'
  | 'ws_error'
  | 'unhandled_rejection'
  | 'uncaught_exception'
  | 'logged_error'
  | 'job_failure'
  | 'delivery_failure'
  | 'custom';

export type SystemEventSource = 'http' | 'ws' | 'job' | 'process' | 'client' | 'log';

/**
 * One row per thing that went wrong on the server, with everything needed
 * to investigate it without reproducing: who, which request, which records,
 * the stack, the build. `reference` is the code users see.
 * Pruned after `diagnostics.retention_days` (default 30).
 */
@Entity('system_events')
@Index(['created_at'])
@Index(['kind', 'created_at'])
@Index(['request_id'])
@Index(['user_id'])
export class SystemEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  reference: string;

  @Column({ type: 'varchar', length: 10 })
  level: SystemEventLevel;

  @Column({ type: 'varchar', length: 50 })
  kind: SystemEventKind;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'error_name', type: 'varchar', length: 100, nullable: true })
  error_name: string | null;

  @Column({ type: 'text', nullable: true })
  stack: string | null;

  @Column({ name: 'status_code', type: 'smallint', nullable: true })
  status_code: number | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  request_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ name: 'user_roles', type: 'text', array: true, nullable: true })
  user_roles: string[] | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;

  @Column({ type: 'jsonb', nullable: true })
  params: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  query: Record<string, unknown> | null;

  /** Sanitised request body: secrets hidden, bulk fields dropped, 8 KB cap. */
  @Column({ type: 'jsonb', nullable: true })
  body: unknown | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entity: string | null;

  @Column({ name: 'entity_id', type: 'varchar', length: 64, nullable: true })
  entity_id: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ name: 'app_commit', type: 'varchar', length: 40, nullable: true })
  app_commit: string | null;

  @Column({ type: 'varchar', length: 16 })
  source: SystemEventSource;

  @Column({ name: 'job_run_id', type: 'uuid', nullable: true })
  job_run_id: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
