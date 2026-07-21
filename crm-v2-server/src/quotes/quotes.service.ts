import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, EntityManager } from 'typeorm';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { put } from '@vercel/blob';
import { Quote } from './entities/quote.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import { CreateQuoteDto, CreateQuoteItemDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { PaymentTermsService } from '../payment-terms/payment-terms.service';
import { DocumentGeneratorService } from '../document-generator/document-generator.service';
import { FileManagerService } from '../file-manager/file-manager.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { QuoteStatus } from './constants';
import { SettingsService } from '../settings/settings.service';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { AbilityScopeService } from '../auth/casl/ability-scope.service';
import { Action } from '../auth/constants/permissions';
import { Deal } from '../deals/entities/deal.entity';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);
  private static readonly QUOTE_CONDITION_KEY_MAP: Record<string, string> = {
    id: 'id',
    ownerId: 'owner_id',
    owner_id: 'owner_id',
    schoolId: 'school_id',
    school_id: 'school_id',
    dealId: 'deal_id',
    deal_id: 'deal_id',
    personId: 'person_id',
    person_id: 'person_id',
    status: 'status',
  };

  constructor(
    @InjectRepository(Quote)
    private readonly quoteRepository: Repository<Quote>,
    @InjectRepository(DocumentItem)
    private readonly documentItemRepository: Repository<DocumentItem>,
    private readonly dataSource: DataSource,
    private readonly activityLogsService: ActivityLogsService,
    private readonly paymentTermsService: PaymentTermsService,
    private readonly documentGeneratorService: DocumentGeneratorService,
    private readonly fileManagerService: FileManagerService,
    private readonly notificationsService: NotificationsService,
    private readonly appSettingsService: SettingsService,
    private readonly abilityScopeService: AbilityScopeService,
  ) {}

  // ========================
  // CRUD Operations
  // ========================

  async create(
    dto: CreateQuoteDto,
    userId: string,
    manager?: EntityManager,
  ): Promise<Quote> {
    const run = async (transactionManager: EntityManager) => {
      const quoteNumber = await this.generateQuoteNumber(transactionManager);

      // Calculate totals from items
      const { items: itemDtos, interest, ...quoteData } = dto;
      const calculatedItems = this.calculateItemTotals(itemDtos);
      const totals = this.sumTotals(calculatedItems);

      const quote = transactionManager.create(Quote, {
        ...quoteData,
        quote_number: quoteNumber,
        owner_id: userId,
        valid_until: dto.valid_until ? new Date(dto.valid_until) : null,
        ...totals,
      });

      const savedQuote = await transactionManager.save(Quote, quote);

      // Create document items
      const items = calculatedItems.map((item) =>
        transactionManager.create(DocumentItem, {
          ...item,
          document_type: 'Quote',
          document_id: savedQuote.id,
        }),
      );

      await transactionManager.save(DocumentItem, items);

      if (dto.payment_term_id) {
        await this.paymentTermsService.applyPaymentTermToDocument(
          {
            document_id: savedQuote.id,
            document_type: 'quote',
            payment_term_id: dto.payment_term_id,
            document_total: totals.total,
            interest,
          },
          userId,
          transactionManager,
        );
      }

      // look up the deal and update deal value to match the invoice total
      if (savedQuote.deal_id) {
        const deal = await transactionManager.findOne(Deal, {
          where: { id: savedQuote.deal_id },
        });

        if (deal) {
          deal.value = Number(savedQuote.total);
          await transactionManager.save(Deal, deal);
        }
      }

      await this.activityLogsService.logCreate(
        'Quote',
        savedQuote.id,
        savedQuote,
        userId,
        `Created quote: ${savedQuote.quote_number}`,
      );

      const fullQuote = await transactionManager.findOne(Quote, {
        where: { id: savedQuote.id },
        relations: ['school', 'owner', 'person', 'deal'],
      });

      if (!fullQuote) {
        throw new NotFoundException(`Quote with ID ${savedQuote.id} not found`);
      }

      return fullQuote;
    };

    if (manager) {
      return run(manager);
    }

    return this.dataSource.transaction((transactionManager) =>
      run(transactionManager),
    );
  }

  async findAll(
    query: QueryQuoteDto,
    userId?: string,
    userRole?: string,
    ability?: AppAbility,
  ): Promise<Pagination<Quote>> {
    const {
      page = '1',
      limit = '10',
      search,
      status,
      school_id,
      owner_id,
      deal_id,
    } = query;

    const qb = this.quoteRepository
      .createQueryBuilder('quote')
      .leftJoinAndSelect('quote.school', 'school')
      .leftJoinAndSelect('quote.owner', 'owner')
      .leftJoinAndSelect('quote.person', 'person')
      .leftJoinAndSelect('quote.deal', 'deal');

    // Authorization: sales_rep only sees own quotes
    if (userId && userRole !== 'admin' && userRole !== 'sales_manager') {
      qb.andWhere('quote.owner_id = :userId', { userId });
    }

    if (search) {
      qb.andWhere(
        '(quote.quote_number LIKE :search OR quote.client_name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      qb.andWhere('quote.status = :status', { status });
    }

    if (school_id) {
      qb.andWhere('quote.school_id = :schoolId', { schoolId: school_id });
    }

    if (owner_id) {
      qb.andWhere('quote.owner_id = :ownerId', { ownerId: owner_id });
    }

    if (deal_id) {
      qb.andWhere('quote.deal_id = :dealId', { dealId: deal_id });
    }

    if (ability) {
      this.abilityScopeService.applyScopeToQueryBuilder(qb, ability, {
        action: Action.READ,
        subject: 'Quote',
        queryAlias: 'quote',
        conditionKeyMap: QuotesService.QUOTE_CONDITION_KEY_MAP,
      });
    }

    qb.orderBy('quote.created_at', 'DESC');

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    return paginate<Quote>(qb, options);
  }

  async findOne(id: string, ability?: AppAbility): Promise<Quote> {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['school', 'owner', 'person', 'deal'],
    });

    if (!quote) {
      throw new NotFoundException(`Quote with ID ${id} not found`);
    }

    if (ability && !this.canReadQuote(ability, quote)) {
      throw new ForbiddenException(
        'You do not have permission to access this quote',
      );
    }

    return quote;
  }

  async findOneWithItems(
    id: string,
    ability?: AppAbility,
  ): Promise<Quote & { items: DocumentItem[] }> {
    const quote = await this.findOne(id, ability);

    const items = await this.documentItemRepository.find({
      where: { document_type: 'Quote', document_id: id },
      relations: ['product'],
      order: { created_at: 'ASC' },
    });

    return { ...quote, items };
  }

  private canReadQuote(ability: AppAbility, quote: Quote): boolean {
    return this.abilityScopeService.canAccessRecord(
      ability,
      quote as unknown as Record<string, unknown>,
      {
        action: Action.READ,
        subject: 'Quote',
        conditionKeyMap: QuotesService.QUOTE_CONDITION_KEY_MAP,
      },
    );
  }

  async update(
    id: string,
    dto: UpdateQuoteDto,
    userId: string,
  ): Promise<Quote> {
    const quote = await this.findOne(id);
    const oldValues = { ...quote };

    if (dto.valid_until) {
      (dto as any).valid_until = new Date(dto.valid_until);
    }

    return await this.dataSource.transaction(async (manager) => {
      Object.assign(quote, dto);
      const updatedQuote = await manager.save(Quote, quote);

      // look up the deal and update deal value to match the invoice total
      if (updatedQuote.deal_id) {
        const deal = await manager.findOne(Deal, {
          where: { id: updatedQuote.deal_id },
        });

        if (deal) {
          deal.value = Number(updatedQuote.total);
          await manager.save(Deal, deal);
        }
      }

      await this.activityLogsService.logUpdate(
        'Quote',
        updatedQuote.id,
        oldValues,
        updatedQuote,
        userId,
        `Updated quote: ${updatedQuote.quote_number}`,
      );

      return this.findOne(updatedQuote.id);
    });
  }

  async updateStatus(
    id: string,
    status: QuoteStatus,
    userId: string,
  ): Promise<Quote> {
    const quote = await this.findOne(id);
    const oldStatus = quote.status;

    quote.status = status;
    const updatedQuote = await this.quoteRepository.save(quote);

    await this.activityLogsService.logUpdate(
      'Quote',
      updatedQuote.id,
      { status: oldStatus },
      { status },
      userId,
      `Updated quote ${updatedQuote.quote_number} status from ${oldStatus} to ${status}`,
    );

    if (status === 'Sent') {
      await this.generateAndSendQuote(id, userId);
    }

    return this.findOne(updatedQuote.id);
  }

  private async generateAndSendQuote(
    quoteId: string,
    userId: string,
  ): Promise<void> {
    try {
      const quoteWithItems = await this.findOneWithItems(quoteId);

      // Generate PDF
      const pdfBuffer =
        await this.documentGeneratorService.generateQuotePdf(quoteWithItems);

      // Upload to Vercel Blob
      const fileName = `${quoteWithItems.quote_number}.pdf`;
      const blob = await put(`quotes/${fileName}`, pdfBuffer, {
        access: 'public',
        contentType: 'application/pdf',
      });

      // Save file reference
      await this.fileManagerService.create(
        {
          file_name: fileName,
          file_url: blob.url,
          provider: 'vercel',
          entity_type: 'quote',
          entity_id: quoteId,
          file_type: 'application/pdf',
          file_size: pdfBuffer.length,
        },
        userId,
      );

      const currency = await this.appSettingsService.getSetting('currency');

      // Send email with PDF attachment
      if (quoteWithItems.client_email) {
        const companyName = process.env.COMPANY_NAME || 'DigiLearn';
        const total = Number(quoteWithItems.total).toLocaleString('en-ZA', {
          style: 'currency',
          currency: currency?.value ?? 'USD',
        });

        await this.notificationsService.sendEmailWithTemplate(
          quoteWithItems.client_email,
          `Quotation ${quoteWithItems.quote_number} from ${companyName}`,
          'quote-sent',
          {
            clientName: quoteWithItems.client_name,
            documentNumber: quoteWithItems.quote_number,
            total,
            validUntil: quoteWithItems.valid_until
              ? new Date(quoteWithItems.valid_until).toLocaleDateString()
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
        `Quote ${quoteWithItems.quote_number} PDF generated and sent`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate/send quote ${quoteId}: ${error.message}`,
      );
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    const quote = await this.findOne(id);

    // Delete document items first
    await this.documentItemRepository.delete({
      document_type: 'Quote',
      document_id: id,
    });

    await this.quoteRepository.remove(quote);

    await this.activityLogsService.logDelete(
      'Quote',
      id,
      quote,
      userId,
      `Deleted quote: ${quote.quote_number}`,
    );
  }

  // ========================
  // Item Management
  // ========================

  async addItem(
    quoteId: string,
    dto: CreateQuoteItemDto,
    userId: string,
  ): Promise<Quote & { items: DocumentItem[] }> {
    const quote = await this.findOne(quoteId);

    const calculated = this.calculateItemTotals([dto])[0];

    const item = this.documentItemRepository.create({
      ...calculated,
      document_type: 'Quote',
      document_id: quoteId,
    });

    await this.documentItemRepository.save(item);
    await this.recalculateQuoteTotals(quoteId);

    await this.activityLogsService.logUpdate(
      'Quote',
      quoteId,
      {},
      { added_item: dto.description },
      userId,
      `Added item to quote ${quote.quote_number}: ${dto.description}`,
    );

    return this.findOneWithItems(quoteId);
  }

  async updateItem(
    quoteId: string,
    itemId: string,
    dto: UpdateQuoteItemDto,
    userId: string,
  ): Promise<Quote & { items: DocumentItem[] }> {
    const quote = await this.findOne(quoteId);

    const item = await this.documentItemRepository.findOne({
      where: { id: itemId, document_type: 'Quote', document_id: quoteId },
    });

    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found in quote`);
    }

    Object.assign(item, dto);

    // Recalculate item totals
    const itemSubtotal = Number(item.quantity) * Number(item.unit_price);
    const itemDiscount = Number(item.discount) || 0;
    const itemTaxRate = Number(item.tax_rate) || 0;
    const itemTax = (itemSubtotal - itemDiscount) * (itemTaxRate / 100);
    item.tax = Math.round(itemTax * 100) / 100;
    item.total =
      Math.round((itemSubtotal - itemDiscount + itemTax) * 100) / 100;

    await this.documentItemRepository.save(item);
    await this.recalculateQuoteTotals(quoteId);

    await this.activityLogsService.logUpdate(
      'Quote',
      quoteId,
      {},
      { updated_item: itemId },
      userId,
      `Updated item in quote ${quote.quote_number}`,
    );

    return this.findOneWithItems(quoteId);
  }

  async removeItem(
    quoteId: string,
    itemId: string,
    userId: string,
  ): Promise<Quote & { items: DocumentItem[] }> {
    const quote = await this.findOne(quoteId);

    const item = await this.documentItemRepository.findOne({
      where: { id: itemId, document_type: 'Quote', document_id: quoteId },
    });

    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found in quote`);
    }

    await this.documentItemRepository.remove(item);
    await this.recalculateQuoteTotals(quoteId);

    await this.activityLogsService.logUpdate(
      'Quote',
      quoteId,
      { removed_item: item.description },
      {},
      userId,
      `Removed item from quote ${quote.quote_number}: ${item.description}`,
    );

    return this.findOneWithItems(quoteId);
  }

  // ========================
  // Quote to Invoice Conversion
  // ========================

  async getItemsForConversion(quoteId: string): Promise<DocumentItem[]> {
    return this.documentItemRepository.find({
      where: { document_type: 'Quote', document_id: quoteId },
    });
  }

  // ========================
  // Helper Methods
  // ========================

  private calculateItemTotals(items: CreateQuoteItemDto[]): Array<{
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

  private async recalculateQuoteTotals(quoteId: string): Promise<void> {
    const items = await this.documentItemRepository.find({
      where: { document_type: 'Quote', document_id: quoteId },
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

    await this.quoteRepository.update(quoteId, {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(totalTax * 100) / 100,
      discount: Math.round(totalDiscount * 100) / 100,
      total: Math.round(grandTotal * 100) / 100,
    });
  }

  async generateQuoteNumber(manager?: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `QUO-${year}-`;

    const repo = manager ? manager.getRepository(Quote) : this.quoteRepository;
    const lastQuote = await repo.findOne({
      where: { quote_number: Like(`${prefix}%`) },
      order: { created_at: 'DESC' },
    });

    let nextNumber = 1;
    if (lastQuote) {
      const match = lastQuote.quote_number.match(/QUO-\d{4}-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  // ========================
  // Quote Stats
  // ========================

  async getQuoteStats() {
    const now = new Date();

    // Monthly: start of current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last quarter: start of current quarter
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);

    // Financial year: start of the year to date
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const buildStats = async (start: Date) => {
      const rows = await this.quoteRepository
        .createQueryBuilder('q')
        .select('q.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(q.total), 0)', 'totalValue')
        .where('q.created_at >= :start', { start })
        .groupBy('q.status')
        .getRawMany();

      let total = 0;
      let accepted = 0;
      let rejected = 0;
      let acceptedValue = 0;
      let totalValue = 0;

      for (const row of rows) {
        const count = Number(row.count);
        const value = Number(row.totalValue);
        total += count;
        totalValue += value;
        if (row.status === 'Accepted') {
          accepted = count;
          acceptedValue = value;
        }
        if (row.status === 'Rejected') {
          rejected = count;
        }
      }

      const decided = accepted + rejected;

      return {
        totalQuotes: total,
        totalValue,
        accepted,
        acceptedValue,
        rejected,
        conversionRate:
          decided > 0 ? Math.round((accepted / decided) * 10000) / 100 : 0,
        acceptedRate:
          total > 0 ? Math.round((accepted / total) * 10000) / 100 : 0,
      };
    };

    const [monthly, quarterly, yearly] = await Promise.all([
      buildStats(monthStart),
      buildStats(quarterStart),
      buildStats(yearStart),
    ]);

    return { monthly, quarterly, yearly };
  }
}
