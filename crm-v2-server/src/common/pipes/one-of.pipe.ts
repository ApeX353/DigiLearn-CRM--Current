import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';

/**
 * Validates that a single route value (a `@Param` or a `@Body('field')`)
 * is one of an allowed list, and answers 400 naming the allowed values
 * when it is not.
 *
 * Why this exists: several handlers took a bare `@Body('status')` or
 * `@Param('status')` and passed it straight to a query against a Postgres
 * enum column. An unknown value then failed inside the database — a 500,
 * and in the lead-status case only after SLA history rows had already
 * been written (BUG-002, BUG-015, BUG-047, BUG-048). The global
 * ValidationPipe cannot help a handler that has no DTO class, so the check
 * has to sit on the parameter itself.
 *
 *   @Param('status', new OneOfPipe(LEAD_STATUSES, 'status'))
 *   @Body('status', new OneOfPipe(INVOICE_STATUSES, 'status'))
 */
@Injectable()
export class OneOfPipe<T extends string> implements PipeTransform<unknown, T> {
  constructor(
    private readonly allowed: readonly T[],
    private readonly label = 'value',
    private readonly code?: string,
  ) {}

  transform(value: unknown): T {
    if (typeof value === 'string' && (this.allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    const shown =
      value === undefined || value === null || value === ''
        ? 'missing'
        : `"${String(value)}"`;
    const message = `${this.label} ${shown} is not valid; expected one of: ${this.allowed.join(', ')}`;
    throw new BadRequestException(this.code ? { code: this.code, message } : message);
  }
}
