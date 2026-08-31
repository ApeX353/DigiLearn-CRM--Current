import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/**
 * Marks an endpoint as reachable while the caller still owes a password change.
 *
 * AUD-H02: a user flagged `requires_password_change` (or whose password has
 * expired) is otherwise refused every route, because the flag on the login
 * response is advice the client is free to ignore and an API caller never sees
 * at all. Enforcement lives in PasswordChangeGuard.
 *
 * Only the handful of routes needed to GET OUT of that state should carry this:
 * changing the password itself, logging out, refreshing, and reading your own
 * profile so the UI can render the change-password screen. Anything else must
 * stay closed, or the control is decorative again.
 *
 * @example
 * ```typescript
 * @AllowPendingPasswordChange()
 * @Post('password/change')
 * async changePassword() {}
 * ```
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
