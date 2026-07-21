import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import {
  DisciplineMetricsService,
  type MetricWindow,
} from './discipline-metrics.service';
import { ActivityDisciplineService } from './activity-discipline.service';
import { ComplianceReportService } from './compliance-report.service';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly disciplineMetrics: DisciplineMetricsService,
    private readonly activityDiscipline: ActivityDisciplineService,
    private readonly complianceReport: ComplianceReportService,
  ) {}

  /**
   * Phase E — admin/manager-only compliance report endpoint. Returns
   * org totals + per-rep breakdown vs the configured Compliance &
   * Controls thresholds. The frontend renders this on the new
   * /admin/compliance-report page. JwtAuthGuard + RolesGuard are
   * registered globally in app.module.ts, so we only need @Roles.
   */
  @Get('compliance-report')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Compliance report — org totals + per-rep pass/fail vs targets',
  })
  async getComplianceReport(@Query() filters: DashboardFiltersDto) {
    const data = await this.complianceReport.compute(filters);
    return { data, status: 'success' };
  }

  @Get('discipline-metrics')
  @ApiOperation({
    summary:
      'Four-category discipline metrics (volume/quality/discipline/progression)',
  })
  async getDisciplineMetrics(
    @Query('window') window: string | undefined,
    @Query('user_id') userId: string | undefined,
    @Req() req: any,
  ) {
    // Self-scope when the caller is a sales_rep unless they
    // explicitly asked for a team view. Managers/admins see team-wide
    // by default and can filter by user_id.
    const callerId = req.user?.id || req.user?.sub;
    const roles = req.user?.roles || [];
    const isManager = roles.some((r: any) =>
      ['admin', 'sales_manager'].includes(r?.name || r),
    );
    const resolvedUser = userId
      ? userId
      : isManager
        ? undefined
        : callerId;
    const w = (
      ['week', 'mtd', 'quarter', 'year'].includes(window ?? '')
        ? window
        : 'mtd'
    ) as MetricWindow;
    const data = await this.disciplineMetrics.compute(w, resolvedUser);
    return { data, status: 'success' };
  }

  private getUserInfo(req: any): { userId: string; role: string } {
    const userId = req.user?.id || req.user?.sub || '';
    const roles = req.user?.roles || [];
    const role =
      roles.find((r: any) =>
        ['admin', 'sales_manager', 'sales_rep'].includes(r?.name || r),
      )?.name ||
      roles[0]?.name ||
      roles[0] ||
      'sales_rep';
    return { userId, role };
  }

  @Get('activity-discipline')
  @ApiOperation({
    summary:
      'Activity Discipline bundle — volume / quality / progression / at-risk / per-rep',
  })
  async getActivityDiscipline(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    // Self-scope the payload for sales_rep callers unless they
    // deliberately asked for a teammate; managers see team-wide by
    // default (matching the discipline-metrics behaviour above).
    const callerId = req.user?.id || req.user?.sub;
    const roles = req.user?.roles || [];
    const isManager = roles.some((r: any) =>
      ['admin', 'sales_manager', 'manager'].includes(r?.name || r),
    );
    const scoped: DashboardFiltersDto = {
      ...filters,
      salesRepId: filters.salesRepId
        ? filters.salesRepId
        : isManager
          ? undefined
          : callerId,
    };
    const data = await this.activityDiscipline.compute(scoped);
    return { data, status: 'success' };
  }

  @Get('kpis')
  @ApiOperation({ summary: 'Executive KPIs' })
  async getKPIs(@Query() filters: DashboardFiltersDto, @Req() req: any) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getExecutiveKPIs(filters, userId, role);
    return {
      data,
      status: 'success',
    }
  }

  @Get('leads-contacted')
  @ApiOperation({ summary: 'Leads contacted vs target' })
  async getLeadsContacted(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getLeadsContactedStats(filters, userId, role);
    return {
      data,
      status: 'success',
    }
  }

  @Get('collections-due')
  @ApiOperation({ summary: 'Collections due and overdue' })
  async getCollectionsDue(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getCollectionsDue(filters, userId, role);
    return {
      data,
      status: 'success',
    }
  }

  @Get('sales-metrics')
  @ApiOperation({ summary: 'Sales metrics with period comparison' })
  async getSalesMetrics(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getSalesMetrics(filters, userId, role);
    return {
      data,
      status: 'success',
    }
  }

  @Get('demo-stats')
  @ApiOperation({ summary: 'Demo pipeline stats' })
  async getDemoStats(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getDemoStats(filters, userId, role);
    return {
      data,
      status: 'success',
    }
  }

  @Get('high-value-deals')
  @ApiOperation({ summary: 'High value active deals' })
  async getHighValueDeals(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getHighValueDeals(filters, userId, role);
    return {
      data,
      status: 'success',
    }
  }

  @Get('funnel-health')
  @ApiOperation({ summary: 'Funnel health and stage breakdown' })
  async getFunnelHealth(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getFunnelHealth(filters, userId, role);
    return {
      data,
      status: 'success',
    }
  }

  @Get('schools-bought')
  @ApiOperation({ summary: 'Schools bought - customer acquisition' })
  async getSchoolsBought(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getSchoolsBought(filters, userId, role);
    return {
      data,
      status: 'success',
    };
  }

  @Get('leads-by-stage')
  @ApiOperation({ summary: 'Leads grouped by status' })
  async getLeadsByStage(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getLeadsByStage(filters, userId, role);
    return {
      data,
      status: 'success',
    };
  }

  @Get('sla-compliance')
  @ApiOperation({ summary: 'SLA compliance and breach tracking' })
  async getSLACompliance(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getSLACompliance(filters, userId, role);
    return {
      data,
      status: 'success',
    };
  }

  @Get('lead-conversion')
  @ApiOperation({ summary: 'Lead conversion rates' })
  async getLeadConversion(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getLeadConversion(filters, userId, role);
    return {
      data,
      status: 'success',
    };
  }

  @Get('nurture-follow-ups')
  @ApiOperation({ summary: 'Nurture and follow-up activities' })
  async getNurtureFollowUps(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getNurtureFollowUps(filters, userId, role);
    return {
      data,
      status: 'success',
    };
  }

  @Get('qualification-overview')
  @ApiOperation({ summary: 'Lead qualification overview with needs breakdown' })
  async getQualificationOverview(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getQualificationOverview(filters, userId, role);
    return {
      data,
      status: 'success',
    };
  }

  @Get('top-selling-products')
  @ApiOperation({ summary: 'Top 5 selling products with by-rep breakdown' })
  async getTopSellingProducts(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    const { userId, role } = this.getUserInfo(req);
    const data = await this.dashboardService.getTopSellingProducts(filters, userId, role);
    return {
      data,
      status: 'success',
    };
  }

  // Alias — frontend's dashboard widget queries `/top-performing-products`
  // but the canonical route above is `/top-selling-products`. Instead of
  // renaming either side (both names read naturally from their own
  // perspective) we route both to the same handler. Eliminates the 404
  // the browser was throwing on every dashboard load.
  @Get('top-performing-products')
  @ApiOperation({
    summary: 'Alias of /top-selling-products — matches the frontend hook.',
  })
  async getTopPerformingProducts(
    @Query() filters: DashboardFiltersDto,
    @Req() req: any,
  ) {
    return this.getTopSellingProducts(filters, req);
  }
}
