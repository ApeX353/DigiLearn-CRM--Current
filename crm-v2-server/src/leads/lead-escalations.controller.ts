import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CaslAbility } from '../auth/decorators/casl-ability.decorator';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { LeadsService } from './leads.service';
import { LeadEscalationService } from './services/lead-escalation.service';
import {
  CreateLeadEscalationDto,
  ResolveLeadEscalationDto,
} from './dto/lead-escalation.dto';

/**
 * Lead-escalation HTTP surface.
 *
 *   POST   /leads/:leadId/escalations       → rep escalates a stuck lead
 *   GET    /leads/:leadId/escalations       → history tab on lead detail
 *   GET    /escalations/leads               → manager queue (open/resolved)
 *   PATCH  /escalations/leads/:id/resolve   → manager resolution
 *
 * Keeping the manager queue at `/escalations/leads` (plural plural) leaves
 * room for `/escalations/deals` later without clashing with the
 * nested-per-record path.
 */

@ApiTags('Lead Escalations')
@ApiBearerAuth()
@Controller()
export class LeadEscalationsController {
  constructor(
    private readonly service: LeadEscalationService,
    private readonly leadsService: LeadsService,
  ) {}

  // Both per-lead routes are scoped exactly as GET /leads/:id is: a rep
  // reaches only the leads they may read. Until 11 Sep 2026 neither
  // checked, so a rep could open an escalation on a colleague's lead and
  // read its history (BUG-046, AUDIT_COVERAGE_V2.md).

  @Post('leads/:leadId/escalations')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Escalate a stuck lead' })
  @ApiResponse({ status: HttpStatus.CREATED })
  async escalate(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() body: CreateLeadEscalationDto,
    @Req() req: any,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.leadsService.assertLeadReadable(leadId, ability);
    const userId = req?.user?.id ?? req?.user?.sub;
    const row = await this.service.escalate(leadId, userId, body);
    return { success: true, data: row };
  }

  @Get('leads/:leadId/escalations')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'List escalations on a lead (history)' })
  async forLead(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.leadsService.assertLeadReadable(leadId, ability);
    const rows = await this.service.byLead(leadId);
    return { success: true, data: rows };
  }

  @Get('escalations/leads')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Manager queue of lead escalations' })
  async queue(@Query('status') status?: 'open' | 'resolved' | 'all') {
    const rows = await this.service.list({ status });
    return { success: true, data: rows };
  }

  @Patch('escalations/leads/:id/resolve')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Record a resolution on a lead escalation' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveLeadEscalationDto,
    @Req() req: any,
  ) {
    const userId = req?.user?.id ?? req?.user?.sub;
    const row = await this.service.resolve(id, userId, body);
    return { success: true, data: row };
  }
}
