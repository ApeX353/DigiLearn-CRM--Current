import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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
}
