import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Diagnostics, phases 2-3:
 *  - users.last_seen_at: written at most every five minutes per signed-in
 *    user by the request interceptor, so the People view can say when someone
 *    last used the CRM without reading the session table.
 *  - whatsapp_messages.failure_reason: the provider's answer when a send is
 *    refused. Until now the row only said "failed".
 */
export class DiagnosticsDeliveryColumns1793000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz`);
    await q.query(`ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS failure_reason text`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE whatsapp_messages DROP COLUMN IF EXISTS failure_reason`);
    await q.query(`ALTER TABLE users DROP COLUMN IF EXISTS last_seen_at`);
  }
}
