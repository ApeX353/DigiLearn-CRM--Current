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
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { LeadsService } from './leads.service';
import { LeadQualificationService } from './services/lead-qualification.service';
import { LeadsXlsxImportService } from './services/leads-xlsx-import.service';
import {
  ImportLeadsXlsxDto,
  UpdateImportDecisionsDto,
  SetImportRowRegionDto,
} from './dto/import-leads-xlsx.dto';
import {
  CreateLeadDto,
  UpdateLeadDto,
  QueryLeadDto,
  CreateLeadWithSchoolContactsDto,
  CreateLeadStakeholderDto,
  CreateLeadReversalRequestDto,
  AssignLeadDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CheckPermission } from '../auth/decorators/permissions.decorator';
import { CaslAbility } from '../auth/decorators/casl-ability.decorator';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LeadImportBatchStatus } from './entities/lead-import-batch.entity';

@ApiTags('Leads')
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly qualificationService: LeadQualificationService,
    private readonly leadsXlsxImport: LeadsXlsxImportService,
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
    @CurrentUser('role') userRole: string,
  ) {
    const result = await this.leadsService.createWithSchoolAndContacts(
      dto,
      userId,
      userRole,
    );
    return {
      success: true,
      message: 'Lead created successfully with school and contacts',
      data: result,
    };
  }

  // Kim's "Import Leads" button. The manager uploads an .xlsx (sent as
  // base64 JSON — no file-upload middleware, no client Excel library);
  // the server parses it and creates a school + head contact + unassigned
  // New lead per row, logging the whole import with its count.
  // Staged for approval — imports NEVER create live leads directly. The file
  // is parsed + dedup-checked into a PENDING batch; a manager approves before
  // anything reaches the CRM (TEST-BACKLOG §2).
  @Post('import')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Stage a bulk import (.xlsx) for approval' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'The pending batch' })
  async importXlsx(
    @Body() dto: ImportLeadsXlsxDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    const batch = await this.leadsXlsxImport.importFromBase64(
      dto.file_base64,
      userId,
      userRole,
      dto.filename,
      dto.campaign_id,
    );
    return {
      success: true,
      message: `Import staged: ${batch.importable_count} ready, ${batch.duplicate_count} possible duplicate(s) — awaiting approval`,
      data: batch,
    };
  }

  @Get('import/batches')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Import batches by status (default: pending)' })
  async listImportBatches(@Query('status') status?: string) {
    const filter =
      status === 'approved'
        ? LeadImportBatchStatus.APPROVED
        : status === 'rejected'
          ? LeadImportBatchStatus.REJECTED
          : LeadImportBatchStatus.PENDING;
    return {
      success: true,
      data: await this.leadsXlsxImport.listPending(filter),
    };
  }

  @Get('import/batches/:id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'A pending batch with its rows and duplicate flags' })
  async getImportBatch(@Param('id') id: string) {
    return { success: true, data: await this.leadsXlsxImport.getBatch(id) };
  }

  @Patch('import/batches/:id/decisions')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Override per-row approve/skip before approving' })
  async setImportDecisions(
    @Param('id') id: string,
    @Body() dto: UpdateImportDecisionsDto,
  ) {
    const data = await this.leadsXlsxImport.updateDecisions(id, dto.decisions);
    return { success: true, data };
  }

  @Patch('import/batches/:id/rows/:rowNumber/region')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Classify a peri-urban import row as urban or rural (R3)',
  })
  async setImportRowRegion(
    @Param('id') id: string,
    @Param('rowNumber') rowNumber: string,
    @Body() dto: SetImportRowRegionDto,
  ) {
    const data = await this.leadsXlsxImport.setRowRegion(
      id,
      Number(rowNumber),
      dto.region,
    );
    return { success: true, data };
  }

  @Post('import/batches/:id/approve')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Approve a batch — creates the real leads' })
  async approveImportBatch(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    const batch = await this.leadsXlsxImport.approveBatch(id, userId, userRole);
    return {
      success: true,
      message: `Approved — creating ${batch.importable_count} lead(s) in the background`,
      data: batch,
    };
  }

  @Post('import/batches/:id/reject')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Reject a batch — nothing is created' })
  async rejectImportBatch(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.leadsXlsxImport.rejectBatch(id, userId);
    return { success: true, message: 'Import rejected', data };
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
    @CaslAbility() ability: AppAbility,
  ) {
    // The export honors the same ownership scope as the list view —
    // a sales_rep downloads their own book, not the whole org.
    const result = await this.leadsService.findAll(
      { limit: '1000' } as any,
      ability,
    );
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
    @CurrentUser('role') role: string,
  ) {
    // A rep can only add stakeholders to a lead assigned to them.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const stakeholder = await this.leadsService.addStakeholder(
      id,
      dto,
      userId,
      scopeUserId,
    );
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
    @CurrentUser('role') role: string,
    @CurrentUser() currentUser: { roles?: Array<{ name: string }> },
  ) {
    const userRoles = (currentUser?.roles || []).map((r) => r.name);
    // A rep can only edit a lead assigned to them.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const lead = await this.leadsService.update(
      id,
      updateLeadDto,
      userId,
      userRoles,
      scopeUserId,
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
    @CurrentUser('role') role: string,
  ) {
    // A rep can only re-stage a lead assigned to them.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const lead = await this.leadsService.updateStatus(
      id,
      status,
      userId,
      scopeUserId,
    );
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
    @Body() dto: AssignLeadDto,
    @CurrentUser('id') userId: string,
  ) {
    if (status === 'Disqualified') {
      throw new BadRequestException(
        'Use the disqualification request/approval workflow',
      );
    }
    const lead = await this.leadsService.assignLead(
      id,
      dto.assigned_to,
      userId,
      dto.reason,
    );
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
    @Body() body: { leadIds: string[]; action: 'assign' | 'status' | 'delete'; assigneeId?: string; status?: string; reason?: string },
    @CurrentUser('id') userId: string,
  ) {
    const { leadIds, action, assigneeId, status, reason } = body;
    let updated = 0;

    for (const leadId of leadIds) {
      try {
        switch (action) {
          case 'assign':
            if (assigneeId) {
              await this.leadsService.assignLead(
                leadId,
                assigneeId,
                userId,
                reason,
              );
              updated++;
            }
            break;
          case 'status':
            if (status) {
              if (status === 'Disqualified') {
                throw new BadRequestException(
                  'Bulk status updates cannot disqualify leads; use the approval workflow',
                );
              }
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

  // ========================
  // DUP2 — field-level merge
  // ========================

  @Post(':survivorId/merge/:loserId')
  @Roles('admin', 'sales_manager', 'admin_support')
  @ApiOperation({
    summary: 'Field-level merge — fuse a duplicate lead into a survivor',
    description:
      'TRUE merge: the survivor keeps all its populated fields and fills any gaps from the loser; all child records (activities, deals, quotes/invoices via deal, cash requisitions, stakeholders, SLA history, escalations, reversal requests, assignment proposals, queued emails) are reparented to the survivor; the loser is retired (Disqualified, "Merged (field-level)") and kept for history. Everything runs in one transaction.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Leads merged successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Same lead / invalid' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Loser already merged' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async mergeLeads(
    @Param('survivorId') survivorId: string,
    @Param('loserId') loserId: string,
    @CurrentUser('id') userId: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const result = await this.leadsService.mergeLeads(
      survivorId,
      loserId,
      userId,
      ability,
    );
    return {
      success: true,
      message: 'Leads merged successfully',
      data: result,
    };
  }

}
