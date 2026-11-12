import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { paginate, Pagination } from 'nestjs-typeorm-paginate';
import { PaymentTerm } from './entities/payment-term.entity';
import { PaymentTermPeriod } from './entities/payment-term-period.entity';
import { AppliedPaymentTerm } from './entities/applied-payment-term.entity';
import { Installment } from './entities/installment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { QueryPaymentTermDto } from './dto/query-payment-term.dto';
import { ApplyPaymentTermDto } from './dto/apply-payment-term.dto';
import { CalculateInstallmentsDto } from './dto/calculate-installments.dto';
import { QueryInstallmentDto } from './dto/query-installment.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { AppliedDocumentType, InvoiceStrategy } from './constants';
import {
  InstallmentCalculationService,
  type InstallmentCalculationResult,
} from './installment-calculation.service';

const INTEREST_ITEM_DESCRIPTION = '[SYSTEM] Payment Term Interest';
const INSTALLMENT_ITEM_DESCRIPTION_PREFIX = '[SYSTEM] Installment';

export interface GeneratedChildInvoiceSummary {
  id: string;
  invoice_number: string;
  amount: number;
  due_date: Date;
  grace_due_date: Date;
  status: string;
  payment_status: string;
}

export interface AppliedPaymentTermResult {
  applied_term_id: string;
  total_amount: number;
  interest_amount: number;
  installment_amount: number;
  number_of_terms: number;
  due_dates: Date[];
  grace_due_dates: Date[];
  invoice_strategy: InvoiceStrategy;
  child_invoices: GeneratedChildInvoiceSummary[];
}

@Injectable()
export class PaymentTermsService {
  constructor(
    @InjectRepository(PaymentTerm)
    private readonly paymentTermRepository: Repository<PaymentTerm>,
    @InjectRepository(AppliedPaymentTerm)
    private readonly appliedTermRepository: Repository<AppliedPaymentTerm>,
    @InjectRepository(Installment)
    private readonly installmentRepository: Repository<Installment>,
    @InjectRepository(PaymentAllocation)
    private readonly allocationRepository: Repository<PaymentAllocation>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly activityLogsService: ActivityLogsService,
    private readonly installmentCalculationService: InstallmentCalculationService,
  ) {}

  // ========================
  // CRUD for PaymentTerm configs
  // ========================

  async create(
    dto: CreatePaymentTermDto,
    userId: string,
  ): Promise<PaymentTerm> {
    return this.dataSource.transaction(async (manager) => {
      const { periods: periodDtos, ...termData } = dto;

      const term = manager.create(PaymentTerm, termData);
      const savedTerm = await manager.save(PaymentTerm, term);

      if (periodDtos && periodDtos.length > 0) {
        const periods = periodDtos.map((p) =>
          manager.create(PaymentTermPeriod, {
            ...p,
            payment_term_id: savedTerm.id,
          }),
        );
        await manager.save(PaymentTermPeriod, periods);
      }

      await this.activityLogsService.logCreate(
        'PaymentTerm',
        savedTerm.id,
        savedTerm,
        userId,
        `Created payment term: ${savedTerm.name || savedTerm.type}`,
      );

      return term;
    });
  }

  async findAll(
    query: QueryPaymentTermDto,
  ): Promise<Pagination<PaymentTerm>> {
    const { page = '1', limit = '10', search, type, is_active } = query;

    const qb = this.paymentTermRepository
      .createQueryBuilder('term')
      .leftJoinAndSelect('term.periods', 'periods')
      .orderBy('term.display_order', 'ASC')
      .addOrderBy('term.created_at', 'DESC');

    if (search) {
      qb.andWhere(
        '(term.name LIKE :search OR term.description LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (type) {
      qb.andWhere('term.type = :type', { type });
    }

    if (is_active !== undefined) {
      qb.andWhere('term.is_active = :isActive', { isActive: is_active });
    }

    return paginate<PaymentTerm>(qb, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }

  async findOne(id: string): Promise<PaymentTerm> {
    const term = await this.paymentTermRepository.findOne({
      where: { id },
      relations: ['periods'],
      order: { periods: { period_number: 'ASC' } },
    });

    if (!term) {
      throw new NotFoundException(`Payment term ${id} not found`);
    }

    return term;
  }

  async update(
    id: string,
    dto: UpdatePaymentTermDto,
    userId: string,
  ): Promise<PaymentTerm> {
    return this.dataSource.transaction(async (manager) => {
      const term = await this.findOne(id);
      const oldValues = { ...term };
      const { periods: periodDtos, ...termData } = dto;

      Object.assign(term, termData);
      await manager.save(PaymentTerm, term);

      if (periodDtos !== undefined) {
        // Replace all periods
        await manager.delete(PaymentTermPeriod, { payment_term_id: id });

        if (periodDtos.length > 0) {
          const periods = periodDtos.map((p) =>
            manager.create(PaymentTermPeriod, {
              ...p,
              payment_term_id: id,
            }),
          );
          await manager.save(PaymentTermPeriod, periods);
        }
      }

      await this.activityLogsService.logUpdate(
        'PaymentTerm',
        id,
        oldValues,
        term,
        userId,
        `Updated payment term: ${term.name || term.type}`,
      );

      return this.findOne(id);
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    const term = await this.findOne(id);

    await this.paymentTermRepository.remove(term);

    await this.activityLogsService.logDelete(
      'PaymentTerm',
      id,
      term,
      userId,
      `Deleted payment term: ${term.name || term.type}`,
    );
  }

  // ========================
  // Apply Payment Term to Document
  // ========================

  async calculateInstallments(dto: CalculateInstallmentsDto) {
    const calculation = await this.installmentCalculationService.calculate({
      payment_term_id: dto.payment_term_id,
      document_total: dto.document_total,
      interest: dto.interest,
      start_date: dto.start_date,
    });

    return {
      payment_term_id: dto.payment_term_id,
      interest_rate: calculation.interest_rate,
      interest_amount: calculation.interest_amount,
      total_amount: calculation.total_amount,
      installment_amount: calculation.installment_amount,
      number_of_terms: calculation.number_of_terms,
      due_dates: calculation.installments.map((installment) => installment.due_date),
      grace_due_dates: calculation.installments.map(
        (installment) => installment.grace_due_date,
      ),
      installments: calculation.installments,
    };
  }

  async applyPaymentTermToDocument(
    params: {
      document_id: string;
      document_type: AppliedDocumentType;
      payment_term_id: string;
      document_total: number;
      start_date?: string | Date;
      interest?: number;
    },
    userId: string,
    manager?: EntityManager,
  ): Promise<AppliedPaymentTermResult> {
    const alreadyApplied = () =>
      new BadRequestException(
        `${params.document_type} ${params.document_id} already has an applied payment term`,
      );

    const run = async (transactionManager: EntityManager) => {
      // Serialise applies per document. The existence check below and the
      // insert after it had nothing between them, so three concurrent
      // applies on one invoice produced three terms, six child invoices
      // and six instalments (BUG-028 / BUG-050). With the lock the second
      // caller waits for the first to commit and then sees its row.
      await transactionManager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`applied_term:${params.document_type}:${params.document_id}`],
      );

      const existingAppliedTerm = await transactionManager.findOne(
        AppliedPaymentTerm,
        {
          where: {
            document_id: params.document_id,
            document_type: params.document_type,
          },
        },
      );
      if (existingAppliedTerm) {
        throw alreadyApplied();
      }

      const paymentTerm = await transactionManager.findOne(PaymentTerm, {
        where: { id: params.payment_term_id },
        relations: ['periods'],
        order: { periods: { period_number: 'ASC' } },
      });

      if (!paymentTerm) {
        throw new NotFoundException(
          `Payment term ${params.payment_term_id} not found`,
        );
      }

      const calculation = this.installmentCalculationService.calculateWithPaymentTerm(
        paymentTerm,
        {
          document_total: params.document_total,
          interest: params.interest,
          start_date: params.start_date,
        },
      );

      const appliedTerm = transactionManager.create(AppliedPaymentTerm, {
        document_id: params.document_id,
        document_type: params.document_type,
        payment_term_id: paymentTerm.id,
        term_name: paymentTerm.name ?? `${paymentTerm.type} Payment`,
        term_type: paymentTerm.type,
        interest_rate: calculation.interest_rate,
        interest_calculation_method: paymentTerm.interest_calculation_method,
        invoice_strategy: paymentTerm.invoice_strategy,
        subtotal: params.document_total,
        interest_amount: calculation.interest_amount,
        total_amount: calculation.total_amount,
        number_of_installments: calculation.number_of_terms,
        term_length_days: paymentTerm.term_length_days,
        days_until_due: paymentTerm.days_until_due,
        grace_period_days: paymentTerm.grace_period_days,
        start_date: calculation.start_date,
        final_due_date: calculation.final_due_date,
        terms_and_conditions: paymentTerm.terms_and_conditions,
        calculation_breakdown: JSON.stringify({
          documentTotal: params.document_total,
          interestRate: calculation.interest_rate,
          interestAmount: calculation.interest_amount,
          totalAmount: calculation.total_amount,
          numberOfTerms: calculation.number_of_terms,
          installmentAmount: calculation.installment_amount,
          method: paymentTerm.interest_calculation_method,
          gracePeriodDays: paymentTerm.grace_period_days,
        }),
      });

      let savedApplied: AppliedPaymentTerm;
      try {
        savedApplied = await transactionManager.save(
          AppliedPaymentTerm,
          appliedTerm,
        );
      } catch (error) {
        // The unique index (migration 1787) is the last line: a caller that
        // reaches the insert without the lock still cannot double-apply.
        if ((error as { code?: string })?.code === '23505') {
          throw alreadyApplied();
        }
        throw error;
      }

      let childInvoices: GeneratedChildInvoiceSummary[] = [];

      if (params.document_type === 'invoice') {
        const invoice = await transactionManager.findOne(Invoice, {
          where: { id: params.document_id },
        });
        if (!invoice) {
          throw new NotFoundException(`Invoice ${params.document_id} not found`);
        }

        childInvoices = await this.applyInvoiceScheduleAndSplit({
          transactionManager,
          invoice,
          paymentTerm,
          appliedTermId: savedApplied.id,
          calculation,
        });

        await transactionManager.update(Invoice, invoice.id, {
          payment_term_id: paymentTerm.id,
          due_date: calculation.final_due_date,
          grace_due_date: calculation.final_grace_due_date,
          is_summary_invoice:
            paymentTerm.invoice_strategy === 'multiple_invoices',
          total: calculation.total_amount,
          amount_paid: paymentTerm.invoice_strategy === 'multiple_invoices' ? 0 : invoice.amount_paid,
          payment_status:
            paymentTerm.invoice_strategy === 'multiple_invoices'
              ? 'Unpaid'
              : invoice.payment_status,
        });
      }

      await this.activityLogsService.logCreate(
        'AppliedPaymentTerm',
        savedApplied.id,
        {
          document_id: params.document_id,
          document_type: params.document_type,
          term_name: savedApplied.term_name,
          total_amount: calculation.total_amount,
          number_of_installments: calculation.number_of_terms,
        },
        userId,
        `Applied payment term "${savedApplied.term_name}" to ${params.document_type} ${params.document_id}`,
      );

      return {
        applied_term_id: savedApplied.id,
        total_amount: calculation.total_amount,
        interest_amount: calculation.interest_amount,
        installment_amount: calculation.installment_amount,
        number_of_terms: calculation.number_of_terms,
        due_dates: calculation.installments.map((installment) => installment.due_date),
        grace_due_dates: calculation.installments.map(
          (installment) => installment.grace_due_date,
        ),
        invoice_strategy: paymentTerm.invoice_strategy,
        child_invoices: childInvoices,
      };
    };

    if (manager) {
      return run(manager);
    }

    return this.dataSource.transaction((transactionManager) =>
      run(transactionManager),
    );
  }


  async applyToDocument(
    dto: ApplyPaymentTermDto,
    userId: string,
    manager?: EntityManager,
  ): Promise<AppliedPaymentTermResult> {
    const documentTotal = await this.getDocumentTotal(
      dto.document_type,
      dto.document_id,
      manager,
    );

    return this.applyPaymentTermToDocument(
      {
        document_id: dto.document_id,
        document_type: dto.document_type,
        payment_term_id: dto.payment_term_id,
        document_total: documentTotal,
        start_date: dto.start_date,
        interest: dto.interest,
      },
      userId,
      manager,
    );
  }

  private async applyInvoiceScheduleAndSplit(params: {
    transactionManager: EntityManager;
    invoice: Invoice;
    paymentTerm: PaymentTerm;
    appliedTermId: string;
    calculation: InstallmentCalculationResult;
  }): Promise<GeneratedChildInvoiceSummary[]> {
    const { transactionManager, invoice, paymentTerm, appliedTermId, calculation } =
      params;

    if (invoice.parent_invoice_id) {
      throw new BadRequestException(
        `Cannot apply payment terms to child invoice ${invoice.id}`,
      );
    }

    const childInvoices: GeneratedChildInvoiceSummary[] = [];

    await this.upsertInterestLineItem(
      transactionManager,
      invoice.id,
      calculation.interest_amount,
    );
    await this.recalculateInvoiceTotals(transactionManager, invoice.id);

    if (paymentTerm.invoice_strategy === 'multiple_invoices') {
      const totalInstallments = calculation.installments.length;

      for (const installment of calculation.installments) {
        const invoiceNumber = await this.generateInvoiceNumber(transactionManager);
        const childInvoice = transactionManager.create(Invoice, {
          invoice_number: invoiceNumber,
          person_id: invoice.person_id,
          deal_id: invoice.deal_id,
          owner_id: invoice.owner_id,
          quote_id: invoice.quote_id,
          school_id: invoice.school_id,
          client_name: invoice.client_name,
          client_email: invoice.client_email,
          client_address: invoice.client_address,
          status: 'Draft',
          payment_status: 'Unpaid',
          subtotal: installment.amount,
          tax: 0,
          discount: 0,
          total: installment.amount,
          amount_paid: 0,
          due_date: installment.due_date,
          grace_due_date: installment.grace_due_date,
          notes: `Auto-generated installment ${installment.installment_number}/${totalInstallments} for ${invoice.invoice_number}`,
          payment_term_id: paymentTerm.id,
          parent_invoice_id: invoice.id,
          is_summary_invoice: false,
        });
        const savedChild = await transactionManager.save(Invoice, childInvoice);

        await transactionManager.save(
          DocumentItem,
          transactionManager.create(DocumentItem, {
            document_type: 'Invoice',
            document_id: savedChild.id,
            description: `${INSTALLMENT_ITEM_DESCRIPTION_PREFIX} ${installment.installment_number}/${totalInstallments} for ${invoice.invoice_number}`,
            product_id: null,
            quantity: 1,
            unit_price: installment.amount,
            discount: 0,
            tax: 0,
            tax_rate: 0,
            total: installment.amount,
          }),
        );

        childInvoices.push({
          id: savedChild.id,
          invoice_number: savedChild.invoice_number,
          amount: installment.amount,
          due_date: installment.due_date,
          grace_due_date: installment.grace_due_date,
          status: savedChild.status,
          payment_status: savedChild.payment_status,
        });
      }

      const splitInstallments = calculation.installments.map((installment, index) =>
        transactionManager.create(Installment, {
          applied_payment_term_id: appliedTermId,
          parent_invoice_id: invoice.id,
          invoice_id: childInvoices[index]?.id ?? null,
          installment_number: installment.installment_number,
          amount: installment.amount,
          balance: installment.amount,
          due_date: installment.due_date,
          grace_due_date: installment.grace_due_date,
          status: 'pending',
        }),
      );
      await transactionManager.save(Installment, splitInstallments);

      return childInvoices;
    }

    const installments = calculation.installments.map((installment) =>
      transactionManager.create(Installment, {
        applied_payment_term_id: appliedTermId,
        parent_invoice_id: invoice.id,
        invoice_id: invoice.id,
        installment_number: installment.installment_number,
        amount: installment.amount,
        balance: installment.amount,
        due_date: installment.due_date,
        grace_due_date: installment.grace_due_date,
        status: 'pending',
      }),
    );
    await transactionManager.save(Installment, installments);

    return childInvoices;
  }

  private async upsertInterestLineItem(
    transactionManager: EntityManager,
    invoiceId: string,
    interestAmount: number,
  ): Promise<void> {
    const roundedInterest = this.roundCurrency(interestAmount);
    const existingItem = await transactionManager.findOne(DocumentItem, {
      where: {
        document_type: 'Invoice',
        document_id: invoiceId,
        description: INTEREST_ITEM_DESCRIPTION,
      },
    });

    if (roundedInterest <= 0) {
      if (existingItem) {
        await transactionManager.remove(DocumentItem, existingItem);
      }
      return;
    }

    if (existingItem) {
      existingItem.quantity = 1;
      existingItem.unit_price = roundedInterest;
      existingItem.discount = 0;
      existingItem.tax = 0;
      existingItem.tax_rate = 0;
      existingItem.total = roundedInterest;
      await transactionManager.save(DocumentItem, existingItem);
      return;
    }

    await transactionManager.save(
      DocumentItem,
      transactionManager.create(DocumentItem, {
        document_type: 'Invoice',
        document_id: invoiceId,
        description: INTEREST_ITEM_DESCRIPTION,
        product_id: null,
        quantity: 1,
        unit_price: roundedInterest,
        discount: 0,
        tax: 0,
        tax_rate: 0,
        total: roundedInterest,
      }),
    );
  }

  private async recalculateInvoiceTotals(
    transactionManager: EntityManager,
    invoiceId: string,
  ): Promise<void> {
    const items = await transactionManager.find(DocumentItem, {
      where: {
        document_type: 'Invoice',
        document_id: invoiceId,
      },
    });

    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    let grandTotal = 0;

    for (const item of items) {
      subtotal += Number(item.quantity) * Number(item.unit_price);
      totalDiscount += Number(item.discount);
      totalTax += Number(item.tax);
      grandTotal += Number(item.total);
    }

    await transactionManager.update(Invoice, invoiceId, {
      subtotal: this.roundCurrency(subtotal),
      tax: this.roundCurrency(totalTax),
      discount: this.roundCurrency(totalDiscount),
      total: this.roundCurrency(grandTotal),
    });
  }

  /**
   * AUD-H11: MAX of the numeric part under an advisory lock — never
   * "newest row by created_at". Postgres freezes now() per transaction,
   * so a master and its children share one created_at and the ordering
   * trick dealt the same number twice (every invoice-with-instalments
   * failed on the unique index; MySQL's per-statement timestamps are why
   * the identical code worked in the previous CRM).
   */
  private async generateInvoiceNumber(
    manager: EntityManager,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtext('invoice_number'))",
    );
    const rows: Array<{ max: number | null }> = await manager.query(
      `SELECT MAX((substring(invoice_number from '(\\d+)$'))::int) AS max
         FROM invoices WHERE invoice_number LIKE $1`,
      [`${prefix}%`],
    );
    const nextNumber = Number(rows[0]?.max ?? 0) + 1;

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async getDocumentTotal(
    documentType: AppliedDocumentType,
    documentId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const qb = manager
      ? manager.createQueryBuilder()
      : this.dataSource.createQueryBuilder();

    if (documentType === 'invoice') {
      const result = await qb
        .select('invoice.total', 'total')
        .from('invoices', 'invoice')
        .where('invoice.id = :id', { id: documentId })
        .getRawOne();
      if (!result) {
        throw new NotFoundException(`Invoice ${documentId} not found`);
      }
      return Number(result.total);
    }

    const result = await qb
      .select('quote.total', 'total')
      .from('quotes', 'quote')
      .where('quote.id = :id', { id: documentId })
      .getRawOne();
    if (!result) {
      throw new NotFoundException(`Quote ${documentId} not found`);
    }
    return Number(result.total);
  }

  async findAppliedTermByDocument(
    documentId: string,
    documentType?: AppliedDocumentType,
    manager?: EntityManager,
  ): Promise<AppliedPaymentTerm | null> {
    const repo = manager
      ? manager.getRepository(AppliedPaymentTerm)
      : this.appliedTermRepository;

    return repo.findOne({
      where: documentType
        ? { document_id: documentId, document_type: documentType }
        : { document_id: documentId },
      order: { created_at: 'DESC' },
    });
  }

  // ========================
  // FIFO Payment Allocation
  // ========================

  /**
   * Undo a payment's allocations and give the money back to the
   * instalments it was applied to.
   *
   * Allocation writes to the instalment directly (paid_amount, balance,
   * status), so deleting the allocation rows alone leaves the schedule
   * claiming money it no longer holds. Deleting or amending a payment
   * has to walk the same path backwards.
   *
   * Safe to call when nothing was ever allocated — it simply finds no
   * rows and does nothing.
   */
  /**
   * FIN-02 (19 Oct 2026): runs inside the caller's transaction when one is
   * given, otherwise in its own. Instalment writes and allocation deletes
   * commit or roll back together; before this, a failure after the
   * instalments were saved left them credited with no allocation rows.
   */
  async reversePaymentAllocations(
    paymentId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const run = async (m: EntityManager): Promise<number> => {
      const allocationRepo = m.withRepository(this.allocationRepository);
      const installmentRepo = m.withRepository(this.installmentRepository);

      const allocations = await allocationRepo.find({
        where: { payment_id: paymentId },
      });
      if (!allocations.length) return 0;

      for (const alloc of allocations) {
        const installment = await installmentRepo.findOne({
          where: { id: alloc.installment_id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!installment) continue;

        const back = Number(alloc.allocated_amount);
        const paid = Math.max(
          0,
          Math.round((Number(installment.paid_amount) - back) * 100) / 100,
        );
        const balance =
          Math.round((Number(installment.amount) - paid) * 100) / 100;

        installment.paid_amount = paid;
        installment.balance = balance;
        installment.status =
          paid === 0 ? 'pending' : balance === 0 ? 'paid' : 'partially_paid';
        await installmentRepo.save(installment);
      }

      await allocationRepo.remove(allocations);
      // Money moved back off a schedule with no row saying so was one of the
      // unaudited writes the diagnostics review listed (the "Paid with nothing
      // received" class of ticket starts here). Actor comes from the request
      // context; a job run records itself as script. Same transaction, so a
      // rolled-back reversal leaves no audit row claiming it happened.
      await this.activityLogsService.logUpdate(
        'Payment',
        paymentId,
        {
          allocations: allocations.map((a) => ({
            installment_id: a.installment_id,
            amount: Number(a.allocated_amount),
            reference: a.reference,
          })),
        },
        { allocations: [] },
        null,
        `Reversed ${allocations.length} allocation(s) of payment ${paymentId.slice(0, 8)} off the instalment schedule`,
        undefined,
        m,
      );
      return allocations.length;
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * FIN-02 (19 Oct 2026): one transaction, with the payment row and the
   * eligible instalments locked FOR UPDATE. Two allocations of the same
   * payment at the same moment used to each read "nothing allocated yet" and
   * together apply 160 of an 80 receipt; the second now waits for the first
   * to commit, re-reads the allocation rows and finds nothing left to apply.
   * Overdue instalments are eligible: an unpaid instalment past its date is
   * exactly what the money is for.
   */
  async allocatePaymentFIFO(
    paymentId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<{
    allocated: number;
    remaining: number;
    allocations_created: number;
  }> {
    const run = (m: EntityManager) => this.allocatePaymentFIFOIn(m, paymentId, userId);
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private async allocatePaymentFIFOIn(
    m: EntityManager,
    paymentId: string,
    userId: string,
  ): Promise<{
    allocated: number;
    remaining: number;
    allocations_created: number;
  }> {
    const paymentRepo = m.withRepository(this.paymentRepository);
    const installmentRepo = m.withRepository(this.installmentRepository);
    const allocationRepo = m.withRepository(this.allocationRepository);

    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    // Instalments still owed on this payment's invoice, oldest due first
    // (FIFO), locked so no other allocation moves them under us.
    const unpaidInstallments = await installmentRepo
      .createQueryBuilder('inst')
      .setLock('pessimistic_write')
      .where('inst.invoice_id = :invoiceId', {
        invoiceId: payment.invoice_id,
      })
      .andWhere('inst.status IN (:...statuses)', {
        statuses: ['pending', 'partially_paid', 'overdue'],
      })
      .andWhere('inst.balance > 0')
      .orderBy('inst.grace_due_date', 'ASC')
      .addOrderBy('inst.installment_number', 'ASC')
      .getMany();

    // What is actually left to distribute?
    //
    // This used to read `payment.unallocated_amount || payment.amount`.
    // Postgres returns decimals as STRINGS, so a fresh payment's
    // unallocated_amount arrives as "0.00" — which JavaScript counts as
    // truthy. The fallback never fired, the loop exited immediately, and
    // the payment was then marked fully allocated with nothing behind it.
    // Every payment in the system went through that path.
    //
    // The tracking columns cannot be trusted to repair it either, since
    // they already hold those wrong figures. The authority is the
    // allocation rows themselves: whatever has genuinely been applied.
    const alreadyAllocated = Number(
      (
        await allocationRepo
          .createQueryBuilder('a')
          .select('COALESCE(SUM(a.allocated_amount), 0)', 'sum')
          .where('a.payment_id = :id', { id: payment.id })
          .getRawOne<{ sum: string }>()
      )?.sum ?? 0,
    );
    let remainingAmount =
      Math.round((Number(payment.amount) - alreadyAllocated) * 100) / 100;
    // Continue numbering after any allocations this payment already has, so
    // a repeat call (POST /payment-terms/allocate/:paymentId on a partially
    // allocated payment) cannot reuse order 1 and its reference.
    const existingCount = await allocationRepo.count({
      where: { payment_id: payment.id },
    });
    let allocationOrder = existingCount + 1;
    const allocations: PaymentAllocation[] = [];

    for (const installment of unpaidInstallments) {
      if (remainingAmount <= 0) break;

      const installmentBalance = Number(installment.balance);
      const allocationAmount = Math.min(remainingAmount, installmentBalance);
      const newBalance =
        Math.round((installmentBalance - allocationAmount) * 100) / 100;
      const newPaidAmount =
        Math.round(
          (Number(installment.paid_amount) + allocationAmount) * 100,
        ) / 100;

      // Deterministic and unique: "ALLOC-<first 8 of the payment id>-<n>".
      // The old generateAllocationReference() looked up the newest
      // ALLOC-YYYY-NNNN row once per loop iteration while the rows being
      // built were still only in memory (saved after the loop), so every
      // allocation of one payment received the same number. The payment's
      // own reference is NOT used here: it is typed by the user (the DTO
      // requires it) and is not unique across payments, and it can be up to
      // 255 characters while this column holds 100. Nothing in the server
      // or client reads this value today; it exists to tie an allocation to
      // its payment unambiguously.
      // Full payment id (FIN-05): an eight-character prefix is not a global identity.
      const allocationRef = `ALLOC-${payment.id}-${allocationOrder}`;

      allocations.push(
        allocationRepo.create({
          payment_id: payment.id,
          installment_id: installment.id,
          allocated_amount: Math.round(allocationAmount * 100) / 100,
          allocation_order: allocationOrder,
          allocation_date: payment.payment_date,
          reference: allocationRef,
        }),
      );

      // Update installment
      installment.paid_amount = newPaidAmount;
      installment.balance = newBalance;
      installment.status = newBalance === 0 ? 'paid' : 'partially_paid';
      await installmentRepo.save(installment);

      remainingAmount =
        Math.round((remainingAmount - allocationAmount) * 100) / 100;
      allocationOrder++;
    }

    if (allocations.length > 0) {
      await allocationRepo.save(allocations);
    }

    // Update payment allocation tracking. Derived the same way — from
    // what was actually applied — so the columns describe reality.
    const totalAllocated =
      Math.round((Number(payment.amount) - remainingAmount) * 100) / 100;
    payment.allocated_amount = totalAllocated;
    payment.unallocated_amount = remainingAmount;
    await paymentRepo.save(payment);

    await this.activityLogsService.logUpdate(
      'Payment',
      paymentId,
      { allocated_amount: alreadyAllocated },
      { allocated_amount: totalAllocated, remaining: remainingAmount },
      userId,
      `FIFO allocated payment ${paymentId}: ${totalAllocated} allocated, ${remainingAmount} remaining`,
      undefined,
      m,
    );

    return {
      allocated: totalAllocated,
      remaining: remainingAmount,
      allocations_created: allocations.length,
    };
  }

  // ========================
  // Installment Schedule
  // ========================

  async getInstallmentSchedule(documentId: string) {
    const appliedTerm = await this.appliedTermRepository.findOne({
      where: { document_id: documentId },
      relations: [
        'installments',
        'installments.allocations',
        'installments.allocations.payment',
        'payment_term',
      ],
      order: {
        installments: { installment_number: 'ASC' },
      },
    });

    if (!appliedTerm) {
      throw new NotFoundException(
        `No payment term applied to document ${documentId}`,
      );
    }

    return appliedTerm;
  }

  // ========================
  // List Installments (paginated)
  // ========================

  async findAllInstallments(
    query: QueryInstallmentDto,
  ): Promise<Pagination<Installment>> {
    const {
      page = '1',
      limit = '10',
      document_id,
      applied_payment_term_id,
      status,
    } = query;

    const qb = this.installmentRepository
      .createQueryBuilder('inst')
      .leftJoinAndSelect('inst.applied_payment_term', 'apt')
      .leftJoinAndSelect('inst.allocations', 'alloc')
      .orderBy('inst.grace_due_date', 'ASC')
      .addOrderBy('inst.installment_number', 'ASC');

    if (document_id) {
      qb.andWhere('apt.document_id = :documentId', {
        documentId: document_id,
      });
    }

    if (applied_payment_term_id) {
      qb.andWhere('inst.applied_payment_term_id = :aptId', {
        aptId: applied_payment_term_id,
      });
    }

    if (status) {
      qb.andWhere('inst.status = :status', { status });
    }

    return paginate<Installment>(qb, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  }
}
