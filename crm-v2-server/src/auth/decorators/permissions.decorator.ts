import { SetMetadata } from '@nestjs/common';
import { Action, Subject } from '../constants/permissions';

export const PERMISSION_KEY = 'permission';

export interface RequiredPermission {
  action: Action;
  subject: Subject | string;
  conditions?: any;
}

/**
 * Decorator to specify required permission for a route using CASL
 * @param action - The action to perform (e.g., 'create', 'read', 'update', 'delete', 'manage')
 * @param subject - The subject/resource (e.g., 'User', 'Deal', 'Lead')
 * @param conditions - Optional conditions for the permission
 * @example
 * @CheckPermissions(Action.CREATE, Subject.USER)
 * @Post('users')
 * createUser() {}
 */
export const CheckPermissions = (
  action: Action,
  subject: Subject | string,
  conditions?: any,
) => {
  const permission: RequiredPermission = { action, subject, conditions };
  return SetMetadata(PERMISSION_KEY, permission);
};

/**
 * Shorthand decorator using string action and subject
 * @example
 * @CheckPermission('read', 'Deal')
 * @Get(':id')
 * findOne() {}
 */
export const CheckPermission = (
  action: string,
  subject: string,
  conditions?: any,
) => {
  const permission: RequiredPermission = {
    action: action as Action,
    subject,
    conditions,
  };
  return SetMetadata(PERMISSION_KEY, permission);
};
