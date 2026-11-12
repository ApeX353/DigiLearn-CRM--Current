import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Request, Response } from 'express';
import { auditStorage } from '../audit/audit-context';
import { DiagnosticsService } from './diagnostics.service';

const SLOW_REQUEST_MS = 2000;

/**
 * Runs after the guards, which is the earliest point at which `req.user`
 * exists. Copies the acting user into the per-request context store that
 * AuditContextMiddleware opened, so every audit row and diagnostics row
 * written later in the request knows who acted. Until this existed the
 * store's `userId` was null on every request.
 *
 * Also emits one line per request to stdout when `LOG_HTTP=true`, and
 * always for requests slower than two seconds.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');
  private readonly logAll = process.env.LOG_HTTP === 'true';

  constructor(private readonly diagnostics: DiagnosticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: { id?: string; roles?: Array<{ name?: string } | string> } }>();
    const res = context.switchToHttp().getResponse<Response>();
    const store = auditStorage.getStore();
    if (store && req.user) {
      store.userId = req.user.id ?? store.userId;
      store.userRoles = (req.user.roles ?? [])
        .map((r) => (typeof r === 'string' ? r : (r.name ?? '')))
        .filter(Boolean);
    }
    if (req.user?.id) this.diagnostics.touchLastSeen(req.user.id);

    const started = Date.now();
    return next.handle().pipe(
      finalize(() => {
        const ms = Date.now() - started;
        if (!this.logAll && ms < SLOW_REQUEST_MS) return;
        this.logger.log(
          `${req.method} ${(req.originalUrl ?? req.url ?? '').split('?')[0]} ${res.statusCode} ${ms}ms${ms >= SLOW_REQUEST_MS ? ' SLOW' : ''}`,
        );
      }),
    );
  }
}
