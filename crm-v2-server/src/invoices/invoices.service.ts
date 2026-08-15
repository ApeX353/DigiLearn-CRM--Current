import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, EntityManager, Not } from 'typeorm';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { put } from '@vercel/blob';
import { Invoice } from './entities/invoice.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { Quote } from '../quotes/entities/quote.entity';
import {
  CreateInvoiceDto,
  CreateInvoiceItemDto,
} from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { UpdateInvoiceItemDto } from './dto/update-invoice-item.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { LeadsService } from '../leads/leads.service';
import {
  PaymentTermsService,
  type GeneratedChildInvoiceSummary,
} from '../payment-terms/payment-terms.service';
import { DocumentGeneratorService } from '../document-generator/document-generator.service';
import { FileManagerService } from '../file-manager/file-manager.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { InvoiceStatus } from './constants';
import { SettingsService } from '../settings/settings.service';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { AbilityScopeService } from '../auth/casl/ability-scope.service';
import { Action } from '../auth/constants/permissions';
import { Deal } from '../deals/entities/deal.entity';

export interface InvoiceCreationResult {
  master_invoice: Invoice;
  child_invoices: GeneratedChildInvoiceSummary[];
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private static readonly INVOICE_CONDITION_KEY_MAP: Record<string, string> = {
    id: 'id',
    ownerId: 'owner_id',
    owner_id: 'owner_id',
    schoolId: 'school_id',
    school_id: 'school_id',
    dealId: 'deal_id',
    deal_id: 'deal_id',
    personId: 'person_id',
    person_id: 'person_id',
    quoteId: 'quote_id',
    quote_id: 'quote_id',
    // See QUOTE_CONDITION_KEY_MAP — the seeded sales_rep rule uses
    // `createdBy`, and the invoice owner column is `owner_id`.
    createdBy: 'owner_id',
    created_by: 'owner_id',
    status: 'status',
    paymentStatus: 'payment_status',
    payment_status: 'payment_status',
  };

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(DocumentItem)
    private readonly documentItemRepository: Repository<DocumentItem>,
    @InjectRepository(Quote)
    private readonly quoteRepository: Repository<Quote>,
    private readonly dataSource: DataSource,
    private readonly activityLogsService: ActivityLogsService,
    private readonly paymentTermsService: PaymentTermsService,
    private readonly documentGeneratorService: DocumentGeneratorService,
    private readonly fileManagerService: FileManagerService,
    private readonly notificationsService: NotificationsService,
    private readonly appSettingsService: SettingsService,
    private readonly abilityScopeService: AbilityScopeService,
    private readonly leadsService: LeadsService,
  ) {}

  // ========================
  // CRUD Operations
  // ========================

  /**
   * C-03: a rep may only hang finance paperwork on their own records. A
   * foreign id answers 404 — not 403 — so ids cannot be probed. Elevated
   * roles pass scopeUserId=undefined and skip the check.
   */
  private async assertDealAttachable(
    manager: EntityManager,
    dealId: string,
    scopeUserId?: string,
  ): Promise<void> {
    if (!scopeUserId) return;
    const deal = await manager.findOne(Deal, { where: { id: dealId } });
    if (!deal || deal.assigned_to !== scopeUserId) {
      throw new NotFoundException(`Deal with ID ${dealId} not found`);
    }
  }

  private async assertQuoteAttachable(
    manager: EntityManager,
    quoteId: string,
    scopeUserId?: string,
  ): Promise<void> {
    if (!scopeUserId) return;
    const quote = await manager.findOne(Quote, { where: { id: quoteId } });
    if (!quote || quote.owner_id !== scopeUserId) {
      throw new NotFoundException(`Quote ${quoteId} not found`);
    }
  }

  async create(
    dto: CreateInvoiceDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<InvoiceCreationResult> {
    return this.dataSource.transaction(async (manager) => {
      // C-03: creating an invoice rewrites the linked deal's value and
      // flips the linked quote to Accepted — so both links must belong
      // to the caller when the caller is a rep.
      if (dto.deal_id) {
        await this.assertDealAttachable(manager, dto.deal_id, scopeUserId);
      }
      if (dto.quote_id) {
        await this.assertQuoteAttachable(manager, dto.quote_id, scopeUserId);
      }
      const invoiceNumber = await this.generateInvoiceNumber(manager);

      const { items: itemDtos, interest, ...invoiceData } = dto;
      const calculatedItems = this.calculateItemTotals(itemDtos);
      const totals = this.sumTotals(calculatedItems);

      const invoice = manager.create(Invoice, {
        ...invoiceData,
        invoice_number: invoiceNumber,
        owner_id: userId,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        grace_due_date: dto.due_date ? new Date(dto.due_date) : null,
        parent_invoice_id: null,
        is_summary_invoice: false,
        ...totals,
      });

      const savedInvoice = await manager.save(Invoice, invoice);

      const items = calculatedItems.map((item) =>
        manager.create(DocumentItem, {
          ...item,
          document_type: 'Invoice',
          document_id: savedInvoice.id,
        }),
      );

      await manager.save(DocumentItem, items);

      let childInvoices: GeneratedChildInvoiceSummary[] = [];
      if (dto.payment_term_id) {
        const applied =
          await this.paymentTermsService.applyPaymentTermToDocument(
            {
              document_id: savedInvoice.id,
              document_type: 'invoice',
              payment_term_id: dto.payment_term_id,
              document_total: totals.total,
              interest,
            },
            userId,
            manager,
          );
        childInvoices = applied.child_invoices;
      }

      const refreshedMasterInvoice = await manager.findOne(Invoice, {
        where: { id: savedInvoice.id },
      });
      if (!refreshedMasterInvoice) {
        throw new NotFoundException(
          `Invoice with ID ${savedInvoice.id} not found`,
        );
      }

      // look up the deal and update deal value to match the invoice total
      if (invoice.deal_id) {
        const deal = await manager.findOne(Deal, {
          where: { id: invoice.deal_id },
        });

        if (deal) {
          deal.value = Number(invoice.total);
          await manager.save(Deal, deal);
        }
      }

      // An invoice raised against a quote means that quote was accepted.
      // The Manual Invoice path used to leave the source quote on "Sent"
      // forever — only the deal Products-tab Convert button flipped it.
      if (savedInvoice.quote_id) {
        const sourceQuote = await manager.findOne(Quote, {
          where: { id: savedInvoice.quote_id },
        });
        if (sourceQuote && sourceQuote.status !== 'Accepted') {
          if (sourceQuote.deal_id) {
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtext($1))',
              [sourceQuote.deal_id],
            );
            const acceptedOnDeal = await manager.count(Quote, {
              where: {
                deal_id: sourceQuote.deal_id,
                status: 'Accepted',
                id: Not(sourceQuote.id),
              },
            });
            if (acceptedOnDeal > 0) {
              throw new ConflictException(
                'This deal already has an Accepted quote. Move that quote out of Accepted before converting this one.',
              );
            }
          }
          sourceQuote.status = 'Accepted';
          await manager.save(Quote, sourceQuote);
        }
      }

      await this.activityLogsService.logCreate(
        'Invoice',
        refreshedMasterInvoice.id,
        refreshedMasterInvoice,
        userId,
        `Created invoice: ${refreshedMasterInvoice.invoice_number}`,
      );

      // Commercial intent: an invoice moves the deal to PO/Contract
      // Received (auto-converting the school's lead if no deal exists)
      // and files itself on the deal. Same transaction — all or nothing.
      const intentDealId = await this.leadsService.registerCommercialIntent(
        manager,
        {
          schoolId: refreshedMasterInvoice.school_id,
          dealId: refreshedMasterInvoice.deal_id,
          documentType: 'invoice',
          documentId: refreshedMasterInvoice.id,
          documentNumber: refreshedMasterInvoice.invoice_number,
          total: Number(refreshedMasterInvoice.total),
          userId,
        },
      );
      if (intentDealId && !refreshedMasterInvoice.deal_id) {
        await manager.update(Invoice, { id: refreshedMasterInvoice.id }, {
          deal_id: intentDealId,
        });
      }

      return {
        master_invoice: refreshedMasterInvoice,
        child_invoices: childInvoices,
      };
    });
  }

  async findAll(
    query: QueryInvoiceDto,
    userId?: string,
    userRole?: string,
    ability?: AppAbility,
  ): Promise<Pagination<Invoice>> {
    const {
      page = '1',
      limit = '10',
      search,
      status,
      payment_status,
      school_id,
      owner_id,
      deal_id,
      overdue,
      include_children = false,
    } = query;

    const qb = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.school', 'school')
      .leftJoinAndSelect('invoice.owner', 'owner')
      .leftJoinAndSelect('invoice.person', 'person')
      .leftJoinAndSelect('invoice.deal', 'deal')
      .leftJoinAndSelect('invoice.quote', 'quote');

    if (userId && userRole !== 'admin' && userRole !== 'sales_manager') {
      qb.andWhere('invoice.owner_id = :userId', { userId });
    }

    if (search) {
      qb.andWhere(
        '(invoice.invoice_number LIKE :search OR invoice.client_name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      qb.andWhere('invoice.status = :status', { status });
    }

    if (payment_status) {
      qb.andWhere('invoice.payment_status = :paymentStatus', {
        paymentStatus: payment_status,
      });
    }

    if (school_id) {
      qb.andWhere('invoice.school_id = :schoolId', { schoolId: school_id });
    }

    if (owner_id) {
      qb.andWhere('invoice.owner_id = :ownerId', { ownerId: owner_id });
    }

    if (deal_id) {
      qb.andWhere('invoice.deal_id = :dealId', { dealId: deal_id });
    }

    if (!include_children) {
      qb.andWhere('invoice.parent_invoice_id IS NULL');
    }

    if (overdue) {
      qb.andWhere('COALESCE(invoice.grace_due_date, invoice.due_date) < NOW()')
        .andWhere('invoice.payment_status != :paid', { paid: 'Paid' })
        .andWhere('invoice.status != :cancelled', { cancelled: 'Cancelled' });
    }

    if (ability) {
      this.abilityScopeService.applyScopeToQueryBuilder(qb, ability, {
        action: Action.READ,
        subject: 'Invoice',
        queryAlias: 'invoice',
        conditionKeyMap: InvoicesService.INVOICE_CONDITION_KEY_MAP,
      });
    }

    qb.orderBy('invoice.created_at', 'DESC');

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    return paginate<Invoice>(qb, options);
  }

  async findOne(id: string, ability?: AppAbility): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: [
        'school',
        'owner',
        'person',
        'deal',
        'quote',
        'parent_invoice',
        'child_invoices',
      ],
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (ability && !this.canReadInvoice(ability, invoice)) {
      throw new ForbiddenException(
        'You do not have permission to access this invoice',
      );
    }

    return invoice;
  }

  async findOneWithItems(
    id: string,
    ability?: AppAbility,
  ): Promise<Invoice & { items: DocumentItem[] }> {
    const invoice = await this.findOne(id, ability);

    const items = await this.documentItemRepository.find({
      where: { document_type: 'Invoice', document_id: id },
      relations: ['product'],
      order: { created_at: 'ASC' },
    });

    return { ...invoice, items };
  }

  private canReadInvoice(ability: AppAbility, invoice: Invoice): boolean {
    return this.abilityScopeService.canAccessRecord(
      ability,
      invoice as unknown as Record<string, unknown>,
      {
        action: Action.READ,
        subject: 'Invoice',
        conditionKeyMap: InvoicesService.INVOICE_CONDITION_KEY_MAP,
      },
    );
  }

  async update(
    id: string,
    dto: UpdateInvoiceDto,
    userId: string,
    scopeUserId?: string,
  ): Promise<Invoice> {
    const invoice = await this.findOne(id);
    const oldValues = { ...invoice };

    if (
      dto.status &&
      ['Paid', 'Partially-Paid', 'Overdue'].includes(dto.status)
    ) {
      throw new BadRequestException(
        'Paid, Partially-Paid, and Overdue are derived from payments and due dates',
      );
    }

    if (dto.due_date) {
      (dto as any).due_date = new Date(dto.due_date);
    }

    return this.dataSource.transaction(async (manager) => {
      // C-03: the guard has authorized the invoice itself, but the body
      // can still re-point deal_id/quote_id at somebody else's records,
      // whose value/status this method then rewrites.
      if (dto.deal_id && dto.deal_id !== invoice.deal_id) {
        await this.assertDealAttachable(manager, dto.deal_id, scopeUserId);
      }
      if (dto.quote_id && dto.quote_id !== invoice.quote_id) {
        await this.assertQuoteAttachable(manager, dto.quote_id, scopeUserId);
      }
      Object.assign(invoice, dto);
      const updatedInvoice = await manager.save(Invoice, invoice);

      // look up the deal
      if (updatedInvoice.deal_id) {
        const deal = await manager.findOne(Deal, {
          where: { id: updatedInvoice.deal_id },
        });

        if (deal) {
          deal.value = Number(invoice.total);
          await manager.save(Deal, deal);
        }
      }

      await this.activityLogsService.logUpdate(
        'Invoice',
        updatedInvoice.id,
        oldValues,
        updatedInvoice,
        userId,
        `Updated invoice: ${updatedInvoice.invoice_number}`,
      );

      return this.findOne(updatedInvoice.id);
    });
  }

  async updateStatus(
    id: string,
    status: InvoiceStatus,
    userId: string,
  ): Promise<Invoice> {
    if (['Paid', 'Partially-Paid', 'Overdue'].includes(status)) {
      throw new BadRequestException(
        'Record a payment instead; financial invoice statuses cannot be selected manually',
      );
    }
    const invoice = await this.findOne(id);
    const oldStatus = invoice.status;

    invoice.status = status;
    const updatedInvoice = await this.invoiceRepository.save(invoice);

    await this.activityLogsService.logUpdate(
      'Invoice',
      updatedInvoice.id,
      { status: oldStatus },
      { status },
      userId,
      `Updated invoice ${updatedInvoice.invoice_number} status from ${oldStatus} to ${status}`,
    );

    if (status === 'Sent') {
      await this.generateAndSendInvoice(id, userId);
    }

    return this.findOne(updatedInvoice.id);
  }

  private async generateAndSendInvoice(
    invoiceId: string,
    userId: string,
  ): Promise<void> {
    try {
      const invoiceWithItems = await this.findOneWithItems(invoiceId);

      // Generate PDF
      const pdfBuffer =
        await this.documentGeneratorService.generateInvoicePdf(
          invoiceWithItems,
        );

      // Upload to Vercel Blob
      const fileName = `${invoiceWithItems.invoice_number}.pdf`;
      const blob = await put(`invoices/${fileName}`, pdfBuffer, {
        access: 'public',
        contentType: 'application/pdf',
      });

      // Save file reference
      await this.fileManagerService.create(
        {
          file_name: fileName,
          file_url: blob.url,
          provider: 'vercel',
          entity_type: 'invoice',
          entity_id: invoiceId,
          file_type: 'application/pdf',
          file_size: pdfBuffer.length,
        },
        userId,
      );
      const currency = await this.appSettingsService.getSetting('currency');

      // Send email with PDF attachment
      if (invoiceWithItems.client_email) {
        const companyName = process.env.COMPANY_NAME || 'DigiLearn';
        const total = Number(invoiceWithItems.total).toLocaleString('en-ZA', {
          style: 'currency',
          currency: currency?.value ?? 'USD',
        });

        await this.notificationsService.sendEmailWithTemplate(
          invoiceWithItems.client_email,
          `Invoice ${invoiceWithItems.invoice_number} from ${companyName}`,
          'invoice-sent',
          {
            clientName: invoiceWithItems.client_name,
            documentNumber: invoiceWithItems.invoice_number,
            total,
            dueDate: invoiceWithItems.due_date
              ? new Date(invoiceWithItems.due_date).toLocaleDateString()
              : null,
            companyName,
            year: new Date().getFullYear(),
          },
          undefined,
          {
            attachments: [
              {
                filename: fileName,
                content: pdfBuffer,
                contentType: 'application/pdf',
              },
            ],
          },
        );
      }

      this.logger.log(
        `Invoice ${invoiceWithItems.invoice_number} PDF generated and sent`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate/send invoice ${invoiceId}: ${error.message}`,
      );
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    const invoice = await this.findOne(id);

    await this.documentItemRepository.delete({
      document_type: 'Invoice',
      document_id: id,
    });

    await this.invoiceRepository.remove(invoice);

    await this.activityLogsService.logDelete(
      'Invoice',
      id,
      invoice,
      userId,
      `Deleted invoice: ${invoice.invoice_number}`,
    );
  }

  // ========================
  // Quote to Invoice Conversion
  // ========================

  async convertFromQuote(
    quoteId: string,
    userId: string,
    dealId?: string,
    scopeUserId?: string,
  ): Promise<InvoiceCreationResult> {
    return this.dataSource.transaction(async (manager) => {
      // Locked for the whole transaction: two simultaneous conversions of
      // the same quote serialize here, and the second one then fails the
      // status check below. The old system had no such lock and holds five
      // quotes that were really converted twice — so this is done with a
      // row lock, not a unique constraint the historical data would fail.
      // (Only scalar columns are read from the quote, so no relations.)
      const quote = await manager.findOne(Quote, {
        where: { id: quoteId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!quote) {
        throw new NotFoundException(`Quote ${quoteId} not found`);
      }

      // C-03: a rep can only convert their own quote; a foreign id
      // answers 404 so ids cannot be probed.
      if (scopeUserId && quote.owner_id !== scopeUserId) {
        throw new NotFoundException(`Quote ${quoteId} not found`);
      }

      // QUOTE1-b: "Accepted" usually means an invoice was already created,
      // but a quote can reach Accepted with NO invoice — via a manual status
      // change, or the manual-invoice path which flips its source quote to
      // Accepted. Blocking purely on status made "Convert to Invoice" 400 on
      // a legitimate, uninvoiced Accepted quote (the deal-page button only
      // checks invoice existence, so it offered a click the server refused).
      // Block only when an invoice actually exists for this quote.
      if (quote.status === 'Accepted') {
        const existingInvoice = await manager.findOne(Invoice, {
          where: { quote_id: quoteId },
        });
        if (existingInvoice) {
          throw new BadRequestException(
            'Quote has already been converted to an invoice',
          );
        }
      }

      // Draft and Sent may convert (the previous CRM's data shows Draft
      // conversions were the normal way of working — 42 of 56). A quote
      // that was Rejected or has Expired may not.
      if (quote.status === 'Rejected' || quote.status === 'Expired') {
        throw new BadRequestException(
          `A ${quote.status} quote cannot be converted to an invoice`,
        );
      }

      // C-03: the optional dealId override must also belong to the caller.
      if (dealId && !quote.deal_id) {
        await this.assertDealAttachable(manager, dealId, scopeUserId);
      }

      const invoiceNumber = await this.generateInvoiceNumber(manager);

      const quoteItems = await manager.find(DocumentItem, {
        where: { document_type: 'Quote', document_id: quoteId },
      });

      const invoice = manager.create(Invoice, {
        invoice_number: invoiceNumber,
        person_id: quote.person_id,
        deal_id: quote.deal_id || dealId,
        owner_id: quote.owner_id,
        quote_id: quote.id,
        school_id: quote.school_id,
        client_name: quote.client_name,
        client_email: quote.client_email,
        client_address: quote.client_address,
        status: 'Draft',
        payment_status: 'Unpaid',
        subtotal: quote.subtotal,
        tax: quote.tax,
        discount: quote.discount,
        total: quote.total,
        amount_paid: 0,
        notes: quote.notes,
        grace_due_date: null,
        parent_invoice_id: null,
        is_summary_invoice: false,
      });

      if (invoice.deal_id) {
        const deal = await manager.findOne(Deal, {
          where: { id: invoice.deal_id },
        });

        if (deal) {
          deal.value = Number(invoice.total);
          await manager.save(Deal, deal);
        }
      }

      const savedInvoice = await manager.save(Invoice, invoice);

      const invoiceItems = quoteItems.map((item) =>
        manager.create(DocumentItem, {
          document_type: 'Invoice',
          document_id: savedInvoice.id,
          description: item.description,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          tax: item.tax,
          tax_rate: item.tax_rate,
          total: item.total,
        }),
      );

      await manager.save(DocumentItem, invoiceItems);

      const appliedQuoteTerm =
        await this.paymentTermsService.findAppliedTermByDocument(
          quote.id,
          'quote',
          manager,
        );

      let childInvoices: GeneratedChildInvoiceSummary[] = [];
      if (appliedQuoteTerm?.payment_term_id) {
        const applied =
          await this.paymentTermsService.applyPaymentTermToDocument(
            {
              document_id: savedInvoice.id,
              document_type: 'invoice',
              payment_term_id: appliedQuoteTerm.payment_term_id,
              document_total: Number(quote.total),
              start_date: appliedQuoteTerm.start_date,
              interest: Number(appliedQuoteTerm.interest_rate),
            },
            userId,
            manager,
          );
        childInvoices = applied.child_invoices;
      }

      const refreshedMasterInvoice = await manager.findOne(Invoice, {
        where: { id: savedInvoice.id },
      });
      if (!refreshedMasterInvoice) {
        throw new NotFoundException(
          `Invoice with ID ${savedInvoice.id} not found`,
        );
      }

      // Update quote status to Accepted
      quote.status = 'Accepted';
      await manager.save(Quote, quote);

      await this.activityLogsService.logUpdate(
        'Quote',
        quote.id,
        { status: 'Sent' },
        { status: 'Accepted' },
        userId,
        `Quote ${quote.quote_number} accepted and converted to invoice ${invoiceNumber}`,
      );

      await this.activityLogsService.logCreate(
        'Invoice',
        refreshedMasterInvoice.id,
        refreshedMasterInvoice,
        userId,
        `Invoice ${invoiceNumber} created from quote ${quote.quote_number}`,
      );

      return {
        master_invoice: refreshedMasterInvoice,
        child_invoices: childInvoices,
      };
    });
  }

  // ========================
  // Item Management
  // ========================

  async addItem(
    invoiceId: string,
    dto: CreateInvoiceItemDto,
    userId: string,
  ): Promise<Invoice & { items: DocumentItem[] }> {
    const invoice = await this.findOne(invoiceId);

    const calculated = this.calculateItemTotals([dto])[0];

    const item = this.documentItemRepository.create({
      ...calculated,
      document_type: 'Invoice',
      document_id: invoiceId,
    });

    await this.documentItemRepository.save(item);
    await this.recalculateInvoiceTotals(invoiceId);

    await this.activityLogsService.logUpdate(
      'Invoice',
      invoiceId,
      {},
      { added_item: dto.description },
      userId,
      `Added item to invoice ${invoice.invoice_number}: ${dto.description}`,
    );

    return this.findOneWithItems(invoiceId);
  }

  async updateItem(
    invoiceId: string,
    itemId: string,
    dto: UpdateInvoiceItemDto,
    userId: string,
  ): Promise<Invoice & { items: DocumentItem[] }> {
    const invoice = await this.findOne(invoiceId);

    const item = await this.documentItemRepository.findOne({
      where: {
        id: itemId,
        document_type: 'Invoice',
        document_id: invoiceId,
      },
    });

    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found in invoice`);
    }

    Object.assign(item, dto);

    const itemSubtotal = Number(item.quantity) * Number(item.unit_price);
    const itemDiscount = Number(item.discount) || 0;
    const itemTaxRate = Number(item.tax_rate) || 0;
    const itemTax = (itemSubtotal - itemDiscount) * (itemTaxRate / 100);
    item.tax = Math.round(itemTax * 100) / 100;
    item.total =
      Math.round((itemSubtotal - itemDiscount + itemTax) * 100) / 100;

    await this.documentItemRepository.save(item);
    await this.recalculateInvoiceTotals(invoiceId);

    await this.activityLogsService.logUpdate(
      'Invoice',
      invoiceId,
      {},
      { updated_item: itemId },
      userId,
      `Updated item in invoice ${invoice.invoice_number}`,
    );

    return this.findOneWithItems(invoiceId);
  }

  async removeItem(
    invoiceId: string,
    itemId: string,
    userId: string,
  ): Promise<Invoice & { items: DocumentItem[] }> {
    const invoice = await this.findOne(invoiceId);

    const item = await this.documentItemRepository.findOne({
      where: {
        id: itemId,
        document_type: 'Invoice',
        document_id: invoiceId,
      },
    });

    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found in invoice`);
    }

    await this.documentItemRepository.remove(item);
    await this.recalculateInvoiceTotals(invoiceId);

    await this.activityLogsService.logUpdate(
      'Invoice',
      invoiceId,
      { removed_item: item.description },
      {},
      userId,
      `Removed item from invoice ${invoice.invoice_number}: ${item.description}`,
    );

    return this.findOneWithItems(invoiceId);
  }

  // ========================
  // Payment Status Management
  // ========================

  async recalculatePaymentStatus(invoiceId: string): Promise<void> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.is_summary_invoice) {
      const childInvoices = await this.invoiceRepository.find({
        where: { parent_invoice_id: invoice.id },
      });

      const totalAmount = childInvoices.reduce(
        (sum, child) => sum + Number(child.total),
        0,
      );
      const totalPaid = childInvoices.reduce(
        (sum, child) => sum + Number(child.amount_paid),
        0,
      );

      invoice.total = Math.round(totalAmount * 100) / 100;
      invoice.amount_paid = Math.round(totalPaid * 100) / 100;

      if (childInvoices.length === 0 || totalPaid === 0) {
        invoice.payment_status = 'Unpaid';
        invoice.status = 'Draft';
        invoice.paid_date = null;
      } else if (totalPaid >= totalAmount) {
        invoice.payment_status = 'Paid';
        invoice.status = 'Paid';
        invoice.paid_date = new Date();
      } else {
        invoice.payment_status = 'Partial';
        invoice.status = 'Partially-Paid';
        invoice.paid_date = null;
      }

      await this.invoiceRepository.save(invoice);
      return;
    }

    // Sum all payments for this invoice from the payments table
    const result = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(payment.amount), 0)', 'total_paid')
      .from('payments', 'payment')
      .where('payment.invoice_id = :invoiceId', { invoiceId })
      .getRawOne();

    const totalPaid = Number(result.total_paid);
    const invoiceTotal = Number(invoice.total);

    invoice.amount_paid = Math.round(totalPaid * 100) / 100;

    if (totalPaid === 0) {
      // Symmetry matters here: every other branch sets payment_status,
      // status AND paid_date together. This one used to set only the
      // first, so an invoice whose payments were removed kept status
      // 'Paid' and its paid date — and went on being counted as revenue.
      invoice.payment_status = 'Unpaid';
      invoice.status = 'Sent';
      invoice.paid_date = null;
    } else if (totalPaid >= invoiceTotal) {
      invoice.payment_status = 'Paid';
      invoice.status = 'Paid';
      invoice.paid_date = new Date();
    } else {
      invoice.payment_status = 'Partial';
      invoice.status = 'Partially-Paid';
      invoice.paid_date = null;
    }

    await this.invoiceRepository.save(invoice);
  }

  // ========================
  // Helper Methods
  // ========================

  private calculateItemTotals(items: CreateInvoiceItemDto[]): Array<{
    description: string;
    product_id: string | null;
    quantity: number;
    unit_price: number;
    discount: number;
    tax_rate: number;
    tax: number;
    total: number;
  }> {
    return items.map((item) => {
      const itemSubtotal = item.quantity * item.unit_price;
      const itemDiscount = item.discount || 0;
      const itemTaxRate = item.tax_rate || 0;
      const itemTax = (itemSubtotal - itemDiscount) * (itemTaxRate / 100);
      const itemTotal = itemSubtotal - itemDiscount + itemTax;

      return {
        description: item.description,
        product_id: item.product_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: Math.round(itemDiscount * 100) / 100,
        tax_rate: itemTaxRate,
        tax: Math.round(itemTax * 100) / 100,
        total: Math.round(itemTotal * 100) / 100,
      };
    });
  }

  private sumTotals(
    items: Array<{
      quantity: number;
      unit_price: number;
      discount: number;
      tax: number;
      total: number;
    }>,
  ): { subtotal: number; tax: number; discount: number; total: number } {
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    let grandTotal = 0;

    items.forEach((item) => {
      subtotal += item.quantity * item.unit_price;
      totalDiscount += item.discount;
      totalTax += item.tax;
      grandTotal += item.total;
    });

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(totalTax * 100) / 100,
      discount: Math.round(totalDiscount * 100) / 100,
      total: Math.round(grandTotal * 100) / 100,
    };
  }

  private async recalculateInvoiceTotals(invoiceId: string): Promise<void> {
    const items = await this.documentItemRepository.find({
      where: { document_type: 'Invoice', document_id: invoiceId },
    });

    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    let grandTotal = 0;

    items.forEach((item) => {
      subtotal += Number(item.quantity) * Number(item.unit_price);
      totalDiscount += Number(item.discount);
      totalTax += Number(item.tax);
      grandTotal += Number(item.total);
    });

    await this.invoiceRepository.update(invoiceId, {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(totalTax * 100) / 100,
      discount: Math.round(totalDiscount * 100) / 100,
      total: Math.round(grandTotal * 100) / 100,
    });
  }

  /**
   * AUD-H11. Two rules, both learned the hard way:
   *
   * 1. Take MAX of the numeric part, never "newest row by created_at":
   *    Postgres freezes now() for a whole transaction, so a master and
   *    its instalment children all share one created_at and the ordering
   *    trick hands out the same number twice (this is why creating an
   *    invoice with a payment plan 500'd — the old CRM ran MySQL, where
   *    timestamps are per-statement, so the identical code worked there).
   * 2. When inside a transaction, hold an advisory lock so two invoices
   *    raised at the same moment cannot draw the same number.
   */
  async generateInvoiceNumber(manager?: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const conn = manager ?? this.invoiceRepository.manager;
    if (manager) {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('invoice_number'))",
      );
    }
    const rows: Array<{ max: number | null }> = await conn.query(
      `SELECT MAX((substring(invoice_number from '(\\d+)$'))::int) AS max
         FROM invoices WHERE invoice_number LIKE $1`,
      [`${prefix}%`],
    );
    const nextNumber = Number(rows[0]?.max ?? 0) + 1;

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  // ========================
  // Invoice Stats
  // ========================

  /**
   * @param scopeUserId When set (sales reps), the KPIs are computed over
   *   the rep's own invoices only, matching what their list shows (C-03).
   */
  async getInvoiceStats(scopeUserId?: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const buildStats = async (start: Date) => {
      const rowsQb = this.invoiceRepository
        .createQueryBuilder('i')
        .select('i.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(i.total), 0)', 'totalValue')
        .where('i.created_at >= :start', { start })
        .groupBy('i.status');
      if (scopeUserId) {
        rowsQb.andWhere('i.owner_id = :scopeUserId', { scopeUserId });
      }
      const rows = await rowsQb.getRawMany();

      // Overdue is computed by DATE, not by the `status` column — no
      // code path ever sets status='Overdue', which is why the KPI
      // always read 0. Every other overdue calculation in the app uses
      // COALESCE(grace_due_date, due_date) < NOW(); this now matches.
      // Value = unpaid balance, and overdue stays a subset of
      // outstanding ("outstanding, of which overdue").
      const overdueQb = this.invoiceRepository
        .createQueryBuilder('i')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(i.total - i.amount_paid), 0)', 'value')
        .where('i.created_at >= :start', { start })
        .andWhere('i.status != :cancelledStatus', {
          cancelledStatus: 'Cancelled',
        })
        .andWhere('i.payment_status != :paidStatus', { paidStatus: 'Paid' })
        .andWhere('COALESCE(i.grace_due_date, i.due_date) < NOW()');
      if (scopeUserId) {
        overdueQb.andWhere('i.owner_id = :scopeUserId', { scopeUserId });
      }
      const overdueRow = await overdueQb.getRawOne();

      let total = 0;
      let totalValue = 0;
      let paid = 0;
      let paidValue = 0;
      const overdue = Number(overdueRow?.count ?? 0);
      const overdueValue = Number(overdueRow?.value ?? 0);
      let outstanding = 0;
      let outstandingValue = 0;
      let cancelled = 0;

      for (const row of rows) {
        const count = Number(row.count);
        const value = Number(row.totalValue);
        total += count;
        totalValue += value;

        if (row.status === 'Paid') {
          paid = count;
          paidValue = value;
        } else if (row.status === 'Overdue') {
          // Legacy branch — status='Overdue' is never written today,
          // but if a row ever carries it, keep it in outstanding.
          outstanding += count;
          outstandingValue += value;
        } else if (row.status === 'Cancelled') {
          cancelled = count;
        } else {
          // Draft, Sent, Partially-Paid are outstanding
          outstanding += count;
          outstandingValue += value;
        }
      }

      const collectible = total - cancelled;

      return {
        totalInvoices: total,
        totalValue,
        paid,
        paidValue,
        outstanding,
        outstandingValue,
        overdue,
        overdueValue,
        cancelled,
        collectionRate:
          collectible > 0 ? Math.round((paid / collectible) * 10000) / 100 : 0,
        paidRate: total > 0 ? Math.round((paid / total) * 10000) / 100 : 0,
      };
    };

    const [monthly, quarterly, yearly] = await Promise.all([
      buildStats(monthStart),
      buildStats(quarterStart),
      buildStats(yearStart),
    ]);

    return { monthly, quarterly, yearly };
  }

  // ========================
  // Installments & Applied Payment Terms
  // ========================

  async getPaymentSchedule(invoiceId: string) {
    const invoice = await this.findOne(invoiceId);
    const appliedDocumentId = invoice.parent_invoice_id ?? invoice.id;

    const appliedTerm =
      await this.paymentTermsService.findAppliedTermByDocument(
        appliedDocumentId,
        'invoice',
      );

    if (!appliedTerm) {
      return {
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total: invoice.total,
          amount_paid: invoice.amount_paid,
          status: invoice.status,
          payment_status: invoice.payment_status,
          due_date: invoice.due_date,
          grace_due_date: invoice.grace_due_date,
        },
        appliedTerm: null,
        installments: [],
      };
    }

    const schedule =
      await this.paymentTermsService.getInstallmentSchedule(appliedDocumentId);
    const installments = invoice.parent_invoice_id
      ? (schedule?.installments ?? []).filter(
          (installment) => installment.invoice_id === invoice.id,
        )
      : (schedule?.installments ?? []);

    return {
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total: invoice.total,
        amount_paid: invoice.amount_paid,
        status: invoice.status,
        payment_status: invoice.payment_status,
        due_date: invoice.due_date,
        grace_due_date: invoice.grace_due_date,
        parent_invoice_id: invoice.parent_invoice_id,
        is_summary_invoice: invoice.is_summary_invoice,
      },
      appliedTerm: {
        id: appliedTerm.id,
        term_name: appliedTerm.term_name,
        term_type: appliedTerm.term_type,
        interest_rate: appliedTerm.interest_rate,
        interest_calculation_method: appliedTerm.interest_calculation_method,
        interest_amount: appliedTerm.interest_amount,
        subtotal: appliedTerm.subtotal,
        total_amount: appliedTerm.total_amount,
        number_of_installments: appliedTerm.number_of_installments,
        start_date: appliedTerm.start_date,
        final_due_date: appliedTerm.final_due_date,
        grace_period_days: appliedTerm.grace_period_days,
      },
      installments,
    };
  }
}
