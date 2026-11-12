import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FIN-04 (19 Oct 2026): a durable identity for every "record a payment"
 * command, written in the same transaction as the receipt. Replaces the
 * two-minute retry brake, which only caught sequential repeats. See
 * payments/entities/payment-command.entity.ts.
 */
export class PaymentCommands1795000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS payment_commands (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      command_key varchar(200) NOT NULL,
      payload_hash char(64) NOT NULL,
      payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
      response jsonb,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS payment_commands_command_key_uq ON payment_commands(command_key)`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS payment_commands_payment_id_idx ON payment_commands(payment_id)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    // Only an empty table is dropped: rows are the memory that stops a
    // repeated command from recording money twice.
    const rows = await q.query(`SELECT count(*)::int AS n FROM payment_commands`);
    if (Number(rows?.[0]?.n ?? 0) > 0) {
      throw new Error(
        'payment_commands holds rows; refusing to drop it. Export or truncate deliberately first.',
      );
    }
    await q.query(`DROP TABLE IF EXISTS payment_commands`);
  }
}
