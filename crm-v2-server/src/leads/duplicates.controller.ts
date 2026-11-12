import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import {
  MergeDuplicateSuspicionDto,
  PeekContactDuplicatesDto,
  PeekLeadDuplicatesDto,
  PeekSchoolDuplicatesDto,
  QueryDuplicateSuspicionsDto,
  RecordDuplicateSuspicionDto,
  ReviewDuplicateSuspicionDto,
  ScanDuplicatesDto,
} from './dto/duplicates.dto';

/**
 * Duplicate-suspicion HTTP surface (Phase 8).
 *
 *   POST /duplicates/peek/lead       → cheap dry-run, returns candidates
 *   POST /duplicates/peek/school     → same for schools
 *   POST /duplicates/peek/contact    → same for contacts
 *   POST /duplicates                 → persist a suspicion after a save
 *   GET  /duplicates                 → manager queue
 *   PATCH /duplicates/:id/review     → manager decision
 */

@ApiTags('Duplicates')
@ApiBearerAuth()
@Controller('duplicates')
export class DuplicatesController {
  constructor(private readonly service: DuplicateDetectionService) {}

  @Post('peek/lead')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Find likely duplicates for a new lead' })
  async peekLead(@Body() body: PeekLeadDuplicatesDto) {
    const data = await this.service.peekLead(body ?? {});
    return { success: true, data };
  }

  @Post('peek/school')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Find likely duplicate schools' })
  async peekSchool(@Body() body: PeekSchoolDuplicatesDto) {
    const data = await this.service.peekSchool(body ?? {});
    return { success: true, data };
  }

  @Post('peek/contact')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Find likely duplicate contacts' })
  async peekContact(@Body() body: PeekContactDuplicatesDto) {
    const data = await this.service.peekContact(body ?? {});
    return { success: true, data };
  }

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Persist a duplicate suspicion for manager review' })
  async record(
    @Body() body: RecordDuplicateSuspicionDto,
    @Req() req: any,
  ) {
    const userId = req?.user?.id ?? req?.user?.sub;
    const row = await this.service.recordSuspicion({
      ...body,
      raised_by_id: userId,
    });
    return { success: true, data: row };
  }

  @Post('rebuild')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary:
      'DUP1: backfill the manager queue from existing leads (runs in the background)',
  })
  async rebuild(@Req() req: any) {
    const userId = req?.user?.id ?? req?.user?.sub;
    // Fire-and-forget: scanning the whole book takes a while, so return
    // immediately and let suspicions appear in the queue as the sweep runs.
    void this.service.rebuildLeadSuspicions(userId);
    return {
      success: true,
      message:
        'Duplicate queue rebuild started — suspected duplicates will appear in the queue shortly.',
    };
  }

  @Post('scan')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary:
      'S2: sweep EXISTING leads/schools/contacts for duplicate pairs and add new ones to the queue (synchronous; reviewed pairs are never re-flagged)',
  })
  async scan(@Body() body: ScanDuplicatesDto, @Req() req: any) {
    const userId = req?.user?.id ?? req?.user?.sub;
    const data = await this.service.scanAll(body?.record_types, userId);
    return { success: true, data };
  }

  @Post(':id/merge')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary:
      'S2: execute a school/contact merge — re-point children onto the existing record, soft-delete the duplicate (leads use the lead-merge panel instead)',
  })
  async merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MergeDuplicateSuspicionDto,
    @Req() req: any,
  ) {
    const userId = req?.user?.id ?? req?.user?.sub;
    const data = await this.service.mergeSuspicion(id, userId, body?.note);
    return { success: true, data };
  }

  @Get()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Manager queue of pending duplicate suspicions' })
  async list(@Query() query: QueryDuplicateSuspicionsDto) {
    const rows = await this.service.list({
      record_type: query.record_type,
      status: (query.status ?? 'pending') as any,
    });
    return { success: true, data: rows };
  }

  @Patch(':id/review')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Record a manager decision on a suspicion' })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewDuplicateSuspicionDto,
    @Req() req: any,
  ) {
    const userId = req?.user?.id ?? req?.user?.sub;
    const row = await this.service.review(id, body.status, userId, body.note);
    return { success: true, data: row };
  }
}
