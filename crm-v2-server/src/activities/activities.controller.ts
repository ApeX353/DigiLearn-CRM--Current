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
  UseGuards,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { QueryActivityDto, ActivitySummaryQueryDto } from './dto/query-activity.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { CreateActivityCommentDto } from './dto/create-activity-comment.dto';
import { ActivityStatus } from './entities/activity.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Activities')
@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // ========================
  // Create Activity
  // ========================

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create a new activity (task, note, call, email, meeting, or whatsapp)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Activity created successfully',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async create(
    @Body() createActivityDto: CreateActivityDto,
    @CurrentUser('id') userId: string,
  ) {
    const activity = await this.activitiesService.create(createActivityDto, userId);
    return {
      success: true,
      message: 'Activity created successfully',
      data: activity,
    };
  }

  // ========================
  // Get All Activities
  // ========================

  @Get()
  @ApiOperation({ summary: 'Get all activities with pagination and filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activities retrieved successfully',
  })
  async findAll(@Query() queryActivityDto: QueryActivityDto) {
    const result = await this.activitiesService.findAll(queryActivityDto);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
    };
  }

  // ========================
  // Get Activities Summary
  // ========================

  @Get('summary')
  @ApiOperation({
    summary: 'Get activities summary with counts by type and status',
    description: 'Returns paginated activities along with summary counts grouped by type and status',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Summary retrieved successfully',
  })
  async getSummary(@Query() query: ActivitySummaryQueryDto) {
    const result = await this.activitiesService.getSummary(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      summary: result.summary,
    };
  }

  // ========================
  // Lead Activity Stats
  // ========================

  @Get('leads/:leadId/stats')
  @Roles('admin', 'manager', 'sales_manager')
  @ApiOperation({
    summary: 'Get activity stats for a specific lead',
    description: 'Returns engagement metrics: touches in last 7 days, time to first touch, meetings booked, incomplete logs, staleness indicator',
  })
  @ApiParam({ name: 'leadId', description: 'Lead UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lead activity stats retrieved successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Lead not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async getLeadActivityStats(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    const stats = await this.activitiesService.getLeadActivityStats(leadId);
    return {
      success: true,
      data: stats,
    };
  }

  // ========================
  // Get Single Activity
  // ========================

  @Get(':id')
  @ApiOperation({ summary: 'Get a single activity by ID' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity retrieved successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const activity = await this.activitiesService.findOne(id);
    return {
      success: true,
      data: activity,
    };
  }

  // ========================
  // Update Activity
  // ========================

  @Put(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update an activity' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity updated successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateActivityDto: UpdateActivityDto,
    @CurrentUser('id') userId: string,
  ) {
    const activity = await this.activitiesService.update(id, updateActivityDto, userId);
    return {
      success: true,
      message: 'Activity updated successfully',
      data: activity,
    };
  }

  // ========================
  // Update Activity Status
  // ========================

  @Patch(':id/status')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update activity status' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: Object.values(ActivityStatus),
          example: 'completed',
        },
      },
      required: ['status'],
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity status updated successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: ActivityStatus,
    @CurrentUser('id') userId: string,
  ) {
    const activity = await this.activitiesService.updateStatus(id, status, userId);
    return {
      success: true,
      message: 'Activity status updated successfully',
      data: activity,
    };
  }

  // ========================
  // Delete Activity
  // ========================

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Delete an activity' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Activity deleted successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.activitiesService.remove(id, userId);
    return {
      success: true,
      message: 'Activity deleted successfully',
    };
  }

  // ========================
  // Comment Endpoints
  // ========================

  @Post(':id/comments')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Add a comment to an activity' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Comment added successfully',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async addComment(
    @Param('id', ParseUUIDPipe) activityId: string,
    @Body() createCommentDto: CreateActivityCommentDto,
    @CurrentUser('id') userId: string,
  ) {
    const comment = await this.activitiesService.addComment(
      activityId,
      createCommentDto,
      userId,
    );
    return {
      success: true,
      message: 'Comment added successfully',
      data: comment,
    };
  }

  // ========================
  // Attachment Endpoints
  // ========================

  @Post(':id/attachments')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Add attachment metadata to an activity',
    description: 'Records file metadata for files uploaded to external storage (e.g., Vercel Blob)',
  })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Attachment added successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async addAttachment(
    @Param('id', ParseUUIDPipe) activity_id: string,
    @Body() createAttachmentDto: Omit<CreateAttachmentDto, 'activity_id'>,
    @CurrentUser('id') userId: string,
  ) {
    const attachment = await this.activitiesService.addAttachment(
      { ...createAttachmentDto, activity_id },
      userId,
    );
    return {
      success: true,
      message: 'Attachment added successfully',
      data: attachment,
    };
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'Get all attachments for an activity' })
  @ApiParam({ name: 'id', description: 'Activity UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Attachments retrieved successfully',
  })
  async getAttachments(@Param('id', ParseUUIDPipe) activity_id: string) {
    const attachments = await this.activitiesService.getAttachments(activity_id);
    return {
      success: true,
      data: attachments,
    };
  }

  @Delete('attachments/:attachmentId')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Remove an attachment' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Attachment removed successfully',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Attachment not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async removeAttachment(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.activitiesService.removeAttachment(attachmentId, userId);
    return {
      success: true,
      message: 'Attachment removed successfully',
    };
  }
}
