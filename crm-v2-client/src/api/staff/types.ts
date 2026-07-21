import type { User } from "~/stores/use-auth-store";
import type{ Role } from "../rbac";

export const USER_STATUS = ["all", "active", "inactive"] as const;

export type UserStatus = (typeof USER_STATUS)[number];

export interface Staff extends Omit<User, 'roles'> {
  id: string;
  is_active: boolean;
  created_at: Date;
  roles: Role[]
}

