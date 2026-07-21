import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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

@ApiTags('Automation')
@Controller('automation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationController {
  constructor(
    private readonly whatsappIngest: WhatsappIngestService,
    private readonly socialHandoff: SocialHandoffService,
    private readonly quoteDraft: QuoteDraftService,
    private readonly attribution: AttributionService,
  ) {}

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
