/**
 * Campaign 001 — database-state invariants.
 *
 * Financial assertions read the tables directly with SQL so that a test
 * never depends on the application's own recalculation of amount_paid or
 * payment_status. If the application and the ledger disagree, the ledger
 * wins and the test says so.
 */
import { DataSource } from 'typeorm';

export class Invariants {
  constructor(private readonly ds: DataSource) {}

  async count(table: string, where = 'true', params: unknown[] = []): Promise<number> {
    const rows = await this.ds.query(`select count(*)::int as n from "${table}" where ${where}`, params);
    return rows[0].n;
  }

  async invoiceRow(id: string): Promise<{
    id: string;
    total: string;
    amount_paid: string;
    status: string;
    payment_status: string;
  }> {
    const rows = await this.ds.query(
      'select id, total, amount_paid, status, payment_status from invoices where id = $1',
      [id],
    );
    if (rows.length !== 1) throw new Error(`invoice ${id} not found`);
    return rows[0];
  }

  /** Sum of payments.amount for an invoice, from the ledger, as a number. */
  async paymentsTotal(invoiceId: string): Promise<number> {
    const rows = await this.ds.query(
      'select coalesce(sum(amount), 0)::numeric(12,2) as s from payments where invoice_id = $1',
      [invoiceId],
    );
    return Number(rows[0].s);
  }

  /** total - sum(payments), computed by the database, as a number. */
  async outstanding(invoiceId: string): Promise<number> {
    const rows = await this.ds.query(
      `select (i.total - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id), 0))::numeric(12,2) as o
         from invoices i where i.id = $1`,
      [invoiceId],
    );
    return Number(rows[0].o);
  }

  async installmentsTotal(appliedTermId: string): Promise<number> {
    const rows = await this.ds.query(
      'select coalesce(sum(amount), 0)::numeric(12,2) as s from installments where applied_payment_term_id = $1',
      [appliedTermId],
    );
    return Number(rows[0].s);
  }

  /** Names of CHECK / FK / UNIQUE constraints on a table. */
  async constraintNames(table: string): Promise<string[]> {
    const rows: Array<{ conname: string }> = await this.ds.query(
      `select c.conname from pg_constraint c join pg_class t on t.oid = c.conrelid
        where t.relname = $1 order by c.conname`,
      [table],
    );
    return rows.map((r) => r.conname);
  }

  /** Names of indexes on a table (unique indexes are not in pg_constraint). */
  async indexNames(table: string): Promise<string[]> {
    const rows: Array<{ indexname: string }> = await this.ds.query(
      'select indexname from pg_indexes where schemaname = $1 and tablename = $2 order by indexname',
      ['public', table],
    );
    return rows.map((r) => r.indexname);
  }

  /** Runs a statement expected to be rejected; returns the SQLSTATE or null if it succeeded. */
  async rejectionCode(sql: string, params: unknown[] = []): Promise<string | null> {
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(sql, params);
      await runner.rollbackTransaction();
      return null;
    } catch (err: any) {
      await runner.rollbackTransaction();
      return err?.code ?? err?.driverError?.code ?? 'unknown';
    } finally {
      await runner.release();
    }
  }
}
