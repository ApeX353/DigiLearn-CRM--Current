import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FinanceReconciliationService } from './finance-reconciliation.service';

export class RepairDto {
  /** false (default) = dry run: compute and report, write nothing. */
  @IsOptional()
  @IsBoolean()
  apply?: boolean;
}

export class RepairStatusesDto extends RepairDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  invoice_ids?: string[];
}

/**
 * FIN-05 / FIN-07: the money invariants and their reviewed repairs.
 * Reading is for admins and support; repairing is support only, dry run by
 * default, and every applied change leaves an audit row naming the person.
 */
@ApiTags('Finance')
@ApiBearerAuth()
@Controller('finance/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly reconciliation: FinanceReconciliationService) {}

  @Get()
  @Roles('admin', 'admin_support')
  @ApiOperation({ summary: 'Check every money invariant; counts and samples of the offending rows' })
  async check() {
    return { success: true, data: await this.reconciliation.check() };
  }

  @Post('repair-caches')
  @Roles('admin_support')
  @ApiOperation({ summary: 'Recompute derived money figures from their sources of truth (dry run unless apply=true)' })
  async repairCaches(@Body() dto: RepairDto, @CurrentUser('id') userId: string) {
    return {
      success: true,
      data: await this.reconciliation.repairCaches(dto.apply === true, userId),
    };
  }

  @Post('repair-allocations')
  @Roles('admin_support')
  @ApiOperation({ summary: 'Allocate unallocated receipts to their invoices’ open instalments, oldest first (dry run unless apply=true)' })
  async repairAllocations(@Body() dto: RepairDto, @CurrentUser('id') userId: string) {
    return {
      success: true,
      data: await this.reconciliation.repairAllocations(dto.apply === true, userId),
    };
  }

  @Post('repair-statuses')
  @Roles('admin_support')
  @ApiOperation({ summary: 'Set invoice statuses to what the money says (dry run unless apply=true); no e-mails' })
  async repairStatuses(@Body() dto: RepairStatusesDto, @CurrentUser('id') userId: string) {
    return {
      success: true,
      data: await this.reconciliation.repairStatuses(dto.apply === true, userId, dto.invoice_ids),
    };
  }
}
