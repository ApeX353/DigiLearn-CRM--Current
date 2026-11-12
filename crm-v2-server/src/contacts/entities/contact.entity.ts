import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { School } from '../../schools/entities/schools.entity';
import { CONTACT_ROLES, type ContactRole } from '../constants/contact-roles';
import {
  STAKEHOLDER_TYPES,
  type StakeholderType,
} from '../constants/stakeholder-types';
import { PreferredContactMethod } from '../constants/preferred-contact-method';
import { Activity } from '../../activities/entities/activity.entity';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, (school) => school.contacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ name: 'school_id', type: 'uuid' })
  school_id: string;

  @Column({ type: 'varchar', length: 100 })
  first_name: string;

  @Column({ type: 'varchar', length: 100 })
  last_name: string;

  @Column({ type: 'enum', enum: CONTACT_ROLES, nullable: true })
  role: ContactRole | null;

  /**
   * Relationship category — see `stakeholder-types.ts`. Nullable so
   * legacy rows keep working; new records should populate it.
   * Non-school stakeholders (government, partners, donors) still live
   * in this table keyed off the nearest related school for locality;
   * `organization_name` captures the real org name when the school
   * is not the stakeholder's actual employer.
   */
  @Column({ type: 'enum', enum: STAKEHOLDER_TYPES, nullable: true })
  stakeholder_type: StakeholderType | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  organization_name: string | null;

  /**
   * `true` for people who are, or are linked to, a real sales lead
   * (the historical shape of this table). `false` for pure
   * relationship-maintenance stakeholders — they still receive
   * activities, but they never enter the pipeline and should not
   * appear in the Leads list.
   */
  @Column({ type: 'boolean', default: true, name: 'is_sales_lead' })
  is_sales_lead: boolean;

  @Column({ default: false })
  is_primary: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  /**
   * Optional second phone number (CON1). Headmasters often carry two
   * numbers; this is always optional and never required anywhere.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  secondary_phone: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsapp_number: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  preferred_contact_method: PreferredContactMethod | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at: Date | null;

  @OneToMany(() => Activity, (activity) => activity.contact)
  activities: Activity[];
}
