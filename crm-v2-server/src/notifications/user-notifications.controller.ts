import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserNotificationsService } from './user-notifications.service';
import {
  CreateNotificationDto,
  SendNotificationDto,
  MarkAsReadDto,
  QueryNotificationDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('User Notifications')
@Controller('user-notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserNotificationsController {
  constructor(
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  // ===== USER ENDPOINTS =====

  @Get('my-notifications')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my notifications' })
  async getMyNotifications(
    @CurrentUser('id') userId: string,
    @Query() queryDto: QueryNotificationDto,
  ) {
    const notifications =
      await this.userNotificationsService.getUserNotifications(
        userId,
        queryDto,
      );
    return {
      success: true,
      data: notifications.items,
      links: notifications.links,
      meta: notifications.meta,
    };
  }

  @Get('my-notifications/unread-count')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my unread notification count' })
  async getMyUnreadCount(@CurrentUser('id') userId: string) {
    const count = await this.userNotificationsService.getUnreadCount(userId);
    return {
      success: true,
      data: { count },
    };
  }

  @Patch('my-notifications/mark-as-read')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark my notifications as read' })
  async markMyNotificationsAsRead(
    @CurrentUser('id') userId: string,
    @Body() markAsReadDto: MarkAsReadDto,
  ) {
    const result = await this.userNotificationsService.markAsRead(
      userId,
      markAsReadDto,
    );
    return result;
  }

  @Patch('my-notifications/mark-all-read')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  async markAllMyNotificationsAsRead(@CurrentUser('id') userId: string) {
    const result = await this.userNotificationsService.markAllAsRead(userId);
    return result;
  }

  @Delete('my-notifications/:notificationId')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete my notification' })
  async deleteMyNotification(
    @CurrentUser('id') userId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.userNotificationsService.deleteUserNotification(
      userId,
      notificationId,
    );
  }

  @Delete('my-notifications')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete multiple my notifications' })
  async deleteMyNotifications(
    @CurrentUser('id') userId: string,
    @Body('notificationIds') notificationIds: string[],
  ) {
    return this.userNotificationsService.deleteUserNotifications(
      userId,
      notificationIds,
    );
  }

  // ===== ADMIN/MANAGER ENDPOINTS =====

  @Post('send')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send notification to specific users' })
  async sendToUsers(@Body() sendNotificationDto: SendNotificationDto) {
    const notification = await this.userNotificationsService.sendToUsers(
      sendNotificationDto,
    );
    return {
      success: true,
      message: 'Notification sent successfully',
      data: notification,
    };
  }

  @Post()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create notification (admin only)' })
  async create(@Body() createNotificationDto: CreateNotificationDto) {
    const notification = await this.userNotificationsService.create(
      createNotificationDto,
    );
    return {
      success: true,
      message: 'Notification created successfully',
      data: notification,
    };
  }

  @Get('admin/all')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all notifications (admin only)' })
  async findAll(@Query() queryDto: QueryNotificationDto) {
    const notifications = await this.userNotificationsService.findAll(queryDto);
    return {
      success: true,
      data: notifications.items,
      links: notifications.links,
      meta: notifications.meta,
    };
  }

  @Get('admin/:id')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notification by ID (admin/manager)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const notification = await this.userNotificationsService.findOne(id);
    return {
      success: true,
      data: notification,
    };
  }

  @Delete('admin/:id')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete notification completely (admin only)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userNotificationsService.remove(id);
  }

  @Get('user/:userId')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user notifications (admin/manager)' })
  async getUserNotifications(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() queryDto: QueryNotificationDto,
  ) {
    const notifications =
      await this.userNotificationsService.getUserNotifications(
        userId,
        queryDto,
      );
    return {
      success: true,
      data: notifications.items,
      links: notifications.links,
      meta: notifications.meta,
    };
  }

  @Get('user/:userId/unread-count')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user unread count (admin/manager)' })
  async getUserUnreadCount(@Param('userId', ParseUUIDPipe) userId: string) {
    const count = await this.userNotificationsService.getUnreadCount(userId);
    return {
      success: true,
      data: { count },
    };
  }
}
