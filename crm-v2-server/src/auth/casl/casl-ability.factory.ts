import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  ExtractSubjectType,
  InferSubjects,
  MongoAbility,
  createMongoAbility,
} from '@casl/ability';
import { User } from '../../users/entities/user.entity';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { Action } from '../constants/permissions';
import { CommonService } from '../../common/common.service';
import { Deal } from '../../deals/entities/deal.entity';
import { Lead } from '../../leads/entities';
import { Activity } from '../../activities/entities/activity.entity';
import { Quote } from '../../quotes/entities/quote.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';

// Define all possible subjects for permissions
type Subjects =
  | InferSubjects<typeof User>
  | InferSubjects<typeof Role>
  | InferSubjects<typeof Permission>
  | 'User'
  | 'Role'
  | 'Permission'
  | 'Report'
  | 'Settings'
  | 'Deal'
  | InferSubjects<typeof Deal>
  | 'Lead'
  | InferSubjects<typeof Lead>
  | 'Contact'
  | 'School'
  | 'Invoice' | InferSubjects<typeof Invoice>
  | 'Quote' | InferSubjects<typeof Quote>
  | 'Payment'
  | 'Product'
  | 'Pipeline'
  | 'Activity'
  | InferSubjects<typeof Activity>
  | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

export interface IAbilityUser {
  id: string;
  email: string;
  roles?: Role[];
}

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly commonService: CommonService) {}

  private resolveConditionVariables(
    conditions: string,
    user: Pick<IAbilityUser, 'id' | 'email'>,
  ): string {
    return conditions
      .replace(/\{\{user\.id\}\}/g, user.id)
      .replace(/\{\{user\.email\}\}/g, user.email)
      .replace(/\$\{id\}/g, user.id)
      .replace(/\$\{email\}/g, user.email);
  }

  private parseConditions(
    conditions: string | null | undefined,
    user: Pick<IAbilityUser, 'id' | 'email'>,
  ): Record<string, unknown> | undefined {
    if (!conditions || conditions.trim().length === 0) {
      return undefined;
    }

    try {
      const conditionsStr = this.resolveConditionVariables(conditions, user);
      return JSON.parse(conditionsStr) as Record<string, unknown>;
    } catch (error) {
      console.error('Failed to parse permission conditions:', error);
      return undefined;
    }
  }

  createForUser(user: IAbilityUser) {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    if (!user || !user.roles) {
      // No permissions for users without roles
      return build({
        detectSubjectType: (item) =>
          item.constructor as ExtractSubjectType<Subjects>,
      });
    }

    // Extract all permissions from user's roles using the helper method
    const permissions = user.roles
      .flatMap((role) => role.rolePermissions || [])
      .filter((rp) => rp.is_active !== false) // Filter out inactive permissions
      .map((rolePermission) =>
        this.commonService.flattenRolePermission(rolePermission),
      );

    if (
      permissions.some(
        (permission) =>
          permission.action?.toLowerCase() === Action.MANAGE &&
          permission.subject?.toLowerCase() === 'all',
      )
    ) {
      can(Action.MANAGE, 'all');
      return build({
        detectSubjectType: (item) =>
          item.constructor as ExtractSubjectType<Subjects>,
      });
    }

    // Build abilities based on permissions
    for (const permission of permissions) {
      const action = permission.action as Action;
      const subject =
        permission.subject as unknown as ExtractSubjectType<Subjects>;
      const isInverted = permission.inverted === true;
      const effectiveConditions =
        permission.conditions ?? permission.permission?.conditions ?? null;
      const conditions = this.parseConditions(effectiveConditions, user);

      if (conditions) {
        if (isInverted) {
          cannot(action, subject, conditions);
        } else {
          can(action, subject, conditions);
        }
      } else {
        if (isInverted) {
          cannot(action, subject);
        } else {
          can(action, subject);
        }
      }
    }

    return build({
      detectSubjectType: (item) =>
        item.constructor as ExtractSubjectType<Subjects>,
    });
  }

  /**
   * Create ability with predefined roles (useful for testing or migrations)
   */
  createForRoles(roles: string[], userId?: string): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (roles.includes('admin')) {
      can(Action.MANAGE, 'all');
    }

    if (roles.includes('sales_manager')) {
      can(Action.MANAGE, 'Deal');
      can(Action.MANAGE, 'Lead');
      can(Action.MANAGE, 'Contact');
      can(Action.MANAGE, 'School');
      can(Action.MANAGE, 'Invoice');
      can(Action.MANAGE, 'Quote');
      can(Action.MANAGE, 'Payment');
      can(Action.MANAGE, 'Product');
      can(Action.MANAGE, 'Pipeline');
      can(Action.READ, 'Report');
      can([Action.READ], 'User');
      can([Action.READ, Action.UPDATE], 'Settings');
    }

    if (roles.includes('sales_rep')) {
      const ownCondition = userId ? { assigned_to: userId } : undefined;
      can([Action.READ, Action.CREATE, Action.UPDATE], 'Deal', ownCondition);
      can([Action.READ, Action.CREATE, Action.UPDATE], 'Lead', ownCondition);
      can([Action.READ, Action.CREATE, Action.UPDATE], 'Contact');
      can([Action.READ], 'School');
      can([Action.READ, Action.CREATE], 'Invoice');
      can([Action.READ, Action.CREATE], 'Quote');
      can([Action.READ, Action.CREATE], 'Payment');
      can([Action.READ], 'Product');
      can([Action.READ], 'Pipeline');
      can([Action.READ], 'Report');
    }

    return build({
      detectSubjectType: (item) =>
        item.constructor as ExtractSubjectType<Subjects>,
    });
  }
}
