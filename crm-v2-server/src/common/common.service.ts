import { Injectable } from '@nestjs/common';
import { Permission } from '../auth/entities/permission.entity';
import { RolePermission } from '../auth/entities/role-permission.entity';

@Injectable()
export class CommonService {
  /**
   * Flattens a RolePermission object by extracting permission fields
   * and merging them at the root level, excluding the nested permission and role objects.
   *
   * @param rolePermission - The RolePermission object with nested permission and role
   * @returns Flattened object with permission fields at root level
   */
  flattenRolePermission(rolePermission: RolePermission): RolePermission & Partial<Permission> {
    const { permission, role, ...rest } = rolePermission;

    return {
      ...rest,
      role,
      action: permission?.action ?? null,
      subject: permission?.subject ?? null,
      description: permission?.description ?? null,
      inverted: permission?.inverted ?? null,
      //fields: permission?.fields ?? null,
      permission
    };
  }
}
