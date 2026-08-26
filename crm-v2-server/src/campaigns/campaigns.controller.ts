import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
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

  @Get(':idOrSlug')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({
    summary: 'Campaign detail — resolves by uuid OR human slug',
  })
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    // Accepts either the raw uuid (legacy links) or the human slug. The
    // service branches on the identifier shape; no UUID pipe here so slugs
    // pass through. Sub-resource routes below still require a uuid.
    const data = await this.service.findOne(idOrSlug);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...CAMPAIGN_MANAGERS)
  @ApiOperation({ summary: 'Edit a campaign (name, type, dates, currency)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const data = await this.service.update(id, dto);
    return { success: true, message: 'Campaign updated', data };
  }

  @Delete(':id')
  @Roles(...CAMPAIGN_MANAGERS)
  @ApiOperation({ summary: 'Delete a campaign (only when nothing is attached)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return { success: true, message: 'Campaign deleted' };
  }

  @Get(':id/leads')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Leads sourced from this campaign' })
  async leads(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // A sales_rep only sees the campaign leads assigned to them; managers /
    // admin / admin_support (elevated `role`) pass undefined and see all.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.service.findLeads(id, scopeUserId);
    return { success: true, data };
  }

  @Get(':id/spend')
  @Roles(...ALL_OPERATORS)
  @ApiOperation({ summary: 'Campaign spend per currency' })
  async spend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // A sales_rep only sees spend derived from their own campaign
    // leads/deals; elevated roles see full campaign-level spend.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.service.getSpend(id, scopeUserId);
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
