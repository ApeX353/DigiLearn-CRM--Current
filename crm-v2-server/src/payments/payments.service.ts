import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { paginate, Pagination } from 'nestjs-typeorm-paginate';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentTermsService } from '../payment-terms/payment-terms.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { SettingsService } from '../settings/settings.service';

export interface PaymentStatistics {
  total_payments: number;
  total_amount: number;
  total_allocated: number;
  total_unallocated: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly invoicesService: InvoicesService,
    private readonly paymentTermsService: PaymentTermsService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(
    dto: CreatePaymentDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<Payment> {
    // Verify invoice exists
    const invoice = await this.invoicesService.findOne(dto.invoice_id);
    // C-03: a rep can only record money against their own invoice. A
    // foreign id answers 404 — not 403 — so ids cannot be probed.
    if (scopeUserId && invoice.owner_id !== scopeUserId) {
      throw new NotFoundException(
        `Invoice with ID ${dto.invoice_id} not found`,
      );
    }
    if (invoice.is_summary_invoice) {
      throw new BadRequestException(
        `Invoice ${dto.invoice_id} is a summary invoice and cannot accept payments`,
      );
    }

    // Auto-generate reference if not provided
    if (!dto.reference) {
      dto.reference = await this.generatePaymentReference();
    }

    const payment = this.paymentRepository.create(dto);
    const saved = await this.paymentRepository.save(payment);

    await this.invoicesService.recalculatePaymentStatus(dto.invoice_id);
    if (invoice.parent_invoice_id) {
      await this.invoicesService.recalculatePaymentStatus(
        invoice.parent_invoice_id,
      );
    }

    // Auto-allocate to installments if invoice has an applied payment term
    try {
      const appliedTerm =
        await this.paymentTermsService.findAppliedTermByDocument(
          invoice.parent_invoice_id ?? dto.invoice_id,
          'invoice',
        );
      if (appliedTerm) {
        await this.paymentTermsService.allocatePaymentFIFO(saved.id, userId);
      }
    } catch (error) {
      this.logger.warn(
        `Auto-allocation failed for payment ${saved.id}: ${error.message}`,
      );
    }

    await this.activityLogsService.logCreate(
      'Payment',
      saved.id,
      saved,
      userId,
      `Recorded payment of ${saved.amount} for invoice ${dto.invoice_id}`,
    );

    return saved;
  }

  /**
   * @param scopeUserId When set (sales reps), restricts results to payments
   *   whose invoice is owned by this user. Payment has no owner column, so
   *   ownership is reached through the joined invoice (invoice.owner_id).
   *   Elevated roles (admin/admin_support/sales_manager/manager) pass
   *   undefined and see everything.
   */
  async findAll(
    query: QueryPaymentDto,
    scopeUserId?: string,
  ): Promise<Pagination<Payment>> {
    const { page = '1', limit = '10', invoice_id, start_date, end_date } = query;

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.invoice', 'invoice')
      .orderBy('payment.payment_date', 'DESC');

    if (scopeUserId) {
      qb.andWhere('invoice.owner_id = :scopeUserId', { scopeUserId });
    }
    if (invoice_id) {
      qb.andWhere('payment.invoice_id = :invoice_id', { invoice_id });
    }
    if (start_date) {
      qb.andWhere('payment.payment_date >= :start_date', { start_date });
    }
    if (end_date) {
      qb.andWhere('payment.payment_date <= :end_date', { end_date });
    }

    return paginate<Payment>(qb, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  async findOne(id: string, scopeUserId?: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['invoice'],
    });
    // A scoped caller (sales_rep) may only read payments on invoices they
    // own — reported as not-found rather than forbidden so ids can't be probed.
    if (!payment || (scopeUserId && payment.invoice?.owner_id !== scopeUserId)) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    return payment;
  }

  async update(
    id: string,
    dto: UpdatePaymentDto,
    userId: string,
  ): Promise<Payment> {
    const payment = await this.findOne(id);
    const oldValues = { ...payment };
    const amountChanged =
      dto.amount !== undefined &&
      Number(dto.amount) !== Number(payment.amount);

    Object.assign(payment, dto);
    const updated = await this.paymentRepository.save(payment);

    // If the amount changed, the old spread across the instalments no
    // longer describes this payment. Undo it and reapply from scratch,
    // rather than leaving the instalments crediting the previous figure.
    if (amountChanged) {
      await this.paymentTermsService.reversePaymentAllocations(id);
      updated.allocated_amount = 0;
      updated.unallocated_amount = Number(updated.amount);
      await this.paymentRepository.save(updated);
      try {
        await this.paymentTermsService.allocatePaymentFIFO(id, userId);
      } catch {
        // An invoice with no instalment schedule has nothing to allocate
        // against; the invoice-level recalculation below still runs.
      }
    }

    await this.invoicesService.recalculatePaymentStatus(payment.invoice_id);
    const invoice = await this.invoicesService.findOne(payment.invoice_id);
    if (invoice.parent_invoice_id) {
      await this.invoicesService.recalculatePaymentStatus(
        invoice.parent_invoice_id,
      );
    }

    await this.activityLogsService.logUpdate(
      'Payment',
      id,
      oldValues,
      updated,
      userId,
      `Updated payment ${id}`,
    );

    return updated;
  }

  async remove(id: string, userId: string): Promise<void> {
    const payment = await this.findOne(id);
    const invoiceId = payment.invoice_id;

    // Give the money back to the instalments first. Allocation writes to
    // the instalment directly, so removing the payment on its own would
    // leave the schedule still claiming to hold money that has gone.
    await this.paymentTermsService.reversePaymentAllocations(id);

    await this.paymentRepository.remove(payment);

    await this.invoicesService.recalculatePaymentStatus(invoiceId);
    const invoice = await this.invoicesService.findOne(invoiceId);
    if (invoice.parent_invoice_id) {
      await this.invoicesService.recalculatePaymentStatus(
        invoice.parent_invoice_id,
      );
    }

    await this.activityLogsService.logDelete(
      'Payment',
      id,
      payment,
      userId,
      `Deleted payment of ${payment.amount}`,
    );
  }

  // ========================
  // Payment Stats
  // ========================

  async getPaymentStats(scopeUserId?: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const buildStats = async (start: Date) => {
      const totalsQb = this.paymentRepository
        .createQueryBuilder('p')
        .select('COUNT(*)', 'totalPayments')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'totalCollected')
        .addSelect('COALESCE(AVG(p.amount), 0)', 'averagePayment')
        .where('p.payment_date >= :start', { start });
      if (scopeUserId) {
        totalsQb
          .leftJoin('p.invoice', 'invoice')
          .andWhere('invoice.owner_id = :scopeUserId', { scopeUserId });
      }
      const result = await totalsQb.getRawOne();

      const byMethodQb = this.paymentRepository
        .createQueryBuilder('p')
        .select('p.method', 'method')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'value')
        .where('p.payment_date >= :start', { start })
        .andWhere('p.method IS NOT NULL');
      if (scopeUserId) {
        byMethodQb
          .leftJoin('p.invoice', 'invoice')
          .andWhere('invoice.owner_id = :scopeUserId', { scopeUserId });
      }
      const byMethod = await byMethodQb
        .groupBy('p.method')
        .orderBy('SUM(p.amount)', 'DESC')
        .getRawMany();

      return {
        totalPayments: Number(result.totalPayments),
        totalCollected: Number(result.totalCollected),
        averagePayment: Math.round(Number(result.averagePayment) * 100) / 100,
        byMethod: byMethod.map((r: any) => ({
          method: r.method,
          count: Number(r.count),
          value: Number(r.value),
        })),
      };
    };

    const [monthly, quarterly, yearly] = await Promise.all([
      buildStats(monthStart),
      buildStats(quarterStart),
      buildStats(yearStart),
    ]);

    return { monthly, quarterly, yearly };
  }

  async getPaymentStatistics(
    query: Pick<QueryPaymentDto, 'start_date' | 'end_date'> = {},
    scopeUserId?: string,
  ): Promise<PaymentStatistics> {
    const startDate = query.start_date
      ? this.startOfDay(new Date(query.start_date))
      : await this.resolveFiscalYearStart();
    const endDate = query.end_date
      ? this.endOfDay(new Date(query.end_date))
      : new Date();

    const statsQb = this.paymentRepository
      .createQueryBuilder('payment')
      .select('COUNT(*)', 'total_payments')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'total_amount')
      .addSelect(
        'COALESCE(SUM(payment.allocated_amount), 0)',
        'total_allocated',
      )
      .addSelect(
        'COALESCE(SUM(payment.unallocated_amount), 0)',
        'total_unallocated',
      )
      .where('payment.payment_date >= :startDate', { startDate })
      .andWhere('payment.payment_date <= :endDate', { endDate });
    if (scopeUserId) {
      statsQb
        .leftJoin('payment.invoice', 'invoice')
        .andWhere('invoice.owner_id = :scopeUserId', { scopeUserId });
    }
    const result = await statsQb.getRawOne();

    return {
      total_payments: Number(result?.total_payments || 0),
      total_amount: Number(result?.total_amount || 0),
      total_allocated: Number(result?.total_allocated || 0),
      total_unallocated: Number(result?.total_unallocated || 0),
    };
  }

  // ========================
  // Reference Generation
  // ========================

  private async generatePaymentReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PAY-${year}-`;

    const lastPayment = await this.paymentRepository.findOne({
      where: { reference: Like(`${prefix}%`) },
      order: { created_at: 'DESC' },
    });

    let nextNumber = 1;
    if (lastPayment?.reference) {
      const match = lastPayment.reference.match(/PAY-\d{4}-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  private async resolveFiscalYearStart(): Promise<Date> {
    const defaultsSetting = await this.settingsService.getSetting('defaults');
    const nestedFiscalYear =
      defaultsSetting?.value &&
      typeof defaultsSetting.value === 'object' &&
      !Array.isArray(defaultsSetting.value)
        ? (defaultsSetting.value as Record<string, unknown>).default_fiscal_year
        : null;
    const nestedStart = this.parseFiscalYearStart(nestedFiscalYear);
    if (nestedStart) {
      return nestedStart;
    }

    const dottedSetting = await this.settingsService.getSetting(
      'defaults.default_fiscal_year',
    );
    const dottedStart = this.parseFiscalYearStart(dottedSetting?.value);
    if (dottedStart) {
      return dottedStart;
    }

    const directSetting =
      await this.settingsService.getSetting('default_fiscal_year');
    const directStart = this.parseFiscalYearStart(directSetting?.value);
    if (directStart) {
      return directStart;
    }

    return new Date(new Date().getFullYear(), 0, 1);
  }

  private parseFiscalYearStart(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return this.startOfDay(value);
    }

    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return new Date(value, 0, 1);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      if (/^\d{4}$/.test(trimmed)) {
        return new Date(Number(trimmed), 0, 1);
      }

      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return this.startOfDay(parsed);
      }
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      for (const candidate of [
        record.start_date,
        record.startDate,
        record.value,
        record.year,
      ]) {
        const parsed = this.parseFiscalYearStart(candidate);
        if (parsed) {
          return parsed;
        }
      }
    }

    return null;
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }
}
