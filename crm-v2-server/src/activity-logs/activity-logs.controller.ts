import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpStatus,
  ParseUUIDPipe,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ActivityLogsService, ScopedAuditQuery } from './activity-logs.service';
import { MANAGER_AUDIT_ENTITIES } from './audit-presentation';
import { QueryActivityLogDto } from './dto/query-activity-log.dto';

/** Roles that may read the whole audit trail. */
const WHOLE_TRAIL = new Set(['admin', 'admin_support']);
/** Roles that read the trail for CRM and financial records, whoever acted. */
const CRM_TRAIL = new Set(['sales_manager']);
/** Roles that may read any one record's history. A rep needs to own the record. */
const ANY_RECORD_HISTORY = new Set([...WHOLE_TRAIL, ...CRM_TRAIL]);

interface Caller {
  id: string;
  roles?: Array<{ name: string }>;
}

@ApiTags('Activity Logs')
@ApiBearerAuth()
@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  // The whole audit trail is read by admins and by support (admin_support
  // holds admin permissions and does the triage). A sales manager reads the
  // CRM and financial records that role already works with. A rep may call the
  // route too, but the query is pinned to their own id: the Profile page shows
  // "your recent activity" from here, and before 16 Oct 2026 that call was
  // refused for every rep and manager (the day log counted it).
  @Roles('admin', 'admin_support', 'sales_manager', 'sales_rep')
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
  async findAll(@Query() query: QueryActivityLogDto, @CurrentUser() caller: Caller) {
    const result = await this.activityLogsService.findAll(this.scope(query, caller));
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
      // Staging runs on a copy of production, so the page must be able to say so.
      environment: process.env.NODE_ENV ?? 'unknown',
    };
  }

  @Get('category-counts')
  @Roles('admin', 'admin_support', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Entry totals per category for the same filters and access' })
  async countByCategory(@Query() query: QueryActivityLogDto, @CurrentUser() caller: Caller) {
    return {
      success: true,
      data: await this.activityLogsService.countByCategory(this.scope(query, caller)),
    };
  }

  @Get('actors')
  @Roles('admin', 'admin_support', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'The people this caller may filter the trail by' })
  async findActors(@CurrentUser() caller: Caller) {
    return {
      success: true,
      data: await this.activityLogsService.findActors(
        this.seesWholeTrail(caller) || this.seesCrmTrail(caller) ? undefined : caller.id,
        this.seesCrmTrail(caller) ? MANAGER_AUDIT_ENTITIES : undefined,
      ),
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
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() caller: Caller,
  ) {
    const anyRecord = (caller?.roles ?? []).some((r) => ANY_RECORD_HISTORY.has(r.name));
    if (this.seesCrmTrail(caller) && !MANAGER_AUDIT_ENTITIES.includes(entity.toLowerCase())) {
      return { success: true, data: [], count: 0 };
    }
    const logs = await this.activityLogsService.findByEntity(
      entity,
      entityId,
      anyRecord ? undefined : caller.id,
    );
    return {
      success: true,
      data: logs,
      count: logs.length,
    };
  }

  private seesWholeTrail(caller: Caller): boolean {
    return (caller?.roles ?? []).some((r) => WHOLE_TRAIL.has(r.name));
  }

  /** A sales manager without a whole-trail role; admin rights always win. */
  private seesCrmTrail(caller: Caller): boolean {
    return (
      !this.seesWholeTrail(caller) &&
      (caller?.roles ?? []).some((r) => CRM_TRAIL.has(r.name))
    );
  }

  /** Applied last, so no query parameter can widen what a caller reads. */
  private scope(query: QueryActivityLogDto, caller: Caller): ScopedAuditQuery {
    if (this.seesWholeTrail(caller)) return { ...query, allowed_entities: undefined };
    if (this.seesCrmTrail(caller)) return { ...query, allowed_entities: MANAGER_AUDIT_ENTITIES };
    return { ...query, actioned_by: caller.id, allowed_entities: undefined };
  }
}
