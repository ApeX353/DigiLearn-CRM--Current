import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { JobRunnerService } from '../diagnostics/job-runner.service';
import { JOBS } from '../diagnostics/job-registry';
import { PaymentTermsService } from '../payment-terms/payment-terms.service';

/**
 * FIN-05 / FIN-07 (19-20 Oct 2026): the money invariants, checked every
 * night and on demand, and the reviewed repairs for when they fail.
 *
 * Every figure the CRM stores twice must agree with its source of truth:
 *   payment.amount          = allocated_amount + unallocated_amount
 *   payment.allocated_amount = sum of its allocation rows
 *   installment.paid_amount  = sum of allocation rows against it
 *   installment.balance      = amount - paid_amount
 *   invoice.amount_paid      = sum of its receipts (summary: of its children)
 *   invoice.status           = what the money says (Paid needs the total, ...)
 * On 9 Oct 2026 production held 28 receipts whose allocation cache claimed
 * money with no allocation rows behind it, and three invoices marked Paid
 * with nothing received. The nightly job reports; a person repairs, with a
 * dry run first and an audit row per corrected record.
 */

export interface InvariantResult {
  name: string;
  /** Plain-language description for the owner. */
  title: string;
  /** 'error' breaks money arithmetic; 'review' needs a human decision. */
  severity: 'error' | 'review';
  count: number;
  sample: Record<string, unknown>[];
}

export interface ReconciliationReport {
  checked_at: string;
  total_errors: number;
  total_review: number;
  invariants: InvariantResult[];
}

export interface RepairChange {
  entity: 'Payment' | 'Installment' | 'Invoice';
  id: string;
  label: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface RepairResult {
  applied: boolean;
  changes: RepairChange[];
}

const SAMPLE = 25;

/** The checks, as SQL that returns the offending rows. Read-only. */
const INVARIANTS: Array<{ name: string; title: string; severity: 'error' | 'review'; sql: string }> = [
  {
    name: 'payment_conservation',
    title: 'Receipts whose amount is not allocated + unallocated',
    severity: 'error',
    sql: `SELECT id, reference, amount, allocated_amount, unallocated_amount
          FROM payments WHERE round(amount - allocated_amount - unallocated_amount, 2) <> 0`,
  },
  {
    name: 'payment_allocated_cache',
    title: 'Receipts whose allocated figure disagrees with their allocation rows',
    severity: 'error',
    sql: `SELECT p.id, p.reference, p.amount, p.allocated_amount AS cached, COALESCE(sum(a.allocated_amount), 0) AS actual
          FROM payments p LEFT JOIN payment_allocations a ON a.payment_id = p.id
          GROUP BY p.id HAVING round(p.allocated_amount - COALESCE(sum(a.allocated_amount), 0), 2) <> 0`,
  },
  {
    name: 'installment_paid_cache',
    title: 'Instalments whose paid figure disagrees with the allocations against them',
    severity: 'error',
    sql: `SELECT i.id, i.invoice_id, i.installment_number, i.amount, i.paid_amount AS cached, COALESCE(sum(a.allocated_amount), 0) AS actual
          FROM installments i LEFT JOIN payment_allocations a ON a.installment_id = i.id
          GROUP BY i.id HAVING round(i.paid_amount - COALESCE(sum(a.allocated_amount), 0), 2) <> 0`,
  },
  {
    name: 'installment_balance',
    title: 'Instalments whose balance is not amount - paid',
    severity: 'error',
    sql: `SELECT id, invoice_id, installment_number, amount, paid_amount, balance
          FROM installments WHERE round(amount - paid_amount - balance, 2) <> 0`,
  },
  {
    name: 'invoice_amount_paid',
    title: 'Invoices whose received figure disagrees with their receipts',
    severity: 'error',
    sql: `SELECT v.id, v.invoice_number, v.status, v.total, v.amount_paid AS cached, COALESCE(sum(p.amount), 0) AS actual
          FROM invoices v LEFT JOIN payments p ON p.invoice_id = v.id
          WHERE NOT v.is_summary_invoice
          GROUP BY v.id HAVING round(v.amount_paid - COALESCE(sum(p.amount), 0), 2) <> 0`,
  },
  {
    name: 'summary_vs_children',
    title: 'Summary invoices whose total or received figure disagrees with their instalment invoices',
    severity: 'error',
    sql: `SELECT s.id, s.invoice_number, s.total, s.amount_paid, sum(c.total) AS child_total, sum(c.amount_paid) AS child_paid
          FROM invoices s JOIN invoices c ON c.parent_invoice_id = s.id
          WHERE s.is_summary_invoice
          GROUP BY s.id HAVING round(s.total - sum(c.total), 2) <> 0 OR round(s.amount_paid - sum(c.amount_paid), 2) <> 0`,
  },
  {
    name: 'overpaid_invoice',
    title: 'Invoices that have received more than their total',
    severity: 'error',
    sql: `SELECT id, invoice_number, status, total, amount_paid FROM invoices
          WHERE NOT is_summary_invoice AND round(amount_paid, 2) > round(total, 2)`,
  },
  {
    name: 'status_vs_money',
    title: 'Invoices whose status contradicts the money received (e.g. Paid with nothing received)',
    severity: 'review',
    sql: `SELECT id, invoice_number, status, payment_status, total, amount_paid FROM invoices
          WHERE status <> 'Cancelled' AND NOT is_summary_invoice AND (
            (status = 'Paid' AND round(amount_paid, 2) < round(total, 2))
            OR (status = 'Partially-Paid' AND amount_paid <= 0)
            OR (status IN ('Sent', 'Draft', 'Overdue') AND total > 0 AND round(amount_paid, 2) >= round(total, 2)))`,
  },
  {
    name: 'cancelled_holding_money',
    title: 'Cancelled invoices that still hold receipts (a decision, not an error)',
    severity: 'review',
    sql: `SELECT v.id, v.invoice_number, v.total, COALESCE(sum(p.amount), 0) AS received
          FROM invoices v JOIN payments p ON p.invoice_id = v.id
          WHERE v.status = 'Cancelled' GROUP BY v.id`,
  },
  {
    name: 'orphan_installments',
    title: 'Instalments that point at an invoice that no longer exists',
    severity: 'review',
    sql: `SELECT i.id, i.invoice_id, i.installment_number, i.amount FROM installments i
          WHERE i.invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices v WHERE v.id = i.invoice_id)`,
  },
  {
    name: 'duplicate_references',
    title: 'The same bank reference recorded twice on one invoice',
    severity: 'review',
    sql: `SELECT invoice_id, lower(btrim(reference)) AS reference, count(*) AS n, sum(amount) AS total
          FROM payments GROUP BY 1, 2 HAVING count(*) > 1`,
  },
  {
    name: 'duplicate_master_invoices',
    title: 'Quotes with more than one live master invoice',
    severity: 'review',
    sql: `SELECT quote_id, count(*) AS n, string_agg(invoice_number, ', ' ORDER BY invoice_number) AS invoices
          FROM invoices WHERE quote_id IS NOT NULL AND parent_invoice_id IS NULL AND status <> 'Cancelled'
          GROUP BY quote_id HAVING count(*) > 1`,
  },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The status the money says an issued, non-summary invoice should carry. */
export function deriveInvoiceStatus(
  current: string,
  total: number,
  received: number,
): { status: string; payment_status: string; paid_date_set: boolean } {
  if (current === 'Cancelled') {
    return {
      status: 'Cancelled',
      payment_status: received <= 0 ? 'Unpaid' : received >= total ? 'Paid' : 'Partial',
      paid_date_set: false,
    };
  }
  if (received <= 0) {
    return { status: current === 'Draft' ? 'Draft' : 'Sent', payment_status: 'Unpaid', paid_date_set: false };
  }
  if (round2(received) >= round2(total)) {
    return { status: 'Paid', payment_status: 'Paid', paid_date_set: true };
  }
  return { status: 'Partially-Paid', payment_status: 'Partial', paid_date_set: false };
}

@Injectable()
export class FinanceReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(FinanceReconciliationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly activityLogs: ActivityLogsService,
    private readonly diagnostics: DiagnosticsService,
    private readonly jobs: JobRunnerService,
    private readonly paymentTerms: PaymentTermsService,
  ) {}

  /** So support can run the check by hand from System Health > Scheduled jobs. */
  onModuleInit(): void {
    this.jobs.registerHandler('finance.reconcile', () => this.handleNightly());
  }

  /**
   * FIN-07c: receipts holding unallocated money on an invoice that still has
   * instalments owed. After the cache repair, every receipt the old code had
   * falsely marked "allocated" shows its money as unallocated; where a
   * schedule exists, that money belongs on the oldest open instalments
   * (FIFO), the same rule the system applies to a new receipt. Dry run by
   * default; the allocation itself writes its own audit rows.
   */
  async repairAllocations(apply: boolean, userId: string): Promise<RepairResult> {
    return this.inRepairTransaction(apply, async (m) => {
      const changes: RepairChange[] = [];
      const receipts: Array<{ id: string; reference: string; amount: string; unallocated_amount: string; invoice_id: string; open_installments: string }> =
        await m.query(`SELECT p.id, p.reference, p.amount, p.unallocated_amount, p.invoice_id,
                              (SELECT count(*) FROM installments i WHERE i.invoice_id = p.invoice_id AND i.balance > 0) AS open_installments
          FROM payments p
          WHERE p.unallocated_amount > 0
            AND EXISTS (SELECT 1 FROM installments i WHERE i.invoice_id = p.invoice_id AND i.balance > 0)
          ORDER BY p.payment_date ASC, p.created_at ASC`);
      for (const r of receipts) {
        const result = await this.paymentTerms.allocatePaymentFIFO(r.id, userId, m);
        changes.push({
          entity: 'Payment',
          id: r.id,
          label: `payment ${r.reference} (${Number(r.amount).toFixed(2)}) on invoice ${r.invoice_id}`,
          before: { unallocated_amount: Number(r.unallocated_amount), open_installments: Number(r.open_installments) },
          after: { allocated_now: result.allocated, remaining: result.remaining, allocations_created: result.allocations_created },
        });
      }
      return changes;
    });
  }

  /** Every invariant, with a count and a sample of the offending rows. Read-only. */
  async check(): Promise<ReconciliationReport> {
    const invariants: InvariantResult[] = [];
    for (const inv of INVARIANTS) {
      const rows: Record<string, unknown>[] = await this.dataSource.query(inv.sql);
      invariants.push({
        name: inv.name,
        title: inv.title,
        severity: inv.severity,
        count: rows.length,
        sample: rows.slice(0, SAMPLE),
      });
    }
    return {
      checked_at: new Date().toISOString(),
      total_errors: invariants.filter((i) => i.severity === 'error').reduce((s, i) => s + i.count, 0),
      total_review: invariants.filter((i) => i.severity === 'review').reduce((s, i) => s + i.count, 0),
      invariants,
    };
  }

  /**
   * Nightly: count every invariant and leave a System Health problem when
   * any arithmetic one fails, so the Day log says so the next morning.
   */
  @Cron(JOBS['finance.reconcile'].cron)
  async handleNightly(): Promise<void> {
    await this.jobs.run('finance.reconcile', async (ctx) => {
      const report = await this.check();
      let failing = 0;
      for (const inv of report.invariants) {
        ctx.count(inv.name, inv.count);
        if (inv.count > 0 && inv.severity === 'error') failing += 1;
      }
      ctx.count('errors', report.total_errors);
      ctx.count('review', report.total_review);
      ctx.count('invariants_failing', failing);
      if (report.total_errors > 0) {
        const worst = report.invariants
          .filter((i) => i.severity === 'error' && i.count > 0)
          .map((i) => `${i.count} ${i.title.toLowerCase()}`)
          .join('; ');
        this.diagnostics.recordEvent({
          kind: 'custom',
          level: 'warn',
          source: 'job',
          message: `Money figures out of step: ${worst}. Open Finance > Reconciliation to review and repair.`,
          details: { invariants: report.invariants.filter((i) => i.count > 0).map((i) => ({ name: i.name, count: i.count })) },
          dedupeKey: `finance.reconcile|${new Date().toISOString().slice(0, 10)}`,
        });
      }
    });
  }

  /**
   * FIN-07a: rewrite the derived money caches from their sources of truth —
   * receipt allocation figures from allocation rows, instalment paid/balance
   * from allocation rows, invoice received figures from receipts (summary
   * parents from their children). Statuses are NOT touched here; see
   * repairStatuses. Dry run by default: every change is computed inside a
   * transaction that is rolled back unless `apply` is true. One audit row
   * per corrected record, actor = the person who ran it.
   */
  async repairCaches(apply: boolean, userId: string): Promise<RepairResult> {
    return this.inRepairTransaction(apply, async (m) => {
      const changes: RepairChange[] = [];

      const payments: Array<{ id: string; reference: string; amount: string; allocated_amount: string; unallocated_amount: string; actual: string }> =
        await m.query(`SELECT p.id, p.reference, p.amount, p.allocated_amount, p.unallocated_amount, COALESCE(sum(a.allocated_amount), 0) AS actual
          FROM payments p LEFT JOIN payment_allocations a ON a.payment_id = p.id
          GROUP BY p.id
          HAVING round(p.allocated_amount - COALESCE(sum(a.allocated_amount), 0), 2) <> 0
              OR round(p.amount - p.allocated_amount - p.unallocated_amount, 2) <> 0`);
      for (const p of payments) {
        const allocated = round2(Number(p.actual));
        const unallocated = round2(Number(p.amount) - allocated);
        await m.query(`UPDATE payments SET allocated_amount = $1, unallocated_amount = $2, updated_at = now() WHERE id = $3`, [allocated, unallocated, p.id]);
        const before = { allocated_amount: Number(p.allocated_amount), unallocated_amount: Number(p.unallocated_amount) };
        const after = { allocated_amount: allocated, unallocated_amount: unallocated };
        changes.push({ entity: 'Payment', id: p.id, label: `payment ${p.reference} (${Number(p.amount).toFixed(2)})`, before, after });
        await this.activityLogs.logUpdate('Payment', p.id, before, after, userId,
          `Reconciliation: allocation figures recomputed from ${allocated > 0 ? 'the allocation rows' : 'no allocation rows'} (was ${before.allocated_amount.toFixed(2)} allocated, now ${allocated.toFixed(2)})`,
          { repair: 'caches' }, m);
      }

      const installments: Array<{ id: string; invoice_id: string; installment_number: number; amount: string; paid_amount: string; balance: string; status: string; actual: string }> =
        await m.query(`SELECT i.id, i.invoice_id, i.installment_number, i.amount, i.paid_amount, i.balance, i.status, COALESCE(sum(a.allocated_amount), 0) AS actual
          FROM installments i LEFT JOIN payment_allocations a ON a.installment_id = i.id
          GROUP BY i.id
          HAVING round(i.paid_amount - COALESCE(sum(a.allocated_amount), 0), 2) <> 0
              OR round(i.amount - i.paid_amount - i.balance, 2) <> 0`);
      for (const i of installments) {
        const paid = round2(Number(i.actual));
        const balance = round2(Number(i.amount) - paid);
        const status = paid <= 0 ? (i.status === 'overdue' ? 'overdue' : 'pending') : balance <= 0 ? 'paid' : 'partially_paid';
        await m.query(`UPDATE installments SET paid_amount = $1, balance = $2, status = $3, updated_at = now() WHERE id = $4`, [paid, balance, status, i.id]);
        const before = { paid_amount: Number(i.paid_amount), balance: Number(i.balance), status: i.status };
        const after = { paid_amount: paid, balance, status };
        changes.push({ entity: 'Installment', id: i.id, label: `instalment ${i.installment_number} of invoice ${i.invoice_id}`, before, after });
        await this.activityLogs.logUpdate('Installment', i.id, before, after, userId,
          `Reconciliation: instalment figures recomputed from its allocation rows`, { repair: 'caches' }, m);
      }

      const invoices: Array<{ id: string; invoice_number: string; amount_paid: string; actual: string }> =
        await m.query(`SELECT v.id, v.invoice_number, v.amount_paid, COALESCE(sum(p.amount), 0) AS actual
          FROM invoices v LEFT JOIN payments p ON p.invoice_id = v.id
          WHERE NOT v.is_summary_invoice
          GROUP BY v.id HAVING round(v.amount_paid - COALESCE(sum(p.amount), 0), 2) <> 0`);
      for (const v of invoices) {
        const received = round2(Number(v.actual));
        await m.query(`UPDATE invoices SET amount_paid = $1, updated_at = now() WHERE id = $2`, [received, v.id]);
        const before = { amount_paid: Number(v.amount_paid) };
        const after = { amount_paid: received };
        changes.push({ entity: 'Invoice', id: v.id, label: v.invoice_number, before, after });
        await this.activityLogs.logUpdate('Invoice', v.id, before, after, userId,
          `Reconciliation: received figure recomputed from receipts`, { repair: 'caches' }, m);
      }

      const summaries: Array<{ id: string; invoice_number: string; total: string; amount_paid: string; child_total: string; child_paid: string }> =
        await m.query(`SELECT s.id, s.invoice_number, s.total, s.amount_paid, sum(c.total) AS child_total, sum(c.amount_paid) AS child_paid
          FROM invoices s JOIN invoices c ON c.parent_invoice_id = s.id
          WHERE s.is_summary_invoice
          GROUP BY s.id HAVING round(s.total - sum(c.total), 2) <> 0 OR round(s.amount_paid - sum(c.amount_paid), 2) <> 0`);
      for (const s of summaries) {
        const total = round2(Number(s.child_total));
        const received = round2(Number(s.child_paid));
        await m.query(`UPDATE invoices SET total = $1, amount_paid = $2, updated_at = now() WHERE id = $3`, [total, received, s.id]);
        const before = { total: Number(s.total), amount_paid: Number(s.amount_paid) };
        const after = { total, amount_paid: received };
        changes.push({ entity: 'Invoice', id: s.id, label: `${s.invoice_number} (summary)`, before, after });
        await this.activityLogs.logUpdate('Invoice', s.id, before, after, userId,
          `Reconciliation: summary figures recomputed from its instalment invoices`, { repair: 'caches' }, m);
      }

      return changes;
    });
  }

  /**
   * FIN-07b: set each invoice's status to what its money says, for the
   * invoices (or the given ones) whose status contradicts it. "Paid with
   * nothing received" becomes Sent when the invoice was ever issued (left
   * Draft before), else Draft. No e-mail is sent: this is a correction of a
   * badge, not an issuance. Dry run by default; audit row per invoice.
   */
  async repairStatuses(apply: boolean, userId: string, invoiceIds?: string[]): Promise<RepairResult> {
    return this.inRepairTransaction(apply, async (m) => {
      const changes: RepairChange[] = [];
      const params: unknown[] = [];
      const filter = invoiceIds?.length ? `AND id = ANY($1::uuid[])` : '';
      if (invoiceIds?.length) params.push(invoiceIds);
      const rows: Array<{ id: string; invoice_number: string; status: string; payment_status: string; total: string; amount_paid: string; paid_date: string | null; ever_issued: boolean }> =
        await m.query(`SELECT v.id, v.invoice_number, v.status, v.payment_status, v.total, v.amount_paid, v.paid_date,
            EXISTS (SELECT 1 FROM activity_logs l WHERE l.entity = 'Invoice' AND l.entity_id = v.id
                    AND (l.new_values::text ILIKE '%"status":%"Sent"%' OR l.summary ILIKE '%to Sent%' OR l.summary ILIKE '%generated and sent%')) AS ever_issued
          FROM invoices v
          WHERE v.status <> 'Cancelled' AND NOT v.is_summary_invoice ${filter} AND (
            (v.status = 'Paid' AND round(v.amount_paid, 2) < round(v.total, 2))
            OR (v.status = 'Partially-Paid' AND v.amount_paid <= 0)
            OR (v.status IN ('Sent', 'Draft', 'Overdue') AND v.total > 0 AND round(v.amount_paid, 2) >= round(v.total, 2)))`, params);
      for (const v of rows) {
        const received = Number(v.amount_paid);
        const total = Number(v.total);
        const derived = deriveInvoiceStatus(v.status, total, received);
        // A badge that says Paid with nothing received came from a hand edit;
        // the invoice goes back to Sent only if it was ever issued.
        if (derived.status === 'Sent' && !v.ever_issued) derived.status = 'Draft';
        if (derived.status === v.status && derived.payment_status === v.payment_status) continue;
        await m.query(
          `UPDATE invoices SET status = $1, payment_status = $2, paid_date = CASE WHEN $3::boolean THEN COALESCE(paid_date, now()) ELSE NULL END, updated_at = now() WHERE id = $4`,
          [derived.status, derived.payment_status, derived.paid_date_set, v.id],
        );
        const before = { status: v.status, payment_status: v.payment_status, amount_paid: received, total };
        const after = { status: derived.status, payment_status: derived.payment_status, amount_paid: received, total };
        changes.push({ entity: 'Invoice', id: v.id, label: v.invoice_number, before, after });
        await this.activityLogs.logUpdate('Invoice', v.id, before, after, userId,
          `Reconciliation: status set from the money received (${received.toFixed(2)} of ${total.toFixed(2)}): ${v.status} → ${derived.status}`,
          { repair: 'statuses', ever_issued: v.ever_issued }, m);
      }
      return changes;
    });
  }

  private async inRepairTransaction(
    apply: boolean,
    work: (m: EntityManager) => Promise<RepairChange[]>,
  ): Promise<RepairResult> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const changes = await work(runner.manager);
      if (apply) {
        await runner.commitTransaction();
        this.logger.warn(`Finance repair APPLIED: ${changes.length} record(s) corrected`);
      } else {
        await runner.rollbackTransaction();
      }
      return { applied: apply, changes };
    } catch (error) {
      await runner.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      await runner.release();
    }
  }
}
