import type { RolePermission, Permission } from "~/api/rbac/types";

/**
 * Flattens a RolePermission object by extracting permission fields
 * and merging them at the root level, excluding the nested permission and role objects.
 *
 * @param rolePermission - The RolePermission object with nested permission and role
 * @returns Flattened object with permission fields at root level
 */
export function flattenRolePermission(
  rolePermission: RolePermission
): RolePermission & Partial<Permission> {
  const { permission, role, ...rest } = rolePermission;

  return {
    ...rest,
    role,
    action: permission?.action ?? null,
    subject: permission?.subject ?? null,
    description: permission?.description ?? null,
    inverted: permission?.inverted ?? null,
    fields: permission?.fields ?? null,
    permission,
  };
}
