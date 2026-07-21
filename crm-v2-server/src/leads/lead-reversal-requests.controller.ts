import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CheckPermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CaslAbility } from '../auth/decorators/casl-ability.decorator';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { LeadsService } from './leads.service';
import { ReviewLeadReversalRequestDto } from './dto';

@ApiTags('Lead Reversal Requests')
@Controller('lead-reversal-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadReversalRequestsController {
  constructor(private readonly leadsService: LeadsService) {}

  /**
   * Phase C.2 — manager approval queue. Returns every reversal /
   * reassignment / tactical_disqualify request in the system,
   * filterable by status and kind. Used by the new Approval Queue
   * page so managers don't have to dig into each lead individually
   * to find what needs their attention.
   */
  @Get()
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'List reversal requests across all leads (manager queue)',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: ['status_reversal', 'reassignment', 'tactical_disqualify'],
  })
  @ApiQuery({ name: 'limit', required: false })
  async listAll(
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('kind')
    kind?: 'status_reversal' | 'reassignment' | 'tactical_disqualify',
    @Query('limit') limit?: string,
  ) {
    const requests = await this.leadsService.findReversalRequests({
      status,
      kind,
      limit: limit ? Math.max(1, Math.min(500, parseInt(limit, 10))) : 100,
    });
    return {
      success: true,
      data: requests,
    };
  }

  @Post(':id/approve')
  @Roles('admin', 'sales_manager')
  @CheckPermission('update', 'Lead')
  @ApiOperation({ summary: 'Approve or reject a lead reversal request' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead reversal request decision saved successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request decision',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Lead reversal request not found',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async approveOrReject(
    @Param('id') id: string,
    @Body() dto: ReviewLeadReversalRequestDto,
    @CurrentUser('id') userId: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const request = await this.leadsService.findReversalRequestById(id);
    await this.leadsService.findOne(request.lead_id, ability);

    const reviewedRequest = await this.leadsService.reviewReversalRequest(
      id,
      dto,
      userId,
    );

    const message =
      dto.decision === 'approved'
        ? 'Lead reversal request approved successfully'
        : 'Lead reversal request rejected successfully';

    return {
      success: true,
      message,
      data: reviewedRequest,
    };
  }
}
