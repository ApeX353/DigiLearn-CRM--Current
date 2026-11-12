import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * AES-256-GCM envelope encryption for stored email credentials (SMTP
 * passwords today, OAuth refresh tokens later).
 *
 * Format: `gcm:v1:<ivHex>:<authTagHex>:<cipherHex>`
 *
 * The `v1` is a deliberate version marker so we can rotate algorithms
 * without a schema change — decrypt dispatches on the prefix. Anything
 * that doesn't start with `gcm:` is treated as cleartext (useful during
 * local dev and for migration paths).
 */
@Injectable()
export class CredentialsCipher {
  private readonly logger = new Logger(CredentialsCipher.name);
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.USER_EMAIL_CREDENTIALS_KEY;
    if (!raw) {
      // Derive a stable dev key from JWT_SECRET so local work still
      // round-trips, but scream loudly so prod deploys notice.
      const fallback =
        process.env.JWT_SECRET_TOKEN || process.env.JWT_SECRET || 'crm-dev-key';
      this.logger.warn(
        'USER_EMAIL_CREDENTIALS_KEY is not set — falling back to a derived dev key. DO NOT ship this to prod.',
      );
      this.key = createHash('sha256').update(fallback).digest();
    } else if (/^[0-9a-f]{64}$/i.test(raw)) {
      this.key = Buffer.from(raw, 'hex');
    } else {
      // Accept an arbitrary passphrase by deriving via SHA-256; keeps
      // ops simple without forcing everyone to generate 64-hex strings.
      this.key = createHash('sha256').update(raw).digest();
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `gcm:v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  decrypt(blob: string): string {
    if (!blob.startsWith('gcm:')) {
      // Cleartext fallback — treat as-is. Never hit in prod, but makes
      // first-boot friendlier for teams still wiring up the key.
      return blob;
    }
    const parts = blob.split(':');
    if (parts.length !== 5 || parts[1] !== 'v1') {
      throw new Error(`Unsupported credential blob format: ${parts[1]}`);
    }
    const [, , ivHex, tagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(cipherHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return dec.toString('utf8');
  }

  /**
   * Helper used when the caller already has a JSON-serialisable
   * credentials object. Keeps callers from reinventing the wheel.
   */
  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson<T>(blob: string): T {
    return JSON.parse(this.decrypt(blob)) as T;
  }
}
