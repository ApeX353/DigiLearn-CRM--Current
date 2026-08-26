import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * AUD-C05: users may point the CRM at their own mail server, and the
 * server then opens a TCP connection to whatever address that name
 * resolves to. Without these checks an ordinary account could aim the
 * CRM at loopback, the database, the container network or cloud
 * metadata and use the response to map the inside of our hosting.
 *
 * The rule: resolve the name ourselves and refuse every address that is
 * not plainly public — for both IPv4 and IPv6, including IPv4-mapped
 * IPv6. Called at account save AND again immediately before every
 * connection, so a DNS record that changes between the two (rebinding)
 * is caught by the second check.
 */

function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function inCidr4(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local + cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // private (Docker networks live here)
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => inCidr4(n, base, bits));
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped / IPv4-translated — judge by the embedded IPv4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (lower === '::' || lower === '::1') return true; // unspecified / loopback
  if (lower.startsWith('fe8') || lower.startsWith('fe9')) return true; // link-local
  if (lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true; // not an IP at all — refuse
}

/**
 * Throws BadRequestException unless the host resolves exclusively to
 * plainly public addresses. Returns quietly when it is safe to connect.
 */
export async function assertSafeSmtpHost(host: string): Promise<void> {
  const trimmed = (host ?? '').trim().replace(/^\[|\]$/g, '');
  if (!trimmed) {
    throw new BadRequestException('Mail server host is required');
  }

  // A raw IP needs no lookup — judge it directly.
  if (isIP(trimmed)) {
    if (isBlockedIp(trimmed)) {
      throw new BadRequestException(
        'That mail server address is inside a private or reserved network and cannot be used',
      );
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(trimmed, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException(
      `Mail server host "${trimmed}" could not be found`,
    );
  }

  if (!addresses.length) {
    throw new BadRequestException(
      `Mail server host "${trimmed}" could not be found`,
    );
  }

  // EVERY resolved address must be public — a name that mixes a public
  // and a private record is exactly the rebinding trick this blocks.
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new BadRequestException(
        'That mail server resolves to a private or reserved network address and cannot be used',
      );
    }
  }
}

/**
 * Connection hygiene shared by verification and sending: never let a
 * probe hang a worker.
 */
export const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;
