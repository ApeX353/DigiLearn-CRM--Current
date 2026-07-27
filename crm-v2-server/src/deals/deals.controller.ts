import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { subject } from '@casl/ability';
import { DealsService } from './deals.service';
import {
  CreateDealDto,
  UpdateDealDto,
  CloseDealDto,
  BulkUpdateDealDto,
  UpdateDealStageDto,
  AddAssigneeDto,
  CreateDealRollbackRequestDto,
  QueryArchivedDealsDto,
  QueryDealRollbackRequestsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CheckPermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CaslAbility } from '../auth/decorators/casl-ability.decorator';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { Action } from '../auth/constants/permissions';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Deal, DealCloseStatus } from './entities/deal.entity';
import { QueryDealsDto } from './dto/query-deals';

/**
 * SEED1: the seeded rule key and the key read here drifted apart
 * (`assignedTo` written, `assigned_to` read), which scoped nothing and
 * failed silently — a rep would simply have seen the whole board. The
 * seed is corrected, and both spellings are accepted here so a stale
 * rule row in any environment cannot reopen it.
 */
function dealOwnerScope(
  conditions?: { assigned_to?: string; assignedTo?: string } | null,
): string | undefined {
  return conditions?.assigned_to ?? conditions?.assignedTo;
}

@ApiTags('Deals')
@Controller('deals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  // ========================
  // CREATE DEAL
  // ========================

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create a new deal from a lead' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Deal created' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  async create(
    @Body() dto: CreateDealDto,
    @CurrentUser('id') userId: string,
    @CurrentUser() currentUser: { roles?: Array<{ name: string }> },
  ) {
    const userRoles = (currentUser?.roles || []).map((r) => r.name);
    const data = await this.dealsService.createDeal(dto, userId, userRoles);
    return { success: true, data, message: 'Deal created successfully' };
  }

  // ========================
  // GET ARCHIVED DEALS (static route — before :id)
  // ========================

  @Get()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get paginated archived (closed) deals' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Archived deals list' })
  async getDeals(@Query() query: QueryDealsDto) {
    const result = await this.dealsService.getDeals(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  @Get('archived')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get paginated archived (closed) deals' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Archived deals list' })
  async getArchivedDeals(@Query() query: QueryArchivedDealsDto) {
    const result = await this.dealsService.getArchivedDeals(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  // ========================
  // GET PIPELINE DEALS (static route — before :id)
  // ========================

  @Get('pipeline/:id')
  // @Roles('admin', 'sales_manager', 'sales_rep', 'viewer')
  @CheckPermission('read', 'Deal')
  @ApiOperation({ summary: 'Get all ongoing deals for a pipeline' })
  @ApiParam({ name: 'id', description: 'Pipeline UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Pipeline deals' })
  async findPipelineDeals(
    @Param('id', ParseUUIDPipe) id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const conditions = ability
      .rulesFor(Action.READ, 'Deal')
      ?.find((rule) => rule.conditions)?.conditions as
      | { status?: DealCloseStatus; search?: string; assigned_to?: string }
      | undefined;
    const data = await this.dealsService.findPipelineDeals(id, {
      ...conditions,
      assigned_to: dealOwnerScope(conditions),
    });
    return { success: true, data };
  }

  @Get('summary')
  @Roles('admin', 'sales_manager', 'sales_rep', 'viewer')
  @ApiOperation({
    summary: 'Get summary metrics for ongoing deals in a pipeline',
  })
  @ApiQuery({
    name: 'pipeline_id',
    required: true,
    description: 'Pipeline UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pipeline summary metrics',
  })
  async getPipelineSummary(
    @Query('pipeline_id', ParseUUIDPipe) pipelineId: string,
    @CaslAbility() ability: AppAbility,
  ) {
    // The header must count the same deals as the board below it, so it
    // reuses the board's ownership conditions (assigned_to for reps).
    const conditions = ability
      ?.rulesFor(Action.READ, 'Deal')
      ?.find((rule) => rule.conditions)?.conditions as
      | { assigned_to?: string; assignedTo?: string }
      | undefined;
    const data = await this.dealsService.getPipelineSummary(
      pipelineId,
      dealOwnerScope(conditions),
    );
    return { success: true, data };
  }

  // ========================
  // BULK UPDATE (static route — before :id)
  // ========================

  @Patch('bulk-update')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Bulk update deal positions and/or stages (kanban drag)',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Deals updated' })
  async bulkUpdate(@Body() dto: BulkUpdateDealDto, @CurrentUser() user: any) {
    const data = await this.dealsService.bulkUpdate(dto, user);
    return { success: true, data, message: 'Deals updated successfully' };
  }

  // ========================
  // EXPORT
  // ========================

  @Get('export')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Export deals as CSV' })
  async exportCsv(
    @Query() query: any,
    @Res() res: Response,
  ) {
    const result = await this.dealsService.getDeals(query);
    const deals = result.items;

    const headers = ['Title', 'Value', 'Stage', 'Status', 'School', 'Assigned To', 'Health Score', 'Created At'];
    const rows = deals.map((deal: any) => [
      deal.title || '',
      deal.value || 0,
      deal.current_stage?.name || deal.currentStatus || '',
      deal.closeStatus || '',
      deal.school?.name || '',
      deal.assigned_user ? `${deal.assigned_user.first_name} ${deal.assigned_user.last_name}` : '',
      deal.healthScore || 0,
      deal.created_at ? new Date(deal.created_at).toISOString().split('T')[0] : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="deals-export-${Date.now()}.csv"`);
    res.send(csvContent);
  }

  // ========================
  // DEAL ROLLBACK REQUESTS
  // ========================

  @Get(':id/rollback-requests')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get rollback requests for a deal' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deal rollback requests retrieved successfully',
  })
  async findRollbackRequests(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryDealRollbackRequestsDto,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.assertDealAccess(id, ability, Action.READ);
    const data = await this.dealsService.findRollbackRequestsByDeal(
      id,
      query.status,
    );
    return { success: true, data };
  }

  @Post(':id/rollback-requests')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Submit a rollback request for a deal' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Deal rollback request submitted successfully',
  })
  async createRollbackRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDealRollbackRequestDto,
    @CurrentUser('id') userId: string,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.assertDealAccess(id, ability, Action.UPDATE);
    const data = await this.dealsService.createRollbackRequest(id, dto, userId);
    return {
      success: true,
      data,
      message: 'Rollback request submitted successfully',
    };
  }

  // ========================
  // GET DEAL DETAILS
  // ========================

  @Get(':id')
  @CheckPermission('read', 'Deal')
  @ApiOperation({ summary: 'Get deal details with all relations' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Deal details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Deal not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const data = await this.dealsService.findDealDetails(id);

    // manage:all / manage:Deal → full access (admin, sales_manager)
    // read:Deal { conditions } → ownership-scoped access (sales_rep)
    const canManage =
      ability.can(Action.MANAGE, 'all' as any) ||
      ability.can(Action.MANAGE, 'Deal');
    const canRead =
      ability.can(Action.READ, 'Deal') ||
      ability.can(Action.READ, subject('Deal', data as Deal));

    if (!canManage && !canRead) {
      throw new ForbiddenException('You do not have access to this deal');
    }

    return { success: true, data };
  }

  // ========================
  // GET DEAL HEALTH
  // ========================

  @Get(':id/health')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get deal health scores' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Deal health scores' })
  async getDealHealth(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.dealsService.getDealHealth(id);
    return { success: true, data };
  }

  // ========================
  // CALCULATE DEAL HEALTH
  // ========================

  @Post(':id/health/calculate')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Calculate and persist deal health score' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Health score calculated',
  })
  async calculateDealHealth(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dealsService.calculateDealHealth(id, userId);
    return { success: true, data, message: 'Health score calculated' };
  }

  // ========================
  // UPDATE DEAL
  // ========================

  @Put(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Update a deal (stage change triggers history + SLA tracking)',
  })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Deal updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Deal not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dealsService.update(id, dto, userId);
    return { success: true, data, message: 'Deal updated successfully' };
  }

  // ========================
  // UPDATE STAGE
  // ========================

  @Patch(':id/stage')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Move deal to a new stage with SLA tracking' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Stage updated' })
  async updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealStageDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dealsService.updateStage(id, dto, userId);
    return { success: true, data, message: 'Deal stage updated' };
  }

  // ========================
  // CLOSE DEAL
  // ========================

  @Patch(':id/close')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Close a deal as won or lost' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Deal closed' })
  async closeDeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseDealDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dealsService.closeDeal(id, dto, userId);
    return {
      success: true,
      data,
      message: `Deal closed as ${dto.close_status}`,
    };
  }

  // ========================
  // ADD ASSIGNEE
  // ========================

  @Patch(':id/assignee')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Assign a user to a deal' })
  @ApiParam({ name: 'id', description: 'Deal UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Assignee updated' })
  async addAssignee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAssigneeDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dealsService.addAssignee(id, dto, userId);
    return { success: true, data, message: 'Deal assignee updated' };
  }

  private async assertDealAccess(
    id: string,
    ability: AppAbility,
    action: Action,
  ): Promise<void> {
    const deal = await this.dealsService.findDealDetails(id);
    const canManage =
      ability.can(Action.MANAGE, 'all' as any) ||
      ability.can(Action.MANAGE, 'Deal');
    const canAct =
      ability.can(action, 'Deal') ||
      ability.can(action, subject('Deal', deal as Deal));

    if (!canManage && !canAct) {
      throw new ForbiddenException('You do not have access to this deal');
    }
  }
}
