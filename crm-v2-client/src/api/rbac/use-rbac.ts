import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import { useAuthStore } from "~/stores/use-auth-store";
import { useRbacStore } from "~/stores/use-rbac-store";
import type {
  AssignPermissionsRequest,
  AssignPermissionsResponse,
  CheckPermissionRequest,
  CheckPermissionResponse,
  CreatePermissionRequest,
  CreatePermissionResponse,
  CreateRoleRequest,
  CreateRoleResponse,
  DeleteRoleRequest,
  DeleteRoleResponse,
  Permission,
  PermissionAssignmentInput,
  Role,
  RolePermission,
  UnassignPermissionsRequest,
  UnassignPermissionsResponse,
  UpdateRoleRequest,
  UpdateRoleResponse,
  UpdateRolePermissionConditionRequest,
  UpdateRolePermissionConditionResponse,
  UpdatePermissionRequest,
  UpdatePermissionResponse,
  UserPermissions,
} from "./types";

type ListResponse<T> = { success?: boolean; count?: number; data: T[] };
type DataResponse<T> = { success?: boolean; message?: string; data: T };

export const rbacKeys = {
  all: ["rbac"] as const,
  permissions: () => [...rbacKeys.all, "permissions"] as const,
  allPermissions: () => [...rbacKeys.permissions(), "all"] as const,
  userPermissions: (userId: string) =>
    [...rbacKeys.permissions(), "user", userId] as const,
  checkPermission: (resource: string, action: string) =>
    [...rbacKeys.all, "check", resource, action] as const,
  roles: () => [...rbacKeys.all, "roles"] as const,
  role: (id: string) => [...rbacKeys.roles(), id] as const,
  rolePermissionsByName: (name: string) =>
    [...rbacKeys.roles(), "name", name] as const,
};

const rbacApi = {
  getUserPermissions: (userId: string): Promise<UserPermissions> =>
    apiClientAuth
      .get<DataResponse<UserPermissions>>(`/rbac/permissions/user/${userId}`)
      .then((res) => res.data.data),

  checkPermission: (
    data: CheckPermissionRequest,
  ): Promise<CheckPermissionResponse> =>
    apiClientAuth.post("/rbac/check-permission", data).then((res) => res.data),

  getAllPermissions: (): Promise<ListResponse<Permission>> =>
    apiClientAuth
      .get<ListResponse<Permission>>("/rbac/permissions")
      .then((res) => res.data),

  getRoles: (): Promise<ListResponse<Role>> =>
    apiClientAuth.get<ListResponse<Role>>("/rbac/roles").then((res) => res.data),

  getRole: (roleId: string): Promise<Role> =>
    apiClientAuth
      .get<DataResponse<Role>>(`/rbac/roles/${roleId}`)
      .then((res) => res.data.data),

  getRolePermissionsByName: (roleName: string): Promise<ListResponse<RolePermission>> =>
    apiClientAuth
      .get<ListResponse<RolePermission>>("/rbac/permissions/role", {
        params: { name: roleName },
      })
      .then((res) => res.data),

  createRole: (data: CreateRoleRequest): Promise<CreateRoleResponse> =>
    apiClientAuth.post("/rbac/roles", data).then((res) => res.data),

  updateRole: ({ roleId, data }: UpdateRoleRequest): Promise<UpdateRoleResponse> =>
    apiClientAuth.patch(`/rbac/roles/${roleId}`, data).then((res) => res.data),

  deleteRole: ({ roleId }: DeleteRoleRequest): Promise<DeleteRoleResponse> =>
    apiClientAuth.delete(`/rbac/roles/${roleId}`).then((res) => res.data),

  createPermission: (
    data: CreatePermissionRequest,
  ): Promise<CreatePermissionResponse> =>
    apiClientAuth.post("/rbac/permissions", data).then((res) => res.data),

  updatePermission: ({
    permissionId,
    data,
  }: UpdatePermissionRequest): Promise<UpdatePermissionResponse> =>
    apiClientAuth.patch(`/rbac/permissions/${permissionId}`, data).then((res) => res.data),

  assignPermissionsToRole: (
    roleId: string,
    data: AssignPermissionsRequest,
  ): Promise<AssignPermissionsResponse> =>
    apiClientAuth
      .post(`/rbac/roles/${roleId}/permissions/assign`, data)
      .then((res) => res.data),

  unassignPermissionsFromRole: (
    roleId: string,
    data: UnassignPermissionsRequest,
  ): Promise<UnassignPermissionsResponse> =>
    apiClientAuth
      .post(`/rbac/roles/${roleId}/permissions/unassign`, data)
      .then((res) => res.data),

  updateRolePermissionCondition: ({
    roleId,
    permissionId,
    conditions,
  }: UpdateRolePermissionConditionRequest): Promise<UpdateRolePermissionConditionResponse> =>
    apiClientAuth
      .patch(`/rbac/roles/${roleId}/permissions/${permissionId}`, {
        conditions,
      })
      .then((res) => res.data),
};

export function useUserPermissions() {
  const { user, isAuthenticated } = useAuthStore();
  const setPermissions = useRbacStore((state) => state.setPermissions);

  const query = useQuery({
    queryKey: rbacKeys.userPermissions(user?.id || ""),
    queryFn: () => rbacApi.getUserPermissions(user!.id),
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (query.data) {
      setPermissions(query.data);
    }
  }, [query.data, setPermissions]);

  useEffect(() => {
    if (query.error) {
      console.error(
        "Failed to fetch user permissions:",
        handleApiError(query.error),
      );
    }
  }, [query.error]);

  return query;
}

export function useCheckPermission(resource: string, action: string) {
  return useQuery({
    queryKey: rbacKeys.checkPermission(resource, action),
    queryFn: () => rbacApi.checkPermission({ resource, action }),
    staleTime: 5 * 60 * 1000,
    enabled: !!resource && !!action,
  });
}

export function useCheckPermissionMutation() {
  return useMutation({
    mutationFn: rbacApi.checkPermission,
    onError: (error) => {
      console.error("Permission check error:", handleApiError(error));
    },
  });
}

export function useAllPermissions() {
  return useQuery({
    queryKey: rbacKeys.allPermissions(),
    queryFn: rbacApi.getAllPermissions,
    staleTime: 10 * 60 * 1000,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: rbacKeys.roles(),
    queryFn: rbacApi.getRoles,
    staleTime: 10 * 60 * 1000,
  });
}

export function useRole(roleId: string) {
  return useQuery({
    queryKey: rbacKeys.role(roleId),
    queryFn: () => rbacApi.getRole(roleId),
    staleTime: 10 * 60 * 1000,
    enabled: !!roleId,
  });
}

export function useRolePermissionsByName(roleName: string) {
  return useQuery({
    queryKey: rbacKeys.rolePermissionsByName(roleName),
    queryFn: () => rbacApi.getRolePermissionsByName(roleName),
    staleTime: 10 * 60 * 1000,
    enabled: !!roleName,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoleRequest) => rbacApi.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateRoleRequest) => rbacApi.updateRole(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
      queryClient.invalidateQueries({ queryKey: rbacKeys.role(variables.roleId) });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DeleteRoleRequest) => rbacApi.deleteRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
    },
  });
}

export function useCreatePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePermissionRequest) => rbacApi.createPermission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.allPermissions() });
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
    },
  });
}

export function useUpdatePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePermissionRequest) => rbacApi.updatePermission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.allPermissions() });
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
    },
  });
}

export function useAssignPermissionsToRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      permissions,
    }: {
      roleId: string;
      permissions: PermissionAssignmentInput[];
    }) =>
      rbacApi.assignPermissionsToRole(roleId, {
        permissions,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: rbacKeys.role(variables.roleId),
      });
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
    },
  });
}

export function useUnassignPermissionsFromRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      roleId,
      permissionIds,
    }: {
      roleId: string;
      permissionIds: string[];
    }) =>
      rbacApi.unassignPermissionsFromRole(roleId, {
        permission_ids: permissionIds,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: rbacKeys.role(variables.roleId),
      });
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
    },
  });
}

export function useUpdateRolePermissionCondition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rbacApi.updateRolePermissionCondition,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: rbacKeys.role(variables.roleId) });
      queryClient.invalidateQueries({ queryKey: rbacKeys.roles() });
    },
  });
}
