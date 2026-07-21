import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CheckPermission } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DealsService } from './deals.service';
import {
  QueryDealRollbackRequestsDto,
  ReviewDealRollbackRequestDto,
} from './dto';

@ApiTags('Deal Rollback Requests')
@Controller('deal-rollback-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealRollbackRequestsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'List deal rollback requests' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deal rollback requests retrieved successfully',
  })
  async findAll(@Query() query: QueryDealRollbackRequestsDto) {
    const data = await this.dealsService.findRollbackRequests(query);
    return { success: true, data };
  }

  @Post(':id/review')
  @Roles('admin', 'sales_manager')
  @CheckPermission('update', 'Deal')
  @ApiOperation({ summary: 'Approve or reject a deal rollback request' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Deal rollback request reviewed successfully',
  })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDealRollbackRequestDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.dealsService.reviewRollbackRequest(id, dto, userId);

    return {
      success: true,
      data,
      message:
        dto.decision === 'approved'
          ? 'Rollback request approved successfully'
          : 'Rollback request rejected successfully',
    };
  }
}
