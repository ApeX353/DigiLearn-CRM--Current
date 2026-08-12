import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
  Inject,
  forwardRef,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, DataSource, Like, EntityManager, Not } from 'typeorm';
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
import { LeadsService } from '../leads/leads.service';
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
import { DealsService } from '../deals/deals.service';

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
    // The sales_rep rule is seeded as {"createdBy":"${id}"}. Without these
    // two keys the raw name falls straight through to SQL as
    // `quote.createdBy`, which does not exist — every rep got a 500.
    createdBy: 'owner_id',
    created_by: 'owner_id',
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
    private readonly leadsService: LeadsService,
    private readonly appSettingsService: SettingsService,
    private readonly abilityScopeService: AbilityScopeService,
    // QUOTE6(a): issuing a quote advances its linked deal into the quoting
    // stage. forwardRef breaks the DealsService <-> QuotesService cycle.
    @Inject(forwardRef(() => DealsService))
    private readonly dealsService: DealsService,
  ) {}

  /**
   * QUOTE2: quotes never expired on their own — a quote past its
   * validity date still read as open, so 34 stale quotes (US$397,863)
   * sat in the pipeline forever. This nightly sweep moves any Draft or
   * Sent quote whose valid_until has passed to Expired. Accepted /
   * Rejected quotes are left alone, and quotes with no validity date
   * (QUOTE3) can never expire — they are skipped, not defaulted.
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireOverdueQuotes(): Promise<void> {
    try {
      const result = await this.quoteRepository
        .createQueryBuilder()
        .update(Quote)
        .set({ status: 'Expired' })
        .where('status IN (:...open)', { open: ['Draft', 'Sent'] })
        .andWhere('valid_until IS NOT NULL')
        .andWhere('valid_until < :now', { now: new Date() })
        .execute();
      if (result.affected) {
        this.logger.log(
          `Expired ${result.affected} quote(s) past their validity date`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Quote expiry sweep failed: ${e?.message}`);
    }
  }

  // ========================
  // CRUD Operations
  // ========================

  /**
   * C-03: a rep may only hang finance paperwork on their own deal. A
   * foreign deal id answers 404 — not 403 — so ids cannot be probed.
   * Elevated roles pass scopeUserId=undefined and skip the check.
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

  private async resolveCurrency(
    manager: EntityManager,
    requested?: string,
    dealId?: string,
  ): Promise<string> {
    if (requested) return requested.toUpperCase();
    if (dealId) {
      const deal = await manager.findOne(Deal, { where: { id: dealId } });
      if (deal?.currency) return deal.currency.toUpperCase();
    }
    const setting = await this.appSettingsService.getSetting('currency');
    const configured = String(setting?.value ?? 'USD').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(configured) ? configured : 'USD';
  }

  /**
   * QUOTE1: serialize acceptance by deal, then reject a second Accepted
   * quote. The advisory transaction lock closes the race where two requests
   * both count zero before either one commits.
   */
  private async assertAcceptedQuoteIsUnique(
    manager: EntityManager,
    quoteId: string,
    dealId: string | null,
    status: QuoteStatus,
  ): Promise<void> {
    if (status !== 'Accepted' || !dealId) return;
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [dealId]);
    const existing = await manager.count(Quote, {
      where: {
        deal_id: dealId,
        status: 'Accepted',
        id: Not(quoteId),
      },
    });
    if (existing > 0) {
      throw new ConflictException(
        'This deal already has an Accepted quote. Move that quote out of Accepted before accepting another one.',
      );
    }
  }

  async create(
    dto: CreateQuoteDto,
    userId: string,
    manager?: EntityManager,
    scopeUserId?: string,
  ): Promise<Quote> {
    const run = async (transactionManager: EntityManager) => {
      if (dto.deal_id) {
        await this.assertDealAttachable(
          transactionManager,
          dto.deal_id,
          scopeUserId,
        );
      }
      const quoteNumber = await this.generateQuoteNumber(transactionManager);

      // Calculate totals from items
      const { items: itemDtos, interest, ...quoteData } = dto;
      const calculatedItems = this.calculateItemTotals(itemDtos);
      const totals = this.sumTotals(calculatedItems);
      const currency = await this.resolveCurrency(
        transactionManager,
        dto.currency,
        dto.deal_id,
      );

      // QUOTE3: never leave a quote without a validity date. A null
      // valid_until is skipped by the expiry sweep, so the quote can never
      // lapse and sits in a blind spot forever (17 of 67 live quotes were
      // like this). Default to 30 days from issue when the caller doesn't
      // supply one — a standard quote validity; change QUOTE_VALIDITY_DAYS
      // if the business wants a different window.
      const QUOTE_VALIDITY_DAYS = 30;
      let validUntil: Date;
      if (dto.valid_until) {
        validUntil = new Date(dto.valid_until);
      } else {
        validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + QUOTE_VALIDITY_DAYS);
      }

      const quote = transactionManager.create(Quote, {
        ...quoteData,
        quote_number: quoteNumber,
        owner_id: userId,
        valid_until: validUntil,
        currency,
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

        // QUOTE6(a): issuing a quote advances the linked deal into the
        // pipeline's quoting stage (forward-only, idempotent — a no-op when
        // the deal is already at/past quoting or the pipeline has no such
        // stage). Runs in this transaction so quote + advance commit
        // together.
        await this.dealsService.advanceDealToQuotingStage(
          transactionManager,
          savedQuote.deal_id,
          userId,
        );
      } else {
        // QUOTE6(c): the quote carries no deal. If it resolves to a lead
        // that has no deal yet, auto-create one (owner decision), link the
        // quote to it, advance it to the quoting stage and flip the lead to
        // Converted. All within this transaction so quote + deal + lead
        // conversion commit atomically. When no single lead can be resolved
        // (a pure standalone quote), autoCreateDealForQuotedLead returns
        // null and this is a no-op — we never invent a lead. When the
        // resolved lead already has a deal, that existing deal is returned
        // (no duplicate) and the quote is simply linked to it.
        const autoDeal = await this.dealsService.autoCreateDealForQuotedLead(
          transactionManager,
          {
            schoolId: savedQuote.school_id,
            personId: savedQuote.person_id,
            value: Number(savedQuote.total),
            currency: savedQuote.currency ?? currency,
            actorId: userId,
          },
        );

        if (autoDeal) {
          savedQuote.deal_id = autoDeal.id;
          await transactionManager.save(Quote, savedQuote);

          await this.dealsService.advanceDealToQuotingStage(
            transactionManager,
            autoDeal.id,
            userId,
          );
        }
      }

      await this.activityLogsService.logCreate(
        'Quote',
        savedQuote.id,
        savedQuote,
        userId,
        `Created quote: ${savedQuote.quote_number}`,
      );

      // Commercial intent: a quote moves the deal to Quote Submitted
      // (auto-converting the school's lead when no deal exists yet) and
      // files itself on the deal. Same transaction — all or nothing.
      const intentDealId = await this.leadsService.registerCommercialIntent(
        transactionManager,
        {
          schoolId: savedQuote.school_id,
          dealId: savedQuote.deal_id,
          documentType: 'quote',
          documentId: savedQuote.id,
          documentNumber: savedQuote.quote_number,
          total: Number(savedQuote.total),
          currency: savedQuote.currency ?? currency,
          userId,
        },
      );
      // A quote created straight from a lead page carries no deal_id;
      // link it to the deal it just caused so the paper trail is whole.
      if (intentDealId && !savedQuote.deal_id) {
        savedQuote.deal_id = intentDealId;
        await transactionManager.save(Quote, savedQuote);
      }

      await this.assertAcceptedQuoteIsUnique(
        transactionManager,
        savedQuote.id,
        savedQuote.deal_id,
        savedQuote.status,
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

  /**
   * QUOTE6(b): re-issue a quote. Produces a FRESH quote (new quote number,
   * new validity window, status Draft) copied from an existing one —
   * line items, client snapshot, notes/terms and payment term are all
   * carried over. Nothing about the source quote or its deal changes; an
   * expired quote simply gets a clean successor to send again.
   *
   * This is the deliberate alternative to auto-marking a deal Lost on
   * expiry: expiry only flips the quote to Expired (see
   * `expireOverdueQuotes`), and a human re-issues when they want to.
   *
   * Any status can be re-issued (the UI surfaces it for Expired quotes),
   * so a lapsed quote is never a dead end. Reuses `create()`, so the new
   * quote also advances the linked deal via QUOTE6(a).
   */
  async reissue(
    sourceId: string,
    userId: string,
    scopeUserId?: string,
  ): Promise<Quote> {
    const source = await this.quoteRepository.findOne({
      where: { id: sourceId },
    });
    if (!source) {
      throw new NotFoundException(`Quote with ID ${sourceId} not found`);
    }

    // A rep may only re-issue their own quote; a foreign id answers 404 so
    // ids cannot be probed (mirrors assertDealAttachable).
    if (scopeUserId && source.owner_id !== scopeUserId) {
      throw new NotFoundException(`Quote with ID ${sourceId} not found`);
    }

    const sourceItems = await this.documentItemRepository.find({
      where: { document_type: 'Quote', document_id: sourceId },
      order: { created_at: 'ASC' },
    });

    const items: CreateQuoteItemDto[] = sourceItems.map((item) => ({
      product_id: item.product_id ?? undefined,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      discount: item.discount != null ? Number(item.discount) : undefined,
      tax_rate: item.tax_rate != null ? Number(item.tax_rate) : undefined,
    }));

    const dto: CreateQuoteDto = {
      person_id: source.person_id ?? undefined,
      deal_id: source.deal_id ?? undefined,
      school_id: source.school_id,
      client_name: source.client_name,
      client_email: source.client_email ?? undefined,
      client_address: source.client_address ?? undefined,
      status: 'Draft',
      // Omit valid_until so create() stamps a fresh QUOTE_VALIDITY_DAYS
      // window from today — the whole point of a re-issue.
      valid_until: undefined,
      notes: source.notes ?? undefined,
      currency: source.currency ?? undefined,
      po_received: false,
      payment_term_id: source.payment_term_id ?? undefined,
      items,
    };

    const newQuote = await this.create(dto, userId, undefined, scopeUserId);

    await this.activityLogsService.logCreate(
      'Quote',
      newQuote.id,
      newQuote,
      userId,
      `Re-issued quote ${newQuote.quote_number} from ${source.quote_number}`,
    );

    return newQuote;
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
    scopeUserId?: string,
  ): Promise<Quote> {
    const quote = await this.findOne(id);
    const oldValues = { ...quote };

    if (dto.valid_until) {
      (dto as any).valid_until = new Date(dto.valid_until);
    }

    return await this.dataSource.transaction(async (manager) => {
      // C-03: the guard has authorized the quote itself, but the body can
      // still re-point deal_id at somebody else's deal — whose value this
      // method then rewrites. Check before assigning.
      if (dto.deal_id && dto.deal_id !== quote.deal_id) {
        await this.assertDealAttachable(manager, dto.deal_id, scopeUserId);
      }
      Object.assign(quote, dto);
      if (dto.currency) quote.currency = dto.currency.toUpperCase();

      // QUOTE1: editing an Accepted quote's content without re-affirming its
      // status invalidates the acceptance — the customer accepted different
      // terms. Drop it back to Draft (and clear po_received) so the UI stops
      // showing "Accepted" on a document that no longer matches. A caller
      // that explicitly sends `status` (e.g. the status dropdown) is honoured
      // as-is and never overridden here.
      if (dto.status === undefined && oldValues.status === 'Accepted') {
        quote.status = 'Draft';
        quote.po_received = false;
      }

      await this.assertAcceptedQuoteIsUnique(
        manager,
        quote.id,
        quote.deal_id,
        quote.status,
      );

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
    const { updatedQuote, oldStatus } = await this.dataSource.transaction(
      async (manager) => {
        const quote = await manager.findOne(Quote, { where: { id } });
        if (!quote) {
          throw new NotFoundException(`Quote with ID ${id} not found`);
        }
        const previous = quote.status;
        await this.assertAcceptedQuoteIsUnique(
          manager,
          quote.id,
          quote.deal_id,
          status,
        );
        quote.status = status;
        return { updatedQuote: await manager.save(Quote, quote), oldStatus: previous };
      },
    );

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

  /**
   * Generate the quote PDF in-process and return the raw bytes — no Vercel
   * Blob involved. Used by the download endpoint so quotes are downloadable
   * even when Blob storage is not configured.
   */
  async getPdf(
    id: string,
    ability?: AppAbility,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const quote = await this.findOneWithItems(id, ability);
    if (!quote) {
      throw new NotFoundException(`Quote with ID ${id} not found`);
    }
    const buffer =
      await this.documentGeneratorService.generateQuotePdf(quote);
    return { buffer, fileName: `${quote.quote_number}.pdf` };
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

  /**
   * QUOTE1: an "Accepted" quote records terms the customer signed off on.
   * The moment those terms change — a line item added/edited/removed, or the
   * quote otherwise edited — the acceptance no longer describes the document,
   * so the quote must drop back to Draft. Without this the UI kept showing
   * "Accepted" on a quote whose contents had since changed.
   *
   * Only Accepted is rolled back; Draft / Sent / Rejected / Expired are left
   * as-is. `po_received` is cleared alongside it — it is meaningful only for
   * an accepted quote, and leaving it set on a Draft is contradictory.
   */
  private async revertAcceptanceOnEdit(
    quoteId: string,
    userId: string,
  ): Promise<void> {
    const quote = await this.quoteRepository.findOne({
      where: { id: quoteId },
    });
    if (!quote || quote.status !== 'Accepted') return;

    await this.quoteRepository.update(quoteId, {
      status: 'Draft',
      po_received: false,
    });

    await this.activityLogsService.logUpdate(
      'Quote',
      quoteId,
      { status: 'Accepted' },
      { status: 'Draft' },
      userId,
      `Quote ${quote.quote_number} reverted to Draft after its contents were edited`,
    );
  }

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
    // QUOTE1: adding an item changes the quote's terms — drop it out of Accepted.
    await this.revertAcceptanceOnEdit(quoteId, userId);

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
    // QUOTE1: editing an item changes the quote's terms — drop it out of Accepted.
    await this.revertAcceptanceOnEdit(quoteId, userId);

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
    // QUOTE1: removing an item changes the quote's terms — drop it out of Accepted.
    await this.revertAcceptanceOnEdit(quoteId, userId);

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

  /**
   * AUD-H11: MAX of the numeric part under an advisory lock — "newest by
   * created_at" both loses to out-of-order history and collides inside a
   * transaction, where Postgres freezes now() (see the invoice generator).
   */
  async generateQuoteNumber(manager?: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `QUO-${year}-`;

    const conn = manager ?? this.quoteRepository.manager;
    if (manager) {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('quote_number'))",
      );
    }
    const rows: Array<{ max: number | null }> = await conn.query(
      `SELECT MAX((substring(quote_number from '(\\d+)$'))::int) AS max
         FROM quotes WHERE quote_number LIKE $1`,
      [`${prefix}%`],
    );
    const nextNumber = Number(rows[0]?.max ?? 0) + 1;

    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  // ========================
  // Quote Stats
  // ========================

  /**
   * @param scopeUserId When set (sales reps), the KPIs are computed over
   *   the rep's own quotes only, matching what their list shows (C-03:
   *   the read rule is owner-scoped, so the stats must be too).
   */
  async getQuoteStats(scopeUserId?: string) {
    const now = new Date();

    // Monthly: start of current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last quarter: start of current quarter
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);

    // Financial year: start of the year to date
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const buildStats = async (start: Date) => {
      const qb = this.quoteRepository
        .createQueryBuilder('q')
        .select('q.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(q.total), 0)', 'totalValue')
        .where('q.created_at >= :start', { start })
        .groupBy('q.status');
      if (scopeUserId) {
        qb.andWhere('q.owner_id = :scopeUserId', { scopeUserId });
      }
      const rows = await qb.getRawMany();

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
