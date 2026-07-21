import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, ILike } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import { Deal, DealCloseStatus } from './entities/deal.entity';
import { DealStageHistory } from './entities/deal-stage-history.entity';
import {
  DealRollbackRequest,
  type DealRollbackRequestStatus,
} from './entities/deal-rollback-request.entity';
import { DealCompetitor } from './entities/deal-competitor.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { Pipeline } from '../pipelines/entities/pipeline.entity';
import { Lead } from '../leads/entities/lead.entity';
import { School } from '../schools/entities/schools.entity';
import { User } from '../users/entities/user.entity';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { CloseDealDto } from './dto/close-deal.dto';
import { BulkUpdateDealDto } from './dto/bulk-update-deal.dto';
import { CreateDealRollbackRequestDto } from './dto/create-deal-rollback-request.dto';
import { QueryDealRollbackRequestsDto } from './dto/query-deal-rollback-requests.dto';
import { ReviewDealRollbackRequestDto } from './dto/review-deal-rollback-request.dto';
import { UpdateDealStageDto } from './dto/update-deal-stage.dto';
import { AddAssigneeDto } from './dto/add-assignee.dto';
import { QueryArchivedDealsDto } from './dto/query-archived-deals.dto';
import { QuotesService } from '../quotes/quotes.service';
import { DealHealthCalculationService } from './deal-health-calculation.service';
import { QueryDealsDto } from './dto/query-deals';
import { Invoice } from '../invoices/entities/invoice.entity';

@Injectable()
export class DealsService {
  constructor(
    @InjectRepository(Deal)
    private dealRepository: Repository<Deal>,
    @InjectRepository(DealStageHistory)
    private dealStageHistoryRepository: Repository<DealStageHistory>,
    @InjectRepository(DealRollbackRequest)
    private dealRollbackRequestRepository: Repository<DealRollbackRequest>,
    @InjectRepository(DealCompetitor)
    private dealCompetitorRepository: Repository<DealCompetitor>,
    @InjectRepository(Stage)
    private stageRepository: Repository<Stage>,
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
    @InjectRepository(School)
    private schoolRepository: Repository<School>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private activityLogsService: ActivityLogsService,
    private quotesService: QuotesService,
    private dealHealthCalculationService: DealHealthCalculationService,
  ) {}

  /* ========================================
     1. CREATE DEAL (Transactional)
  ======================================== */

  async createDeal(dto: CreateDealDto, userId: string): Promise<Deal> {
    // Validate lead exists and is not already converted
    const lead = await this.leadRepository.findOne({
      where: { id: dto.lead_id },
      relations: ['primary_contact', 'stakeholders', 'stakeholders.contact'],
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status === 'Converted') {
      throw new ConflictException('Lead has already been converted to a deal');
    }

    // Validate school
    const school = await this.schoolRepository.findOne({
      where: { id: dto.school_id },
    });
    if (!school) throw new NotFoundException('School not found');

    // Validate stage belongs to pipeline
    const stage = await this.stageRepository.findOne({
      where: { id: dto.stage_id, pipeline_id: dto.pipeline_id },
    });
    if (!stage) {
      throw new BadRequestException(
        'Stage not found or does not belong to the specified pipeline',
      );
    }

    // Validate pipeline
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: dto.pipeline_id },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    // Validate assignee if provided
    if (dto.assigned_to) {
      const assignee = await this.userRepository.findOne({
        where: { id: dto.assigned_to },
      });
      if (!assignee) throw new NotFoundException('Assigned user not found');
    }

    // Calculate position (max position in stage + 1000)
    const maxPositionResult = await this.dealRepository
      .createQueryBuilder('deal')
      .select('MAX(deal.position)', 'maxPos')
      .where('deal.current_stage_id = :stageId', { stageId: dto.stage_id })
      .getRawOne();
    const position = (maxPositionResult?.maxPos ?? 0) + 1000;

    const dealId = uuidv4();

    await this.dataSource.transaction(async (manager) => {
      // Create deal
      const deal = manager.create(Deal, {
        id: dealId,
        title: dto.title,
        description: dto.description,
        value: dto.value,
        currency: dto.currency || 'USD',
        lead_id: dto.lead_id,
        school_id: dto.school_id,
        current_stage_id: dto.stage_id,
        pipeline_id: dto.pipeline_id,
        assigned_to: dto.assigned_to || null,
        currentStatus: stage.name,
        currentStageSince: new Date(),
        probability: Number(stage.probability),
        position,
        expectedCloseDate: dto.expected_close_date
          ? new Date(dto.expected_close_date)
          : undefined,
        closeStatus: DealCloseStatus.ONGOING,
      });
      await manager.save(Deal, deal);

      // Create initial stage history
      const history = manager.create(DealStageHistory, {
        id: uuidv4(),
        dealId: dealId,
        fromStatus: undefined,
        toStatus: stage.name,
        movedAt: new Date(),
        movedBy: userId,
        slaCompliant: true,
        notes: 'Deal created',
      });
      await manager.save(DealStageHistory, history);

      // Create competitors if provided
      if (dto.competitors?.length) {
        const competitors = dto.competitors.map((c) =>
          manager.create(DealCompetitor, {
            id: uuidv4(),
            deal_id: dealId,
            name: c.name,
            strengths: c.strengths,
            weaknesses: c.weaknesses,
            price: c.price,
            threat_level: c.threat_level,
            notes: c.notes,
          }),
        );
        await manager.save(DealCompetitor, competitors);
      }

      // Mark lead as converted
      await manager.update(Lead, dto.lead_id, {
        status: 'Converted' as any,
        converted_at: new Date(),
      });

      if (dto?.items && dto.items.length > 0) {
        const quote = await this.quotesService.create(
          {
            deal_id: deal.id,
            items: dto.items,
            person_id: lead?.primary_contact?.id ?? '',
            school_id: school.id,
            client_name: `${lead.primary_contact?.first_name} ${lead.primary_contact?.last_name}`,
            client_email: lead.primary_contact?.email ?? '',
            status: 'Draft',
            valid_until: addDays(new Date(), 14).toISOString(),
            po_received: false,
            payment_term_id: dto.payment_term_id,
            interest: dto.interest,
          },
          userId,
          manager,
        );

        // Use quote total as the deal value
        await manager.update(Deal, dealId, { value: quote.total });
      }
    });

    // Activity log
    await this.activityLogsService.logCreate(
      'deal',
      dealId,
      { title: dto.title, value: dto.value, pipeline: pipeline.name },
      userId,
      `Created deal "${dto.title}" from lead "${lead.lead_name}"`,
    );

    return this.findDealDetails(dealId);
  }

  /* ========================================
     2. FIND DEAL DETAILS
  ======================================== */

  async findDealDetails(id: string): Promise<Deal> {
    const deal = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.school', 'school')
      .leftJoinAndSelect('deal.lead', 'lead')
      .leftJoinAndSelect('lead.primary_contact', 'primary_contact')
      .leftJoinAndSelect('lead.stakeholders', 'stakeholders')
      .leftJoinAndSelect('stakeholders.contact', 'stakeholder_contact')
      .leftJoinAndSelect('deal.assigned_user', 'assigned_user')
      .leftJoinAndSelect('deal.current_stage', 'current_stage')
      .leftJoinAndSelect('deal.pipeline', 'pipeline')
      .leftJoinAndSelect('deal.stageHistory', 'stageHistory')
      .leftJoinAndSelect('stageHistory.moved_by', 'history_user')
      .leftJoinAndSelect('deal.competitors', 'competitors')
      .leftJoinAndSelect('deal.quotes', 'quotes')
      .leftJoinAndSelect('deal.invoices', 'invoices')
      .leftJoinAndSelect('deal.activities', 'activities')
      .where('deal.id = :id', { id })
      .orderBy('stageHistory.movedAt', 'DESC')
      .getOne();

    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  /* ========================================
     3. FIND PIPELINE DEALS
  ======================================== */

  async findPipelineDeals(pipelineId: string, {
    status,
    search,
    assigned_to,
  }: {
    status?: DealCloseStatus;
    search?: string
    assigned_to?: string;
  } = {}): Promise<Deal[]> {
    return this.dealRepository.find({
      where: {
        pipeline_id: pipelineId,
        closeStatus: DealCloseStatus.ONGOING,
        ...(status && { status }),
        ...(search && { title: ILike(`%${search}%`) }),
        ...(assigned_to && { assigned_to }),
      },
      relations: ['current_stage', 'assigned_user', 'school'],
      order: { position: 'ASC' },
    });
  }

  async getPipelineSummary(pipelineId: string): Promise<{
    pipeline_id: string;
    total_deals: number;
    pipeline_value: number;
    deals_with_overdue_invoices: number;
    avg_deal_health: number;
  }> {
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId },
    });
    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    const dealTotals = await this.dealRepository
      .createQueryBuilder('deal')
      .select('COUNT(deal.id)', 'totalDeals')
      .addSelect('COALESCE(SUM(deal.value), 0)', 'pipelineValue')
      .addSelect('COALESCE(AVG(deal.health_score), 0)', 'avgDealHealth')
      .where('deal.pipeline_id = :pipelineId', { pipelineId })
      .andWhere('deal.close_status = :ongoingStatus', {
        ongoingStatus: DealCloseStatus.ONGOING,
      })
      .getRawOne<{
        totalDeals: string;
        pipelineValue: string;
        avgDealHealth: string;
      }>();

    const overdueDeals = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(DISTINCT deal.id)', 'overdueDeals')
      .from(Deal, 'deal')
      .innerJoin(Invoice, 'invoice', 'invoice.deal_id = deal.id')
      .where('deal.pipeline_id = :pipelineId', { pipelineId })
      .andWhere('deal.close_status = :ongoingStatus', {
        ongoingStatus: DealCloseStatus.ONGOING,
      })
      .andWhere('invoice.parent_invoice_id IS NULL')
      .andWhere('invoice.payment_status != :paidStatus', { paidStatus: 'Paid' })
      .andWhere('invoice.status != :cancelledStatus', {
        cancelledStatus: 'Cancelled',
      })
      .andWhere('COALESCE(invoice.grace_due_date, invoice.due_date) < NOW()')
      .getRawOne<{ overdueDeals: string }>();

    const totalDeals = Number(dealTotals?.totalDeals ?? 0);
    const pipelineValue = Number(dealTotals?.pipelineValue ?? 0);
    const avgDealHealth = Number(dealTotals?.avgDealHealth ?? 0);
    const dealsWithOverdueInvoices = Number(overdueDeals?.overdueDeals ?? 0);

    return {
      pipeline_id: pipelineId,
      total_deals: totalDeals,
      pipeline_value: Number(pipelineValue.toFixed(2)),
      deals_with_overdue_invoices: dealsWithOverdueInvoices,
      avg_deal_health: Number(avgDealHealth.toFixed(2)),
    };
  }

  /* ========================================
     4. UPDATE DEAL
  ======================================== */

  async update(id: string, dto: UpdateDealDto, userId: string): Promise<Deal> {
    const deal = await this.dealRepository.findOne({
      where: { id },
      relations: ['current_stage'],
    });
    if (!deal) throw new NotFoundException('Deal not found');

    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    // If stage_id changes, handle SLA tracking in transaction
    if (dto.stage_id && dto.stage_id !== deal.current_stage_id) {
      const newStage = await this.stageRepository.findOne({
        where: { id: dto.stage_id, pipeline_id: deal.pipeline_id },
      });
      if (!newStage) throw new NotFoundException('Target stage not found');

      this.ensureBackwardStageMoveAllowed(deal, newStage);

      await this.dataSource.transaction(async (manager) => {
        const transitionUpdate = await this.buildStageTransitionUpdatePayload(
          manager,
          {
            deal,
            targetStage: newStage,
            actorId: userId,
            position: dto.position,
          },
        );

        oldValues.stage = deal.currentStatus;
        newValues.stage = newStage.name;

        await manager.update(Deal, id, transitionUpdate);
      });
    }

    // Apply remaining field updates
    const updatePayload: Partial<Deal> = {};
    if (dto.title !== undefined) {
      oldValues.title = deal.title;
      newValues.title = dto.title;
      updatePayload.title = dto.title;
    }
    if (dto.description !== undefined) {
      oldValues.description = deal.description;
      newValues.description = dto.description;
      updatePayload.description = dto.description;
    }
    if (dto.value !== undefined) {
      oldValues.value = deal.value;
      newValues.value = dto.value;
      updatePayload.value = dto.value;
    }
    if (dto.currency !== undefined) {
      oldValues.currency = deal.currency;
      newValues.currency = dto.currency;
      updatePayload.currency = dto.currency;
    }
    if (dto.probability !== undefined && !dto.stage_id) {
      oldValues.probability = deal.probability;
      newValues.probability = dto.probability;
      updatePayload.probability = dto.probability;
    }
    if (dto.position !== undefined && !dto.stage_id) {
      oldValues.position = deal.position;
      newValues.position = dto.position;
      updatePayload.position = dto.position;
    }
    if (dto.expected_close_date !== undefined) {
      oldValues.expected_close_date = deal.expectedCloseDate;
      newValues.expected_close_date = dto.expected_close_date;
      updatePayload.expectedCloseDate = new Date(dto.expected_close_date);
    }

    if (Object.keys(updatePayload).length > 0) {
      await this.dealRepository.update(id, updatePayload);
    }

    // Activity log
    if (Object.keys(newValues).length > 0) {
      await this.activityLogsService.logUpdate(
        'deal',
        id,
        oldValues,
        newValues,
        userId,
        `Updated deal "${deal.title}"`,
      );
    }

    return this.findDealDetails(id);
  }

  /* ========================================
     5. CLOSE DEAL
  ======================================== */

  async closeDeal(
    id: string,
    dto: CloseDealDto,
    userId: string,
  ): Promise<Deal> {
    const deal = await this.dealRepository.findOne({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');

    if (deal.closeStatus !== DealCloseStatus.ONGOING) {
      throw new BadRequestException(
        `Deal is already closed as "${deal.closeStatus}"`,
      );
    }

    if (dto.close_status === DealCloseStatus.LOST && !dto.lost_reason) {
      throw new BadRequestException(
        'A lost reason is required when closing a deal as lost',
      );
    }

    await this.dealRepository.update(id, {
      closeStatus: dto.close_status,
      actualCloseDate: new Date(),
      lostReason:
        dto.close_status === DealCloseStatus.LOST ? dto.lost_reason : undefined,
    });

    await this.activityLogsService.logUpdate(
      'deal',
      id,
      { closeStatus: DealCloseStatus.ONGOING },
      {
        closeStatus: dto.close_status,
        lostReason: dto.lost_reason,
      },
      userId,
      `Closed deal "${deal.title}" as ${dto.close_status}`,
    );

    return this.findDealDetails(id);
  }

  /* ========================================
     6. ADD ASSIGNEE
  ======================================== */

  async addAssignee(
    dealId: string,
    dto: AddAssigneeDto,
    userId: string,
  ): Promise<Deal> {
    const deal = await this.dealRepository.findOne({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Deal not found');

    const assignee = await this.userRepository.findOne({
      where: { id: dto.user_id },
    });
    if (!assignee) throw new NotFoundException('User not found');

    const oldAssignedTo = deal.assigned_to;
    await this.dealRepository.update(dealId, {
      assigned_to: dto.user_id,
    });

    await this.activityLogsService.logUpdate(
      'deal',
      dealId,
      { assigned_to: oldAssignedTo },
      { assigned_to: dto.user_id },
      userId,
      `Assigned "${assignee.first_name} ${assignee.last_name}" to deal "${deal.title}"`,
    );

    return this.findDealDetails(dealId);
  }

  async createRollbackRequest(
    dealId: string,
    dto: CreateDealRollbackRequestDto,
    userId: string,
  ): Promise<DealRollbackRequest> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId },
      relations: ['current_stage'],
    });
    if (!deal) throw new NotFoundException('Deal not found');

    const targetStage = await this.stageRepository.findOne({
      where: { id: dto.to_stage_id, pipeline_id: deal.pipeline_id },
    });
    if (!targetStage) throw new NotFoundException('Target stage not found');

    if (targetStage.id === deal.current_stage_id) {
      throw new BadRequestException('Deal is already in this stage');
    }

    if (!this.isBackwardStageMove(deal.current_stage, targetStage)) {
      throw new BadRequestException(
        'Rollback requests can only target an earlier pipeline stage',
      );
    }

    const existingPendingRequest = await this.dealRollbackRequestRepository.findOne({
      where: {
        deal_id: dealId,
        status: 'pending',
      },
    });

    if (existingPendingRequest) {
      throw new ConflictException(
        'A pending rollback request already exists for this deal',
      );
    }

    const rollbackRequest = this.dealRollbackRequestRepository.create({
      deal_id: dealId,
      from_stage_id: deal.current_stage_id,
      to_stage_id: targetStage.id,
      reason: dto.reason.trim(),
      status: 'pending',
      requested_by_id: userId,
      approved_by_id: null,
      rejected_by_id: null,
      approved_at: null,
      rejected_at: null,
      review_note: null,
    });

    const savedRequest =
      await this.dealRollbackRequestRepository.save(rollbackRequest);

    await this.activityLogsService.logCreate(
      'deal',
      dealId,
      {
        rollback_request: {
          id: savedRequest.id,
          from_stage_id: savedRequest.from_stage_id,
          to_stage_id: savedRequest.to_stage_id,
          status: savedRequest.status,
        },
      },
      userId,
      `Submitted rollback request for deal "${deal.title}"`,
    );

    return this.findRollbackRequestById(savedRequest.id);
  }

  async findRollbackRequestsByDeal(
    dealId: string,
    status?: DealRollbackRequestStatus,
  ): Promise<DealRollbackRequest[]> {
    const queryBuilder = this.dealRollbackRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.deal', 'deal')
      .leftJoinAndSelect('request.requested_by', 'requested_by')
      .leftJoinAndSelect('request.approved_by', 'approved_by')
      .leftJoinAndSelect('request.rejected_by', 'rejected_by')
      .leftJoinAndSelect('request.from_stage', 'from_stage')
      .leftJoinAndSelect('request.to_stage', 'to_stage')
      .where('request.deal_id = :dealId', { dealId });

    if (status) {
      queryBuilder.andWhere('request.status = :status', { status });
    }

    return queryBuilder.orderBy('request.requested_at', 'DESC').getMany();
  }

  async findRollbackRequests(
    query: QueryDealRollbackRequestsDto,
  ): Promise<DealRollbackRequest[]> {
    const queryBuilder = this.dealRollbackRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.deal', 'deal')
      .leftJoinAndSelect('request.requested_by', 'requested_by')
      .leftJoinAndSelect('request.approved_by', 'approved_by')
      .leftJoinAndSelect('request.rejected_by', 'rejected_by')
      .leftJoinAndSelect('request.from_stage', 'from_stage')
      .leftJoinAndSelect('request.to_stage', 'to_stage');

    if (query.status) {
      queryBuilder.andWhere('request.status = :status', {
        status: query.status,
      });
    }

    if (query.pipeline_id) {
      queryBuilder.andWhere('deal.pipeline_id = :pipelineId', {
        pipelineId: query.pipeline_id,
      });
    }

    return queryBuilder.orderBy('request.requested_at', 'DESC').getMany();
  }

  async findRollbackRequestById(id: string): Promise<DealRollbackRequest> {
    const rollbackRequest = await this.dealRollbackRequestRepository.findOne({
      where: { id },
      relations: [
        'deal',
        'requested_by',
        'approved_by',
        'rejected_by',
        'from_stage',
        'to_stage',
      ],
    });

    if (!rollbackRequest) {
      throw new NotFoundException(`Rollback request with ID ${id} not found`);
    }

    return rollbackRequest;
  }

  async reviewRollbackRequest(
    id: string,
    dto: ReviewDealRollbackRequestDto,
    userId: string,
  ): Promise<DealRollbackRequest> {
    const existingRequest = await this.findRollbackRequestById(id);

    if (existingRequest.status !== 'pending') {
      throw new BadRequestException(
        `Rollback request has already been ${existingRequest.status}`,
      );
    }

    if (dto.decision === 'approved') {
      await this.dataSource.transaction(async (manager) => {
        const rollbackRequestRepository = manager.getRepository(
          DealRollbackRequest,
        );
        const request = await rollbackRequestRepository.findOne({
          where: { id },
        });

        if (!request) {
          throw new NotFoundException(`Rollback request with ID ${id} not found`);
        }

        if (request.status !== 'pending') {
          throw new BadRequestException(
            `Rollback request has already been ${request.status}`,
          );
        }

        const deal = await manager.findOne(Deal, {
          where: { id: request.deal_id },
          relations: ['current_stage'],
        });
        if (!deal) throw new NotFoundException('Deal not found');

        if (deal.current_stage_id !== request.from_stage_id) {
          throw new ConflictException(
            'Deal stage has changed since this rollback was requested. Please submit a new rollback request.',
          );
        }

        const targetStage = await manager.findOne(Stage, {
          where: { id: request.to_stage_id, pipeline_id: deal.pipeline_id },
        });
        if (!targetStage) throw new NotFoundException('Target stage not found');

        if (!this.isBackwardStageMove(deal.current_stage, targetStage)) {
          throw new BadRequestException(
            'Rollback target is no longer earlier than the current stage',
          );
        }

        const transitionUpdate = await this.buildStageTransitionUpdatePayload(
          manager,
          {
            deal,
            targetStage,
            actorId: userId,
            incrementRollbackCount: true,
            notes: `Approved rollback request: ${request.reason}`,
          },
        );

        await manager.update(Deal, deal.id, transitionUpdate);

        request.status = 'approved';
        request.approved_by_id = userId;
        request.approved_at = new Date();
        request.rejected_by_id = null;
        request.rejected_at = null;
        request.review_note = dto.review_note?.trim() || null;

        await rollbackRequestRepository.save(request);
      });

      await this.activityLogsService.logUpdate(
        'deal',
        existingRequest.deal_id,
        {
          rollback_request_status: 'pending',
          stage: existingRequest.from_stage?.name,
        },
        {
          rollback_request_status: 'approved',
          stage: existingRequest.to_stage?.name,
        },
        userId,
        `Approved rollback request for deal "${existingRequest.deal?.title ?? existingRequest.deal_id}"`,
      );
    } else {
      existingRequest.status = 'rejected';
      existingRequest.rejected_by_id = userId;
      existingRequest.rejected_at = new Date();
      existingRequest.review_note = dto.review_note?.trim() || null;

      await this.dealRollbackRequestRepository.save(existingRequest);

      await this.activityLogsService.logUpdate(
        'deal',
        existingRequest.deal_id,
        { rollback_request_status: 'pending' },
        { rollback_request_status: 'rejected' },
        userId,
        `Rejected rollback request for deal "${existingRequest.deal?.title ?? existingRequest.deal_id}"`,
      );
    }

    return this.findRollbackRequestById(id);
  }

  /* ========================================
     7. BULK UPDATE (Transactional)
  ======================================== */

  async bulkUpdate(dto: BulkUpdateDealDto, user: any): Promise<Deal[]> {
    if (!dto.deals?.length) {
      return [];
    }

    const dealIds = dto.deals.map((d) => d.id);
    const dealsToUpdate = await this.dealRepository.find({
      where: { id: In(dealIds) },
      select: ['id', 'assigned_to'],
    });

    if (!dealsToUpdate.length) {
      return [];
    }

    const actorId = typeof user === 'string' ? user : user?.id;
    const roleNames = this.extractRoleNames(user);
    const isAdmin = roleNames.includes('admin');
    const isSalesManager =
      roleNames.includes('sales_manager') ||
      roleNames.includes('sales-manager');
    const isAssigned = dealsToUpdate.some(
      (deal) => deal.assigned_to === actorId,
    );

    if (!isAdmin && !isSalesManager && !isAssigned) {
      throw new ForbiddenException('Not authorized to update this deal');
    }

    const logEntries = new Map<
      string,
      {
        id: string;
        oldValues: Record<string, any>;
        newValues: Record<string, any>;
        summary: string;
      }
    >();

    await this.dataSource.transaction(async (manager) => {
      for (const item of dto.deals) {
        const deal = await manager.findOne(Deal, {
          where: { id: item.id },
          relations: ['current_stage'],
        });
        if (!deal) {
          throw new BadRequestException(`Deal not found: ${item.id}`);
        }

        const updatePayload: Partial<Deal> = {};

        if (item.position !== undefined) {
          updatePayload.position = item.position;
        }

        const targetStage = await this.resolveTargetStageForDeal(
          manager,
          deal,
          item,
        );

        if (targetStage && targetStage.id !== deal.current_stage_id) {
          this.ensureBackwardStageMoveAllowed(deal, targetStage);

          const transitionUpdate = await this.buildStageTransitionUpdatePayload(
            manager,
            {
              deal,
              targetStage,
              actorId,
              position: item.position,
            },
          );

          Object.assign(updatePayload, transitionUpdate);
        }

        if (Object.keys(updatePayload).length > 0) {
          const oldSnapshot = this.buildDealSnapshot(deal);
          const newSnapshot = this.buildDealSnapshot(deal, updatePayload);

          await manager.update(Deal, item.id, updatePayload);

          await this.dealHealthCalculationService.calculateDealHealth({
            dealId: item.id,
            userId: actorId,
            manager,
          });

          const oldValues: Record<string, any> = { snapshot: oldSnapshot };
          const newValues: Record<string, any> = { snapshot: newSnapshot };

          if (updatePayload.position !== undefined) {
            oldValues.position = deal.position;
            newValues.position = updatePayload.position;
          }

          if (targetStage && targetStage.id !== deal.current_stage_id) {
            oldValues.stage_id = deal.current_stage_id;
            oldValues.status = deal.currentStatus;
            oldValues.probability = deal.probability;
            oldValues.currentStageSince = deal.currentStageSince?.toISOString();

            newValues.stage_id = targetStage.id;
            newValues.status = targetStage.name;
            newValues.probability = Number(targetStage.probability);
            newValues.currentStageSince = updatePayload.currentStageSince
              ? updatePayload.currentStageSince.toISOString()
              : undefined;
          }

          const summary = targetStage
            ? `Moved deal "${deal.title}" from "${deal.currentStatus}" to "${targetStage.name}"`
            : `Updated deal "${deal.title}" position`;

          logEntries.set(item.id, {
            id: item.id,
            oldValues,
            newValues,
            summary,
          });
        }
      }
    });

    for (const entry of logEntries.values()) {
      await this.activityLogsService.logUpdate(
        'deal',
        entry.id,
        entry.oldValues,
        entry.newValues,
        actorId,
        entry.summary,
      );
    }

    return this.dealRepository.findBy(dealIds.map((id) => ({ id })));
  }

  /* ========================================
     8. UPDATE STAGE (Transactional)
  ======================================== */

  async updateStage(
    dealId: string,
    dto: UpdateDealStageDto,
    userId: string,
  ): Promise<Deal> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId },
      relations: ['current_stage'],
    });
    if (!deal) throw new NotFoundException('Deal not found');

    if (deal.current_stage_id === dto.stage_id) {
      throw new BadRequestException('Deal is already in this stage');
    }

    const newStage = await this.stageRepository.findOne({
      where: { id: dto.stage_id, pipeline_id: deal.pipeline_id },
    });
    if (!newStage) throw new NotFoundException('Target stage not found');

    this.ensureBackwardStageMoveAllowed(deal, newStage);

    await this.dataSource.transaction(async (manager) => {
      const transitionUpdate = await this.buildStageTransitionUpdatePayload(
        manager,
        {
          deal,
          targetStage: newStage,
          actorId: userId,
          notes: dto.notes,
        },
      );

      await manager.update(Deal, dealId, transitionUpdate);
    });

    await this.activityLogsService.logUpdate(
      'deal',
      dealId,
      { stage: deal.currentStatus },
      { stage: newStage.name, notes: dto.notes },
      userId,
      `Moved deal "${deal.title}" from "${deal.currentStatus}" to "${newStage.name}"`,
    );

    return this.findDealDetails(dealId);
  }

  /* ========================================
     9. CALCULATE DEAL HEALTH
  ======================================== */

  async calculateDealHealth(dealId: string, userId: string): Promise<Deal> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId },
    });
    if (!deal) throw new NotFoundException('Deal not found');

    const health = await this.dealHealthCalculationService.calculateDealHealth({
      dealId,
      userId,
    });

    await this.activityLogsService.logUpdate(
      'deal',
      dealId,
      { healthScore: deal.healthScore },
      {
        healthScore: health.score,
        stakeholderEngagement: health.factors.stakeholderEngagement,
        timing: health.factors.timing,
        competition: health.factors.competition,
        budget: health.factors.budget,
      },
      userId,
      `Calculated health score for "${deal.title}": ${health.score}/100`,
    );

    return this.findDealDetails(dealId);
  }

  /* ========================================
     10. GET DEAL HEALTH
  ======================================== */

  async getDealHealth(dealId: string) {
    const health =
      await this.dealHealthCalculationService.getDealHealth(dealId);
    if (!health) throw new NotFoundException('Deal not found');

    return {
      healthScore: health.score,
      stakeholderEngagement: health.factors.stakeholderEngagement,
      timing: health.factors.timing,
      competition: health.factors.competition,
      budget: health.factors.budget,
      lastCalculated: health.lastCalculated,
    };
  }

  /* ========================================
     11. GET ARCHIVED DEALS (Paginated)
  ======================================== */

  async getArchivedDeals(
    dto: QueryArchivedDealsDto,
  ): Promise<Pagination<Deal>> {
    const page = parseInt(dto.page || '1', 10);
    const limit = parseInt(dto.limit || '10', 10);

    const options: IPaginationOptions = { page, limit };

    const qb = this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.school', 'school')
      .leftJoinAndSelect('deal.assigned_user', 'assigned_user')
      .leftJoinAndSelect('deal.current_stage', 'current_stage')
      .where('deal.closeStatus != :ongoing', {
        ongoing: DealCloseStatus.ONGOING,
      })
      .orderBy('deal.actualCloseDate', 'DESC');

    if (dto.close_status) {
      qb.andWhere('deal.closeStatus = :closeStatus', {
        closeStatus: dto.close_status,
      });
    }

    if (dto.search) {
      qb.andWhere(
        '(deal.title LIKE :search OR deal.description LIKE :search)',
        { search: `%${dto.search}%` },
      );
    }

    if (dto.pipeline_id) {
      qb.andWhere('deal.pipeline_id = :pipelineId', {
        pipelineId: dto.pipeline_id,
      });
    }

    if (dto.date_from) {
      qb.andWhere('deal.actualCloseDate >= :dateFrom', {
        dateFrom: new Date(dto.date_from),
      });
    }

    if (dto.date_to) {
      qb.andWhere('deal.actualCloseDate <= :dateTo', {
        dateTo: new Date(dto.date_to),
      });
    }

    return paginate<Deal>(qb, options);
  }

  /* ========================================
     11. GET DEALS (Paginated)
  ======================================== */

  async getDeals(dto: QueryDealsDto): Promise<Pagination<Deal>> {
    const page = parseInt(dto.page || '1', 10);
    const limit = parseInt(dto.limit || '10', 10);

    const options: IPaginationOptions = { page, limit };

    const qb = this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.school', 'school')
      .leftJoinAndSelect('deal.assigned_user', 'assigned_user')
      .leftJoinAndSelect('deal.current_stage', 'current_stage')
      .where('deal.close_status = :close_status', {
        close_status: DealCloseStatus.ONGOING,
      })
      .orderBy('deal.actualCloseDate', 'DESC');

    if (dto.close_status) {
      qb.andWhere('deal.closeStatus = :closeStatus', {
        closeStatus: dto.close_status,
      });
    }

    if (dto.search) {
      qb.andWhere(
        '(deal.title LIKE :search OR deal.description LIKE :search)',
        { search: `%${dto.search}%` },
      );
    }

    if (dto.pipeline_id) {
      qb.andWhere('deal.pipeline_id = :pipelineId', {
        pipelineId: dto.pipeline_id,
      });
    }

    if (dto.school_id) {
      qb.andWhere('deal.school_id = :schoolId', {
        schoolId: dto.school_id,
      });
    }

    if (dto.date_from) {
      qb.andWhere('deal.actualCloseDate >= :dateFrom', {
        dateFrom: new Date(dto.date_from),
      });
    }

    if (dto.date_to) {
      qb.andWhere('deal.actualCloseDate <= :dateTo', {
        dateTo: new Date(dto.date_to),
      });
    }

    return paginate<Deal>(qb, options);
  }

  private async resolveTargetStageForDeal(
    manager: EntityManager,
    deal: Deal,
    item: { stage_id?: string; status?: string },
  ): Promise<Stage | null> {
    if (item.stage_id && item.stage_id !== deal.current_stage_id) {
      const targetStage = await manager.findOne(Stage, {
        where: { id: item.stage_id, pipeline_id: deal.pipeline_id },
      });
      if (!targetStage) {
        throw new BadRequestException(`Stage not found for deal ${deal.id}`);
      }
      return targetStage;
    }

    if (item.status && item.status !== deal.currentStatus) {
      const targetStage = await manager.findOne(Stage, {
        where: { name: item.status, pipeline_id: deal.pipeline_id },
      });
      if (!targetStage) {
        throw new BadRequestException(`Stage not found for deal ${deal.id}`);
      }
      return targetStage;
    }

    return null;
  }

  private ensureBackwardStageMoveAllowed(deal: Deal, targetStage: Stage): void {
    if (this.isBackwardStageMove(deal.current_stage, targetStage)) {
      throw new BadRequestException(
        'Moving a deal backward requires an approved rollback request',
      );
    }
  }

  private isBackwardStageMove(
    currentStage: Stage | null | undefined,
    targetStage: Stage,
  ): boolean {
    if (!currentStage) {
      return false;
    }

    return Number(targetStage.order) < Number(currentStage.order);
  }

  private async buildStageTransitionUpdatePayload(
    manager: EntityManager,
    {
      deal,
      targetStage,
      actorId,
      position,
      notes,
      incrementRollbackCount = false,
    }: {
      deal: Deal;
      targetStage: Stage;
      actorId: string;
      position?: number;
      notes?: string;
      incrementRollbackCount?: boolean;
    },
  ): Promise<Partial<Deal>> {
    const now = new Date();
    const stageSince = deal.currentStageSince ?? new Date();
    const timeInStage = Math.floor(
      (now.getTime() - stageSince.getTime()) / (1000 * 60 * 60 * 24),
    );
    const slaDeadline = deal.current_stage?.sla_days
      ? new Date(
          stageSince.getTime() +
            deal.current_stage.sla_days * 24 * 60 * 60 * 1000,
        )
      : null;
    const slaCompliant = slaDeadline ? now <= slaDeadline : true;

    const history = manager.create(DealStageHistory, {
      id: uuidv4(),
      dealId: deal.id,
      fromStatus: deal.currentStatus,
      toStatus: targetStage.name,
      movedAt: now,
      movedBy: actorId,
      timeInStage,
      slaDeadlineWas: slaDeadline ?? undefined,
      slaCompliant,
      notes: notes?.trim() || undefined,
    });
    await manager.save(DealStageHistory, history);

    let nextPosition = position;
    if (nextPosition === undefined) {
      const maxPosResult = await manager
        .createQueryBuilder(Deal, 'deal')
        .select('MAX(deal.position)', 'maxPos')
        .where('deal.current_stage_id = :stageId', {
          stageId: targetStage.id,
        })
        .getRawOne();
      nextPosition = (maxPosResult?.maxPos ?? 0) + 1000;
    }

    return {
      current_stage_id: targetStage.id,
      currentStatus: targetStage.name,
      currentStageSince: now,
      probability: Number(targetStage.probability),
      position: nextPosition,
      ...(incrementRollbackCount
        ? { rollback_count: (deal.rollback_count ?? 0) + 1 }
        : {}),
    };
  }

  private extractRoleNames(user: any): string[] {
    const roles = new Set<string>();

    if (user?.role && typeof user.role === 'string') {
      roles.add(user.role);
    }

    if (Array.isArray(user?.roles)) {
      for (const role of user.roles) {
        if (!role) continue;
        if (typeof role === 'string') {
          roles.add(role);
        } else if (typeof role.name === 'string') {
          roles.add(role.name);
        }
      }
    }

    return Array.from(roles);
  }

  private buildDealSnapshot(deal: Deal, overrides: Partial<Deal> = {}) {
    const currentStageSince =
      overrides.currentStageSince ?? deal.currentStageSince;

    return {
      id: deal.id,
      title: deal.title,
      pipeline_id: deal.pipeline_id,
      assigned_to: deal.assigned_to,
      current_stage_id: overrides.current_stage_id ?? deal.current_stage_id,
      currentStatus: overrides.currentStatus ?? deal.currentStatus,
      position: overrides.position ?? deal.position,
      probability: overrides.probability ?? deal.probability,
      currentStageSince: currentStageSince
        ? currentStageSince.toISOString()
        : null,
    };
  }
}
