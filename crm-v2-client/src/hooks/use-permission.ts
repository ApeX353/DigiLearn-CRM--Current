import type { Action, Subject } from '~/lib/abilities';
import { useShallow } from 'zustand/react/shallow';
import { useRbacStore } from '~/stores/use-rbac-store'

/**
 * Hook to check if user has a specific permission
 */
export function usePermission(resource: Subject, action: Action) {
  return useRbacStore((state) => state.hasPermission(resource, action))
}

/**
 * Hook to check if user has any of the specified permissions
 */
export function useAnyPermission(checks: Array<{ resource: string; action: string }>) {
  return useRbacStore((state) => state.hasAnyPermission(checks))
}

/**
 * Hook to check if user has all of the specified permissions
 */
export function useAllPermissions(checks: Array<{ resource: string; action: string }>) {
  return useRbacStore((state) => state.hasAllPermissions(checks))
}

/**
 * Hook to check if user has a specific role
 */
export function useRole(roleName: string) {
  return useRbacStore((state) => state.hasRole(roleName))
}

/**
 * Hook to check if user has any of the specified roles
 */
export function useAnyRole(roleNames: string[]) {
  return useRbacStore((state) => state.hasAnyRole(roleNames))
}

/**
 * Hook to get all user permissions
 */
export function usePermissions() {
  // Zustand 5 requires a stable snapshot while the selected fields are unchanged.
  return useRbacStore(useShallow((state) => ({
    permissions: state.permissions,
    roles: state.roles,
    isLoaded: state.isLoaded,
  })))
}
