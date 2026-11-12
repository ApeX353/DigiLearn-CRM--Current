import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type DeliveryChannel = 'whatsapp' | 'email' | 'sms' | 'blob' | 'push' | 'in-app';

/**
 * One row per call to an outside provider (WhatsApp, SMTP, Vercel Blob…),
 * success or failure, with the provider's answer kept this time. Before this
 * table a refused WhatsApp send logged "API error: 400" to stdout and lost
 * the body that said why.
 */
@Entity('delivery_attempts')
@Index(['created_at'])
@Index(['channel', 'success', 'created_at'])
@Index(['entity', 'entity_id'])
export class DeliveryAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  channel: DeliveryChannel;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string | null;

  /** Template or event name; never the rendered message. */
  @Column({ name: 'event_type', type: 'varchar', length: 100, nullable: true })
  event_type: string | null;

  /** Phone or e-mail, partially hidden. */
  @Column({ name: 'target_masked', type: 'varchar', length: 120, nullable: true })
  target_masked: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entity: string | null;

  @Column({ name: 'entity_id', type: 'varchar', length: 64, nullable: true })
  entity_id: string | null;

  /** Template name, variable keys, sizes — no values. */
  @Column({ name: 'request_summary', type: 'jsonb', nullable: true })
  request_summary: Record<string, unknown> | null;

  @Column({ name: 'response_status', type: 'smallint', nullable: true })
  response_status: number | null;

  /** Provider's answer, at most 2 KB. */
  @Column({ name: 'response_body', type: 'text', nullable: true })
  response_body: string | null;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  duration_ms: number | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  request_id: string | null;

  @Column({ name: 'job_run_id', type: 'uuid', nullable: true })
  job_run_id: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  user_id: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  created_at: Date;
}
