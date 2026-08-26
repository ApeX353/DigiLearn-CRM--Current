import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { RolePermission } from './role-permission.entity';

@Entity('permissions')
@Index(['action', 'subject', 'inverted'], { unique: true })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  action: string; // e.g., 'create', 'read', 'update', 'delete', 'manage'

  @Column({ length: 50 })
  subject: string; // e.g., 'User', 'Role', 'Student', 'all'

  /**
   * Default conditions for this permission.
   * These can be overridden by role-specific conditions in RolePermission.
   */
  @Column({ type: 'text', nullable: true })
  conditions: string | null; // JSON string for conditional permiss
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  inverted: boolean;

  /**
   * Direct relationship to RolePermission join table entities.
   * Use this when you need access to role-specific conditions.
   */
  @OneToMany(
    'RolePermission',
    (rolePermission: RolePermission) => rolePermission.permission,
    {
      cascade: true,
    },
  )
  rolePermissions: Relation<RolePermission[]>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
