import { SetMetadata } from '@nestjs/common';

export const SKIP_ROLES_CHECK_KEY = 'skipRolesCheck';

/**
 * Decorator to skip role/permission checks while still requiring authentication.
 * Use this for endpoints that should be accessible to any authenticated user
 * regardless of their roles or permissions.
 *
 * @example
 * ```typescript
 * @SkipRolesCheck()
 * @Post('logout')
 * async logout() {
 *   // Any authenticated user can logout
 * }
 * ```
 */
export const SkipRolesCheck = () => SetMetadata(SKIP_ROLES_CHECK_KEY, true);
