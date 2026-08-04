import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum CampaignType {
  CONFERENCE = 'CONFERENCE',
  ROADSHOW = 'ROADSHOW',
  OTHER = 'OTHER',
}

/**
 * A marketing/sales campaign or event (e.g. the NASH congress stand).
 *
 * Carries its own cash-requisition costs (stand fees, travel,
 * accommodation) via cash_requisitions.campaign_id, and sources leads
 * via leads.source_campaign_id — which survives lead→deal conversion
 * so cost-per-won-deal can be attributed back to the event.
 *
 * `currency` is the campaign's reporting default only; each
 * requisition still carries its own currency and totals are always
 * grouped per-currency, never merged.
 */
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'enum', enum: CampaignType, default: CampaignType.OTHER })
  type: CampaignType;

  /**
   * R6: the date the campaign was entered into the CRM (distinct from
   * `start_date`, which is when the event runs). Defaults to the creation
   * date on backfill; editable so a campaign logged late can carry its true
   * intake date. Used on the approval "folders" so leads group by campaign
   * + entry date and don't get mixed (R7).
   */
  @Column({ type: 'date', nullable: true })
  entry_date: string | null;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Index()
  @Column({ type: 'uuid' })
  created_by_id: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
