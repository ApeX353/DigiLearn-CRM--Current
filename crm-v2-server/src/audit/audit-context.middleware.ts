import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { auditStorage, AuditSource, ClientOrigin, emptyAuditContext } from './audit-context';

export const REQUEST_ID_HEADER = 'x-request-id';
const INBOUND_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // `req.user` is never set this early (guards run after middleware);
    // RequestContextInterceptor fills userId/userRoles once the JWT guard has.
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    // Two ways to be automation, and both are decided here rather than at the
    // call site, so no service has to remember to say so.
    //
    //   x-api-key    — ApiKeyGuard's caller is a machine by definition.
    //   x-automation — a script signed in as a real person, declaring itself
    //                  and saying what it is for. db-ops scripts must send it.
    //
    // Header only: nothing a browser sends by itself can set this, and the
    // value is recorded, not trusted for access.
    const header = (name: string): string | null => {
      const v = req.headers[name];
      const s = Array.isArray(v) ? v[0] : v;
      return typeof s === 'string' && s.trim() ? s.trim() : null;
    };

    const automation = header('x-automation');
    const isScript = automation !== null || header('x-api-key') !== null;
    const source: AuditSource = isScript ? 'script' : 'user';
    const automationReason = isScript
      ? (automation ?? 'api-key caller').slice(0, 200)
      : null;

    // A caller may supply its own id (a script correlating several calls, a
    // retry of a failed request); anything malformed is replaced, never
    // trusted. The id is echoed so the browser and scripts can quote it.
    const inbound = header(REQUEST_ID_HEADER);
    const requestId =
      inbound && INBOUND_REQUEST_ID.test(inbound) ? inbound : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const store = {
      ...emptyAuditContext(),
      ipAddress,
      source,
      automationReason,
      requestId,
      userAgent: header('user-agent')?.slice(0, 300) ?? null,
      method: req.method ?? null,
      path: (req.originalUrl ?? req.url ?? '').split('?')[0].slice(0, 500) || null,
      startedAt: new Date(),
      client: readClientOrigin(header),
    };

    auditStorage.run(store, () => {
      next();
    });
  }
}

/**
 * The browser URI-encodes these (dialog titles need not be ASCII); anything
 * that fails to decode is kept as sent. Control characters are dropped and
 * each value is cut short, because this is recorded, never trusted.
 */
function readClientOrigin(header: (name: string) => string | null): ClientOrigin | null {
  const read = (name: string, max: number): string | null => {
    const raw = header(name);
    if (!raw) return null;
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // keep raw
    }
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean ? clean.slice(0, max) : null;
  };
  const origin: ClientOrigin = {
    page: read('x-client-page', 200),
    screen: read('x-client-screen', 80),
    form: read('x-client-form', 120),
    action: read('x-client-action', 80),
  };
  return origin.page || origin.screen || origin.form || origin.action ? origin : null;
}
