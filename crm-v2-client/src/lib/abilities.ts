import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type Subject as CaslSubject,
} from "@casl/ability";
import type { Lead } from "~/api/leads";
import type { Activity } from "~/api/activities";

import type { Permission, Role, UserPermissionRow } from "~/api/rbac/types";
import { type User } from "~/stores/use-auth-store";

// shape the PermissionCondition
export interface PermissionCondition {
  [key: string]: string | number | boolean | null | PermissionCondition;
}

// Define the shape of your abilities
// Action: the actions users can perform (e.g., 'read', 'create', 'update', 'delete')
export const PERMISSION_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "import",
  "export",
] as const;
export type Action = (typeof PERMISSION_ACTIONS)[number] | "manage";

// Subject: the resources/subjects (e.g., 'User', 'Course', 'Assignment')
type UserSubject = User | "User";
type RoleSubject = Role | "Role";
type PermissionSubject = Permission | "Permission";
type LeadSubject = Lead | "Lead";
type ActivitySubject = Activity | "Activity";
type DashboardSubject = "Dashboard";

export type Subject =
  | UserSubject
  | PermissionSubject
  | RoleSubject
  | LeadSubject
  | ActivitySubject
  | DashboardSubject
  | "all";

export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * Creates CASL abilities from user permissions
 * @param permissions - Array of user permissions from the API
 * @returns CASL Ability instance
 */
export function getUserAbilities(
  user: Pick<User, "id" | "roles"> | null,
  permissions: Array<Permission | UserPermissionRow>,
): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(
    createMongoAbility,
  );
  if (user) {
    if (
      permissions.some(
        (permission) =>
          permission.action === "manage" && permission.subject === "all",
      )
    ) {
      can("manage", "all");
      return build();
    }

    // Build abilities from permissions array
    permissions.forEach((permission) => {
      const action =
        (permission as UserPermissionRow).action ??
        (permission as UserPermissionRow).permission?.action;
      const subject =
        (permission as UserPermissionRow).subject ??
        (permission as UserPermissionRow).permission?.subject;

      if (!action || !subject) {
        return;
      }

      const rawConditions =
        permission.conditions ??
        (permission as UserPermissionRow).permission?.conditions ??
        null;

      let conditions: PermissionCondition | undefined;
      if (rawConditions && rawConditions.trim().length > 0) {
        try {
          conditions = PermissionHelper.parseCondition(
            JSON.parse(rawConditions),
            {
              id: user.id,
            },
          );
        } catch (error) {
          console.error("Failed to parse permission condition:", error);
        }
      }

      const inverted =
        permission.inverted ??
        (permission as UserPermissionRow).permission?.inverted ??
        false;

      if (inverted) {
        cannot(action as Action, subject as CaslSubject, conditions);
      } else {
        can(action as Action, subject as CaslSubject, conditions);
      }
    });
  }

  return build();
}

/**
 * Creates an empty ability instance (for unauthenticated users)
 * @returns CASL Ability instance with no permissions
 */
export function createEmptyAbility(): AppAbility {
  const { build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  return build();
}

class PermissionHelper {
  static parseCondition(
    condition: PermissionCondition | null,
    variables: Record<string, string>,
  ): PermissionCondition | undefined {
    if (!condition) return undefined;
    const parsedCondition: PermissionCondition = {};
    for (const [key, rawValue] of Object.entries(condition)) {
      if (rawValue !== null && typeof rawValue === "object") {
        const value = this.parseCondition(rawValue, variables);
        if (typeof value === "undefined") {
          throw new ReferenceError(`Variable ${rawValue} is not defined`);
        }
        parsedCondition[key] = value;
        continue;
      }
      if (typeof rawValue !== "string") {
        parsedCondition[key] = rawValue;
        continue;
      }
      // find placeholder "${}""
      const matches = /\${(.*?)}/g.exec(rawValue);
      if (!matches) {
        parsedCondition[key] = rawValue;
        continue;
      }
      const value = variables[matches[1]];
      if (typeof value === "undefined") {
        throw new ReferenceError(`Variable ${rawValue} is not defined`);
      }
      parsedCondition[key] = value;
    }
    return parsedCondition;
  }
}
