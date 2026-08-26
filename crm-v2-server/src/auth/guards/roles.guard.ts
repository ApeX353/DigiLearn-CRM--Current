import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from '../casl/casl-ability.factory';
import { AbilityScopeService } from '../casl/ability-scope.service';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_ROLES_CHECK_KEY } from '../decorators/skip-roles-check.decorator';

/**
 * Roles that stand in for another role at the @Roles() gate.
 *
 * `admin_support` is seeded with `manage` permissions across the same
 * subjects as `admin`, but it was never added to a single one of the
 * ~238 @Roles() declarations in the codebase, so the coarse role gate
 * rejected it everywhere the finer CASL check was not used. Rather
 * than edit every decorator (and miss new ones), the equivalence is
 * declared once, here.
 *
 * Remove an entry to revert that role to literal matching only.
 */
const ROLE_ALIASES: Record<string, readonly string[]> = {
  admin_support: ['admin'],
};

/** Expand a user's roles with any roles they stand in for. */
function effectiveRoles(userRoles: string[]): Set<string> {
  const all = new Set(userRoles);
  for (const role of userRoles) {
    for (const alias of ROLE_ALIASES[role] ?? []) {
      all.add(alias);
    }
  }
  return all;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
    private abilityScopeService: AbilityScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Public routes (e.g. /book/:slug) carry no user at all — the JWT
    // guard already skipped them via the same metadata key. Without
    // this check every @Public endpoint 403'd on the "User not
    // authenticated" branch below, which broke the entire public
    // booking flow.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Check if roles check should be skipped (e.g., for auth endpoints like logout)
    const skipRolesCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_ROLES_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipRolesCheck) {
      return true; // Allow authenticated users without role/permission checks
    }
    // Check for authenticated user (only for non-public routes)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check if specific permissions are required
    const requiredPermission = this.reflector.get<RequiredPermission>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // Build CASL ability and attach to request for controller-level checks
    const ability = this.caslAbilityFactory.createForUser(user);
    request.ability = ability;

    if (requiredPermission) {
      const { action, subject, conditions } = requiredPermission;

      // Check if user has the required permission (string-level check)
      let hasPermission = conditions
        ? ability.can(action, subject as any, conditions)
        : ability.can(action, subject as any);

      // Fallback for conditional CASL rules when no explicit check conditions are supplied.
      // This keeps route-level checks aligned with entity-level filtering done in services.
      if (!hasPermission && !conditions) {
        hasPermission = this.abilityScopeService.hasAnyAllowRule(
          ability,
          action,
          subject,
        );
      }

      if (!hasPermission) {
        throw new ForbiddenException(
          `You don't have permission to ${action} ${subject}`,
        );
      }

      return true;
    }

    // Check if specific roles are required (fallback to simple role check)
    const requiredRoles = this.reflector.get<string[]>(
      ROLES_KEY,
      context.getHandler(),
    );

    if (requiredRoles) {
      const userRoles = user.roles?.map((role: any) => role.name) || [];
      const granted = effectiveRoles(userRoles);
      const hasRole = requiredRoles.some((role) => granted.has(role));

      if (!hasRole) {
        throw new ForbiddenException(
          `Required roles: ${requiredRoles.join(', ')}`,
        );
      }

      return true;
    }

    // If no specific permissions or roles required, allow access
    return true;
  }
}
