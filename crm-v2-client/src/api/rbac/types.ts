export type PermissionAction =
  | "manage"
  | "read"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "import";

export interface Permission {
  id: string;
  action: PermissionAction | string;
  subject: string;
  conditions: string | null;
  description: string | null;
  is_active: boolean;
  inverted: boolean;
  created_at: string;
  updated_at: string;
  fields?: string[] | null;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  is_system_role?: boolean;
  rolePermissions: RolePermission[];
  created_at?: string;
  updated_at?: string;
}

export interface RolePermission {
  id: string;
  role?: Role;
  permission: Permission;
  permission_id: string;
  role_id: string;
  is_active: boolean;
  conditions: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserPermissionRow
  extends Omit<RolePermission, "permission" | "role"> {
  action: PermissionAction | string;
  subject: string;
  description?: string | null;
  inverted?: boolean | null;
  permission?: Permission | null;
  role?: Role | null;
}

export interface UserPermissions {
  user_id: string;
  roles: Role[];
  permissions: UserPermissionRow[];
}

export interface CheckPermissionRequest {
  resource: string;
  action: string;
}

export interface CheckPermissionResponse {
  hasPermission: boolean;
}

export interface PermissionAssignmentInput {
  permission_id: string;
  conditions?: string | null;
}

export interface AssignPermissionsRequest {
  permissions: PermissionAssignmentInput[];
}

export interface UnassignPermissionsRequest {
  permission_ids: string[];
}

export interface AssignPermissionsResponse {
  success: boolean;
  message?: string;
  data: RolePermission[];
}

export interface UnassignPermissionsResponse {
  success: boolean;
  message?: string;
}

export interface UpdateRolePermissionConditionRequest {
  roleId: string;
  permissionId: string;
  conditions: string | null;
}

export interface UpdateRolePermissionConditionResponse {
  success: boolean;
  message?: string;
  data: RolePermission;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface CreateRoleResponse {
  success: boolean;
  message?: string;
  data: Role;
}

export interface UpdateRoleRequest {
  roleId: string;
  data: {
    name?: string;
    description?: string;
  };
}

export interface UpdateRoleResponse {
  success: boolean;
  message?: string;
  data: Role;
}

export interface DeleteRoleRequest {
  roleId: string;
}

export interface DeleteRoleResponse {
  success: boolean;
  message?: string;
}

export interface CreatePermissionRequest {
  action: PermissionAction;
  subject: string;
  conditions?: string;
  description?: string;
  default_role_ids?: string[];
  inverted?: boolean;
}

export interface CreatePermissionResponse {
  success: boolean;
  message?: string;
  data: Permission;
}

export interface UpdatePermissionRequest {
  permissionId: string;
  data: {
    action?: PermissionAction;
    subject?: string;
    conditions?: string | null;
    description?: string | null;
    inverted?: boolean;
  };
}

export interface UpdatePermissionResponse {
  success: boolean;
  message?: string;
  data: Permission;
}
