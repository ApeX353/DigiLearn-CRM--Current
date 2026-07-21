import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
