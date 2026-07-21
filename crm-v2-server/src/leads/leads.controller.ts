import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { LeadsService } from './leads.service';
import { LeadQualificationService } from './services/lead-qualification.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadDto,
  CreateLeadWithSchoolContactsDto,
  CreateLeadStakeholderDto,
  CreateLeadReversalRequestDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CheckPermission } from '../auth/decorators/permissions.decorator';
import { CaslAbility } from '../auth/decorators/casl-ability.decorator';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Leads')
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly qualificationService: LeadQualificationService,
  ) {}

  // @Post()
  // @Roles('admin', 'sales_manager', 'sales_rep')
  // @ApiOperation({ summary: 'Create a new lead' })
  // @ApiResponse({
  //   status: HttpStatus.CREATED,
  //   description: 'Lead created successfully',
  // })
  // @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  // async create(
  //   @Body() createLeadDto: CreateLeadDto,
  //   @CurrentUser('id') userId: string,
  // ) {
  //   const lead = await this.leadsService.create(createLeadDto, userId);
  //   return {
  //     success: true,
  //     message: 'Lead created successfully',
  //     data: lead,
  //   };
  // }

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Create lead with school and contacts in a single transaction',
    description:
      'Creates a lead along with school (or uses existing) and contacts. All operations are transactional - if any step fails, everything is rolled back.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'Lead, school, contacts, and stakeholder relationships created successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async createWithSchoolAndContacts(
    @Body() dto: CreateLeadWithSchoolContactsDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.leadsService.createWithSchoolAndContacts(
      dto,
      userId,
    );
    return {
      success: true,
      message: 'Lead created successfully with school and contacts',
      data: result,
    };
  }

  @Get()
  @CheckPermission('read', 'Lead')
  @ApiOperation({ summary: 'Get all leads with pagination and filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Leads retrieved successfully',
  })
  async findAll(
    @Query() queryLeadDto: QueryLeadDto,
    @CaslAbility() ability: AppAbility,
  ) {
    const leads = await this.leadsService.findAll(queryLeadDto, ability);
    return {
      success: true,
      data: leads.items,
      meta: leads.meta,
      links: leads.links,
    };
  }

  @Get('status-counts')
  @CheckPermission('read', 'Lead')
  @ApiOperation({
    summary: 'Accurate per-status lead totals for the list tab badges',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Per-status counts (plus an All total) retrieved successfully',
  })
  async getStatusCounts(@CaslAbility() ability: AppAbility) {
    const counts = await this.leadsService.getStatusCounts(ability);
    return { success: true, data: counts };
  }

  @Get('export')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Export leads as CSV' })
  async exportCsv(
    @Res() res: Response,
  ) {
    const result = await this.leadsService.findAll({ limit: '1000' } as any);
    const leads = result.items;

    const headers = ['Lead Name', 'Status', 'School', 'Province', 'Contact', 'Phone', 'Source', 'Assigned To', 'Created At'];
    const rows = leads.map((lead: any) => [
      lead.lead_name || '',
      lead.status || '',
      lead.school?.name || '',
      lead.school?.province || '',
      lead.primary_contact ? `${lead.primary_contact.first_name || ''} ${lead.primary_contact.last_name || ''}`.trim() : '',
      lead.primary_contact?.phone || '',
      lead.source || '',
      lead.assignee ? `${lead.assignee.first_name || ''} ${lead.assignee.last_name || ''}`.trim() : '',
      lead.created_at ? new Date(lead.created_at).toISOString().split('T')[0] : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: string[]) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads-export-${Date.now()}.csv"`);
    res.send(csvContent);
  }

  @Get(':id')
  @CheckPermission('read', 'Lead')
  @ApiOperation({ summary: 'Get a single lead by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead retrieved successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  async findOne(
    @Param('id') id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const lead = await this.leadsService.findOne(id, ability);
    return {
      success: true,
      data: lead,
    };
  }

  @Get(':id/related')
  @CheckPermission('read', 'Lead')
  @ApiOperation({
    summary: 'Find related leads',
    description:
      'Finds leads related by shared school, school name, contact phone, or contact email. Returns match reasons for each related lead.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Related leads retrieved successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  async findRelatedLeads(
    @Param('id') id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const result = await this.leadsService.findRelatedLeads(id, ability);
    return {
      success: true,
      data: result.leads,
      matchReasons: result.matchReasons,
    };
  }

  @Get(':id/stakeholders')
  @CheckPermission('read', 'Lead')
  @ApiOperation({ summary: 'Get lead stakeholders' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead retrieved successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  async findLeadStakeholders(
    @Param('id') id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const lead = await this.leadsService.findLeadStakeholders(id, ability);
    return {
      success: true,
      data: lead,
    };
  }

  @Post(':id/stakeholders')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Add a stakeholder to a lead' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Stakeholder added successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  async addLeadStakeholder(
    @Param('id') id: string,
    @Body() dto: CreateLeadStakeholderDto,
    @CurrentUser('id') userId: string,
  ) {
    const stakeholder = await this.leadsService.addStakeholder(id, dto, userId);
    return {
      success: true,
      message: 'Stakeholder added successfully',
      data: stakeholder,
    };
  }

  @Get(':id/qualification')
  @CheckPermission('read', 'Lead')
  @ApiOperation({
    summary: 'Get lead qualification criteria',
    description:
      'Returns qualification data including needs, plan type, timeline, budget, decision maker, checklist, and qualification score.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead qualification retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Lead or qualification not found',
  })
  async getLeadQualification(
    @Param('id') id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.leadsService.findOne(id, ability);
    const data = await this.qualificationService.findByLeadId(id);
    return {
      success: true,
      data,
    };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update a lead' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead updated successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async update(
    @Param('id') id: string,
    @Body() updateLeadDto: UpdateLeadDto,
    @CurrentUser('id') userId: string,
    @CurrentUser() currentUser: { roles?: Array<{ name: string }> },
  ) {
    const userRoles = (currentUser?.roles || []).map((r) => r.name);
    const lead = await this.leadsService.update(
      id,
      updateLeadDto,
      userId,
      userRoles,
    );
    return {
      success: true,
      message: 'Lead updated successfully',
      data: lead,
    };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Soft delete a lead' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead deleted successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.leadsService.remove(id, userId);
    return {
      success: true,
      message: 'Lead deleted successfully',
    };
  }

  @Patch(':id/restore')
  @Roles('admin')
  @ApiOperation({ summary: 'Restore a soft-deleted lead' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead restored successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Lead not found or not deleted',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const lead = await this.leadsService.restore(id, userId);
    return {
      success: true,
      message: 'Lead restored successfully',
      data: lead,
    };
  }

  @Get(':id/reversal-requests')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @CheckPermission('read', 'Lead')
  @ApiOperation({ summary: 'Get lead reversal requests' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead reversal requests retrieved successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async findReversalRequests(
    @Param('id') id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.leadsService.findOne(id, ability);
    const requests = await this.leadsService.findReversalRequestsByLead(id);

    return {
      success: true,
      data: requests,
    };
  }

  @Post(':id/reversal-requests')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @CheckPermission('update', 'Lead')
  @ApiOperation({ summary: 'Submit a lead reversal request' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Lead reversal request submitted successfully',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Pending request already exists' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async createReversalRequest(
    @Param('id') id: string,
    @Body() dto: CreateLeadReversalRequestDto,
    @CurrentUser('id') userId: string,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.leadsService.findOne(id, ability);
    const reversalRequest = await this.leadsService.createReversalRequest(
      id,
      dto,
      userId,
    );

    return {
      success: true,
      message: 'Lead reversal request submitted successfully',
      data: reversalRequest,
    };
  }

  @Patch(':id/status')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update lead status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead status updated successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser('id') userId: string,
  ) {
    const lead = await this.leadsService.updateStatus(id, status, userId);
    return {
      success: true,
      message: 'Lead status updated successfully',
      data: lead,
    };
  }

  @Patch(':id/assign')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Assign lead to a user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead assigned successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async assignLead(
    @Param('id') id: string,
    @Body('assigned_to') assignedTo: string,
    @CurrentUser('id') userId: string,
  ) {
    const lead = await this.leadsService.assignLead(id, assignedTo, userId);
    return {
      success: true,
      message: 'Lead assigned successfully',
      data: lead,
    };
  }

  // ========================
  // Bulk Operations
  // ========================

  @Patch('bulk-update')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Bulk update leads (assign, status change, or delete)' })
  async bulkUpdate(
    @Body() body: { leadIds: string[]; action: 'assign' | 'status' | 'delete'; assigneeId?: string; status?: string },
    @CurrentUser('id') userId: string,
  ) {
    const { leadIds, action, assigneeId, status } = body;
    let updated = 0;

    for (const leadId of leadIds) {
      try {
        switch (action) {
          case 'assign':
            if (assigneeId) {
              await this.leadsService.assignLead(leadId, assigneeId, userId);
              updated++;
            }
            break;
          case 'status':
            if (status) {
              await this.leadsService.updateStatus(leadId, status, userId);
              updated++;
            }
            break;
          case 'delete':
            await this.leadsService.remove(leadId, userId);
            updated++;
            break;
        }
      } catch {
        // Skip individual failures in bulk ops
      }
    }

    return {
      success: true,
      message: `Bulk ${action} completed: ${updated}/${leadIds.length} leads updated`,
      updated,
    };
  }

}
