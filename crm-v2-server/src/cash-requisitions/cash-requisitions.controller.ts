import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CashRequisitionsService } from './cash-requisitions.service';
import type { RequestingUser } from './cash-requisitions.service';
import {
  CreateCashRequisitionDto,
  UpdateCashRequisitionDto,
  QueryCashRequisitionDto,
  RejectRequisitionDto,
} from './dto/cash-requisition.dto';

const MANAGER_APPROVERS = ['admin', 'manager', 'sales_manager'] as const;
const FINANCE_APPROVERS = ['admin', 'finance'] as const;

/**
 * Roles able to RAISE costs: every CRM operator. Ownership rules
 * (only the requester can edit/submit their own draft) are enforced
 * in the service, not just hidden in the UI.
 */
const ALL_OPERATORS = [
  'admin',
  'manager',
  'sales_manager',
  'sales_rep',
  'finance',
] as const;

@ApiTags('Cash Requisitions')
@ApiBearerAuth()
@Controller('cash-requisitions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashRequisitionsController {
  constructor(private readonly service: CashRequisitionsService) {}

  @Post()
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Create a cash requisition (DRAFT)' })
  async create(
    @Body() dto: CreateCashRequisitionDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.service.create(dto, userId);
    return { success: true, message: 'Requisition created', data };
  }

  @Get()
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'List requisitions (reps see their own)' })
  async findAll(
    @Query() query: QueryCashRequisitionDto,
    @CurrentUser() user: RequestingUser,
  ) {
    const result = await this.service.findAll(query, user);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('deals/:dealId/summary')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Per-currency cost rollup for a deal' })
  async dealSummary(@Param('dealId', ParseUUIDPipe) dealId: string) {
    const data = await this.service.getDealCostSummary(dealId);
    return { success: true, data };
  }

  @Get('leads/:leadId/summary')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Per-currency cost rollup for a lead' })
  async leadSummary(@Param('leadId', ParseUUIDPipe) leadId: string) {
    const data = await this.service.getLeadCostSummary(leadId);
    return { success: true, data };
  }

  /* Stage 4 report — declared BEFORE ':id' so the literal path wins. */
  @Get('reports/cost-to-close')
  @Roles('admin', 'manager', 'sales_manager', 'finance')
  @ApiOperation({
    summary: 'Spend per WON deal (acquisition cost) and LOST deal, by currency',
  })
  async costToClose() {
    const data = await this.service.getCostToCloseReport();
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Get one requisition' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Edit a DRAFT requisition (requester only)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashRequisitionDto,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, message: 'Requisition updated', data };
  }

  @Post(':id/submit')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Submit a DRAFT requisition for approval' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.submit(id, user);
    return { success: true, message: 'Requisition submitted', data };
  }

  /* ===== Stage 3: approval chain ===== */

  @Post(':id/manager-approve')
  @Roles(...MANAGER_APPROVERS)
  @ApiOperation({ summary: 'Manager: approve a SUBMITTED requisition' })
  async managerApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.managerApprove(id, user);
    return { success: true, message: 'Requisition manager-approved', data };
  }

  @Post(':id/manager-reject')
  @Roles(...MANAGER_APPROVERS)
  @ApiOperation({ summary: 'Manager: reject a SUBMITTED requisition' })
  async managerReject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRequisitionDto,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.managerReject(id, dto.reason, user);
    return { success: true, message: 'Requisition rejected', data };
  }

  @Post(':id/finance-approve')
  @Roles(...FINANCE_APPROVERS)
  @ApiOperation({ summary: 'Finance: approve a MANAGER_APPROVED requisition' })
  async financeApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.financeApprove(id, user);
    return { success: true, message: 'Requisition finance-approved', data };
  }

  @Post(':id/finance-reject')
  @Roles(...FINANCE_APPROVERS)
  @ApiOperation({ summary: 'Finance: reject a MANAGER_APPROVED requisition' })
  async financeReject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRequisitionDto,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.financeReject(id, dto.reason, user);
    return { success: true, message: 'Requisition rejected', data };
  }

  @Post(':id/mark-paid')
  @Roles(...FINANCE_APPROVERS)
  @ApiOperation({ summary: 'Finance: mark a FINANCE_APPROVED requisition paid' })
  async markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.markPaid(id, user);
    return { success: true, message: 'Requisition marked paid', data };
  }

}
