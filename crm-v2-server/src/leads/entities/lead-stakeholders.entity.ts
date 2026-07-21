import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lead } from './lead.entity';
import { CONTACT_ROLES, type ContactRole } from '../../contacts/constants';
import { Contact } from '../../contacts/entities/contact.entity';

export enum DecisionRole {
  DECISION_MAKER = 'decision_maker',
  INFLUENCER = 'influencer',
  GATEKEEPER = 'gatekeeper',
  CHAMPION = 'champion',
  BLOCKER = 'blocker',
}

export enum InfluenceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

@Entity('lead_stakeholders')
@Unique(['lead_id', 'contact_id'])
@Index(['lead_id'])
@Index(['contact_id'])
export class LeadStakeholder {
  @Column({ type: 'varchar', length: 36, primary: true })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  lead_id: string;

  @Column({ type: 'varchar', length: 36 })
  contact_id: string;

  @Column({ type: 'enum', enum: CONTACT_ROLES, nullable: true })
  role: ContactRole; // Job title/role

  @Column({
    type: 'enum',
    enum: DecisionRole,
  })
  decision_role: DecisionRole;

  @Column({
    type: 'enum',
    enum: InfluenceLevel,
    default: InfluenceLevel.MEDIUM,
  })
  influence_level: InfluenceLevel;

  @Column({ type: 'tinyint', default: 0 })
  is_primary: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => Lead, (lead) => lead.stakeholders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;
}
