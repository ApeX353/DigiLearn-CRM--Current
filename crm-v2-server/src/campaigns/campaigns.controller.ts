import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/campaign.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestingUser } from '../cash-requisitions/cash-requisitions.service';

const ALL_OPERATORS = [
  'admin',
  'manager',
  'sales_manager',
  'sales_rep',
  'finance',
];
const CAMPAIGN_MANAGERS = ['admin', 'manager', 'sales_manager'];

@ApiTags('Campaigns')
@ApiBearerAuth('JWT-auth')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Post()
  @Roles(...CAMPAIGN_MANAGERS)
  @ApiOperation({ summary: 'Create a campaign/event' })
  async create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: RequestingUser,
  ) {
    const data = await this.service.create(dto, user.id);
    return { success: true, message: 'Campaign created', data };
  }

  @Get()
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'List campaigns' })
  async findAll() {
    const data = await this.service.findAll();
    return { success: true, data };
  }

  @Get(':id')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Campaign detail' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findOne(id);
    return { success: true, data };
  }

  @Get(':id/leads')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Leads sourced from this campaign' })
  async leads(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.findLeads(id);
    return { success: true, data };
  }

  @Get(':id/spend')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Campaign spend per currency' })
  async spend(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.getSpend(id);
    return { success: true, data };
  }

  @Get(':id/roi')
  @Roles(...CAMPAIGN_MANAGERS, 'finance')
  @ApiOperation({
    summary: 'Campaign ROI: cost/lead, cost/won-deal, per-deal true cost',
  })
  async roi(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.service.getRoi(id);
    return { success: true, data };
  }
}
