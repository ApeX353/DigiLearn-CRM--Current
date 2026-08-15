import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Like, Repository } from 'typeorm';
import { paginate, Pagination } from 'nestjs-typeorm-paginate';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { PaymentTermsService } from '../payment-terms/payment-terms.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { SettingsService } from '../settings/settings.service';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Installment } from '../payment-terms/entities/installment.entity';
import { PaymentAllocation } from '../payment-terms/entities/payment-allocation.entity';
import { ActivityLog } from '../activity-logs/entities/activity-log.entity';
import {
  PaymentEntryRequest,
  PaymentEntryRequestStatus,
} from './entities/payment-entry-request.entity';
import { ReviewPaymentEntryRequestDto } from './dto/review-payment-entry-request.dto';

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
    @InjectRepository(PaymentEntryRequest)
    private readonly paymentEntryRequestRepository: Repository<PaymentEntryRequest>,
    private readonly invoicesService: InvoicesService,
    private readonly paymentTermsService: PaymentTermsService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
  ) {}

  async submit(
    dto: CreatePaymentDto,
    userId: string,
    role: string,
  ): Promise<
    | { kind: 'payment'; payment: Payment }
    | { kind: 'approval_request'; request: PaymentEntryRequest }
  > {
    if (role === 'sales_rep') {
      return {
        kind: 'approval_request',
        request: await this.createPaymentEntryRequest(dto, userId),
      };
    }
    if (role !== 'admin' && role !== 'sales_manager') {
      throw new ForbiddenException(
        'Only admins and sales managers may post payments directly',
      );
    }
    return { kind: 'payment', payment: await this.create(dto, userId) };
  }

  async create(
    dto: CreatePaymentDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<Payment> {
    return this.dataSource.transaction((manager) =>
      this.postPayment(manager, dto, userId, scopeUserId),
    );
  }

  async findPaymentEntryRequests(
    status: PaymentEntryRequestStatus = 'pending',
  ): Promise<PaymentEntryRequest[]> {
    return this.paymentEntryRequestRepository.find({
      where: { status },
      relations: [
        'invoice',
        'invoice.school',
        'requested_by',
        'reviewed_by',
        'resulting_payment',
      ],
      order: { requested_at: 'DESC' },
    });
  }

  async reviewPaymentEntryRequest(
    id: string,
    dto: ReviewPaymentEntryRequestDto,
    reviewerId: string,
  ): Promise<PaymentEntryRequest> {
    if (dto.decision === 'rejected' && !dto.review_note?.trim()) {
      throw new BadRequestException('A rejection note is required');
    }

    await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(PaymentEntryRequest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) {
        throw new NotFoundException(`Payment entry request ${id} not found`);
      }
      if (request.status !== 'pending') {
        throw new ConflictException(
          `Payment entry request has already been ${request.status}`,
        );
      }

      request.reviewed_by_id = reviewerId;
      request.reviewed_at = new Date();
      request.review_note = dto.review_note?.trim() || null;

      if (dto.decision === 'rejected') {
        request.status = 'rejected';
        await manager.save(PaymentEntryRequest, request);
        await this.writeActivityLog(manager, {
          entity: 'PaymentEntryRequest',
          entityId: request.id,
          action: 'update',
          actorId: reviewerId,
          oldValues: { status: 'pending' },
          newValues: { status: 'rejected', review_note: request.review_note },
          summary: `Rejected payment entry request for invoice ${request.invoice_id}`,
        });
        return;
      }

      const payment = await this.postPayment(
        manager,
        {
          invoice_id: request.invoice_id,
          amount: Number(request.amount),
          payment_date: new Date(request.payment_date).toISOString(),
          method: request.method ?? undefined,
          payment_method: request.method ?? undefined,
          reference: request.reference ?? undefined,
          notes: request.notes ?? undefined,
        },
        request.requested_by_id,
        request.requested_by_id,
        request.id,
      );
      request.status = 'approved';
      request.resulting_payment_id = payment.id;
      await manager.save(PaymentEntryRequest, request);
      await this.writeActivityLog(manager, {
        entity: 'PaymentEntryRequest',
        entityId: request.id,
        action: 'update',
        actorId: reviewerId,
        oldValues: { status: 'pending' },
        newValues: {
          status: 'approved',
          resulting_payment_id: payment.id,
          review_note: request.review_note,
        },
        summary: `Approved payment entry request for invoice ${request.invoice_id}`,
      });
    });

    const reviewed = await this.paymentEntryRequestRepository.findOne({
      where: { id },
      relations: [
        'invoice',
        'invoice.school',
        'requested_by',
        'reviewed_by',
        'resulting_payment',
      ],
    });
    if (!reviewed) {
      throw new NotFoundException(`Payment entry request ${id} not found`);
    }
    return reviewed;
  }

  private async createPaymentEntryRequest(
    dto: CreatePaymentDto,
    userId: string,
  ): Promise<PaymentEntryRequest> {
    const requestId = await this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockPayableInvoice(
        manager,
        dto.invoice_id,
        userId,
      );
      const outstanding = await this.getOutstanding(manager, invoice);
      const pendingRaw = await manager
        .getRepository(PaymentEntryRequest)
        .createQueryBuilder('request')
        .select('COALESCE(SUM(request.amount), 0)', 'total')
        .where('request.invoice_id = :invoiceId', { invoiceId: invoice.id })
        .andWhere('request.status = :status', { status: 'pending' })
        .getRawOne<{ total: string }>();
      const available = this.roundCurrency(
        outstanding - Number(pendingRaw?.total ?? 0),
      );
      this.assertPaymentAmount(dto.amount, available);

      const request = manager.create(PaymentEntryRequest, {
        invoice_id: invoice.id,
        amount: this.roundCurrency(dto.amount),
        payment_date: new Date(dto.payment_date),
        method: dto.method ?? dto.payment_method ?? null,
        reference: dto.reference?.trim() || null,
        notes: dto.notes?.trim() || null,
        invoice_total_snapshot: Number(invoice.total),
        outstanding_snapshot: outstanding,
        invoice_owner_id_snapshot: invoice.owner_id,
        status: 'pending',
        requested_by_id: userId,
      });
      const saved = await manager.save(PaymentEntryRequest, request);
      await this.writeActivityLog(manager, {
        entity: 'PaymentEntryRequest',
        entityId: saved.id,
        action: 'create',
        actorId: userId,
        newValues: {
          invoice_id: saved.invoice_id,
          amount: saved.amount,
          payment_date: saved.payment_date,
          status: saved.status,
        },
        summary: `Requested payment entry of ${saved.amount} for invoice ${saved.invoice_id}`,
      });
      return saved.id;
    });

    const request = await this.paymentEntryRequestRepository.findOne({
      where: { id: requestId },
      relations: ['invoice', 'invoice.school', 'requested_by'],
    });
    if (!request) throw new NotFoundException('Payment entry request not found');
    return request;
  }

  private async postPayment(
    manager: EntityManager,
    dto: CreatePaymentDto,
    recordedById: string,
    scopeUserId?: string,
    requestId?: string,
  ): Promise<Payment> {
    const invoice = await this.lockPayableInvoice(
      manager,
      dto.invoice_id,
      scopeUserId,
    );
    const outstanding = await this.getOutstanding(manager, invoice);
    this.assertPaymentAmount(dto.amount, outstanding);

    const reference =
      dto.reference?.trim() || (await this.generatePaymentReference(manager));
    const payment = manager.create(Payment, {
      invoice_id: invoice.id,
      amount: this.roundCurrency(dto.amount),
      payment_date: new Date(dto.payment_date),
      method: dto.method ?? dto.payment_method ?? undefined,
      reference,
      notes: dto.notes?.trim() || undefined,
      allocated_amount: 0,
      unallocated_amount: this.roundCurrency(dto.amount),
      recorded_by_id: recordedById,
      payment_entry_request_id: requestId ?? null,
    });
    const saved = await manager.save(Payment, payment);

    await this.allocatePaymentFIFO(manager, saved);
    await this.recalculateInvoicePaymentState(manager, invoice.id);
    if (invoice.parent_invoice_id) {
      await this.recalculateInvoicePaymentState(
        manager,
        invoice.parent_invoice_id,
      );
    }

    await this.writeActivityLog(manager, {
      entity: 'Payment',
      entityId: saved.id,
      action: 'create',
      actorId: recordedById,
      newValues: {
        invoice_id: saved.invoice_id,
        amount: saved.amount,
        payment_date: saved.payment_date,
        method: saved.method,
        reference: saved.reference,
        recorded_by_id: saved.recorded_by_id,
        payment_entry_request_id: saved.payment_entry_request_id,
      },
      summary: `Recorded payment of ${saved.amount} for invoice ${invoice.invoice_number}`,
    });
    return saved;
  }

  private async lockPayableInvoice(
    manager: EntityManager,
    invoiceId: string,
    scopeUserId?: string,
  ): Promise<Invoice> {
    const invoice = await manager.findOne(Invoice, {
      where: { id: invoiceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice || (scopeUserId && invoice.owner_id !== scopeUserId)) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }
    if (invoice.is_summary_invoice) {
      throw new BadRequestException(
        `Invoice ${invoiceId} is a summary invoice and cannot accept payments`,
      );
    }
    if (invoice.status === 'Cancelled') {
      throw new BadRequestException('Cancelled invoices cannot accept payments');
    }
    return invoice;
  }

  private async getOutstanding(
    manager: EntityManager,
    invoice: Invoice,
  ): Promise<number> {
    const raw = await manager
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('payment.invoice_id = :invoiceId', { invoiceId: invoice.id })
      .getRawOne<{ total: string }>();
    return Math.max(
      0,
      this.roundCurrency(Number(invoice.total) - Number(raw?.total ?? 0)),
    );
  }

  private assertPaymentAmount(amount: number, available: number): void {
    const rounded = this.roundCurrency(Number(amount));
    if (!Number.isFinite(rounded) || rounded <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (rounded > available) {
      throw new ConflictException(
        `Payment amount exceeds the current outstanding balance of ${available.toFixed(2)}`,
      );
    }
  }

  private async allocatePaymentFIFO(
    manager: EntityManager,
    payment: Payment,
  ): Promise<void> {
    const installments = await manager
      .getRepository(Installment)
      .createQueryBuilder('installment')
      .where('installment.invoice_id = :invoiceId', {
        invoiceId: payment.invoice_id,
      })
      .andWhere('installment.balance > 0')
      .orderBy('installment.grace_due_date', 'ASC')
      .addOrderBy('installment.installment_number', 'ASC')
      .setLock('pessimistic_write')
      .getMany();

    let remaining = Number(payment.amount);
    let allocated = 0;
    let order = 1;
    for (const installment of installments) {
      if (remaining <= 0) break;
      const amount = this.roundCurrency(
        Math.min(remaining, Number(installment.balance)),
      );
      installment.paid_amount = this.roundCurrency(
        Number(installment.paid_amount) + amount,
      );
      installment.balance = this.roundCurrency(
        Number(installment.amount) - Number(installment.paid_amount),
      );
      installment.status =
        Number(installment.balance) <= 0 ? 'paid' : 'partially_paid';
      await manager.save(Installment, installment);
      await manager.save(
        PaymentAllocation,
        manager.create(PaymentAllocation, {
          payment_id: payment.id,
          installment_id: installment.id,
          allocated_amount: amount,
          allocation_order: order,
          allocation_date: payment.payment_date,
          reference: `ALLOC-${payment.id.slice(0, 8)}-${order}`,
        }),
      );
      allocated = this.roundCurrency(allocated + amount);
      remaining = this.roundCurrency(remaining - amount);
      order += 1;
    }

    payment.allocated_amount = allocated;
    payment.unallocated_amount = remaining;
    await manager.save(Payment, payment);
  }

  private async recalculateInvoicePaymentState(
    manager: EntityManager,
    invoiceId: string,
  ): Promise<void> {
    const invoice = await manager.findOne(Invoice, {
      where: { id: invoiceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    let totalPaid = 0;
    if (invoice.is_summary_invoice) {
      const children = await manager.find(Invoice, {
        where: { parent_invoice_id: invoice.id },
      });
      invoice.total = this.roundCurrency(
        children.reduce((sum, child) => sum + Number(child.total), 0),
      );
      totalPaid = children.reduce(
        (sum, child) => sum + Number(child.amount_paid),
        0,
      );
    } else {
      const raw = await manager
        .getRepository(Payment)
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'total')
        .where('payment.invoice_id = :invoiceId', { invoiceId })
        .getRawOne<{ total: string }>();
      totalPaid = Number(raw?.total ?? 0);
    }

    invoice.amount_paid = this.roundCurrency(totalPaid);
    if (totalPaid <= 0) {
      invoice.payment_status = 'Unpaid';
      invoice.paid_date = null;
      if (['Paid', 'Partially-Paid', 'Overdue'].includes(invoice.status)) {
        invoice.status = 'Sent';
      }
    } else if (totalPaid >= Number(invoice.total)) {
      invoice.payment_status = 'Paid';
      invoice.status = 'Paid';
      invoice.paid_date = new Date();
    } else {
      invoice.payment_status = 'Partial';
      invoice.status = 'Partially-Paid';
      invoice.paid_date = null;
    }
    await manager.save(Invoice, invoice);
  }

  private async writeActivityLog(
    manager: EntityManager,
    values: {
      entity: string;
      entityId: string;
      action: string;
      actorId: string;
      summary: string;
      oldValues?: Record<string, unknown>;
      newValues?: Record<string, unknown>;
    },
  ): Promise<void> {
    await manager.save(
      ActivityLog,
      manager.create(ActivityLog, {
        entity: values.entity,
        entity_id: values.entityId,
        action: values.action,
        actioned_by: values.actorId,
        summary: values.summary,
        old_values: values.oldValues,
        new_values: values.newValues,
      }),
    );
  }

  private async createLegacy(
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
      .leftJoinAndSelect('payment.recorded_by', 'recordedBy')
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
      relations: ['invoice', 'recorded_by'],
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

  private async generatePaymentReference(
    manager?: EntityManager,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PAY-${year}-`;

    if (manager) {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('payment_reference'))",
      );
      const rows: Array<{ max: number | null }> = await manager.query(
        `SELECT MAX((substring(reference from '(\\d+)$'))::int) AS max
           FROM payments WHERE reference LIKE $1`,
        [`${prefix}%`],
      );
      const next = Number(rows[0]?.max ?? 0) + 1;
      return `${prefix}${String(next).padStart(4, '0')}`;
    }

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

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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
