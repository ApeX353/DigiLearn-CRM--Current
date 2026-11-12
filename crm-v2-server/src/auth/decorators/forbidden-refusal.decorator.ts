import { SetMetadata } from '@nestjs/common';

export const FORBIDDEN_REFUSAL_KEY = 'forbidden_refusal';

export interface ForbiddenRefusalBody {
  code: string;
  message: string;
}

/**
 * What RolesGuard answers when a role is refused on this route, in place of its
 * generic "Required roles: ...". For routes whose refusal has a stable code.
 */
export const ForbiddenRefusal = (code: string, message: string) =>
  SetMetadata<string, ForbiddenRefusalBody>(FORBIDDEN_REFUSAL_KEY, {
    code,
    message,
  });
