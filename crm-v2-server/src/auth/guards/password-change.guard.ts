import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator';

/**
 * AUD-H02 -- "You must change your password" can simply be ignored.
 *
 * Login already detected the condition, but it only added
 * `requires_password_change: true` to the response body and handed over a
 * full, unrestricted session. That is a suggestion, not a control: a client
 * that ignores the flag, or anything talking to the API directly, carried on
 * as though nothing were owed.
 *
 * This closes the session down server-side until the password is actually
 * changed. Runs globally, after JwtAuthGuard has populated req.user.
 *
 * Deliberately narrow:
 *   - unauthenticated requests are none of its business (no req.user), so
 *     login and the public routes are untouched;
 *   - routes marked @AllowPendingPasswordChange() stay open, or the user
 *     would have no way to fix the very thing being enforced;
 *   - it reads a value the JWT strategy already computed, so it costs no
 *     extra query.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    // No authenticated user: not this guard's concern.
    if (!user?.requiresPasswordChange) {
      return true;
    }

    throw new ForbiddenException(
      'Your password must be changed before you can continue. Change it and sign in again.',
    );
  }
}
