import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Permission,
  Role,
  UserPermissions,
  UserPermissionRow,
} from "~/api/rbac/types";
import {
  type Action,
  createEmptyAbility,
  getUserAbilities,
  type Subject,
  type AppAbility,
} from "~/lib/abilities";

export interface RbacState {
  // State
  roles: Role[];
  permissions: Array<Permission | UserPermissionRow>;
  ability: AppAbility;
  isLoaded: boolean;

  // Actions
  setPermissions: (userPermissions: UserPermissions) => void;
  clearPermissions: () => void;
  hasPermission: (resource: Subject, action: Action) => boolean;
  hasAnyPermission: (
    checks: Array<{ resource: string; action: string }>,
  ) => boolean;
  hasAllPermissions: (
    checks: Array<{ resource: string; action: string }>,
  ) => boolean;
  hasRole: (roleName: string) => boolean;
  hasAnyRole: (roleNames: string[]) => boolean;
}

export const useRbacStore = create<RbacState>()(
  persist(
    (set, get) => ({
      // Initial state
      roles: [],
      permissions: [],
      ability: createEmptyAbility(),
      isLoaded: false,

      // Set user permissions and roles
      setPermissions: (userPermissions: UserPermissions) => {
        const ability = getUserAbilities(
          {
            id: userPermissions.user_id,
            roles: userPermissions.roles.map((role) => role.name),
          },
          userPermissions.permissions,
        );
        set({
          roles: userPermissions.roles,
          permissions: userPermissions.permissions,
          ability,
          isLoaded: true,
        });
      },

      // Clear all permissions and roles
      clearPermissions: () => {
        set({
          roles: [],
          permissions: [],
          ability: createEmptyAbility(),
          isLoaded: false,
        });
      },

      // Check if user has a specific permission
      hasPermission: (resource: Subject, action: Action) => {
        const { ability } = get();
        return ability.can(action, resource);
      },

      // Check if user has any of the specified permissions
      hasAnyPermission: (checks) => {
        const { permissions } = get();
        return checks.some(({ resource, action }) =>
          permissions.some(
            (perm) =>
              "subject" in perm &&
              "action" in perm &&
              perm.subject === resource &&
              perm.action === action,
          ),
        );
      },

      // Check if user has all of the specified permissions
      hasAllPermissions: (checks) => {
        const { permissions } = get();
        return checks.every(({ resource, action }) =>
          permissions.some(
            (perm) =>
              "subject" in perm &&
              "action" in perm &&
              perm.subject === resource &&
              perm.action === action,
          ),
        );
      },

      // Check if user has a specific role
      hasRole: (roleName: string) => {
        const { roles } = get();
        return roles.some((role) => role.name === roleName);
      },

      // Check if user has any of the specified roles
      hasAnyRole: (roleNames: string[]) => {
        const { roles } = get();
        return roleNames.some((roleName) =>
          roles.some((role) => role.name === roleName),
        );
      },
    }),
    {
      name: "rbac-storage",
      partialize: (state) => ({
        roles: state.roles,
        permissions: state.permissions,
        isLoaded: state.isLoaded,
        // Don't persist ability - it will be recreated from permissions
      }),
    },
  ),
);
