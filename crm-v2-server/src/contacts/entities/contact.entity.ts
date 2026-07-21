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
import { PreferredContactMethod } from '../constants/preferred-contact-method';
import { Activity } from '../../activities/entities/activity.entity';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, (school) => school.contacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ name: 'school_id', type: 'varchar', length: 36 })
  school_id: string;

  @Column({ type: 'varchar', length: 100 })
  first_name: string;

  @Column({ type: 'varchar', length: 100 })
  last_name: string;

  @Column({ type: 'enum', enum: CONTACT_ROLES, nullable: true })
  role: ContactRole | null;

  @Column({ default: false })
  is_primary: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

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
