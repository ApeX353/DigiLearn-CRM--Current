import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit guard that identifies the caller by their REAL client IP,
 * not the proxy's.
 *
 * The API sits behind Cloudflare and CapRover's nginx, so `req.ip` is the
 * proxy address — the same for every visitor. Keying the rate limiter on
 * that would put all users in one shared bucket: a single busy client (or
 * one attacker) could exhaust the limit and lock everyone out at once.
 *
 * So we take the client IP the same way the audit trail already does:
 * prefer Cloudflare's `CF-Connecting-IP`, then the left-most
 * `X-Forwarded-For` entry, then fall back to `req.ip`. `trust proxy` is
 * deliberately NOT enabled app-wide (it would change cookie/secure
 * detection), which is exactly why we read these headers directly here.
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = req.headers ?? {};
    const cfConnectingIp = headers['cf-connecting-ip'] as string | undefined;
    const forwardedFor = (headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim();
    return cfConnectingIp || forwardedFor || req.ip || 'unknown';
  }
}
