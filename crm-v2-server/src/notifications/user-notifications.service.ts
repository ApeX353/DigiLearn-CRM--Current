import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { paginate, Pagination, IPaginationOptions } from 'nestjs-typeorm-paginate';
import { Notification, UserNotification } from './entities';
import {
  CreateNotificationDto,
  SendNotificationDto,
  MarkAsReadDto,
  QueryNotificationDto,
} from './dto';

export interface UserNotificationResponse extends Notification {
  isRead: boolean;
}

@Injectable()
export class UserNotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(UserNotification)
    private readonly userNotificationRepository: Repository<UserNotification>,
  ) {}

  /**
   * Create a notification (without sending to users)
   */
  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...createNotificationDto,
      channel: createNotificationDto.channel || 'in-app',
    });

    return this.notificationRepository.save(notification);
  }

  /**
   * Send notification to specific users
   */
  async sendToUsers(
    sendNotificationDto: SendNotificationDto,
  ): Promise<Notification> {
    const { userIds, ...notificationData } = sendNotificationDto;

    // Create the notification
    const notification = await this.create(notificationData);

    // Create user-notification relationships
    const userNotifications = userIds.map((userId) =>
      this.userNotificationRepository.create({
        userId,
        notificationId: notification.id,
        isRead: 0,
      }),
    );

    await this.userNotificationRepository.save(userNotifications);

    return notification;
  }

  /**
   * Get all notifications for a specific user with pagination
   */
  async getUserNotifications(
    userId: string,
    queryDto: QueryNotificationDto,
  ): Promise<Pagination<UserNotificationResponse>> {
    const {
      page = '1',
      limit = '10',
      channel,
      severity,
      entity,
      entityId,
      isRead,
      unreadOnly,
    } = queryDto;

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    const queryBuilder = this.userNotificationRepository
      .createQueryBuilder('un')
      .leftJoinAndSelect('un.notification', 'notification')
      .where('un.userId = :userId', { userId });

    if (channel) {
      queryBuilder.andWhere('notification.channel = :channel', { channel });
    }

    if (severity) {
      queryBuilder.andWhere('notification.severity = :severity', { severity });
    }

    if (entity) {
      queryBuilder.andWhere('notification.entity = :entity', { entity });
    }

    if (entityId) {
      queryBuilder.andWhere('notification.entityId = :entityId', { entityId });
    }

    if (unreadOnly === true) {
      queryBuilder.andWhere('un.isRead = :isRead', { isRead: 0 });
    } else if (isRead !== undefined) {
      queryBuilder.andWhere('un.isRead = :isRead', {
        isRead: isRead ? 1 : 0,
      });
    }

    queryBuilder.orderBy('notification.createdAt', 'DESC');

    const result = await paginate<UserNotification>(queryBuilder, options);

    // Transform to include isRead as boolean
    const transformedItems = result.items.map((item) => ({
      ...item.notification,
      isRead: item.isRead === 1,
    }));

    return {
      ...result,
      items: transformedItems,
    };
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.userNotificationRepository.count({
      where: {
        userId,
        isRead: 0,
      },
    });
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(
    userId: string,
    markAsReadDto: MarkAsReadDto,
  ): Promise<{ success: boolean; message: string; count: number }> {
    const { notificationIds } = markAsReadDto;

    const result = await this.userNotificationRepository
      .createQueryBuilder()
      .update(UserNotification)
      .set({ isRead: 1 })
      .where('userId = :userId', { userId })
      .andWhere('notificationId IN (:...notificationIds)', { notificationIds })
      .andWhere('isRead = :isRead', { isRead: 0 })
      .execute();

    return {
      success: true,
      message: 'Notifications marked as read',
      count: result.affected || 0,
    };
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(
    userId: string,
  ): Promise<{ success: boolean; message: string; count: number }> {
    const result = await this.userNotificationRepository
      .createQueryBuilder()
      .update(UserNotification)
      .set({ isRead: 1 })
      .where('userId = :userId', { userId })
      .andWhere('isRead = :isRead', { isRead: 0 })
      .execute();

    return {
      success: true,
      message: 'All notifications marked as read',
      count: result.affected || 0,
    };
  }

  /**
   * Delete a notification for a user
   */
  async deleteUserNotification(
    userId: string,
    notificationId: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.userNotificationRepository.delete({
      userId,
      notificationId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found for this user');
    }

    return {
      success: true,
      message: 'Notification deleted successfully',
    };
  }

  /**
   * Delete multiple notifications for a user
   */
  async deleteUserNotifications(
    userId: string,
    notificationIds: string[],
  ): Promise<{ success: boolean; message: string; count: number }> {
    const result = await this.userNotificationRepository.delete({
      userId,
      notificationId: In(notificationIds),
    });

    return {
      success: true,
      message: 'Notifications deleted successfully',
      count: result.affected || 0,
    };
  }

  /**
   * Get a single notification by ID (admin/system use)
   */
  async findOne(id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }

    return notification;
  }

  /**
   * Get all notifications (admin only)
   */
  async findAll(
    queryDto: QueryNotificationDto,
  ): Promise<Pagination<Notification>> {
    const { page = '1', limit = '10', channel, severity, entity, entityId } = queryDto;

    const options: IPaginationOptions = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    const queryBuilder =
      this.notificationRepository.createQueryBuilder('notification');

    if (channel) {
      queryBuilder.andWhere('notification.channel = :channel', { channel });
    }

    if (severity) {
      queryBuilder.andWhere('notification.severity = :severity', { severity });
    }

    if (entity) {
      queryBuilder.andWhere('notification.entity = :entity', { entity });
    }

    if (entityId) {
      queryBuilder.andWhere('notification.entityId = :entityId', { entityId });
    }

    queryBuilder.orderBy('notification.createdAt', 'DESC');

    return paginate<Notification>(queryBuilder, options);
  }

  /**
   * Delete a notification completely (admin only)
   */
  async remove(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.notificationRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }

    return {
      success: true,
      message: 'Notification deleted successfully',
    };
  }
}
