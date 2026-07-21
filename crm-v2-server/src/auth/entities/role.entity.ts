import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { RolePermission } from './role-permission.entity';
import { User } from '../../users/entities/user.entity';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  is_system_role: boolean; // System roles cannot be deleted

  /**
   * Direct relationship to RolePermission join table entities.
   * Use this when you need access to role-specific conditions.
   */
  @OneToMany('RolePermission', (rolePermission: RolePermission) => rolePermission.role, {
    cascade: true,
  })
  rolePermissions: Relation<RolePermission[]>;

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
