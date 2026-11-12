import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getAuditContext } from '../audit/audit-context';
import { REQUEST_ID_HEADER } from '../audit/audit-context.middleware';
import { classifyException, ClassifiedException } from './classify-exception';
import { DiagnosticsService } from './diagnostics.service';
import { newReference } from './reference';

interface RequestUser {
  id?: string;
  roles?: Array<{ name?: string } | string>;
}

/**
 * The only exception filter in the API. Replaces Nest's default, which
 * answered every unexpected error with `Internal server error` and kept no
 * record of it.
 *
 * For each failure it (1) decides what the user may see, (2) decides whether
 * the failure is worth a `system_events` row, (3) answers with the same shape
 * the client already parses plus `reference` and `requestId`, so a user can
 * quote a short code and the trace can be found from it.
 */
@Catch()
@Injectable()
export class DiagnosticsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DiagnosticsExceptionFilter.name);

  constructor(private readonly diagnostics: DiagnosticsService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const type = host.getType<string>();
    if (type === 'http') return this.catchHttp(exception, host);
    if (type === 'ws') return this.catchWs(exception, host);
    // rpc / unknown: record and move on
    this.diagnostics.recordEvent({
      kind: 'http_5xx',
      message: exception instanceof Error ? exception.message : String(exception),
      error: exception,
      source: 'process',
    });
  }

  private async catchHttp(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { user?: RequestUser }>();
    const res = ctx.getResponse<Response>();
    const classified = classifyException(exception, req.method);
    const store = getAuditContext();
    const requestId =
      store.requestId ?? (res.getHeader(REQUEST_ID_HEADER) as string | undefined) ?? null;

    let reference: string | undefined;
    if (await this.shouldPersist(classified)) {
      reference = newReference();
      const user = req.user;
      this.diagnostics.recordEvent({
        reference,
        kind: classified.kind ?? 'http_5xx',
        level: classified.level,
        message: classified.internalMessage,
        error: exception,
        statusCode: classified.status,
        source: 'http',
        details: {
          ...(classified.dbCode ? { pg_code: classified.dbCode } : {}),
          // The screen, open form and last button in the browser when this
          // request was sent (x-client-* headers), for "where were they".
          ...(store.client ? { client: store.client } : {}),
        },
        request: {
          method: req.method,
          path: (req.originalUrl ?? req.url ?? '').split('?')[0],
          params: req.params,
          query: req.query,
          body: req.body,
          requestId,
          // Guard failures (403) never reach the interceptor that fills the
          // store, but the JWT guard has already attached req.user by then.
          userId: user?.id ?? store.userId,
          userRoles: user?.roles
            ? user.roles.map((r) => (typeof r === 'string' ? r : (r.name ?? ''))).filter(Boolean)
            : store.userRoles.length
              ? store.userRoles
              : null,
        },
      });
    }

    if (classified.status >= 500) {
      // One line on stdout too, so the container log and the table agree.
      // AppLogger does not mirror this context into system_events (the row
      // above already exists).
      this.logger.error(
        `${classified.status} ${req.method} ${req.originalUrl ?? req.url} ref=${reference ?? '-'} req=${requestId ?? '-'}: ${classified.internalMessage}`,
        classified.stack ?? undefined,
      );
    }

    if (res.headersSent) return;
    res.status(classified.status).json({
      statusCode: classified.status,
      message: classified.message,
      error: classified.error,
      ...(classified.code ? { code: classified.code } : {}),
      ...(classified.details !== undefined ? { details: classified.details } : {}),
      ...(reference ? { reference } : {}),
      ...(requestId ? { requestId } : {}),
    });
  }

  private catchWs(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<{ emit?: (event: string, payload: unknown) => void; id?: string }>();
    const classified = classifyException(exception);
    const reference = this.diagnostics.recordEvent({
      kind: 'ws_error',
      level: classified.status >= 500 ? 'error' : 'warn',
      message: classified.internalMessage,
      error: exception,
      source: 'ws',
      details: { socket: client?.id ?? null, event: safeWsEvent(host) },
    });
    try {
      client?.emit?.('exception', {
        status: 'error',
        message: typeof classified.message === 'string' ? classified.message : classified.message.join('; '),
        reference,
      });
    } catch {
      // the socket is gone; the row is what matters
    }
  }

  private async shouldPersist(c: ClassifiedException): Promise<boolean> {
    switch (c.persist) {
      case 'always':
        return true;
      case 'never':
        return false;
      case 'setting:capture_403':
        return this.diagnostics.getFlag('diagnostics.capture_403', true);
      case 'setting:capture_validation':
        return this.diagnostics.getFlag('diagnostics.capture_validation', false);
      default:
        return c.status >= HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}

function safeWsEvent(host: ArgumentsHost): string | null {
  try {
    const pattern = host.switchToWs().getPattern?.();
    return typeof pattern === 'string' ? pattern : null;
  } catch {
    return null;
  }
}
