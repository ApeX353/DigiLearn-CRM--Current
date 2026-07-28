import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  OneToOne,
  OneToMany,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'first_name' })
  first_name: string;

  @Column({ name: 'last_name' })
  last_name: string;

  @Column({ default: true, name: 'is_active' })
  is_active: boolean;

  /**
   * AUTO2: provinces this rep covers, stored as a JSON array in text
   * (e.g. '["Bulawayo","Matabeleland South"]'). NULL/empty = no
   * territory configured; the rep then competes for every lead on load
   * alone. Read by the auto-assign engine's location-first routing.
   */
  @Column({ name: 'territory_provinces', type: 'text', nullable: true })
  territory_provinces: string | null;

  // Relations will be set up with circular imports handled properly
  @ManyToMany('Role', 'users', { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles: any[]; // Will be Role[] type

  @OneToOne('AccountSecurity', 'user', { cascade: true })
  account_security: any; // Will be AccountSecurity type

  @OneToMany('AuthSession', 'user')
  auth_sessions: any[]; // Will be AuthSession[] type

  @OneToMany('Activity', 'createdBy')
  createdActivities: any[]; // Will be Activity[] type

  @OneToMany('Activity', 'assignedTo')
  assignedActivities: any[]; // Will be Activity[] type

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}