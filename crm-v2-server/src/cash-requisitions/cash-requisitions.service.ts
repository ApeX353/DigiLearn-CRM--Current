import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  paginate,
  Pagination,
  IPaginationOptions,
} from 'nestjs-typeorm-paginate';
import {
  CashRequisition,
  RequisitionStatus,
} from './entities/cash-requisition.entity';
import { RequisitionLineItem } from './entities/requisition-line-item.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { User } from '../users/entities/user.entity';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import {
  CreateCashRequisitionDto,
  UpdateCashRequisitionDto,
  QueryCashRequisitionDto,
  CreateRequisitionLineItemDto,
} from './dto/cash-requisition.dto';

/** Roles allowed to see every requisition (not just their own). */
const OVERSEER_ROLES = ['admin', 'manager', 'sales_manager', 'finance'];

export interface RequestingUser {
  id: string;
  roles?: Array<{ name: string }>;
}

export interface DealCostSummaryRow {
  currency: string;
  in_approval: string; // SUBMITTED + MANAGER_APPROVED + FINANCE_APPROVED
  paid: string; // PAID
  total: string; // in_approval + paid (never mixes currencies)
}

/** Roles that action the manager stage. */
const MANAGER_APPROVER_ROLES = ['admin', 'manager', 'sales_manager'];
/** Roles that action the finance stage (admin is fallback until finance users exist). */
const FINANCE_APPROVER_ROLES = ['admin', 'finance'];

@Injectable()
export class CashRequisitionsService {
  private readonly logger = new Logger(CashRequisitionsService.name);

  constructor(
    @InjectRepository(CashRequisition)
    private readonly requisitionRepo: Repository<CashRequisition>,
    @InjectRepository(RequisitionLineItem)
    private readonly lineItemRepo: Repository<RequisitionLineItem>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    @Optional()
    private readonly userNotificationsService?: UserNotificationsService,
  ) {}

  /** Active user ids holding any of the given role names. */
  private async userIdsWithRoles(roleNames: string[]): Promise<string[]> {
    const users = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('role.name IN (:...roleNames)', { roleNames })
      .andWhere('user.is_active = true')
      .select('user.id', 'id')
      .getRawMany<{ id: string }>();
    return [...new Set(users.map((u) => u.id))];
  }

  /**
   * Persisted notification helper. Errors are logged, never thrown —
   * an approval must not fail because a notification insert did.
   */
  private async notify(
    userIds: string[],
    title: string,
    message: string,
    requisitionId: string,
    severity: 'info' | 'success' | 'warning' | 'error' = 'info',
    dedupeKey?: string,
  ): Promise<void> {
    const targets = [...new Set(userIds)].filter(Boolean);
    if (!targets.length || !this.userNotificationsService) return;
    try {
      await this.userNotificationsService.sendToUsers({
        title,
        message: message.slice(0, 255),
        severity,
        channel: 'in-app',
        entity: 'CashRequisition',
        entityId: requisitionId,
        actionUrl: `/requisitions/${requisitionId}`,
        ...(dedupeKey ? { dedupeKey } : {}),
        userIds: targets,
      });
    } catch (error) {
      this.logger.error(
        `Failed to notify for requisition ${requisitionId}: ${error?.message}`,
      );
    }
  }

  private requisitionLabel(req: CashRequisition): string {
    const target =
      req.deal?.title ??
      req.lead?.lead_name ??
      req.campaign?.name ??
      'unlinked';
    return `${req.currency} ${req.total_amount} — ${target}`;
  }

  private roleNames(user: RequestingUser): string[] {
    return (user.roles ?? []).map((r) => r.name);
  }

  private isOverseer(user: RequestingUser): boolean {
    return this.roleNames(user).some((r) => OVERSEER_ROLES.includes(r));
  }

  private sumItems(items: CreateRequisitionLineItemDto[]): string {
    // Sum in integer cents to avoid float drift, emit as "123.45".
    const cents = items.reduce(
      (acc, i) => acc + Math.round(i.amount * 100),
      0,
    );
    return (cents / 100).toFixed(2);
  }

  async create(
    dto: CreateCashRequisitionDto,
    userId: string,
  ): Promise<CashRequisition> {
    const linkages = [dto.deal_id, dto.lead_id, dto.campaign_id].filter(
      Boolean,
    );
    if (linkages.length === 0) {
      throw new BadRequestException(
        'A requisition must be linked to a deal, a lead, or a campaign',
      );
    }
    if (linkages.length > 1) {
      throw new BadRequestException(
        'Link a requisition to exactly one of: deal, lead, campaign',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.deal_id) {
        const deal = await manager.findOne(Deal, {
          where: { id: dto.deal_id },
        });
        if (!deal) throw new NotFoundException('Deal not found');
      }
      if (dto.lead_id) {
        const lead = await manager.findOne(Lead, {
          where: { id: dto.lead_id },
        });
        if (!lead) throw new NotFoundException('Lead not found');
      }
      if (dto.campaign_id) {
        const campaign = await manager.findOne(Campaign, {
          where: { id: dto.campaign_id },
        });
        if (!campaign) throw new NotFoundException('Campaign not found');
      }

      const requisition = manager.create(CashRequisition, {
        type: dto.type,
        status: RequisitionStatus.DRAFT,
        requested_by_id: userId,
        deal_id: dto.deal_id ?? null,
        lead_id: dto.lead_id ?? null,
        campaign_id: dto.campaign_id ?? null,
        currency: dto.currency,
        reason: dto.reason,
        total_amount: this.sumItems(dto.line_items),
      });
      const saved = await manager.save(CashRequisition, requisition);

      const items = dto.line_items.map((i) =>
        manager.create(RequisitionLineItem, {
          requisition_id: saved.id,
          category: i.category,
          description: i.description,
          amount: i.amount.toFixed(2),
        }),
      );
      await manager.save(RequisitionLineItem, items);

      saved.line_items = items;
      return saved;
    });
  }

  async update(
    id: string,
    dto: UpdateCashRequisitionDto,
    user: RequestingUser,
  ): Promise<CashRequisition> {
    const requisition = await this.findOne(id, user);

    if (requisition.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT requisitions can be edited');
    }
    if (
      requisition.requested_by_id !== user.id &&
      !this.roleNames(user).includes('admin')
    ) {
      throw new ForbiddenException(
        'Only the requester can edit this requisition',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.type !== undefined) requisition.type = dto.type;
      if (dto.currency !== undefined) requisition.currency = dto.currency;
      if (dto.reason !== undefined) requisition.reason = dto.reason;

      if (dto.line_items) {
        await manager.delete(RequisitionLineItem, { requisition_id: id });
        const items = dto.line_items.map((i) =>
          manager.create(RequisitionLineItem, {
            requisition_id: id,
            category: i.category,
            description: i.description,
            amount: i.amount.toFixed(2),
          }),
        );
        await manager.save(RequisitionLineItem, items);
        requisition.total_amount = this.sumItems(dto.line_items);
        requisition.line_items = items;
      }

      return manager.save(CashRequisition, requisition);
    });
  }

  async submit(id: string, user: RequestingUser): Promise<CashRequisition> {
    const requisition = await this.findOne(id, user);

    if (requisition.requested_by_id !== user.id) {
      throw new ForbiddenException(
        'Only the requester can submit this requisition',
      );
    }
    if (requisition.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot submit a requisition in status ${requisition.status}`,
      );
    }
    if (!requisition.line_items?.length) {
      throw new BadRequestException(
        'Add at least one line item before submitting',
      );
    }

    requisition.status = RequisitionStatus.SUBMITTED;
    requisition.submitted_at = new Date();
    const saved = await this.requisitionRepo.save(requisition);

    // Stage 3 requirement: on submit, persist a notification to every
    // manager AND every finance user (queried by role).
    const [managerIds, financeIds] = await Promise.all([
      this.userIdsWithRoles(MANAGER_APPROVER_ROLES),
      this.userIdsWithRoles(FINANCE_APPROVER_ROLES),
    ]);
    const requesterName = requisition.requested_by
      ? `${requisition.requested_by.first_name} ${requisition.requested_by.last_name}`
      : 'A rep';
    await this.notify(
      [...managerIds, ...financeIds].filter((id) => id !== user.id),
      'Cash requisition submitted',
      `${requesterName} requested ${this.requisitionLabel(saved)}: ${saved.reason}`,
      saved.id,
      'info',
      `cashreq-submitted-${saved.id}`,
    );

    return saved;
  }

  /* ========================
     APPROVAL CHAIN (Stage 3)
     Role checks happen twice on purpose: @Roles on the controller
     gates the route, and these service methods re-verify against the
     acting user so the rule holds even if a future caller wires the
     service directly.
  ======================== */

  private assertRole(user: RequestingUser, allowed: string[], action: string) {
    if (!this.roleNames(user).some((r) => allowed.includes(r))) {
      throw new ForbiddenException(
        `Your role cannot ${action} (requires: ${allowed.join(', ')})`,
      );
    }
  }

  private assertStatus(
    req: CashRequisition,
    expected: RequisitionStatus,
    action: string,
  ) {
    if (req.status !== expected) {
      throw new BadRequestException(
        `Cannot ${action} a requisition in status ${req.status} (expected ${expected})`,
      );
    }
  }

  // N2: segregation of duties — the person who raised a requisition may not
  // approve or release it themselves, even if their role otherwise allows.
  // Previously an admin (in both approver sets) could submit → manager-approve
  // → finance-approve → mark-paid their own requisition end to end.
  // (Edge: in a one-approver org this blocks the sole approver; a deliberate
  // override would be a separate policy decision.)
  private assertNotSubmitter(
    req: CashRequisition,
    user: RequestingUser,
    action: string,
  ) {
    if (req.requested_by_id === user.id) {
      throw new ForbiddenException(
        `You cannot ${action} your own requisition — it needs a different approver`,
      );
    }
  }

  async managerApprove(
    id: string,
    user: RequestingUser,
  ): Promise<CashRequisition> {
    this.assertRole(user, MANAGER_APPROVER_ROLES, 'manager-approve');
    const req = await this.findOne(id, user);
    this.assertNotSubmitter(req, user, 'manager-approve');
    this.assertStatus(req, RequisitionStatus.SUBMITTED, 'manager-approve');

    req.status = RequisitionStatus.MANAGER_APPROVED;
    req.manager_actioned_by_id = user.id;
    req.manager_actioned_at = new Date();
    const saved = await this.requisitionRepo.save(req);

    const financeIds = await this.userIdsWithRoles(FINANCE_APPROVER_ROLES);
    await this.notify(
      [...financeIds.filter((fid) => fid !== user.id), req.requested_by_id],
      'Requisition manager-approved',
      `${this.requisitionLabel(req)} passed manager approval — awaiting finance`,
      req.id,
      'info',
    );
    return saved;
  }

  async managerReject(
    id: string,
    reason: string,
    user: RequestingUser,
  ): Promise<CashRequisition> {
    this.assertRole(user, MANAGER_APPROVER_ROLES, 'manager-reject');
    const req = await this.findOne(id, user);
    this.assertStatus(req, RequisitionStatus.SUBMITTED, 'manager-reject');

    req.status = RequisitionStatus.REJECTED;
    req.rejected_stage = 'manager';
    req.rejection_reason = reason;
    req.manager_actioned_by_id = user.id;
    req.manager_actioned_at = new Date();
    const saved = await this.requisitionRepo.save(req);

    await this.notify(
      [req.requested_by_id],
      'Requisition rejected by manager',
      `${this.requisitionLabel(req)} — ${reason}`,
      req.id,
      'error',
    );
    return saved;
  }

  async financeApprove(
    id: string,
    user: RequestingUser,
  ): Promise<CashRequisition> {
    this.assertRole(user, FINANCE_APPROVER_ROLES, 'finance-approve');
    const req = await this.findOne(id, user);
    this.assertNotSubmitter(req, user, 'finance-approve');
    this.assertStatus(
      req,
      RequisitionStatus.MANAGER_APPROVED,
      'finance-approve',
    );

    req.status = RequisitionStatus.FINANCE_APPROVED;
    req.finance_actioned_by_id = user.id;
    req.finance_actioned_at = new Date();
    const saved = await this.requisitionRepo.save(req);

    await this.notify(
      [req.requested_by_id],
      'Requisition approved by finance',
      `${this.requisitionLabel(req)} — awaiting payment`,
      req.id,
      'success',
    );
    return saved;
  }

  async financeReject(
    id: string,
    reason: string,
    user: RequestingUser,
  ): Promise<CashRequisition> {
    this.assertRole(user, FINANCE_APPROVER_ROLES, 'finance-reject');
    const req = await this.findOne(id, user);
    this.assertStatus(
      req,
      RequisitionStatus.MANAGER_APPROVED,
      'finance-reject',
    );

    req.status = RequisitionStatus.REJECTED;
    req.rejected_stage = 'finance';
    req.rejection_reason = reason;
    req.finance_actioned_by_id = user.id;
    req.finance_actioned_at = new Date();
    const saved = await this.requisitionRepo.save(req);

    await this.notify(
      [req.requested_by_id],
      'Requisition rejected by finance',
      `${this.requisitionLabel(req)} — ${reason}`,
      req.id,
      'error',
    );
    return saved;
  }

  async markPaid(id: string, user: RequestingUser): Promise<CashRequisition> {
    this.assertRole(user, FINANCE_APPROVER_ROLES, 'mark as paid');
    const req = await this.findOne(id, user);
    this.assertNotSubmitter(req, user, 'mark as paid');
    this.assertStatus(req, RequisitionStatus.FINANCE_APPROVED, 'mark as paid');

    req.status = RequisitionStatus.PAID;
    req.paid_at = new Date();
    const saved = await this.requisitionRepo.save(req);

    await this.notify(
      [req.requested_by_id],
      'Requisition paid',
      `${this.requisitionLabel(req)} has been paid out`,
      req.id,
      'success',
    );
    return saved;
  }

  async findAll(
    query: QueryCashRequisitionDto,
    user: RequestingUser,
  ): Promise<Pagination<CashRequisition>> {
    const options: IPaginationOptions = {
      page: parseInt(query.page ?? '1', 10),
      limit: parseInt(query.limit ?? '20', 10),
    };

    const qb = this.requisitionRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.line_items', 'items')
      .leftJoinAndSelect('req.requested_by', 'requester')
      .leftJoinAndSelect('req.deal', 'deal')
      .leftJoinAndSelect('req.lead', 'lead')
      .leftJoinAndSelect('req.campaign', 'campaign')
      .orderBy('req.created_at', 'DESC');

    // Visibility: reps see only their own; overseer roles see all.
    if (query.mine === 'true' || !this.isOverseer(user)) {
      qb.andWhere('req.requested_by_id = :uid', { uid: user.id });
    }

    if (query.status) {
      qb.andWhere('req.status = :status', { status: query.status });
    }
    if (query.deal_id) {
      qb.andWhere('req.deal_id = :dealId', { dealId: query.deal_id });
    }
    if (query.campaign_id) {
      qb.andWhere('req.campaign_id = :campaignId', {
        campaignId: query.campaign_id,
      });
    }
    if (query.lead_id) {
      qb.andWhere('req.lead_id = :leadId', { leadId: query.lead_id });
    }

    // Inbox filter: what is waiting on MY role right now.
    if (query.awaiting === 'true') {
      const roles = this.roleNames(user);
      const awaiting: RequisitionStatus[] = [];
      if (roles.some((r) => ['admin', 'manager', 'sales_manager'].includes(r))) {
        awaiting.push(RequisitionStatus.SUBMITTED);
      }
      if (roles.some((r) => ['admin', 'finance'].includes(r))) {
        awaiting.push(
          RequisitionStatus.MANAGER_APPROVED,
          RequisitionStatus.FINANCE_APPROVED, // awaiting mark-paid
        );
      }
      if (awaiting.length === 0) {
        qb.andWhere('1 = 0'); // reps have no approval inbox
      } else {
        qb.andWhere('req.status IN (:...awaiting)', { awaiting });
      }
    }

    return paginate<CashRequisition>(qb, options);
  }

  async findOne(id: string, user: RequestingUser): Promise<CashRequisition> {
    const requisition = await this.requisitionRepo.findOne({
      where: { id },
      relations: [
        'line_items',
        'requested_by',
        'deal',
        'lead',
        'campaign',
        'manager_actioned_by',
        'finance_actioned_by',
      ],
    });
    if (!requisition) {
      throw new NotFoundException(`Requisition ${id} not found`);
    }
    if (
      requisition.requested_by_id !== user.id &&
      !this.isOverseer(user)
    ) {
      throw new ForbiddenException('You cannot view this requisition');
    }
    return requisition;
  }

  /**
   * Per-currency cost rollup for a deal or a lead. Currencies are
   * NEVER summed together — one row per currency. DRAFT and REJECTED
   * are excluded (a draft isn't a commitment; a rejection isn't a
   * cost).
   */
  private async getCostSummaryFor(
    column: 'deal_id' | 'lead_id',
    id: string,
  ): Promise<DealCostSummaryRow[]> {
    const rows: Array<{
      currency: string;
      in_approval: string | null;
      paid: string | null;
    }> = await this.requisitionRepo
      .createQueryBuilder('req')
      .select('req.currency', 'currency')
      .addSelect(
        `COALESCE(SUM(CASE WHEN req.status IN ('SUBMITTED','MANAGER_APPROVED','FINANCE_APPROVED') THEN req.total_amount ELSE 0 END), 0)`,
        'in_approval',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN req.status = 'PAID' THEN req.total_amount ELSE 0 END), 0)`,
        'paid',
      )
      .where(`req.${column} = :id`, { id })
      .andWhere(`req.status NOT IN ('DRAFT','REJECTED')`)
      .groupBy('req.currency')
      .getRawMany();

    return rows.map((r) => {
      const inApproval = Number(r.in_approval ?? 0);
      const paid = Number(r.paid ?? 0);
      return {
        currency: r.currency,
        in_approval: inApproval.toFixed(2),
        paid: paid.toFixed(2),
        total: (inApproval + paid).toFixed(2),
      };
    });
  }

  async getDealCostSummary(dealId: string): Promise<DealCostSummaryRow[]> {
    return this.getCostSummaryFor('deal_id', dealId);
  }

  async getLeadCostSummary(leadId: string): Promise<DealCostSummaryRow[]> {
    return this.getCostSummaryFor('lead_id', leadId);
  }

  /**
   * Cost-to-close report (Stage 4): spend per closed deal, grouped by
   * currency, split WON (acquisition cost) vs LOST (sunk cost).
   * "Spend" = PAID requisitions; "committed" additionally includes
   * money still in the approval pipeline. Currencies stay separate.
   */
  async getCostToCloseReport(): Promise<{
    won: CostToCloseDealRow[];
    lost: CostToCloseDealRow[];
    totals: {
      won: Array<{ currency: string; paid: string; committed: string }>;
      lost: Array<{ currency: string; paid: string; committed: string }>;
    };
  }> {
    const raw: Array<{
      deal_id: string;
      title: string;
      close_status: 'won' | 'lost';
      deal_value: string;
      deal_currency: string;
      currency: string;
      paid: string;
      committed: string;
    }> = await this.requisitionRepo
      .createQueryBuilder('req')
      .innerJoin('req.deal', 'deal')
      .select('deal.id', 'deal_id')
      .addSelect('deal.title', 'title')
      .addSelect('deal.close_status', 'close_status')
      .addSelect('deal.value', 'deal_value')
      .addSelect('deal.currency', 'deal_currency')
      .addSelect('req.currency', 'currency')
      .addSelect(
        `COALESCE(SUM(CASE WHEN req.status = 'PAID' THEN req.total_amount ELSE 0 END), 0)`,
        'paid',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN req.status IN ('SUBMITTED','MANAGER_APPROVED','FINANCE_APPROVED','PAID') THEN req.total_amount ELSE 0 END), 0)`,
        'committed',
      )
      .where(`deal.close_status IN ('won','lost')`)
      .andWhere(`req.status NOT IN ('DRAFT','REJECTED')`)
      .groupBy('deal.id')
      .addGroupBy('deal.title')
      .addGroupBy('deal.close_status')
      .addGroupBy('deal.value')
      .addGroupBy('deal.currency')
      .addGroupBy('req.currency')
      .getRawMany();

    const toRow = (r: (typeof raw)[number]): CostToCloseDealRow => ({
      deal_id: r.deal_id,
      title: r.title,
      deal_value: Number(r.deal_value).toFixed(2),
      deal_currency: r.deal_currency,
      currency: r.currency,
      paid: Number(r.paid).toFixed(2),
      committed: Number(r.committed).toFixed(2),
    });

    const won = raw.filter((r) => r.close_status === 'won').map(toRow);
    const lost = raw.filter((r) => r.close_status === 'lost').map(toRow);

    const totalsFor = (rows: CostToCloseDealRow[]) => {
      const byCurrency = new Map<string, { paid: number; committed: number }>();
      for (const r of rows) {
        const acc = byCurrency.get(r.currency) ?? { paid: 0, committed: 0 };
        acc.paid += Number(r.paid);
        acc.committed += Number(r.committed);
        byCurrency.set(r.currency, acc);
      }
      return [...byCurrency.entries()].map(([currency, v]) => ({
        currency,
        paid: v.paid.toFixed(2),
        committed: v.committed.toFixed(2),
      }));
    };

    return { won, lost, totals: { won: totalsFor(won), lost: totalsFor(lost) } };
  }
}

export interface CostToCloseDealRow {
  deal_id: string;
  title: string;
  deal_value: string;
  deal_currency: string;
  /** requisition currency for this row — one row per deal per currency */
  currency: string;
  paid: string;
  committed: string;
}
