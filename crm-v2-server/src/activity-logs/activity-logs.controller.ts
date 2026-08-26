import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityLogsService } from './activity-logs.service';
import { QueryActivityLogDto } from './dto/query-activity-log.dto';

@ApiTags('Activity Logs')
@ApiBearerAuth()
@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Get all activity logs with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'entity',
    required: false,
    description: 'Filter by entity type',
  })
  @ApiQuery({
    name: 'entity_id',
    required: false,
    description: 'Filter by entity ID',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    description: 'Filter by action type',
  })
  @ApiQuery({
    name: 'actioned_by',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'start_date',
    required: false,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'end_date',
    required: false,
    description: 'End date (ISO 8601)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns paginated activity logs',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin role',
  })
  async findAll(@Query() query: QueryActivityLogDto) {
    const result = await this.activityLogsService.findAll(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('entity/:entity/:entityId')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get activity logs for a specific entity' })
  @ApiParam({
    name: 'entity',
    description: 'Entity type (e.g., Pipeline, Stage)',
  })
  @ApiParam({ name: 'entityId', description: 'Entity UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns activity logs for the entity',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Requires admin or sales_manager role',
  })
  async findByEntity(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
  ) {
    const logs = await this.activityLogsService.findByEntity(entity, entityId);
    return {
      success: true,
      data: logs,
      count: logs.length,
    };
  }
}
