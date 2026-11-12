import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Permission } from '../auth/entities/permission.entity';
import { Role } from '../auth/entities/role.entity';
import { RolePermission } from '../auth/entities/role-permission.entity';
import { User } from '../users/entities/user.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PermissionAssignmentDto } from './dto/assign-permissions.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { CommonService } from '../common/common.service';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermissionRepository: Repository<RolePermission>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly commonService: CommonService,
    // Role and permission changes decide who may see what; until 14 Oct 2026
    // none of them left an audit row. The actor comes from the request context.
    @Optional() private readonly activityLogs?: ActivityLogsService,
  ) {}

  private audit(
    action: 'create' | 'update' | 'delete',
    entity: 'Role' | 'Permission' | 'RolePermission',
    id: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    summary: string,
  ): void {
    if (!this.activityLogs) return;
    const p =
      action === 'create'
        ? this.activityLogs.logCreate(entity, id, newValues, null, summary)
        : action === 'delete'
          ? this.activityLogs.logDelete(entity, id, oldValues, null, summary)
          : this.activityLogs.logUpdate(entity, id, oldValues, newValues, null, summary);
    void Promise.resolve(p).catch(() => undefined);
  }

  async getAllPermissions(): Promise<Permission[]> {
    return this.permissionRepository.find({
      where: { is_active: true },
      order: { subject: 'ASC', action: 'ASC' },
    });
  }

  /**
   * Get permissions for a role with role-specific conditions
   */
  async getPermissionsByRole(roleId: string): Promise<
    Array<{
      permission: Permission;
      roleSpecificConditions: string | null;
      effectiveConditions: string | null;
    }>
  > {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, is_active: true },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    const rolePermissions = await this.rolePermissionRepository.find({
      where: { role_id: roleId, is_active: true },
      relations: ['permission'],
    });

    return rolePermissions
      .filter((rp) => rp.permission.is_active)
      .map((rp) => ({
        permission: rp.permission,
        roleSpecificConditions: rp.conditions,
        effectiveConditions: rp.conditions ?? rp.permission.conditions,
      }));
  }

  async getPermissionsByRoleName(roleName: string): Promise<RolePermission[]> {
    const role = await this.roleRepository.findOne({
      where: { name: roleName, is_active: true },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });

    if (!role) {
      throw new NotFoundException(`Role with name ${roleName} not found`);
    }

    return role.rolePermissions
      .map((r) => this.commonService.flattenRolePermission(r))
      .filter((p) => p.is_active);
  }

  async getPermissionsForUser(userId: string): Promise<{
    roles: Role[];
    permissions: RolePermission[];
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId, is_active: true },
      relations: [
        'roles',
        'roles.rolePermissions',
        'roles.rolePermissions.permission',
      ],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Get all unique permissions from all user's roles
    const permissionsMap = new Map<string, RolePermission>();

    user.roles.forEach((role) => {
      if (role.is_active) {
        role.rolePermissions.forEach((permission: RolePermission) => {
          if (permission.is_active) {
            permissionsMap.set(
              permission.id,
              this.commonService.flattenRolePermission(permission),
            );
          }
        });
      }
    });

    return {
      roles: user.roles.filter((r) => r.is_active),
      permissions: Array.from(permissionsMap.values()),
    };
  }

  async getAllRoles(): Promise<Role[]> {
    return this.roleRepository.find({
      where: { is_active: true },
      relations: ['rolePermissions.permission'],
      order: { name: 'ASC' },
    });
  }

  async getRoleById(roleId: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, is_active: true },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    return role;
  }

  async createRole(createRoleDto: CreateRoleDto): Promise<Role> {
    const normalizedName = createRoleDto.name.trim();
    if (!normalizedName) {
      throw new BadRequestException('Role name is required');
    }

    const existingRole = await this.roleRepository.findOne({
      where: { name: normalizedName },
    });
    if (existingRole) {
      throw new ConflictException(
        `Role with name "${normalizedName}" already exists`,
      );
    }

    const role = this.roleRepository.create({
      name: normalizedName,
      description: createRoleDto.description?.trim() || null,
      is_active: true,
      is_system_role: false,
    });
    const saved = await this.roleRepository.save(role);
    this.audit('create', 'Role', saved.id, {}, { name: saved.name, description: saved.description }, `Created role "${saved.name}"`);
    return saved;
  }

  async updateRole(
    roleId: string,
    updateRoleDto: UpdateRoleDto,
  ): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, is_active: true },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }
    const before = { name: role.name, description: role.description };

    if (typeof updateRoleDto.name === 'string') {
      const normalizedName = updateRoleDto.name.trim();
      if (!normalizedName) {
        throw new BadRequestException('Role name is required');
      }

      const existingRole = await this.roleRepository.findOne({
        where: { name: normalizedName },
      });

      if (existingRole && existingRole.id !== roleId) {
        throw new ConflictException(
          `Role with name "${normalizedName}" already exists`,
        );
      }

      role.name = normalizedName;
    }

    if (typeof updateRoleDto.description === 'string') {
      const normalizedDescription = updateRoleDto.description.trim();
      role.description = normalizedDescription || null;
    }

    const saved = await this.roleRepository.save(role);
    this.audit('update', 'Role', saved.id, before, { name: saved.name, description: saved.description }, `Updated role "${saved.name}"`);
    return saved;
  }

  async deleteRole(roleId: string): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, is_active: true },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    if (role.is_system_role) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    role.is_active = false;
    await this.roleRepository.save(role);
    await this.rolePermissionRepository.update(
      { role_id: roleId },
      { is_active: false },
    );
    this.audit('delete', 'Role', roleId, { name: role.name, is_active: true }, { is_active: false }, `Deactivated role "${role.name}" and its permission assignments`);
  }

  async createPermission(
    createPermissionDto: CreatePermissionDto,
  ): Promise<Permission> {
    const { default_role_ids = [], ...permissionPayload } = createPermissionDto;

    // Check if permission already exists
    const existingPermission = await this.permissionRepository.findOne({
      where: {
        action: permissionPayload.action,
        subject: permissionPayload.subject,
        inverted: permissionPayload.inverted,
      },
    });

    if (existingPermission) {
      throw new ConflictException(
        `Permission with action "${permissionPayload.action}" and subject "${permissionPayload.subject}" already exists`,
      );
    }

    return this.permissionRepository.manager.transaction(async (manager) => {
      const permissionRepo = manager.getRepository(Permission);
      const roleRepo = manager.getRepository(Role);
      const rolePermissionRepo = manager.getRepository(RolePermission);

      const permission = permissionRepo.create({
        ...permissionPayload,
        inverted: permissionPayload.inverted ?? false,
      });
      const savedPermission = await permissionRepo.save(permission);

      if (default_role_ids.length > 0) {
        const uniqueRoleIds = Array.from(new Set(default_role_ids));
        const roles = await roleRepo.find({
          where: {
            id: In(uniqueRoleIds),
            is_active: true,
          },
        });

        if (roles.length !== uniqueRoleIds.length) {
          const foundRoleIds = roles.map((role) => role.id);
          const missingRoleIds = uniqueRoleIds.filter(
            (roleId) => !foundRoleIds.includes(roleId),
          );
          throw new BadRequestException(
            `Some roles not found: ${missingRoleIds.join(', ')}`,
          );
        }

        const defaultAssignments = uniqueRoleIds.map((roleId) =>
          rolePermissionRepo.create({
            role_id: roleId,
            permission_id: savedPermission.id,
            conditions: null,
            is_active: true,
          }),
        );
        await rolePermissionRepo.save(defaultAssignments);
      }

      return savedPermission;
    });
  }

  async updatePermission(
    permissionId: string,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId, is_active: true },
    });

    if (!permission) {
      throw new NotFoundException(
        `Permission with ID ${permissionId} not found`,
      );
    }

    const nextAction = updatePermissionDto.action ?? permission.action;
    const nextSubject = updatePermissionDto.subject ?? permission.subject;

    if (
      nextAction !== permission.action ||
      nextSubject !== permission.subject
    ) {
      const existingPermission = await this.permissionRepository.findOne({
        where: {
          action: nextAction,
          subject: nextSubject,
        },
      });

      if (existingPermission && existingPermission.id !== permission.id) {
        throw new ConflictException(
          `Permission with action "${nextAction}" and subject "${nextSubject}" already exists`,
        );
      }
    }

    if (typeof updatePermissionDto.action !== 'undefined') {
      permission.action = updatePermissionDto.action;
    }

    if (typeof updatePermissionDto.subject !== 'undefined') {
      permission.subject = updatePermissionDto.subject;
    }

    if (typeof updatePermissionDto.conditions !== 'undefined') {
      permission.conditions = updatePermissionDto.conditions;
    }

    if (typeof updatePermissionDto.description !== 'undefined') {
      permission.description = updatePermissionDto.description;
    }

    if (typeof updatePermissionDto.inverted !== 'undefined') {
      permission.inverted = updatePermissionDto.inverted;
    }

    return this.permissionRepository.save(permission);
  }

  /**
   * Assign permissions to a role with optional role-specific conditions
   */
  async assignPermissionsToRole(
    roleId: string,
    permissionAssignments: PermissionAssignmentDto[],
  ): Promise<RolePermission[]> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, is_active: true },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    const permissionIds = permissionAssignments.map((pa) => pa.permission_id);

    // Verify all permissions exist
    const permissions = await this.permissionRepository.find({
      where: {
        id: In(permissionIds),
        is_active: true,
      },
    });

    if (permissions.length !== permissionIds.length) {
      const foundIds = permissions.map((p) => p.id);
      const missingIds = permissionIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestException(
        `Some permissions not found: ${missingIds.join(', ')}`,
      );
    }

    // Check for existing assignments
    const existingAssignments = await this.rolePermissionRepository.find({
      where: {
        role_id: roleId,
        permission_id: In(permissionIds),
      },
    });

    const existingPermissionIds = existingAssignments.map(
      (ea) => ea.permission_id,
    );

    // Filter out already assigned permissions
    const newAssignments = permissionAssignments.filter(
      (pa) => !existingPermissionIds.includes(pa.permission_id),
    );

    if (newAssignments.length === 0) {
      throw new BadRequestException(
        'All specified permissions are already assigned to this role',
      );
    }

    // Create RolePermission entries with optional conditions
    const rolePermissions = newAssignments.map((assignment) => {
      return this.rolePermissionRepository.create({
        role_id: roleId,
        permission_id: assignment.permission_id,
        conditions: assignment.conditions,
        is_active: true,
      });
    });

    const saved = await this.rolePermissionRepository.save(rolePermissions);
    const granted = permissions
      .filter((p) => newAssignments.some((a) => a.permission_id === p.id))
      .map((p) => `${p.action} ${p.subject}`);
    this.audit(
      'update',
      'Role',
      roleId,
      {},
      { granted, conditions: newAssignments.map((a) => ({ permission_id: a.permission_id, conditions: a.conditions ?? null })) },
      `Granted ${granted.length} permission(s) to role "${role.name}": ${granted.join(', ').slice(0, 300)}`,
    );
    return saved;
  }

  /**
   * Unassign permissions from a role
   */
  async unassignPermissionsFromRole(
    roleId: string,
    permissionIds: string[],
  ): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, is_active: true },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    // Find the role-permission assignments to remove
    const assignmentsToRemove = await this.rolePermissionRepository.find({
      where: {
        role_id: roleId,
        permission_id: In(permissionIds),
      },
    });

    if (assignmentsToRemove.length === 0) {
      throw new BadRequestException(
        'None of the specified permissions are assigned to this role',
      );
    }

    // Delete the assignments
    await this.rolePermissionRepository.remove(assignmentsToRemove);
  }

  /**
   * Update role-specific conditions for an existing role-permission assignment
   */
  async updateRolePermissionConditions(
    roleId: string,
    permissionId: string,
    conditions?: string | null,
  ): Promise<RolePermission> {
    const rolePermission = await this.rolePermissionRepository.findOne({
      where: {
        role_id: roleId,
        permission_id: permissionId,
      },
      relations: ['permission', 'role'],
    });

    if (!rolePermission) {
      throw new NotFoundException(
        `Permission ${permissionId} is not assigned to role ${roleId}`,
      );
    }

    const before = { conditions: rolePermission.conditions };
    rolePermission.conditions = conditions ?? null;
    const saved = await this.rolePermissionRepository.save(rolePermission);
    this.audit(
      'update',
      'RolePermission',
      saved.id,
      before,
      { conditions: saved.conditions },
      `Changed conditions for ${rolePermission.permission?.action ?? ''} ${rolePermission.permission?.subject ?? permissionId} on role "${rolePermission.role?.name ?? roleId}"`,
    );
    return saved;
  }

  async deletePermission(permissionId: string): Promise<void> {
    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException(
        `Permission with ID ${permissionId} not found`,
      );
    }

    // Soft delete by setting is_active to false
    permission.is_active = false;
    await this.permissionRepository.save(permission);
    this.audit('delete', 'Permission', permissionId, { action: permission.action, subject: permission.subject, is_active: true }, { is_active: false }, `Deactivated permission ${permission.action} ${permission.subject}`);
  }
}
