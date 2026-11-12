import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, SelectQueryBuilder } from 'typeorm';
import { Deal } from '../deals/entities/deal.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Installment } from '../payment-terms/entities/installment.entity';
import {
  applyFamilyReviewScope,
  applyObligationScope,
  applyUnissuedDraftScope,
  businessDaysOverdue,
} from '../invoices/invoice-obligations';

/**
 * Read-only aggregation service for the in-app reports pages (Sales
 * Performance / Pipeline Analysis / Finance). Keeps queries close to
 * the data so controllers stay thin; mirrors the shapes defined in
 * `client/src/api/reports/types.ts` so the frontend hooks consume
 * the response directly with no remapping.
 */
export type SalesPerformancePeriod = 'month' | 'quarter' | 'year';

export interface SalesPerformanceStats {
  totalPrincipalSold: number;
  totalContractValue: number;
  cashCollected: number;
  outstanding: number;
  /** Unpaid value on Drafts: shown beside outstanding, never inside it. */
  draftNotIssued: number;
  /** Live instalments under cancelled parents: in no figure, flagged for review. */
  familiesToReview: { count: number; value: number };
}

export interface PipelineStageStats {
  stageName: string;
  stageColor: string;
  dealCount: number;
  totalValue: number;
  avgDaysInStage: number;
}

export interface FinanceReportStats {
  revenueByMethod: { method: string; amount: number }[];
  outstandingInvoices: {
    id: string;
    invoiceNumber: string;
    schoolName: string;
    amountDue: number;
    amountPaid: number;
    status: string;
  }[];
  upcomingInstallments: {
    id: string;
    dealName: string;
    amount: number;
    dueDate: string;
    status: string;
  }[];
}

@Injectable()
export class ReportsReadService {
  constructor(
    @InjectRepository(Deal) private readonly dealRepo: Repository<Deal>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Stage) private readonly stageRepo: Repository<Stage>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Installment)
    private readonly installmentRepo: Repository<Installment>,
  ) {}

  // ========================================================================
  // Sales Performance — principal sold, contract value, cash collected,
  // outstanding. Scoped to the selected period (month / quarter / year).
  // ========================================================================
  async getSalesPerformance(
    period: SalesPerformancePeriod,
    scopeUserId?: string,
  ): Promise<SalesPerformanceStats> {
    const { from, to } = this.rangeFor(period);

    // Won deals within the window = principal sold + contract value.
    // The Deal entity names the close timestamp `actualCloseDate`
    // (column `actual_close_date`), not `closed_at`. Using that.
    // When scoped (sales_rep), every figure is limited to the caller's
    // own book: deals they're assigned, invoices they own.
    const wonDeals = await this.dealRepo.find({
      where: {
        closeStatus: 'won' as any,
        actualCloseDate: Between(from, to) as any,
        ...(scopeUserId && { assigned_to: scopeUserId }),
      },
    });
    const totalPrincipalSold = wonDeals.reduce(
      (acc, d) => acc + Number(d.value || 0),
      0,
    );
    // Contract value defaults to the deal value if no invoice-level
    // override is present. Keeps the widget useful without introducing
    // a separate "contract_value" column.
    const totalContractValue = totalPrincipalSold;

    // Cash collected = the receipts dated in the window. This used to sum
    // amount_paid on invoices by paid_date, which only a fully paid invoice has
    // and which records when the payment was keyed, so a part payment counted
    // as no cash at all (FIN-02).
    const cashQb = this.paymentRepo
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'cash')
      .where('payment.payment_date BETWEEN :from AND :to', { from, to });
    if (scopeUserId) {
      cashQb
        .innerJoin('payment.invoice', 'invoice')
        .andWhere('invoice.owner_id = :scopeUserId', { scopeUserId });
    }
    const cashCollected = Number((await cashQb.getRawOne())?.cash ?? 0);

    // Outstanding = sum of (total - amount_paid) across all non-cancelled
    // invoices issued to date, regardless of the window (deployment
    // readiness = how much is unpaid RIGHT NOW).
    // One obligation once (010A): a split family's unpaid balance is the sum of
    // its child instalments; the summary parent is never added on top.
    const openInvoices = () =>
      this.invoiceRepo.createQueryBuilder('invoice').where('1 = 1');
    const balances = async (scoped: SelectQueryBuilder<Invoice>) => {
      if (scopeUserId) {
        scoped.andWhere('invoice.owner_id = :scopeUserId', { scopeUserId });
      }
      const rows = await scoped.getMany();
      return {
        count: rows.length,
        value: rows.reduce(
          (acc, inv) =>
            acc + Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0)),
          0,
        ),
      };
    };
    const { value: outstanding } = await balances(
      applyObligationScope(openInvoices(), 'invoice', { issuedOnly: true }),
    );
    const { value: draftNotIssued } = await balances(
      applyUnissuedDraftScope(openInvoices(), 'invoice'),
    );
    const familiesToReview = await balances(
      applyFamilyReviewScope(openInvoices(), 'invoice'),
    );

    return {
      totalPrincipalSold,
      totalContractValue,
      cashCollected,
      outstanding,
      draftNotIssued,
      familiesToReview,
    };
  }

  // ========================================================================
  // Pipeline Analysis — per-stage deal count, total value, and avg days
  // in stage. One row per active stage.
  // ========================================================================
  async getPipelineAnalysis(
    scopeUserId?: string,
  ): Promise<PipelineStageStats[]> {
    const stages = await this.stageRepo.find({
      where: { is_active: true },
      order: { order: 'ASC' },
    });

    const results: PipelineStageStats[] = [];
    for (const stage of stages) {
      const deals = await this.dealRepo.find({
        where: {
          current_stage_id: stage.id,
          closeStatus: 'ongoing',
          ...(scopeUserId && { assigned_to: scopeUserId }),
        } as any,
      });
      const dealCount = deals.length;
      const totalValue = deals.reduce(
        (acc, d) => acc + Number(d.value || 0),
        0,
      );
      // Avg days in stage = now - current_stage_since, averaged.
      const now = Date.now();
      const daysList = deals
        .map((d: any) => {
          const since = d.current_stage_since ?? d.currentStageSince ?? null;
          if (!since) return null;
          const t = new Date(since).getTime();
          if (Number.isNaN(t)) return null;
          return Math.max(0, (now - t) / (1000 * 60 * 60 * 24));
        })
        .filter((x): x is number => x !== null);
      const avgDaysInStage =
        daysList.length > 0
          ? daysList.reduce((a, b) => a + b, 0) / daysList.length
          : 0;

      results.push({
        stageName: stage.name,
        stageColor: stage.color || '#64748b',
        dealCount,
        totalValue,
        avgDaysInStage: Math.round(avgDaysInStage * 10) / 10,
      });
    }
    return results;
  }

  // ========================================================================
  // Finance Report — revenue grouped by payment method + outstanding
  // invoices list + upcoming installments list.
  // ========================================================================
  async getFinanceReport(): Promise<FinanceReportStats> {
    // Revenue by method — aggregate payment.amount grouped by method.
    const payments = await this.paymentRepo
      .createQueryBuilder('p')
      .select("COALESCE(p.method, 'Unknown')", 'method')
      .addSelect('SUM(p.amount)', 'amount')
      .groupBy('p.method')
      .getRawMany<{ method: string; amount: string }>();
    const revenueByMethod = payments.map((row) => ({
      method: row.method || 'Unknown',
      amount: Number(row.amount || 0),
    }));

    // Outstanding invoices — issued obligations not yet paid, one row each,
    // sorted by oldest due date first. Capped at 100 for the widget.
    const openInvoices = await applyObligationScope(
      this.invoiceRepo
        .createQueryBuilder('invoice')
        .leftJoin('invoice.school', 'school')
        .addSelect('school.name', 'school_name')
        .where('invoice.payment_status != :paid', { paid: 'Paid' }),
      'invoice',
      { issuedOnly: true },
    )
      .orderBy('invoice.due_date', 'ASC')
      .limit(100)
      .getRawAndEntities();
    const outstandingInvoices = openInvoices.entities.map((inv, i) => {
      const raw = openInvoices.raw[i] as { school_name?: string };
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        schoolName: raw?.school_name ?? inv.client_name ?? '—',
        amountDue: Math.max(
          0,
          Number(inv.total || 0) - Number(inv.amount_paid || 0),
        ),
        amountPaid: Number(inv.amount_paid || 0),
        status: inv.payment_status,
      };
    });

    // Upcoming installments — not yet paid, due in the next 60 days.
    // Installment has no ORM relation to Invoice (only `invoice_id`
    // as a scalar), so we JOIN on the id explicitly. Status enum
    // values are lowercase (`pending|partially_paid|paid|overdue`).
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const upcoming = await applyObligationScope(
      this.installmentRepo
        .createQueryBuilder('inst')
        .leftJoin(Invoice, 'invoice', 'invoice.id = inst.invoice_id')
        .leftJoin('invoice.deal', 'deal')
        .addSelect('deal.title', 'deal_title')
        .where('inst.due_date BETWEEN :from AND :to', {
          from: now.toISOString(),
          to: in60.toISOString(),
        })
        .andWhere('inst.status != :paid', { paid: 'paid' }),
      'invoice',
      { issuedOnly: true },
    )
      .orderBy('inst.due_date', 'ASC')
      .limit(100)
      .getRawAndEntities();
    const upcomingInstallments = upcoming.entities.map((inst: any, i) => {
      const raw = upcoming.raw[i] as { deal_title?: string };
      return {
        id: inst.id,
        dealName: raw?.deal_title ?? '—',
        amount: Number(inst.amount || 0),
        dueDate: inst.due_date?.toISOString?.() ?? String(inst.due_date),
        status: inst.status ?? 'pending',
      };
    });

    return { revenueByMethod, outstandingInvoices, upcomingInstallments };
  }

  // Used by /collections/aging-report — see CollectionsController.
  async getAgingReport(asOfDateISO?: string, scopeUserId?: string) {
    const asOf = asOfDateISO ? new Date(asOfDateISO) : new Date();

    const installmentRows = async (scope: (qb: SelectQueryBuilder<any>) => unknown) => {
      // Installment has only `invoice_id` as a scalar; JOIN Invoice
      // explicitly by id instead of via an ORM relation (which doesn't
      // exist on the entity). Status values are lowercase enums.
      const rowsQb = this.installmentRepo
        .createQueryBuilder('inst')
        .leftJoin(Invoice, 'invoice', 'invoice.id = inst.invoice_id')
        .leftJoin('invoice.school', 'school')
        .addSelect('invoice.invoice_number', 'invoice_number')
        .addSelect('invoice.id', 'invoice_id')
        .addSelect('school.id', 'school_id')
        .addSelect('school.name', 'school_name')
        .where('inst.status != :paid', { paid: 'paid' });
      scope(rowsQb);
      if (scopeUserId) {
        rowsQb.andWhere('invoice.owner_id = :scopeUserId', { scopeUserId });
      }
      const rows = await rowsQb.getRawAndEntities();

      return rows.entities.map((inst: any, i) => {
        const raw = rows.raw[i] as {
          invoice_number?: string;
          invoice_id?: string;
          school_id?: string;
          school_name?: string;
        };
        const dueDate = inst.due_date ? new Date(inst.due_date) : null;
        // Effective deadline honours the grace date; overdue once the Harare
        // day of that deadline has ended before the as-of day, in whole Harare
        // days (010C). An instalment is due throughout its own day.
        const deadline = inst.grace_due_date
          ? new Date(inst.grace_due_date)
          : dueDate;
        const daysOverdue = deadline ? businessDaysOverdue(deadline, asOf) : 0;
        const bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+' =
          daysOverdue <= 0
            ? 'current'
            : daysOverdue <= 30
              ? '1-30'
              : daysOverdue <= 60
                ? '31-60'
                : daysOverdue <= 90
                  ? '61-90'
                  : '90+';
        const amount = Number(inst.amount || 0);
        const paidAmount = Number(inst.paid_amount || 0);
        return {
          installment_id: inst.id,
          installment_number: inst.installment_number ?? 1,
          invoice_id: raw?.invoice_id ?? '',
          invoice_number: raw?.invoice_number ?? '—',
          customer_id: raw?.school_id ?? '',
          customer_name: raw?.school_name ?? '—',
          due_date:
            dueDate?.toISOString() ?? String(inst.due_date),
          amount,
          balance: Math.max(0, amount - paidAmount),
          paid_amount: paidAmount,
          status: inst.status ?? 'pending',
          days_overdue: daysOverdue,
          aging_bucket: bucket,
          late_fee: Number(inst.late_fee || 0),
        };
      });
    };
    // Only collectible obligations (010D): the instalment's invoice must exist
    // and be a non-summary invoice that is not cancelled, under a parent that
    // is not cancelled — the same rule as every other obligation figure — and,
    // since RELEASE-EBI-AUDIT-003, issued. The instalment rows of a cancelled
    // invoice keep their own status, so without this they stayed in the report;
    // a row with no invoice, should one ever exist, is not debt and is left out
    // as well. So are the rows of an invoice already marked Paid.
    const installments = await installmentRows((qb) =>
      applyObligationScope(qb, 'invoice', { issuedOnly: true }).andWhere(
        "invoice.status <> 'Paid'",
      ),
    );
    // Listed for the deal and school tabs, outside every total below.
    const draft_installments = await installmentRows((qb) =>
      applyUnissuedDraftScope(qb, 'invoice'),
    );

    // Bucket summaries.
    const bucketOrder: Array<
      'current' | '1-30' | '31-60' | '61-90' | '90+'
    > = ['current', '1-30', '31-60', '61-90', '90+'];
    const buckets = bucketOrder.map((b) => {
      const slice = installments.filter((x) => x.aging_bucket === b);
      return {
        bucket: b,
        count: slice.length,
        total_balance: slice.reduce((acc, x) => acc + x.balance, 0),
      };
    });

    // Customer summaries.
    const customerMap = new Map<
      string,
      { customer_id: string; customer_name: string; total_balance: number; installment_count: number }
    >();
    for (const x of installments) {
      const existing = customerMap.get(x.customer_id) ?? {
        customer_id: x.customer_id,
        customer_name: x.customer_name,
        total_balance: 0,
        installment_count: 0,
      };
      existing.total_balance += x.balance;
      existing.installment_count += 1;
      customerMap.set(x.customer_id, existing);
    }
    const customers = [...customerMap.values()].sort(
      (a, b) => b.total_balance - a.total_balance,
    );

    const total_outstanding = installments.reduce(
      (acc, x) => acc + x.balance,
      0,
    );
    return { installments, draft_installments, buckets, customers, total_outstanding };
  }

  // --------------------------------------------------------------
  private rangeFor(period: SalesPerformancePeriod): { from: Date; to: Date } {
    const now = new Date();
    const to = now;
    const from = new Date(now);
    if (period === 'month') {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    } else if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      from.setMonth(q * 3, 1);
      from.setHours(0, 0, 0, 0);
    } else {
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
    }
    return { from, to };
  }
}
