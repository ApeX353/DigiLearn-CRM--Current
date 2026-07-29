import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateLeadWithSchoolContactsDto } from '../leads/dto';
import { IngestWhatsAppDto } from './dto/ingest-whatsapp.dto';
import { WhatsappIngestService } from './services/whatsapp-ingest.service';
import { SocialHandoffService } from './services/social-handoff.service';
import { QuoteDraftService } from './services/quote-draft.service';
import { AttributionService } from './services/attribution.service';
import { LeadAutoRouterService } from './services/lead-auto-router.service';
import { AssignmentProposalStatus } from './entities/lead-assignment-proposal.entity';

@ApiTags('Automation')
@Controller('automation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationController {
  constructor(
    private readonly whatsappIngest: WhatsappIngestService,
    private readonly socialHandoff: SocialHandoffService,
    private readonly quoteDraft: QuoteDraftService,
    private readonly attribution: AttributionService,
    private readonly autoRouter: LeadAutoRouterService,
  ) {}

  // ------------------- AUTO1: assignment proposals -------------------
  // The engine proposes; a manager decides. Reps never see this queue.

  // The "Run auto-assign" button. A manager taps it; distribution runs
  // and lands in the Approval Queue as proposals — nothing is assigned
  // until the manager approves. Returns the per-person "will gain X"
  // preview so the manager sees the shape before approving.
  @Post('assignment-proposals/run')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Run auto-assign distribution (proposes only)' })
  async runAssignmentDistribution(@CurrentUser('id') userId: string) {
    const data = await this.autoRouter.runDistribution(userId);
    return { success: true, data };
  }

  @Get('assignment-proposals')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'List auto-assign proposals awaiting a decision' })
  async listAssignmentProposals(@Query('status') status?: string) {
    const wanted = Object.values(AssignmentProposalStatus).includes(
      status as AssignmentProposalStatus,
    )
      ? (status as AssignmentProposalStatus)
      : AssignmentProposalStatus.PENDING;
    const data = await this.autoRouter.listProposals(wanted);
    return { success: true, data };
  }

  @Patch('assignment-proposals/:id/approve')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Approve one proposal — assigns the lead' })
  async approveAssignmentProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.autoRouter.approveProposal(id, userId);
    return { success: true, data, message: 'Lead assigned' };
  }

  @Patch('assignment-proposals/:id/reject')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Reject one proposal — lead stays unassigned' })
  async rejectAssignmentProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.autoRouter.rejectProposal(id, userId);
    return { success: true, data, message: 'Proposal rejected' };
  }

  @Post('assignment-proposals/approve-batch')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Approve a batch of proposals in one call' })
  async approveAssignmentProposalBatch(
    @Body('ids') ids: string[],
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.autoRouter.approveProposals(
      Array.isArray(ids) ? ids : [],
      userId,
    );
    return { success: true, data };
  }

  // #5 — WhatsApp ingestion landing zone (called by the external connector).
  @Post('ingest/whatsapp')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Ingest normalized WhatsApp messages as activities' })
  async ingestWhatsApp(
    @Body() dto: IngestWhatsAppDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.whatsappIngest.ingest(dto, userId);
    return { success: true, data: result };
  }

  // #9 — Social→sales handoff (marketing-triaged inbound → CRM lead).
  @Post('handoff/social-lead')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create a CRM lead from a triaged social inbound' })
  async createSocialLead(
    @Body() dto: CreateLeadWithSchoolContactsDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.socialHandoff.handoff(dto, userId);
    return { success: true, data: result };
  }

  // #8 — Quote/proposal draft scaffold (read-only; no prices invented).
  @Get('quote-draft/:dealId')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Assemble a read-only quote draft from a deal' })
  async quoteDraftForDeal(@Param('dealId') dealId: string) {
    const data = await this.quoteDraft.draftForDeal(dealId);
    return { success: true, data };
  }

  // #12 — Marketing→CRM source attribution (read-only).
  @Get('attribution/sources')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Lead source attribution with conversion' })
  async sourceAttribution() {
    const data = await this.attribution.getSourceAttribution();
    return { success: true, data };
  }
}
