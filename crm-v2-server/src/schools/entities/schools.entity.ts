import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Contact } from '../../contacts/entities/contact.entity';
import { Lead } from '../../leads/entities/lead.entity';
import { SCHOOL_TYPES, type SchoolType } from '../constants/school-types';
import { Deal } from '../../deals/entities/deal.entity';
import {
  CHURCH_DENOMINATIONS,
  type Region,
  REGIONS,
  type ChurchDenomination,
  OWNERSHIP_TYPES,
  type OwnershipType,
  PROVINCES,
  type Province,
} from '../constants';

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: SCHOOL_TYPES })
  school_type: SchoolType;

  @Column({ type: 'enum', enum: CHURCH_DENOMINATIONS })
  church_denomination: ChurchDenomination;

  @Column({ type: 'enum', enum: OWNERSHIP_TYPES })
  ownership_type: OwnershipType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'enum', enum: PROVINCES })
  province: Province;

  @Column({ nullable: true })
  district: string;

  @Column({ type: 'enum', enum: REGIONS })
  region: Region;

  @Column({ type: 'varchar', length: 255, nullable: true })
  principal_name: string | null;

  @Column({ type: 'int', nullable: true })
  student_count: number | null;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => Contact, (contact) => contact.school)
  contacts: Contact[];

  @OneToMany(() => Deal, (deal) => deal.school)
  deals: Deal[];

  @OneToMany(() => Lead, (lead) => lead.school)
  leads: Lead[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at: Date | null;
}
