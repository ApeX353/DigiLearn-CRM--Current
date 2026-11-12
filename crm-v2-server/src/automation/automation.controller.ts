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
import { FollowupReminderService } from './services/followup-reminder.service';
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
    private readonly followupReminders: FollowupReminderService,
  ) {}

  // FU6: manual trigger for the follow-up due/missed reminder sweep. The sweep
  // also runs hourly on a cron; this lets a manager (or ops verification) fire
  // it on demand. Deduped per activity+day, so extra runs are safe.
  @Post('followup-reminders/run')
  @Roles('admin', 'sales_manager', 'admin_support')
  @ApiOperation({ summary: 'Run the follow-up due/missed reminder sweep now' })
  async runFollowupReminders() {
    const data = await this.followupReminders.run();
    return { success: true, data };
  }

  // ------------------- AUTO1: assignment proposals -------------------
  // The engine proposes; a manager decides. Reps never see this queue.

  // The "Run auto-assign" button. A manager taps it and chooses a batch
  // size (50/100/250/500 or "all"); distribution runs and lands in the
  // Approval Queue as proposals — nothing is assigned until the manager
  // approves. Returns the per-person "will gain X" preview.
  @Post('assignment-proposals/run')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Run auto-assign distribution (proposes only)' })
  async runAssignmentDistribution(
    @CurrentUser('id') userId: string,
    @Query('limit') limitParam?: string,
    @Query('campaign_id') campaignId?: string,
  ) {
    // "all" (or nothing) → distribute every eligible lead; otherwise the
    // chosen batch size. Anything unparseable falls back to all.
    let limit: number | null = null;
    if (limitParam && limitParam !== 'all') {
      const n = Number.parseInt(limitParam, 10);
      limit = Number.isFinite(n) && n > 0 ? n : null;
    }
    // Optional campaign scope: distribute ONLY leads sourced from this import
    // campaign (Kim's flow — "distribute the batch we just imported", not the
    // whole backlog). Blank = every eligible lead, as before.
    const data = await this.autoRouter.runDistribution(
      userId,
      limit,
      campaignId && campaignId !== 'all' ? campaignId : null,
    );
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

  // R2 — per-rep current→projected strip shown above the auto-assign queue.
  @Get('assignment-proposals/projection')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Per-rep current vs projected load for pending proposals',
  })
  async assignmentProjection() {
    const data = await this.autoRouter.getQueueProjection();
    return { success: true, data };
  }

  @Patch('assignment-proposals/:id/approve')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary:
      'Approve one proposal — assigns the lead (optionally redirect to a chosen rep)',
  })
  async approveAssignmentProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body('rep_id') repId?: string,
  ) {
    const data = await this.autoRouter.approveProposal(id, userId, repId);
    return {
      success: true,
      data,
      message: repId ? 'Lead redirected and assigned' : 'Lead assigned',
    };
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

  // UNDO — reverse approvals a manager just made: unassign the lead(s),
  // clear the first-touch SLA the approval started, and return the
  // proposal(s) to PENDING. Only untouched (no activity, still owned by the
  // proposed rep) approvals are reversed; the rest are skipped with a reason.
  @Post('assignment-proposals/undo')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Undo a batch of auto-assign approvals' })
  async undoAssignmentApprovals(
    @Body('ids') ids: string[],
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.autoRouter.undoApprovals(
      Array.isArray(ids) ? ids : [],
      userId,
    );
    return { success: true, data };
  }

  // R4/R8 — reject a batch of proposals in one call (bulk multi-select).
  @Post('assignment-proposals/reject-batch')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Reject a batch of proposals in one call' })
  async rejectAssignmentProposalBatch(
    @Body('ids') ids: string[],
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.autoRouter.rejectProposals(
      Array.isArray(ids) ? ids : [],
      userId,
    );
    return { success: true, data };
  }

  // R5 — redirect a REJECTED suggestion to a chosen rep/manager: turns the
  // reject into an approval and assigns the lead.
  @Post('assignment-proposals/:id/redirect')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Redirect a rejected proposal to a chosen rep — assigns the lead',
  })
  async redirectAssignmentProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body('rep_id') repId: string,
  ) {
    const data = await this.autoRouter.redirectProposal(id, repId, userId);
    return { success: true, data, message: 'Lead redirected and assigned' };
  }

  // R5 — send a rejected suggestion's lead back to the New Leads pool
  // (clears owner, resets status to New, re-runs duplicate detection).
  @Post('assignment-proposals/:id/to-new-leads')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Send a rejected proposal back to New Leads (unassign + reset)',
  })
  async sendAssignmentProposalToNewLeads(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.autoRouter.sendProposalToNewLeads(id, userId);
    return { success: true, data, message: 'Lead sent back to New Leads' };
  }

  // Rebalance — a manager evens out load by moving a batch of leads from one
  // rep to another. CROSS-TERRITORY allowed (owner, 3 Aug): a deliberate hand
  // move is not bound by the territory filter. `preview: true` returns the
  // "will move X" figures without writing.
  @Post('rebalance')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Rebalance load — move a batch of leads between two reps',
  })
  async rebalance(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      from_rep_id?: string;
      to_rep_id?: string;
      count?: number | null;
      campaign_id?: string | null;
      preview?: boolean;
    },
  ) {
    const data = await this.autoRouter.rebalance({
      fromRepId: body?.from_rep_id ?? '',
      toRepId: body?.to_rep_id ?? '',
      count: body?.count ?? null,
      campaignId: body?.campaign_id ?? null,
      deciderId: userId,
      preview: !!body?.preview,
    });
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
