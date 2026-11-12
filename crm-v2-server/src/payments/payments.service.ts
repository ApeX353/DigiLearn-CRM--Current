import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository, Like, In, DataSource, EntityManager } from 'typeorm';
import { paginate, Pagination } from 'nestjs-typeorm-paginate';
import { Payment } from './entities/payment.entity';
import { PaymentCommand } from './entities/payment-command.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { assertFamilyAcceptsPayments } from '../invoices/invoice-money-rules';
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

/**
 * The identities of one "record a payment" request. The natural key (invoice
 * + bank reference) is always claimed, because a bank reference names one
 * transfer whoever sends it; the client key is claimed as well when the
 * caller sent x-idempotency-key, and it is the one that answers a replay.
 */
function commandIdentity(
  invoice: Pick<Invoice, 'id'>,
  dto: CreatePaymentDto,
  userId?: string,
  idempotencyKey?: string,
): { clientKey: string | null; naturalKey: string; payloadHash: string } {
  return {
    clientKey: idempotencyKey ? `client:${userId ?? 'anonymous'}:${idempotencyKey}` : null,
    naturalKey: `natural:${invoice.id}:${normaliseReference(dto.reference)}`,
    payloadHash: hashPaymentPayload(dto),
  };
}

/** The identity of a bank reference: case and spacing do not make it a different transfer. */
export function normaliseReference(reference: string | undefined | null): string {
  return String(reference ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * What a payment command says, in canonical form, hashed. Two submissions
 * with the same hash are the same command; the same key with a different
 * hash is a conflict, not a replay.
 */
export function hashPaymentPayload(dto: CreatePaymentDto): string {
  const canonical = {
    invoice_id: dto.invoice_id,
    amount: Number(dto.amount).toFixed(2),
    reference: normaliseReference(dto.reference),
    payment_date: dto.payment_date
      ? new Date(dto.payment_date).toISOString().slice(0, 10)
      : null,
    method: (dto.method ?? dto.payment_method ?? '').trim().toLowerCase() || null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
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

  /**
   * FIN-02 (19 Oct 2026): every money write is ONE database transaction with
   * the invoice row (and its summary parent) locked FOR UPDATE for the whole
   * of it. Balance check, receipt, invoice figures, instalment allocations
   * and the audit row commit together or not at all.
   *
   * Before this: two payments of 70 against a 100 invoice arriving at the
   * same moment both passed the balance check (each read "0 received") and
   * both were stored; an edit that failed half way left the receipt at the
   * new amount and the invoice at the old one; a failed delete left the
   * schedule unpaid while the receipt still existed. The 19 Oct financial
   * review reproduced each of these against the deployed code.
   */
  private get connection(): DataSource {
    return this.paymentRepository.manager.connection;
  }

  /**
   * Lock the invoice and, for an instalment child, its summary parent, in
   * that order. Every writer takes the same locks in the same order, so two
   * writers on one family queue instead of deadlocking.
   */
  private async lockInvoiceFamily(
    manager: EntityManager,
    invoiceId: string,
  ): Promise<{ invoice: Invoice; parent: Invoice | null }> {
    const invoice = await manager.findOne(Invoice, {
      where: { id: invoiceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }
    const parent = invoice.parent_invoice_id
      ? await manager.findOne(Invoice, {
          where: { id: invoice.parent_invoice_id },
          lock: { mode: 'pessimistic_write' },
        })
      : null;
    return { invoice, parent };
  }

  /**
   * @param idempotencyKey the caller's x-idempotency-key, when it sent one.
   *   A repeat of the same key with the same details is answered with the
   *   payment recorded the first time; the same key with different details
   *   is refused. Without a key the money's own identity (invoice + bank
   *   reference) plays the part, and a repeat is refused rather than
   *   replayed, because a person retyping the same reference may mean a
   *   second payment and must say so with its own reference.
   */
  async create(
    dto: CreatePaymentDto,
    userId: string,
    scopeUserId?: string,
    idempotencyKey?: string,
  ): Promise<Payment> {
    return this.connection.transaction(async (manager) => {
      const { invoice, parent } = await this.lockInvoiceFamily(
        manager,
        dto.invoice_id,
      );
      // C-03: a rep can only record money against their own invoice. A
      // foreign id answers 404 — not 403 — so ids cannot be probed.
      if (scopeUserId && invoice.owner_id !== scopeUserId) {
        throw new NotFoundException(
          `Invoice with ID ${dto.invoice_id} not found`,
        );
      }
      this.assertInvoiceAcceptsPayments(invoice);
      assertFamilyAcceptsPayments(invoice, parent);

      // Auto-generate reference if not provided (the DTO requires one, so
      // this is for callers that bypass the pipe).
      if (!dto.reference) {
        dto.reference = await this.generatePaymentReference();
      }

      // FIN-04: refuse a repeat of money already recorded, then claim this
      // command's identity before any money moves. A replay of a client key
      // with the same details returns the original payment here.
      await this.assertNotARetry(manager, invoice, dto, userId, idempotencyKey);
      const claim = await this.claimPaymentCommand(
        manager,
        invoice,
        dto,
        userId,
        idempotencyKey,
      );
      if (claim.replay) return claim.replay;

      // Judged under the lock: nothing else can add a receipt to this
      // invoice between the check and the write.
      await this.assertAmountWithinBalance(manager, invoice, Number(dto.amount));

      const payments = manager.withRepository(this.paymentRepository);
      // A fresh receipt holds all of its money unallocated until the
      // schedule takes it; amount = allocated + unallocated from the start.
      const payment = payments.create({
        ...dto,
        allocated_amount: 0,
        unallocated_amount: Number(dto.amount),
      });
      const saved = await payments.save(payment);

      await this.invoicesService.recalculatePaymentStatus(invoice.id, manager);
      if (parent) {
        await this.invoicesService.recalculatePaymentStatus(parent.id, manager);
      }

      // Allocate to instalments when the invoice (or its parent) carries a
      // payment schedule. In the same transaction: an allocation that fails
      // rolls the receipt back too, rather than leaving money recorded but
      // not applied.
      const appliedTerm =
        await this.paymentTermsService.findAppliedTermByDocument(
          parent?.id ?? invoice.id,
          'invoice',
          manager,
        );
      if (appliedTerm) {
        await this.paymentTermsService.allocatePaymentFIFO(
          saved.id,
          userId,
          manager,
        );
      }

      // The command now points at the receipt it produced; a replay of the
      // same key will be answered with this payment.
      await manager.getRepository(PaymentCommand).update(
        { command_key: In(claim.keys) },
        {
          payment_id: saved.id,
          response: {
            payment_id: saved.id,
            amount: Number(saved.amount),
            reference: saved.reference,
            invoice_id: saved.invoice_id,
          },
        },
      );

      await this.activityLogsService.logCreate(
        'Payment',
        saved.id,
        saved,
        userId,
        `Recorded payment of ${saved.amount} for invoice ${dto.invoice_id}`,
        undefined,
        manager,
      );

      return saved;
    });
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
    return this.connection.transaction(async (manager) => {
      const payments = manager.withRepository(this.paymentRepository);
      const located = await payments.findOne({ where: { id } });
      if (!located) {
        throw new NotFoundException(`Payment ${id} not found`);
      }
      // Invoice family first, then the payment: the same order as every
      // other writer.
      const { invoice, parent } = await this.lockInvoiceFamily(
        manager,
        located.invoice_id,
      );
      const payment = await payments.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw new NotFoundException(`Payment ${id} not found`);
      }

      const oldValues = { ...payment };
      const amountChanged =
        dto.amount !== undefined &&
        Number(dto.amount) !== Number(payment.amount);

      // The same balance rule as on create, with this payment's own current
      // amount left out of "already received". Until 11 Sep 2026 an edit was
      // never re-checked, so an amount could be raised past the invoice
      // total and the invoice reported as overpaid (BUG-017).
      if (amountChanged) {
        assertFamilyAcceptsPayments(invoice, parent);
        await this.assertAmountWithinBalance(
          manager,
          invoice,
          Number(dto.amount),
          payment.id,
        );
      }

      Object.assign(payment, dto);
      let updated = await payments.save(payment);

      // If the amount changed, the old spread across the instalments no
      // longer describes this payment. Undo it and reapply from scratch,
      // rather than leaving the instalments crediting the previous figure.
      // All inside this transaction: a failure here rolls the amount change
      // back as well, so receipt and schedule never disagree.
      if (amountChanged) {
        await this.paymentTermsService.reversePaymentAllocations(id, manager);
        updated.allocated_amount = 0;
        updated.unallocated_amount = Number(updated.amount);
        updated = await payments.save(updated);
        const appliedTerm =
          await this.paymentTermsService.findAppliedTermByDocument(
            parent?.id ?? invoice.id,
            'invoice',
            manager,
          );
        if (appliedTerm) {
          await this.paymentTermsService.allocatePaymentFIFO(
            id,
            userId,
            manager,
          );
        }
      }

      await this.invoicesService.recalculatePaymentStatus(invoice.id, manager);
      if (parent) {
        await this.invoicesService.recalculatePaymentStatus(parent.id, manager);
      }

      await this.activityLogsService.logUpdate(
        'Payment',
        id,
        oldValues,
        updated,
        userId,
        `Updated payment ${id}`,
        undefined,
        manager,
      );

      return updated;
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.connection.transaction(async (manager) => {
      const payments = manager.withRepository(this.paymentRepository);
      const located = await payments.findOne({ where: { id } });
      if (!located) {
        throw new NotFoundException(`Payment ${id} not found`);
      }
      const { invoice, parent } = await this.lockInvoiceFamily(
        manager,
        located.invoice_id,
      );
      const payment = await payments.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw new NotFoundException(`Payment ${id} not found`);
      }

      // Give the money back to the instalments first. Allocation writes to
      // the instalment directly, so removing the payment on its own would
      // leave the schedule still claiming to hold money that has gone. Same
      // transaction as the delete: if the delete fails, the schedule keeps
      // its allocations and the receipt stays.
      await this.paymentTermsService.reversePaymentAllocations(id, manager);

      await payments.remove(payment);

      await this.invoicesService.recalculatePaymentStatus(invoice.id, manager);
      if (parent) {
        await this.invoicesService.recalculatePaymentStatus(parent.id, manager);
      }

      await this.activityLogsService.logDelete(
        'Payment',
        id,
        payment,
        userId,
        `Deleted payment of ${payment.amount}`,
        undefined,
        manager,
      );
    });
  }

  // ========================
  // Money guards (one place; create and update both go through them)
  // ========================

  /**
   * Which invoices may take money. A summary parent never does — its
   * children do. A Cancelled invoice never does: money against it would
   * revive it (BUG-043). Draft is deliberately NOT refused: on production
   * every one of the 17 standalone invoices with payments went straight
   * from Draft to paid without ever being marked Sent, and instalment
   * children are created Draft by design — refusing Draft would block the
   * way the business actually records cash.
   */
  private assertInvoiceAcceptsPayments(invoice: Invoice): void {
    if (invoice.is_summary_invoice) {
      throw new BadRequestException(
        `Invoice ${invoice.invoice_number} is a summary invoice and cannot accept payments; record the payment against one of its instalments`,
      );
    }
    if (invoice.status === 'Cancelled') {
      throw new BadRequestException(
        `Invoice ${invoice.invoice_number} is cancelled and cannot accept payments. Set it back to Sent first if it was cancelled by mistake.`,
      );
    }
  }

  /**
   * A payment may not exceed what is still owed on its invoice. "Already
   * received" leaves out `excludePaymentId` so an edit is measured against
   * the balance without the payment being edited. Nothing on production
   * violated this on 4 Sep 2026 (0 of 40 payments), so it refuses only new
   * mistakes.
   */
  private async assertAmountWithinBalance(
    manager: EntityManager,
    invoice: Invoice,
    amount: number,
    excludePaymentId?: string,
  ): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const qb = manager
      .withRepository(this.paymentRepository)
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'received')
      .where('payment.invoice_id = :invoiceId', { invoiceId: invoice.id });
    if (excludePaymentId) {
      qb.andWhere('payment.id != :excludePaymentId', { excludePaymentId });
    }
    const row = await qb.getRawOne<{ received: string }>();
    const received = Number(row?.received ?? 0);
    const total = Number(invoice.total ?? 0);
    const balance = Math.round((total - received) * 100) / 100;

    if (amount > balance + 0.005) {
      throw new BadRequestException(
        `A payment of ${amount.toFixed(2)} exceeds the ${balance.toFixed(2)} still owed on ${invoice.invoice_number} (total ${total.toFixed(2)}, ${received.toFixed(2)} already received)`,
      );
    }
  }

  /**
   * FIN-04: durable identity for a "record a payment" command (replaces the
   * two-minute double-submit brake of BUG-042, which forgot after 120 s and
   * missed two submissions arriving together).
   *
   * Runs under the invoice lock, inside the same transaction as the receipt,
   * and claims a row in payment_commands keyed by:
   *  - `client:<user>:<x-idempotency-key>` when the caller sent a key. The
   *    same key with the same details is a replay and gets the original
   *    payment back; the same key with different details is refused.
   *  - `natural:<invoice>:<reference>` otherwise. A bank reference names one
   *    transfer, so a second payment with the same reference on the same
   *    invoice is refused with what was already recorded (production holds
   *    49 payments and no repeated reference on an invoice, 19 Oct 2026).
   * A command whose payment was since deleted is reusable: the row is
   * re-pointed at the new payment.
   *
   * assertNotARetry refuses the repeat; claimPaymentCommand records the
   * identity (and hands back the original payment for a true replay).
   */
  private async assertNotARetry(
    manager: EntityManager,
    invoice: Invoice,
    dto: CreatePaymentDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<void> {
    const { clientKey, naturalKey, payloadHash } = commandIdentity(
      invoice,
      dto,
      userId,
      idempotencyKey,
    );
    const livePrior = async (key: string): Promise<{ row: PaymentCommand; prior: Payment } | null> => {
      const row = await manager.getRepository(PaymentCommand).findOne({
        where: { command_key: key },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row?.payment_id) return null;
      const prior = await manager.findOne(Payment, { where: { id: row.payment_id } });
      return prior ? { row, prior } : null;
    };
    const when = (p: Payment) => new Date(p.created_at).toISOString().slice(0, 10);

    let replayOf: string | null = null;
    if (clientKey) {
      const hit = await livePrior(clientKey);
      if (hit) {
        if (hit.row.payload_hash !== payloadHash) {
          throw new ConflictException(
            `This request was already processed on ${when(hit.prior)} as a payment of ${Number(hit.prior.amount).toFixed(2)} (reference "${hit.prior.reference}") on ${invoice.invoice_number}, with different details. Send a new request for a new payment.`,
          );
        }
        replayOf = hit.prior.id; // same request again: answered by the claim
      }
    }

    const byReference = await livePrior(naturalKey);
    if (byReference && byReference.prior.id !== replayOf) {
      throw new ConflictException(
        `A payment of ${Number(byReference.prior.amount).toFixed(2)} with reference "${byReference.prior.reference}" is already recorded on ${invoice.invoice_number} (${when(byReference.prior)}). If this is a separate payment, give it its own reference.`,
      );
    }
  }

  /**
   * Records the command's identities in payment_commands, inside the
   * caller's transaction: the natural key always, the client key when sent.
   * Returns the keys (the caller points them at the receipt once written)
   * and, when the same client key with the same details was already
   * answered, the payment to hand back unchanged.
   */
  private async claimPaymentCommand(
    manager: EntityManager,
    invoice: Invoice,
    dto: CreatePaymentDto,
    userId?: string,
    idempotencyKey?: string,
  ): Promise<{ keys: string[]; replay: Payment | null }> {
    const commands = manager.getRepository(PaymentCommand);
    const { clientKey, naturalKey, payloadHash } = commandIdentity(
      invoice,
      dto,
      userId,
      idempotencyKey,
    );
    const keys = clientKey ? [clientKey, naturalKey] : [naturalKey];

    for (const key of keys) {
      const existing = await commands.findOne({
        where: { command_key: key },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        const prior = existing.payment_id
          ? await manager.findOne(Payment, { where: { id: existing.payment_id } })
          : null;
        if (prior) {
          // assertNotARetry has already let this through, so it is a replay
          // of the client key: hand back what was recorded the first time.
          return { keys, replay: prior };
        }
        // The payment this command produced is gone (deleted); the command
        // is free to be used again.
        existing.payload_hash = payloadHash;
        existing.payment_id = null;
        existing.response = null;
        existing.created_by = userId ?? null;
        await commands.save(existing);
        continue;
      }

      try {
        await commands.insert({
          command_key: key,
          payload_hash: payloadHash,
          payment_id: null,
          response: null,
          created_by: userId ?? null,
        });
      } catch (error) {
        // The invoice lock serialises same-invoice commands, so this is a
        // client key reused across invoices racing past it: the unique index
        // is the backstop.
        if ((error as { code?: string })?.code === '23505') {
          throw new ConflictException(
            `This request is already being processed. Wait a moment and refresh; do not record the payment again.`,
          );
        }
        throw error;
      }
    }
    return { keys, replay: null };
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
