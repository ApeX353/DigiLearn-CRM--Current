import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, SelectQueryBuilder } from 'typeorm';
import { Deal, DealCloseStatus } from '../deals/entities/deal.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Activity, ActivityType } from '../activities/entities/activity.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { LeadQualificationCriteria } from '../leads/entities/lead-qualification-criteria.entity';
import { User } from '../users/entities/user.entity';
import { DocumentItem } from '../document-items/entities/document-item.entity';
import {
  DashboardFiltersDto,
  type DateRangeType,
} from './dto/dashboard-filters.dto';
import { SettingsService } from '../settings/settings.service';

// Configurable defaults
const DEFAULT_DAILY_LEADS_TARGET = 40;
const DEFAULT_MONTHLY_TARGET = 100000;
const DEFAULT_EXPECTED_WIN_RATE = 0.25;
const DEFAULT_HIGH_VALUE_THRESHOLD = 20000;
const QUALIFICATION_THRESHOLD = 80;
const CONTACT_ACTIVITY_TYPES = [
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.WHATSAPP,
  ActivityType.MEETING,
];

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Deal)
    private readonly dealRepo: Repository<Deal>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(Stage)
    private readonly stageRepo: Repository<Stage>,
    @InjectRepository(LeadQualificationCriteria)
    private readonly qualificationRepo: Repository<LeadQualificationCriteria>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(DocumentItem)
    private readonly documentItemRepo: Repository<DocumentItem>,
    private readonly settingsService: SettingsService,
  ) {}

  // ===== HELPERS =====

  private getDateRange(filters: DashboardFiltersDto): {
    start: Date;
    end: Date;
  } {
    const now = new Date();
    const range = (filters.dateRange || 'mtd') as DateRangeType;

    switch (range) {
      case 'today':
        return {
          start: this.startOfDay(now),
          end: this.endOfDay(now),
        };
      case 'mtd':
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: this.endOfDay(now),
        };
      case 'qtd': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        return {
          start: new Date(now.getFullYear(), qMonth, 1),
          end: this.endOfDay(now),
        };
      }
      case 'ytd':
        return {
          start: new Date(now.getFullYear(), 0, 1),
          end: this.endOfDay(now),
        };
      case 'custom':
        return {
          start: filters.startDate
            ? new Date(filters.startDate)
            : new Date(now.getFullYear(), now.getMonth(), 1),
          end: filters.endDate ? new Date(filters.endDate) : this.endOfDay(now),
        };
      default:
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: this.endOfDay(now),
        };
    }
  }

  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private endOfDay(d: Date): Date {
    return new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      23,
      59,
      59,
      999,
    );
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private diffDays(a: Date, b: Date): number {
    return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
  }

  private subDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() - n);
    return r;
  }

  private addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  private toPositiveFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private async resolveDailyLeadsTarget(): Promise<number> {
    const defaultsSetting = await this.settingsService.getSetting('defaults');
    const nestedTarget =
      defaultsSetting?.value &&
      typeof defaultsSetting.value === 'object' &&
      !Array.isArray(defaultsSetting.value)
        ? (defaultsSetting.value as Record<string, unknown>).daily_leads_target
        : null;
    const nestedValue = this.toPositiveFiniteNumber(nestedTarget);
    if (nestedValue !== null) {
      return nestedValue;
    }

    const dottedSetting = await this.settingsService.getSetting(
      'defaults.daily_leads_target',
    );
    const dottedValue = this.toPositiveFiniteNumber(dottedSetting?.value);
    if (dottedValue !== null) {
      return dottedValue;
    }

    return DEFAULT_DAILY_LEADS_TARGET;
  }

  private buildLeadsContactedBaseQuery(
    filters: DashboardFiltersDto,
  ): SelectQueryBuilder<Activity> {
    const qb = this.activityRepo
      .createQueryBuilder('a')
      .where('a.lead_id IS NOT NULL')
      .andWhere('a.type IN (:...types)', {
        types: CONTACT_ACTIVITY_TYPES,
      });

    if (filters.province) {
      qb.innerJoin('a.lead', 'lead')
        .innerJoin('lead.school', 'school')
        .andWhere('school.province = :province', {
          province: filters.province,
        });
    }

    return qb;
  }

  private applyLeadsContactedScope(
    qb: SelectQueryBuilder<Activity>,
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ): void {
    if (userRole === 'sales_rep') {
      qb.andWhere('a.created_by_id = :currentUserId', {
        currentUserId: userId,
      });
    }

    if (filters.salesRepId) {
      qb.andWhere('a.created_by_id = :selectedRepId', {
        selectedRepId: filters.salesRepId,
      });
    }
  }

  // ===== ENDPOINTS =====

  /**
   * Executive KPIs: Cash Collected, Principal Sold, Pipeline Coverage, Overdue, Qualification Stats
   */
  async getExecutiveKPIs(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const { start, end } = this.getDateRange(filters);
    const now = new Date();

    // Won deals in period
    const wonQuery = this.dealRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.school', 'school')
      .where('d.closeStatus = :won', { won: DealCloseStatus.WON })
      .andWhere('d.actualCloseDate >= :start', { start })
      .andWhere('d.actualCloseDate <= :end', { end });

    if (userRole === 'sales_rep')
      wonQuery.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      wonQuery.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      wonQuery.andWhere('school.province = :prov', { prov: filters.province });

    const wonDeals = await wonQuery.getMany();
    const principalSold = wonDeals.reduce(
      (s, d) => s + Number(d.value || 0),
      0,
    );

    // Pipeline value (active deals)
    const pipeQuery = this.dealRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.school', 'school')
      .where('d.closeStatus = :ongoing', { ongoing: DealCloseStatus.ONGOING });

    if (userRole === 'sales_rep')
      pipeQuery.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      pipeQuery.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      pipeQuery.andWhere('school.province = :prov', { prov: filters.province });

    const activeDeals = await pipeQuery.getMany();
    const pipelineValue = activeDeals.reduce(
      (s, d) => s + Number(d.value || 0),
      0,
    );

    // Cash collected (payments in period)
    const payQuery = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoin('p.invoice', 'inv')
      .leftJoin('inv.deal', 'deal')
      .leftJoin('deal.school', 'school')
      .where('p.payment_date >= :start', { start })
      .andWhere('p.payment_date <= :end', { end });

    if (userRole === 'sales_rep')
      payQuery.andWhere('deal.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      payQuery.andWhere('deal.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      payQuery.andWhere('school.province = :prov', { prov: filters.province });

    const payments = await payQuery
      .select('SUM(p.amount)', 'total')
      .getRawOne();
    const cashCollected = Number(payments?.total || 0);

    // Overdue invoices
    const overdueQuery = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoin('inv.deal', 'deal')
      .leftJoin('deal.school', 'school')
      .where('inv.due_date < :now', { now })
      .andWhere('inv.status IN (:...statuses)', {
        statuses: ['Sent', 'Partially Paid', 'Overdue'],
      });

    if (userRole === 'sales_rep')
      overdueQuery.andWhere('deal.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      overdueQuery.andWhere('deal.assigned_to = :rep', {
        rep: filters.salesRepId,
      });
    if (filters.province)
      overdueQuery.andWhere('school.province = :prov', {
        prov: filters.province,
      });

    const overdueResult = await overdueQuery
      .select('SUM(inv.total - inv.amount_paid)', 'total')
      .getRawOne();
    const overdueAmount = Math.max(0, Number(overdueResult?.total || 0));

    // Pipeline coverage
    const monthlyTarget = DEFAULT_MONTHLY_TARGET;
    const requiredPipeline = monthlyTarget / DEFAULT_EXPECTED_WIN_RATE;
    const pipelineCoverageRatio =
      requiredPipeline > 0 ? (pipelineValue / requiredPipeline) * 100 : 0;

    // Qualification stats
    const qualStats = await this.qualificationRepo
      .createQueryBuilder('q')
      .select('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN q.is_qualified = true THEN 1 ELSE 0 END)',
        'qualified',
      )
      .addSelect('AVG(q.qualification_score)', 'avgScore')
      .getRawOne();

    return {
      cashCollected,
      principalSold,
      pipelineCoverageRatio: Math.round(pipelineCoverageRatio * 10) / 10,
      overdueAmount,
      pipelineValue,
      monthlyTarget,
      qualification: {
        totalLeads: Number(qualStats?.total || 0),
        qualifiedLeads: Number(qualStats?.qualified || 0),
        averageScore: Math.round(Number(qualStats?.avgScore || 0) * 10) / 10,
      },
    };
  }

  /**
   * Leads Contacted vs Target
   */
  async getLeadsContactedStats(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const now = new Date();
    const todayStart = this.startOfDay(now);
    const todayEnd = this.endOfDay(now);
    const { start: rawRangeStart, end: rawRangeEnd } =
      this.getDateRange(filters);
    const rangeStart = this.startOfDay(rawRangeStart);
    const rangeEnd = this.endOfDay(
      rawRangeEnd > todayEnd ? todayEnd : rawRangeEnd,
    );
    const rangeDays =
      rangeEnd >= rangeStart ? this.diffDays(rangeEnd, rangeStart) + 1 : 0;

    const dailyTarget = await this.resolveDailyLeadsTarget();

    console.log(dailyTarget);

    const cohortQb = this.buildLeadsContactedBaseQuery(filters)
      .select('DISTINCT a.created_by_id', 'repId')
      .andWhere('a.created_at >= :start', { start: rangeStart })
      .andWhere('a.created_at <= :end', { end: rangeEnd });
    this.applyLeadsContactedScope(cohortQb, filters, userId, userRole);

    const cohortRows = await cohortQb.getRawMany();
    const cohortRepIds = cohortRows
      .map((row) => row.repId as string | null)
      .filter(
        (repId): repId is string =>
          typeof repId === 'string' && repId.trim().length > 0,
      );

    let repUsers: User[] = [];
    if (cohortRepIds.length > 0) {
      repUsers = await this.userRepo
        .createQueryBuilder('u')
        .where('u.is_active = :active', { active: true })
        .andWhere('u.id IN (:...repIds)', { repIds: cohortRepIds })
        .orderBy('u.first_name', 'ASC')
        .addOrderBy('u.last_name', 'ASC')
        .addOrderBy('u.email', 'ASC')
        .getMany();
    }

    const byRep = await Promise.all(
      repUsers.map(async (rep) => {
        const todayResult = await this.buildLeadsContactedBaseQuery(filters)
          .select('COUNT(DISTINCT a.lead_id)', 'count')
          .andWhere('a.created_by_id = :repId', { repId: rep.id })
          .andWhere('a.created_at >= :start', { start: todayStart })
          .andWhere('a.created_at <= :end', { end: todayEnd })
          .getRawOne();

        const rangeResult = await this.buildLeadsContactedBaseQuery(filters)
          .select('DATE(a.created_at)', 'day')
          .addSelect('COUNT(DISTINCT a.lead_id)', 'count')
          .andWhere('a.created_by_id = :repId', { repId: rep.id })
          .andWhere('a.created_at >= :start', { start: rangeStart })
          .andWhere('a.created_at <= :end', { end: rangeEnd })
          .groupBy('DATE(a.created_at)')
          .getRawMany();

        const mtdTotal = rangeResult.reduce(
          (sum, row) => sum + Number(row.count || 0),
          0,
        );
        const mtdAverage = rangeDays > 0 ? mtdTotal / rangeDays : 0;
        const repName = `${rep.first_name || ''} ${rep.last_name || ''}`.trim();

        return {
          repId: rep.id,
          repName: repName || rep.email || 'Unknown Rep',
          today: Number(todayResult?.count || 0),
          target: dailyTarget,
          mtdTotal,
          mtdAverage: Math.round(mtdAverage * 10) / 10,
        };
      }),
    );

    const today = byRep.reduce((sum, rep) => sum + rep.today, 0);
    const target = byRep.length * dailyTarget;
    const mtdAverage =
      byRep.length > 0
        ? byRep.reduce((sum, rep) => sum + rep.mtdAverage, 0) / byRep.length
        : 0;

    const activeRepIds = byRep.map((rep) => rep.repId);
    let daysWithAny = 0;

    if (activeRepIds.length > 0 && rangeDays > 0) {
      const dayRows = await this.buildLeadsContactedBaseQuery(filters)
        .select('DATE(a.created_at)', 'day')
        .andWhere('a.created_by_id IN (:...repIds)', { repIds: activeRepIds })
        .andWhere('a.created_at >= :start', { start: rangeStart })
        .andWhere('a.created_at <= :end', { end: rangeEnd })
        .groupBy('DATE(a.created_at)')
        .getRawMany();
      daysWithAny = new Set(dayRows.map((row) => row.day)).size;
    }

    const missedDays = Math.max(0, rangeDays - daysWithAny);

    return {
      today,
      target,
      mtdAverage: Math.round(mtdAverage * 10) / 10,
      missedDays,
      byRep,
    };
  }

  /**
   * Collections Due - overdue invoices + upcoming
   */
  async getCollectionsDue(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const now = new Date();
    const todayStr = this.formatDate(now);
    const in7 = this.formatDate(this.addDays(now, 7));
    const in30 = this.formatDate(this.addDays(now, 30));

    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.school', 'school')
      .leftJoin('inv.deal', 'deal')
      .where('inv.status IN (:...statuses)', {
        statuses: ['Sent', 'Partially Paid', 'Overdue'],
      });

    if (userRole === 'sales_rep')
      qb.andWhere('deal.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      qb.andWhere('deal.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      qb.andWhere('school.province = :prov', { prov: filters.province });

    const invoices = await qb.getMany();

    const outstanding = invoices
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        schoolName: inv.school?.name || 'Unknown',
        dueDate: inv.due_date ? this.formatDate(inv.due_date) : '',
        outstanding: Math.max(
          0,
          Number(inv.total || 0) - Number(inv.amount_paid || 0),
        ),
      }))
      .filter((i) => i.outstanding > 0);

    const dueToday = outstanding
      .filter((i) => i.dueDate === todayStr)
      .reduce((s, i) => s + i.outstanding, 0);
    const overdue = outstanding
      .filter((i) => i.dueDate < todayStr)
      .reduce((s, i) => s + i.outstanding, 0);
    const dueIn7Days = outstanding
      .filter((i) => i.dueDate > todayStr && i.dueDate <= in7)
      .reduce((s, i) => s + i.outstanding, 0);
    const dueIn30Days = outstanding
      .filter((i) => i.dueDate > in7 && i.dueDate <= in30)
      .reduce((s, i) => s + i.outstanding, 0);

    const overdueList = outstanding
      .filter((i) => i.dueDate < todayStr && i.dueDate !== '')
      .map((i) => ({
        ...i,
        daysOverdue: this.diffDays(now, new Date(i.dueDate)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 10);

    return { dueToday, overdue, dueIn7Days, dueIn30Days, overdueList };
  }

  /**
   * Sales Metrics - Principal Sold / Cash Collected with period comparison
   */
  async getSalesMetrics(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const { start, end } = this.getDateRange(filters);
    const periodDays = this.diffDays(end, start);
    const prevStart = this.subDays(start, periodDays + 1);
    const prevEnd = this.subDays(start, 1);

    const getMetrics = async (s: Date, e: Date) => {
      const dealQb = this.dealRepo
        .createQueryBuilder('d')
        .leftJoin('d.school', 'school')
        .where('d.closeStatus = :won', { won: DealCloseStatus.WON })
        .andWhere('d.actualCloseDate >= :s', { s })
        .andWhere('d.actualCloseDate <= :e', { e });

      if (userRole === 'sales_rep')
        dealQb.andWhere('d.assigned_to = :uid', { uid: userId });
      if (filters.salesRepId)
        dealQb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
      if (filters.province)
        dealQb.andWhere('school.province = :prov', { prov: filters.province });

      const dealResult = await dealQb
        .select('SUM(d.value)', 'principalSold')
        .getRawOne();

      const payQb = this.paymentRepo
        .createQueryBuilder('p')
        .leftJoin('p.invoice', 'inv')
        .leftJoin('inv.deal', 'deal')
        .leftJoin('deal.school', 'school')
        .where('p.payment_date >= :s', { s })
        .andWhere('p.payment_date <= :e', { e });

      if (userRole === 'sales_rep')
        payQb.andWhere('deal.assigned_to = :uid', { uid: userId });
      if (filters.salesRepId)
        payQb.andWhere('deal.assigned_to = :rep', { rep: filters.salesRepId });
      if (filters.province)
        payQb.andWhere('school.province = :prov', { prov: filters.province });

      const payResult = await payQb
        .select('SUM(p.amount)', 'cashCollected')
        .getRawOne();

      return {
        principalSold: Number(dealResult?.principalSold || 0),
        totalContractValue: Number(dealResult?.principalSold || 0),
        cashCollected: Number(payResult?.cashCollected || 0),
      };
    };

    const current = await getMetrics(start, end);
    const previous = await getMetrics(prevStart, prevEnd);

    return { ...current, previousPeriod: previous };
  }

  /**
   * Demo Stats - Mid-funnel tracking
   */
  async getDemoStats(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    // Find demo-related stages
    const demoStages = await this.stageRepo
      .createQueryBuilder('s')
      .where('s.name LIKE :demo', { demo: '%demo%' })
      .orWhere('s.name LIKE :pres', { pres: '%presentation%' })
      .getMany();

    const demoStageIds = demoStages.map((s) => s.id);

    if (demoStageIds.length === 0) {
      return {
        upcomingDemos: 0,
        completedDemos: 0,
        demoToProposalRate: 0,
        demoDeals: [],
      };
    }

    const { start, end } = this.getDateRange(filters);

    const qb = this.dealRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.school', 'school')
      .leftJoinAndSelect('d.current_stage', 'stage')
      .leftJoinAndSelect('d.assigned_user', 'owner')
      .where('d.current_stage_id IN (:...ids)', { ids: demoStageIds })
      .andWhere('d.closeStatus = :ongoing', {
        ongoing: DealCloseStatus.ONGOING,
      });

    if (userRole === 'sales_rep')
      qb.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      qb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      qb.andWhere('school.province = :prov', { prov: filters.province });

    const upcomingDeals = await qb.getMany();

    // Completed demos (won in period)
    const completedQuery = this.dealRepo
      .createQueryBuilder('d')
      .where('d.closeStatus = :won', { won: DealCloseStatus.WON })
      .andWhere('d.actualCloseDate >= :start', { start })
      .andWhere('d.actualCloseDate <= :end', { end });

    if (userRole === 'sales_rep')
      completedQuery.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      completedQuery.andWhere('d.assigned_to = :rep', {
        rep: filters.salesRepId,
      });

    const completedDemos = await completedQuery.getCount();
    const demoToProposalRate =
      upcomingDeals.length > 0
        ? (completedDemos / upcomingDeals.length) * 100
        : 0;

    const demoDeals = upcomingDeals.slice(0, 10).map((d) => ({
      id: d.id,
      dealName: d.title,
      schoolName: d.school?.name || 'Unknown',
      scheduledDate: d.currentStageSince?.toISOString() || null,
      stageName: d.current_stage?.name || 'Unknown',
      ownerName: d.assigned_user
        ? `${d.assigned_user.first_name} ${d.assigned_user.last_name}`
        : 'Unknown',
    }));

    return {
      upcomingDemos: upcomingDeals.length,
      completedDemos,
      demoToProposalRate: Math.round(demoToProposalRate * 10) / 10,
      demoDeals,
    };
  }

  /**
   * High Value Deals
   */
  async getHighValueDeals(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const qb = this.dealRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.school', 'school')
      .leftJoinAndSelect('d.current_stage', 'stage')
      .leftJoinAndSelect('d.assigned_user', 'owner')
      .where('d.closeStatus = :ongoing', { ongoing: DealCloseStatus.ONGOING })
      .andWhere('d.value >= :threshold', {
        threshold: DEFAULT_HIGH_VALUE_THRESHOLD,
      });

    if (userRole === 'sales_rep')
      qb.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      qb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      qb.andWhere('school.province = :prov', { prov: filters.province });

    qb.orderBy('d.value', 'DESC').take(10);

    const deals = await qb.getMany();
    const now = new Date();

    return deals.map((d) => {
      const daysInStage = d.currentStageSince
        ? this.diffDays(now, new Date(d.currentStageSince))
        : 0;
      const slaDays = d.current_stage?.sla_days || 7;

      return {
        id: d.id,
        dealName: d.title,
        schoolName: d.school?.name || 'Unknown',
        totalContractValue: Number(d.value),
        stageName: d.current_stage?.name || 'Unknown',
        ownerName: d.assigned_user
          ? `${d.assigned_user.first_name} ${d.assigned_user.last_name}`
          : 'Unknown',
        daysInStage,
        slaDays,
        isBreached: daysInStage > slaDays,
      };
    });
  }

  /**
   * Funnel Health - Pipeline coverage and stage breakdown
   */
  async getFunnelHealth(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const { start, end } = this.getDateRange(filters);
    const stages = await this.stageRepo.find({ order: { order: 'ASC' } });

    // Active deals
    const activeQb = this.dealRepo
      .createQueryBuilder('d')
      .leftJoin('d.school', 'school')
      .where('d.closeStatus = :ongoing', { ongoing: DealCloseStatus.ONGOING });

    if (userRole === 'sales_rep')
      activeQb.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      activeQb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      activeQb.andWhere('school.province = :prov', { prov: filters.province });

    const activeDeals = await activeQb
      .select('d.current_stage_id', 'stageId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(d.value)', 'value')
      .groupBy('d.current_stage_id')
      .getRawMany();

    // Lost deals in period
    const lostQb = this.dealRepo
      .createQueryBuilder('d')
      .leftJoin('d.school', 'school')
      .where('d.closeStatus = :lost', { lost: DealCloseStatus.LOST })
      .andWhere('d.actualCloseDate >= :start', { start })
      .andWhere('d.actualCloseDate <= :end', { end });

    if (userRole === 'sales_rep')
      lostQb.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      lostQb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      lostQb.andWhere('school.province = :prov', { prov: filters.province });

    const lostDeals = await lostQb
      .select('d.current_stage_id', 'stageId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(d.value)', 'value')
      .groupBy('d.current_stage_id')
      .getRawMany();

    const activeMap = new Map(activeDeals.map((r) => [r.stageId, r]));
    const lostMap = new Map(lostDeals.map((r) => [r.stageId, r]));

    const totalPipeline = activeDeals.reduce(
      (s, r) => s + Number(r.value || 0),
      0,
    );
    const monthlyTarget = DEFAULT_MONTHLY_TARGET;
    const expectedWinRate = DEFAULT_EXPECTED_WIN_RATE;
    const requiredPipeline = monthlyTarget / expectedWinRate;
    const coverageRatio =
      requiredPipeline > 0 ? (totalPipeline / requiredPipeline) * 100 : 0;

    const stageBreakdown = stages.map((s) => {
      const active = activeMap.get(s.id);
      const lost = lostMap.get(s.id);
      return {
        stageName: s.name,
        stageColor: s.color || '#6366f1',
        dealCount: Number(active?.count || 0),
        value: Number(active?.value || 0),
        lostCount: Number(lost?.count || 0),
        lostValue: Number(lost?.value || 0),
      };
    });

    return {
      monthlyTarget,
      expectedWinRate: expectedWinRate * 100,
      requiredPipeline,
      actualPipeline: totalPipeline,
      coverageRatio: Math.round(coverageRatio * 10) / 10,
      stageBreakdown,
    };
  }

  /**
   * Schools Bought - Customer acquisition tracking
   */
  async getSchoolsBought(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const { start, end } = this.getDateRange(filters);

    // All won deals
    const allWonQb = this.dealRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.school', 'school')
      .where('d.closeStatus = :won', { won: DealCloseStatus.WON });

    if (userRole === 'sales_rep')
      allWonQb.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      allWonQb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      allWonQb.andWhere('school.province = :prov', { prov: filters.province });

    const allWon = await allWonQb.getMany();

    // Period deals
    const periodDeals = allWon.filter(
      (d) =>
        d.actualCloseDate &&
        d.actualCloseDate >= start &&
        d.actualCloseDate <= end,
    );

    // Prior deals (before period)
    const priorSchoolIds = new Set(
      allWon
        .filter((d) => d.actualCloseDate && d.actualCloseDate < start)
        .map((d) => d.school_id),
    );

    const schoolIds = new Set(periodDeals.map((d) => d.school_id));
    let newSchools = 0;
    let repeatSchools = 0;
    const byProvince: Record<string, number> = {};

    schoolIds.forEach((sid) => {
      const deal = periodDeals.find((d) => d.school_id === sid);
      const province = deal?.school?.province || 'Unknown';
      if (priorSchoolIds.has(sid)) {
        repeatSchools++;
      } else {
        newSchools++;
      }
      byProvince[province] = (byProvince[province] || 0) + 1;
    });

    return {
      total: schoolIds.size,
      newSchools,
      repeatSchools,
      byProvince,
    };
  }

  /**
   * Leads by Stage
   */
  async getLeadsByStage(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const qb = this.leadRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.stage', 'stage')
      .where('l.deleted_at IS NULL');

    if (userRole === 'sales_rep')
      qb.andWhere('l.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      qb.andWhere('l.assigned_to = :rep', { rep: filters.salesRepId });

    const result = await qb
      .select('l.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.status')
      .getRawMany();

    return result.map((r) => ({
      status: r.status,
      count: Number(r.count),
    }));
  }

  /**
   * SLA Compliance - Stage aging / breach tracking
   */
  async getSLACompliance(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const qb = this.dealRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.school', 'school')
      .leftJoinAndSelect('d.current_stage', 'stage')
      .leftJoinAndSelect('d.assigned_user', 'owner')
      .where('d.closeStatus = :ongoing', { ongoing: DealCloseStatus.ONGOING });

    if (userRole === 'sales_rep')
      qb.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      qb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      qb.andWhere('school.province = :prov', { prov: filters.province });

    const deals = await qb.getMany();
    const now = new Date();

    const breached = deals
      .map((d) => {
        const daysInStage = d.currentStageSince
          ? this.diffDays(now, new Date(d.currentStageSince))
          : 0;
        const slaDays = d.current_stage?.sla_days || 7;
        return {
          id: d.id,
          dealName: d.title,
          schoolName: d.school?.name || 'Unknown',
          stageName: d.current_stage?.name || 'Unknown',
          ownerName: d.assigned_user
            ? `${d.assigned_user.first_name} ${d.assigned_user.last_name}`
            : 'Unknown',
          daysInStage,
          slaDays,
          isBreached: daysInStage > slaDays,
        };
      })
      .filter((d) => d.isBreached)
      .sort((a, b) => b.daysInStage - a.daysInStage);

    return {
      totalActive: deals.length,
      totalBreached: breached.length,
      breachRate:
        deals.length > 0
          ? Math.round((breached.length / deals.length) * 1000) / 10
          : 0,
      breachedDeals: breached,
    };
  }

  /**
   * Lead Conversion Rates
   */
  async getLeadConversion(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const { start, end } = this.getDateRange(filters);

    const leadQb = this.leadRepo
      .createQueryBuilder('l')
      .where('l.created_at >= :start', { start })
      .andWhere('l.created_at <= :end', { end })
      .andWhere('l.deleted_at IS NULL');

    if (userRole === 'sales_rep')
      leadQb.andWhere('l.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      leadQb.andWhere('l.assigned_to = :rep', { rep: filters.salesRepId });

    const leads = await leadQb.getMany();
    const totalLeads = leads.length;
    const convertedLeads = leads.filter((l) => l.status === 'Converted').length;
    const qualifiedLeads = leads.filter(
      (l) => l.status === 'Qualified' || l.status === 'Converted',
    ).length;
    const leadToSchoolRate =
      totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

    // Won deals in period
    const wonQb = this.dealRepo
      .createQueryBuilder('d')
      .where('d.closeStatus = :won', { won: DealCloseStatus.WON })
      .andWhere('d.actualCloseDate >= :start', { start })
      .andWhere('d.actualCloseDate <= :end', { end });

    if (userRole === 'sales_rep')
      wonQb.andWhere('d.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      wonQb.andWhere('d.assigned_to = :rep', { rep: filters.salesRepId });

    const wonDeals = await wonQb.getCount();
    const demoToSaleRate = totalLeads > 0 ? (wonDeals / totalLeads) * 100 : 0;

    return {
      totalLeads,
      convertedLeads,
      qualifiedLeads,
      leadToSchoolRate: Math.round(leadToSchoolRate * 10) / 10,
      wonDeals,
      demoToSaleRate: Math.round(demoToSaleRate * 10) / 10,
    };
  }

  /**
   * Nurture / Follow-ups due
   */
  async getNurtureFollowUps(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    const now = new Date();
    const todayEnd = this.endOfDay(now);
    const in7 = this.addDays(now, 7);

    // Overdue tasks/activities
    const overdueQb = this.activityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.lead', 'lead')
      .leftJoinAndSelect('a.assigned_to', 'assignee')
      .where('a.due_at < :now', { now })
      .andWhere('a.status NOT IN (:...done)', {
        done: ['completed', 'cancelled'],
      })
      .andWhere('a.archived_at IS NULL');

    if (userRole === 'sales_rep')
      overdueQb.andWhere('a.assigned_to_id = :uid', { uid: userId });
    if (filters.salesRepId)
      overdueQb.andWhere('a.assigned_to_id = :rep', {
        rep: filters.salesRepId,
      });

    const overdue = await overdueQb
      .orderBy('a.due_at', 'ASC')
      .take(20)
      .getMany();

    // Due today
    const dueTodayQb = this.activityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.lead', 'lead')
      .leftJoinAndSelect('a.assigned_to', 'assignee')
      .where('a.due_at >= :start', { start: this.startOfDay(now) })
      .andWhere('a.due_at <= :end', { end: todayEnd })
      .andWhere('a.status NOT IN (:...done)', {
        done: ['completed', 'cancelled'],
      })
      .andWhere('a.archived_at IS NULL');

    if (userRole === 'sales_rep')
      dueTodayQb.andWhere('a.assigned_to_id = :uid', { uid: userId });
    if (filters.salesRepId)
      dueTodayQb.andWhere('a.assigned_to_id = :rep', {
        rep: filters.salesRepId,
      });

    const dueToday = await dueTodayQb.getCount();

    // Due in next 7 days
    const dueWeekQb = this.activityRepo
      .createQueryBuilder('a')
      .where('a.due_at > :today', { today: todayEnd })
      .andWhere('a.due_at <= :week', { week: in7 })
      .andWhere('a.status NOT IN (:...done)', {
        done: ['completed', 'cancelled'],
      })
      .andWhere('a.archived_at IS NULL');

    if (userRole === 'sales_rep')
      dueWeekQb.andWhere('a.assigned_to_id = :uid', { uid: userId });
    if (filters.salesRepId)
      dueWeekQb.andWhere('a.assigned_to_id = :rep', {
        rep: filters.salesRepId,
      });

    const dueIn7Days = await dueWeekQb.getCount();

    const formatActivity = (a: Activity) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      leadName: a.lead?.lead_name || null,
      assigneeName: a.assigned_to
        ? `${a.assigned_to.first_name} ${a.assigned_to.last_name}`
        : 'Unassigned',
      dueAt: a.due_at?.toISOString() || null,
      daysOverdue: a.due_at ? this.diffDays(now, a.due_at) : 0,
    });

    return {
      overdueCount: overdue.length,
      dueToday,
      dueIn7Days,
      overdueActivities: overdue.map(formatActivity),
    };
  }

  /**
   * Lead Qualification Overview - qualification stats with needs breakdown
   */
  async getQualificationOverview(
    filters: DashboardFiltersDto,
    userId: string,
    userRole: string,
  ) {
    // Base query with lead join for RBAC
    const qb = this.qualificationRepo
      .createQueryBuilder('q')
      .leftJoin('q.lead', 'lead')
      .leftJoin('lead.school', 'school')
      .where('lead.deleted_at IS NULL');

    if (userRole === 'sales_rep')
      qb.andWhere('lead.assigned_to = :uid', { uid: userId });
    if (filters.salesRepId)
      qb.andWhere('lead.assigned_to = :rep', { rep: filters.salesRepId });
    if (filters.province)
      qb.andWhere('school.province = :prov', { prov: filters.province });

    // Aggregate stats
    const stats = await qb
      .select('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN q.is_qualified = true THEN 1 ELSE 0 END)',
        'qualified',
      )
      .addSelect('AVG(q.qualification_score)', 'avgScore')
      .addSelect(
        'SUM(CASE WHEN q.has_needs = true THEN 1 ELSE 0 END)',
        'withNeeds',
      )
      .addSelect(
        'SUM(CASE WHEN q.has_plan_type = true THEN 1 ELSE 0 END)',
        'withPlanType',
      )
      .addSelect(
        'SUM(CASE WHEN q.has_timeline = true THEN 1 ELSE 0 END)',
        'withTimeline',
      )
      .addSelect(
        'SUM(CASE WHEN q.has_budget = true THEN 1 ELSE 0 END)',
        'withBudget',
      )
      .addSelect(
        'SUM(CASE WHEN q.has_verified_contact = true THEN 1 ELSE 0 END)',
        'withContact',
      )
      .getRawOne();

    // Get all qualifications with needs for product breakdown
    const qualWithNeeds = await this.qualificationRepo
      .createQueryBuilder('q')
      .leftJoin('q.lead', 'lead')
      .leftJoin('lead.school', 'school')
      .where('lead.deleted_at IS NULL')
      .andWhere('q.qualification_needs IS NOT NULL')
      .select('q.qualification_needs')
      .getMany();

    // Aggregate qualification_needs across all leads
    const needsMap = new Map<
      string,
      { name: string; count: number; totalValue: number }
    >();
    for (const q of qualWithNeeds) {
      if (q.qualification_needs) {
        for (const need of q.qualification_needs) {
          const existing = needsMap.get(need.id);
          const netValue = need.price - need.discount + need.tax;
          if (existing) {
            existing.count++;
            existing.totalValue += netValue;
          } else {
            needsMap.set(need.id, {
              name: need.name,
              count: 1,
              totalValue: netValue,
            });
          }
        }
      }
    }

    const topNeeds = Array.from(needsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Score distribution
    const distribution = await this.qualificationRepo
      .createQueryBuilder('q')
      .leftJoin('q.lead', 'lead')
      .where('lead.deleted_at IS NULL')
      .select(
        `CASE
          WHEN q.qualification_score >= 80 THEN 'qualified'
          WHEN q.qualification_score >= 60 THEN 'warm'
          WHEN q.qualification_score >= 30 THEN 'developing'
          ELSE 'cold'
        END`,
        'bucket',
      )
      .addSelect('COUNT(*)', 'count')
      .groupBy('bucket')
      .getRawMany();

    return {
      total: Number(stats?.total || 0),
      qualified: Number(stats?.qualified || 0),
      averageScore: Math.round(Number(stats?.avgScore || 0) * 10) / 10,
      criteriaBreakdown: {
        withNeeds: Number(stats?.withNeeds || 0),
        withPlanType: Number(stats?.withPlanType || 0),
        withTimeline: Number(stats?.withTimeline || 0),
        withBudget: Number(stats?.withBudget || 0),
        withContact: Number(stats?.withContact || 0),
      },
      scoreDistribution: distribution.map((d) => ({
        bucket: d.bucket,
        count: Number(d.count),
      })),
      topNeeds,
    };
  }

  // ===== TOP SELLING PRODUCTS =====

  async getTopSellingProducts(
    filters: DashboardFiltersDto,
    userId: string,
    role: string,
  ) {
    const { start, end } = this.getDateRange(filters);

    // Build base query: document_items → quotes → users (sales reps)
    const baseQb = this.documentItemRepo
      .createQueryBuilder('di')
      .innerJoin(
        'quotes',
        'q',
        'di.document_id = q.id AND di.document_type = :docType',
        { docType: 'Quote' },
      )
      .innerJoin('users', 'u', 'q.owner_id = u.id')
      .where('di.product_id IS NOT NULL')
      .andWhere('di.created_at BETWEEN :start AND :end', { start, end });

    if (role === 'sales_rep') {
      baseQb.andWhere('q.owner_id = :userId', { userId });
    } else if (filters.salesRepId) {
      baseQb.andWhere('q.owner_id = :salesRepId', {
        salesRepId: filters.salesRepId,
      });
    }

    // Step 1: Get top 5 products by total value
    const topProducts = await baseQb
      .clone()
      .innerJoin('products', 'p', 'di.product_id = p.id')
      .select('di.product_id', 'product_id')
      .addSelect('p.name', 'product_name')
      .addSelect('SUM(di.quantity)', 'totalCount')
      .addSelect('SUM(di.total)', 'totalAmount')
      .groupBy('di.product_id')
      .addGroupBy('p.name')
      .orderBy('SUM(di.total)', 'DESC')
      .limit(5)
      .getRawMany();

    if (topProducts.length === 0) {
      return { products: [] };
    }

    const productIds = topProducts.map((p: any) => p.product_id);

    // Step 2: Get by-rep breakdown for those products
    const byRepRows = await this.documentItemRepo
      .createQueryBuilder('di')
      .innerJoin(
        'quotes',
        'q',
        'di.document_id = q.id AND di.document_type = :docType',
        { docType: 'Quote' },
      )
      .innerJoin('users', 'u', 'q.owner_id = u.id')
      .select('di.product_id', 'product_id')
      .addSelect("CONCAT(u.first_name, ' ', u.last_name)", 'rep_name')
      .addSelect('SUM(di.quantity)', 'count')
      .addSelect('SUM(di.total)', 'value')
      .where('di.product_id IN (:...productIds)', { productIds })
      .andWhere('di.created_at BETWEEN :start AND :end', { start, end })
      .groupBy('di.product_id')
      .addGroupBy('q.owner_id')
      .addGroupBy('u.first_name')
      .addGroupBy('u.last_name')
      .orderBy('SUM(di.total)', 'DESC')
      .getRawMany();

    // Step 3: Assemble response
    const repsByProduct = new Map<
      string,
      Array<{ name: string; count: number; value: number }>
    >();
    for (const row of byRepRows) {
      const list = repsByProduct.get(row.product_id) || [];
      list.push({
        name: row.rep_name,
        count: Number(row.count),
        value: Number(row.value),
      });
      repsByProduct.set(row.product_id, list);
    }

    const products = topProducts.map((p: any) => ({
      product_id: p.product_id,
      product_name: p.product_name,
      totalCount: Number(p.totalCount),
      totalAmount: Number(p.totalAmount),
      byRep: repsByProduct.get(p.product_id) || [],
    }));

    return { products };
  }
}
