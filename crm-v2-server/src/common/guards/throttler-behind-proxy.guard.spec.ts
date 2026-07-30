import { ThrottlerBehindProxyGuard } from './throttler-behind-proxy.guard';

/**
 * `getTracker` is the only custom logic in the guard — the throttling
 * mechanics themselves come from @nestjs/throttler. These tests pin down
 * the client-IP resolution so a busy visitor (or an attacker) can never be
 * bucketed under the shared proxy address by mistake.
 *
 * getTracker does not use `this`, so we can invoke it off the prototype
 * without constructing the full guard (which would need DI providers).
 */
const getTracker = (req: Record<string, any>): Promise<string> =>
  (ThrottlerBehindProxyGuard.prototype as any).getTracker(req);

describe('ThrottlerBehindProxyGuard.getTracker', () => {
  it('prefers Cloudflare CF-Connecting-IP above everything else', async () => {
    const req = {
      headers: {
        'cf-connecting-ip': '41.220.1.5',
        'x-forwarded-for': '10.0.0.1, 172.16.0.1',
      },
      ip: '172.16.0.1',
    };
    await expect(getTracker(req)).resolves.toBe('41.220.1.5');
  });

  it('falls back to the left-most X-Forwarded-For entry (the real client)', async () => {
    const req = {
      headers: { 'x-forwarded-for': '41.220.1.5, 10.0.0.1, 172.16.0.1' },
      ip: '172.16.0.1',
    };
    await expect(getTracker(req)).resolves.toBe('41.220.1.5');
  });

  it('falls back to req.ip when no proxy headers are present', async () => {
    const req = { headers: {}, ip: '203.0.113.9' };
    await expect(getTracker(req)).resolves.toBe('203.0.113.9');
  });

  it('never throws when headers are missing entirely', async () => {
    await expect(getTracker({})).resolves.toBe('unknown');
  });

  it('does not bucket two different clients behind the same proxy together', async () => {
    const proxyIp = '172.16.0.1';
    const a = await getTracker({
      headers: { 'cf-connecting-ip': '41.220.1.5' },
      ip: proxyIp,
    });
    const b = await getTracker({
      headers: { 'cf-connecting-ip': '41.220.9.9' },
      ip: proxyIp,
    });
    expect(a).not.toBe(b);
  });
});
