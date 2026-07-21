import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Deal } from '../deals/entities/deal.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Installment } from '../payment-terms/entities/installment.entity';

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
  ): Promise<SalesPerformanceStats> {
    const { from, to } = this.rangeFor(period);

    // Won deals within the window = principal sold + contract value.
    // The Deal entity names the close timestamp `actualCloseDate`
    // (column `actual_close_date`), not `closed_at`. Using that.
    const wonDeals = await this.dealRepo.find({
      where: {
        closeStatus: 'won' as any,
        actualCloseDate: Between(from, to) as any,
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

    // Cash collected = sum of invoice.amount_paid on invoices whose
    // paid_date falls in the window.
    const paidInvoices = await this.invoiceRepo.find({
      where: {
        paid_date: Between(from, to) as any,
      },
    });
    const cashCollected = paidInvoices.reduce(
      (acc, inv) => acc + Number(inv.amount_paid || 0),
      0,
    );

    // Outstanding = sum of (total - amount_paid) across all non-cancelled
    // invoices issued to date, regardless of the window (deployment
    // readiness = how much is unpaid RIGHT NOW).
    const openInvoices = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .where('invoice.status != :cancelled', { cancelled: 'Cancelled' })
      .getMany();
    const outstanding = openInvoices.reduce(
      (acc, inv) =>
        acc + Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0)),
      0,
    );

    return {
      totalPrincipalSold,
      totalContractValue,
      cashCollected,
      outstanding,
    };
  }

  // ========================================================================
  // Pipeline Analysis — per-stage deal count, total value, and avg days
  // in stage. One row per active stage.
  // ========================================================================
  async getPipelineAnalysis(): Promise<PipelineStageStats[]> {
    const stages = await this.stageRepo.find({
      where: { is_active: true },
      order: { order: 'ASC' },
    });

    const results: PipelineStageStats[] = [];
    for (const stage of stages) {
      const deals = await this.dealRepo.find({
        where: { current_stage_id: stage.id, closeStatus: 'ongoing' } as any,
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

    // Outstanding invoices — non-paid, non-cancelled, sorted by oldest
    // due date first. Capped at 100 for the widget.
    const openInvoices = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoin('invoice.school', 'school')
      .addSelect('school.name', 'school_name')
      .where('invoice.status != :cancelled', { cancelled: 'Cancelled' })
      .andWhere('invoice.payment_status != :paid', { paid: 'Paid' })
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
    const upcoming = await this.installmentRepo
      .createQueryBuilder('inst')
      .leftJoin(Invoice, 'invoice', 'invoice.id = inst.invoice_id')
      .leftJoin('invoice.deal', 'deal')
      .addSelect('deal.title', 'deal_title')
      .where('inst.due_date BETWEEN :from AND :to', {
        from: now.toISOString(),
        to: in60.toISOString(),
      })
      .andWhere('inst.status != :paid', { paid: 'paid' })
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
  async getAgingReport(asOfDateISO?: string) {
    const asOf = asOfDateISO ? new Date(asOfDateISO) : new Date();

    // Installment has only `invoice_id` as a scalar; JOIN Invoice
    // explicitly by id instead of via an ORM relation (which doesn't
    // exist on the entity). Status values are lowercase enums.
    const rows = await this.installmentRepo
      .createQueryBuilder('inst')
      .leftJoin(Invoice, 'invoice', 'invoice.id = inst.invoice_id')
      .leftJoin('invoice.school', 'school')
      .addSelect('invoice.invoice_number', 'invoice_number')
      .addSelect('invoice.id', 'invoice_id')
      .addSelect('school.id', 'school_id')
      .addSelect('school.name', 'school_name')
      .where('inst.status != :paid', { paid: 'paid' })
      .getRawAndEntities();

    const installments = rows.entities.map((inst: any, i) => {
      const raw = rows.raw[i] as {
        invoice_number?: string;
        invoice_id?: string;
        school_id?: string;
        school_name?: string;
      };
      const dueDate = inst.due_date ? new Date(inst.due_date) : null;
      const daysOverdue =
        dueDate && dueDate < asOf
          ? Math.floor(
              (asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
            )
          : 0;
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
    return { installments, buckets, customers, total_outstanding };
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
