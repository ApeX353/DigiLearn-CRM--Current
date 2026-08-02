import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Campaign } from '../../campaigns/entities/campaign.entity';

export enum LeadImportBatchStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** How a parsed row relates to something already in the system. */
export type ImportRowDuplicateKind =
  | 'existing-school'
  | 'existing-lead'
  | 'within-batch';

/**
 * One parsed row of an import, stored as JSONB on the batch. Nothing here is
 * a real school/lead yet — these are staged for a manager to approve. The
 * dedup check runs at upload time and stamps `duplicate` so the reviewer sees
 * collisions before anything goes live.
 */
export interface PendingImportRow {
  rowNumber: number;
  schoolName: string;
  contactFirst: string;
  contactLast: string;
  province: string | null;
  region: 'urban' | 'rural' | null;
  city?: string;
  district?: string;
  phone?: string;
  /** CON1: optional second phone number recognised from the sheet. */
  secondary_phone?: string;
  role: string;
  /** importable = has the fields needed to create a lead; invalid = missing. */
  status: 'importable' | 'invalid';
  invalidReason?: string;
  duplicate?: { kind: ImportRowDuplicateKind; name: string; id?: string };
  /** Reviewer intent. Defaults: skip if duplicate or invalid, else approve. */
  decision: 'approve' | 'skip';
}

/**
 * A staged bulk import awaiting manager approval — the gate that keeps
 * imported data OUT of the live CRM until a human signs off (TEST-BACKLOG
 * §2). The uploaded file is parsed and dedup-checked into `rows`; only on
 * approval are the real schools/contacts/leads created (attributed to
 * `campaign` if the import ran from inside a campaign). A failed-then-retried
 * import is just another pending batch that can be discarded — it can never
 * silently double the CRM again.
 */
@Entity('lead_import_batches')
@Index(['status'])
export class LeadImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename: string | null;

  @Column({ type: 'uuid' })
  uploaded_by_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploaded_by: User;

  /** Set when the import was run from inside a campaign — every created lead
   *  is stamped with it for source attribution. */
  @Column({ type: 'uuid', nullable: true })
  campaign_id: string | null;

  @ManyToOne(() => Campaign, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign | null;

  @Column({
    type: 'enum',
    enum: LeadImportBatchStatus,
    default: LeadImportBatchStatus.PENDING,
  })
  status: LeadImportBatchStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  rows: PendingImportRow[];

  /** Denormalised counts so the pending list renders without parsing rows. */
  @Column({ type: 'int', default: 0 })
  total_rows: number;

  @Column({ type: 'int', default: 0 })
  importable_count: number;

  @Column({ type: 'int', default: 0 })
  duplicate_count: number;

  /** How many real leads the approval actually created (null until approved). */
  @Column({ type: 'int', nullable: true })
  created_count: number | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  decided_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  decided_by_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'decided_by_id' })
  decided_by: User | null;
}
