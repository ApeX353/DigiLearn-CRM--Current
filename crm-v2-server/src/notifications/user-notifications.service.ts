import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
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
import { NotificationsGateway } from './notifications.gateway';

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
    @Optional()
    private readonly gateway?: NotificationsGateway,
  ) {}

  /**
   * Create a notification (without sending to users)
   */
  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    // Reuse an existing row when a dedupe key is supplied and already
    // present. The `dedupe_key` column is uniquely indexed and callers
    // (e.g. SLA breach checks that run on a schedule) rely on it to
    // avoid re-raising the same alert every tick.
    if (createNotificationDto.dedupeKey) {
      const existing = await this.notificationRepository.findOne({
        where: { dedupe_key: createNotificationDto.dedupeKey },
      });
      if (existing) return existing;
    }

    // Explicit field mapping. The DTO is camelCase but the entity
    // columns are snake_case, so the previous `{ ...dto }` spread
    // silently dropped entity_id, action_url, dedupe_key, context_json
    // and notification_options. That broke click-through navigation
    // (no entity_id / action_url to route to) AND — because dedupe_key
    // never persisted — duplicate suppression, so scheduled SLA checks
    // piled up hundreds of identical unread notifications.
    const notification = this.notificationRepository.create({
      title: createNotificationDto.title,
      message: createNotificationDto.message,
      channel: createNotificationDto.channel || 'in-app',
      severity: createNotificationDto.severity ?? 'info',
      entity: createNotificationDto.entity ?? null,
      entity_id: createNotificationDto.entityId ?? null,
      dedupe_key: createNotificationDto.dedupeKey ?? null,
      action_url: createNotificationDto.actionUrl ?? null,
      context_json: createNotificationDto.contextJson ?? null,
      notification_options: createNotificationDto.notificationOptions ?? null,
    });

    try {
      return await this.notificationRepository.save(notification);
    } catch (error: any) {
      // Concurrent creators can race past the findOne check above and
      // both attempt to insert the same dedupe_key. Postgres raises
      // 23505 (unique_violation); fall back to the existing row.
      const isUniqueViolation =
        error?.code === '23505' ||
        /duplicate key|ER_DUP_ENTRY/i.test(error?.message ?? '');
      if (createNotificationDto.dedupeKey && isUniqueViolation) {
        const existing = await this.notificationRepository.findOne({
          where: { dedupe_key: createNotificationDto.dedupeKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Send notification to specific users
   */
  async sendToUsers(
    sendNotificationDto: SendNotificationDto,
  ): Promise<Notification> {
    const { userIds, ...notificationData } = sendNotificationDto;

    // Dedup at the notification level: if this alert was already sent
    // (same dedupe key), don't fan it out again — no new fan-out rows,
    // no repeat real-time push. This is what stops scheduled SLA
    // checks from re-notifying every tick.
    if (notificationData.dedupeKey) {
      const existing = await this.notificationRepository.findOne({
        where: { dedupe_key: notificationData.dedupeKey },
      });
      if (existing) {
        // Dedupe the ALERT, never the AUDIENCE. Returning here outright meant
        // that once a notification existed, nobody new could ever receive it —
        // so when a lead moved to another rep, the re-fire found the existing
        // row and the new owner was silently skipped while the alert stayed
        // sitting in the old owner's bell. Reuse the notification, but make
        // sure every requested user actually has a fan-out row.
        await this.ensureRecipients(existing, userIds);
        return existing;
      }
    }

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

    // Emit real-time notification via WebSocket
    if (this.gateway) {
      for (const userId of userIds) {
        this.gateway.emitToUser(userId, 'notification:new', {
          ...notification,
          isRead: false,
        });
      }
    }

    return notification;
  }

  /**
   * Give every user in `userIds` a fan-out row for this notification,
   * skipping the ones who already have it, and push in real time only to
   * those who were actually added.
   */
  private async ensureRecipients(
    notification: Notification,
    userIds: string[],
  ): Promise<void> {
    if (!userIds.length) return;

    const already = await this.userNotificationRepository.find({
      where: { notificationId: notification.id, userId: In(userIds) },
      select: ['userId'],
    });
    const have = new Set(already.map((r) => r.userId));
    const missing = userIds.filter((id) => !have.has(id));
    if (!missing.length) return;

    await this.userNotificationRepository.save(
      missing.map((userId) =>
        this.userNotificationRepository.create({
          userId,
          notificationId: notification.id,
          isRead: 0,
        }),
      ),
    );

    if (this.gateway) {
      for (const userId of missing) {
        this.gateway.emitToUser(userId, 'notification:new', {
          ...notification,
          isRead: false,
        });
      }
    }
  }

  /**
   * Withdraw a personal, still-unread alert about one entity from users who
   * should no longer be seeing it — the previous owner after a reassignment.
   *
   * Only unread rows are removed: anything already read is part of that
   * person's history and stays. The notification row itself is left alone,
   * so whoever still holds it keeps it.
   */
  async revokeUnreadForEntity(
    entity: string,
    entityId: string,
    userIds: string[],
    dedupeKeyPrefixes: string[],
  ): Promise<number> {
    if (!userIds.length || !dedupeKeyPrefixes.length) return 0;

    // Scoped by dedupe-key prefix on purpose. Not every alert about a lead is
    // addressed to whoever owns it: SLA escalations and breach alerts go to
    // admins and sales managers precisely BECAUSE they are not the owner, and
    // withdrawing those on a reassignment would delete a manager's escalation
    // out from under them. Only the alerts whose emitter sends to
    // [lead.assigned_to] and nobody else are withdrawn here.
    const inner = this.notificationRepository
      .createQueryBuilder('n')
      .select('n.id')
      .where('n.entity = :entity')
      .andWhere('n.entity_id = :entityId')
      .andWhere(
        '(' +
          dedupeKeyPrefixes
            .map((_, i) => `n.dedupe_key LIKE :prefix${i}`)
            .join(' OR ') +
          ')',
      );

    const parameters: Record<string, unknown> = { entity, entityId };
    dedupeKeyPrefixes.forEach((prefix, i) => {
      parameters[`prefix${i}`] = `${prefix}%`;
    });

    const result = await this.userNotificationRepository
      .createQueryBuilder()
      .delete()
      .where('"userId" IN (:...userIds)', { userIds })
      .andWhere('"isRead" = 0')
      .andWhere('"notificationId" IN (' + inner.getQuery() + ')')
      .setParameters({ ...parameters, userIds })
      .execute();

    return result.affected ?? 0;
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
