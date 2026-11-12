import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 *   running  started, not finished (a stale one past its max runtime is `lost`)
 *   ok       finished normally
 *   failed   threw; `error_reference` points at the system_events row
 *   skipped  did not run: a setting is off, or another runner holds it
 *   lost     was `running` for longer than allowed; the process probably died
 */
export type JobRunStatus = 'running' | 'ok' | 'failed' | 'skipped' | 'lost';

/**
 * One row per execution of a scheduled job (or a manual trigger). Answers the
 * question the logs could not: did it run, what did it do, and if it did
 * nothing, was that because there was nothing to do or because it is off.
 * The partial unique index `job_runs_single_running` (migration 1792) lets
 * only one `running` row exist per job name, so two replicas cannot run
 * the same job at once.
 */
@Entity('job_runs')
@Index(['name', 'started_at'])
@Index(['created_at'])
export class JobRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 10 })
  status: JobRunStatus;

  @Column({ name: 'skip_reason', type: 'varchar', length: 200, nullable: true })
  skip_reason: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  started_at: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finished_at: Date | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  duration_ms: number | null;

  /** Named counters the job reported: { checked: 214, breached: 3 }. */
  @Column({ type: 'jsonb', nullable: true })
  counts: Record<string, number> | null;

  @Column({ type: 'jsonb', nullable: true })
  notes: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string | null;

  @Column({ name: 'error_reference', type: 'varchar', length: 16, nullable: true })
  error_reference: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  host: string | null;

  @Column({ name: 'app_commit', type: 'varchar', length: 40, nullable: true })
  app_commit: string | null;

  @Column({ type: 'varchar', length: 10, default: 'cron' })
  trigger: 'cron' | 'manual';

  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggered_by: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
