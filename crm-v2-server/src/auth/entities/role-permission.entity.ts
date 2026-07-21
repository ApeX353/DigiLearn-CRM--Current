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
import type { Relation } from 'typeorm';
import type { Role } from './role.entity';
import type { Permission } from './permission.entity';

/**
 * RolePermission entity represents the many-to-many relationship
 * between roles and permissions with additional metadata.
 *
 * This allows for role-specific conditions that override or customize
 * the default conditions defined in the Permission entity.
 */
@Entity('role_permissions')
@Index(['role_id', 'permission_id'], { unique: true })
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  role_id: string;

  @Column({ type: 'varchar', length: 36 })
  permission_id: string;

  @Column({ type: 'text', nullable: true })
  conditions: string | null; // JSON string for role-specific conditional permissions

  @Column({ default: true })
  is_active: boolean;

  @ManyToOne('Role', (role: Role) => role.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: Relation<Role>;

  @ManyToOne('Permission', (permission: Permission) => permission.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'permission_id' })
  permission: Relation<Permission>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
