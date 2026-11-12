import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PERMISSION_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_ROLES_CHECK_KEY } from '../decorators/skip-roles-check.decorator';

/**
 * BUG-051 regression cover. A handler that declares BOTH @Roles and
 * @CheckPermission must satisfy both. Before the fix the permission branch
 * returned early and @Roles was never read, so a sales rep with `update Lead`
 * on their own lead could approve their own reversal request on a route
 * declared for admin / sales_manager only.
 */
describe('RolesGuard', () => {
  const handler = () => undefined;
  const controllerClass = class {};

  let reflector: Reflector;
  let guard: RolesGuard;
  let ability: { can: jest.Mock };
  let abilityScope: { hasAnyAllowRule: jest.Mock };
  let request: Record<string, unknown>;

  const user = (...roles: string[]) => ({
    id: 'u1',
    roles: roles.map((name) => ({ name })),
  });

  const context = (): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  /** Metadata as the handler would declare it via decorators. */
  const declare = (meta: {
    roles?: string[];
    permission?: { action: string; subject: string; conditions?: unknown };
    isPublic?: boolean;
    skip?: boolean;
  }) => {
    jest.spyOn(reflector, 'get').mockImplementation((key: unknown) => {
      if (key === ROLES_KEY) return meta.roles;
      if (key === PERMISSION_KEY) return meta.permission;
      return undefined;
    });
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => {
        if (key === IS_PUBLIC_KEY) return meta.isPublic;
        if (key === SKIP_ROLES_CHECK_KEY) return meta.skip;
        // Since 14 Oct 2026 the guard reads @Roles and @CheckPermission with
        // getAllAndOverride([handler, class]) so a class-level decorator counts.
        if (key === ROLES_KEY) return meta.roles;
        if (key === PERMISSION_KEY) return meta.permission;
        return undefined;
      });
  };

  beforeEach(() => {
    reflector = new Reflector();
    ability = { can: jest.fn() };
    abilityScope = { hasAnyAllowRule: jest.fn().mockReturnValue(false) };
    const caslFactory = { createForUser: jest.fn().mockReturnValue(ability) };
    guard = new RolesGuard(reflector, caslFactory as any, abilityScope as any);
    request = {};
  });

  it('lets public routes through without a user', async () => {
    declare({ isPublic: true });
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('lets @SkipRolesCheck routes through for any authenticated caller', async () => {
    declare({ skip: true, roles: ['admin'] });
    request.user = user('sales_rep');
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('refuses when there is no user on the request', async () => {
    declare({ roles: ['admin'] });
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('@Roles only', () => {
    it('passes a caller holding one of the roles', async () => {
      declare({ roles: ['admin', 'sales_manager'] });
      request.user = user('sales_manager');
      await expect(guard.canActivate(context())).resolves.toBe(true);
    });

    it('refuses a caller holding none of the roles', async () => {
      declare({ roles: ['admin', 'sales_manager'] });
      request.user = user('sales_rep');
      await expect(guard.canActivate(context())).rejects.toThrow(
        'Required roles: admin, sales_manager',
      );
    });

    it('lets admin_support stand in for admin', async () => {
      declare({ roles: ['admin'] });
      request.user = user('admin_support');
      await expect(guard.canActivate(context())).resolves.toBe(true);
    });
  });

  describe('@CheckPermission only', () => {
    it('passes when the ability allows the action', async () => {
      declare({ permission: { action: 'update', subject: 'Lead' } });
      request.user = user('sales_rep');
      ability.can.mockReturnValue(true);
      await expect(guard.canActivate(context())).resolves.toBe(true);
      expect(ability.can).toHaveBeenCalledWith('update', 'Lead');
    });

    it('falls back to any conditional allow rule when no conditions are supplied', async () => {
      declare({ permission: { action: 'update', subject: 'Lead' } });
      request.user = user('sales_rep');
      ability.can.mockReturnValue(false);
      abilityScope.hasAnyAllowRule.mockReturnValue(true);
      await expect(guard.canActivate(context())).resolves.toBe(true);
    });

    it('refuses when neither the ability nor a scoped rule allows it', async () => {
      declare({ permission: { action: 'delete', subject: 'Invoice' } });
      request.user = user('sales_rep');
      ability.can.mockReturnValue(false);
      await expect(guard.canActivate(context())).rejects.toThrow(
        "You don't have permission to delete Invoice",
      );
    });
  });

  describe('@Roles and @CheckPermission together (BUG-051)', () => {
    const approveRoute = {
      roles: ['admin', 'sales_manager'],
      permission: { action: 'update', subject: 'Lead' },
    };

    it('refuses a sales rep even though the permission check would pass', async () => {
      declare(approveRoute);
      request.user = user('sales_rep');
      ability.can.mockReturnValue(true); // the rep may update their own lead
      await expect(guard.canActivate(context())).rejects.toThrow(
        'Required roles: admin, sales_manager',
      );
      // The role gate decides first; the permission is never consulted.
      expect(ability.can).not.toHaveBeenCalled();
    });

    it('refuses a manager who holds the role but not the permission', async () => {
      declare(approveRoute);
      request.user = user('sales_manager');
      ability.can.mockReturnValue(false);
      await expect(guard.canActivate(context())).rejects.toThrow(
        "You don't have permission to update Lead",
      );
    });

    it('passes a manager who satisfies both', async () => {
      declare(approveRoute);
      request.user = user('sales_manager');
      ability.can.mockReturnValue(true);
      await expect(guard.canActivate(context())).resolves.toBe(true);
    });

    it('still passes a rep on a route that lists sales_rep in its roles', async () => {
      declare({
        roles: ['admin', 'sales_manager', 'sales_rep'],
        permission: { action: 'update', subject: 'Lead' },
      });
      request.user = user('sales_rep');
      ability.can.mockReturnValue(true);
      await expect(guard.canActivate(context())).resolves.toBe(true);
    });
  });

  it('allows any authenticated caller when a handler declares neither', async () => {
    declare({});
    request.user = user('viewer');
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('attaches the CASL ability to the request for controller-level checks', async () => {
    declare({});
    request.user = user('admin');
    await guard.canActivate(context());
    expect(request.ability).toBe(ability);
  });
});
