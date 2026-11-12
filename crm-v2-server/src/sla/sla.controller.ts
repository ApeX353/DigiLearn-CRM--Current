import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SlaBreachService } from './sla-breach.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('SLA')
@Controller('sla')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlaController {
  constructor(private readonly slaBreachService: SlaBreachService) {}

  @Post('check-lead-breaches')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Check for lead SLA breaches and create notifications',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead SLA breach check completed',
  })
  async checkLeadBreaches() {
    const data = await this.slaBreachService.checkLeadSlaBreaches();
    return {
      success: true,
      message: `Found ${data.breachedCount} new lead SLA breach(es)`,
      data,
    };
  }

  @Post('check-deal-breaches')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Check for deal SLA breaches and create notifications',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deal SLA breach check completed',
  })
  async checkDealBreaches() {
    const data = await this.slaBreachService.checkDealSlaBreaches();
    return {
      success: true,
      message: `Found ${data.breachedCount} new deal SLA breach(es)`,
      data,
    };
  }

  @Get('lead-breaches')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get current lead SLA breach summary' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead breach summary retrieved',
  })
  async getLeadBreaches() {
    const data = await this.slaBreachService.getLeadBreachSummary();
    return {
      success: true,
      data,
    };
  }

  @Get('deal-breaches')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get current deal SLA breach summary' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deal breach summary retrieved',
  })
  async getDealBreaches() {
    const data = await this.slaBreachService.getDealBreachSummary();
    return {
      success: true,
      data,
    };
  }
}
