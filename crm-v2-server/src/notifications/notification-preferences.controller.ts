import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  NotificationPreference,
  type NotificationChannel,
} from './entities/notification-preference.entity';

interface CreatePreferenceBody {
  event_type: string;
  channel: NotificationChannel;
  is_enabled: boolean;
  severity_min?: 'info' | 'warning' | 'critical';
}

interface UpdatePreferenceBody {
  is_enabled?: boolean;
  severity_min?: 'info' | 'warning' | 'critical';
}

/**
 * `/notification-preferences` — per-user toggles for notification
 * delivery. Endpoints mirror the client hook contract in
 * `client/src/api/notifications/use-notifications.ts`:
 *
 *   GET    /notification-preferences              → list for current user
 *   POST   /notification-preferences               → upsert one
 *   PATCH  /notification-preferences/:event/:ch    → partial update
 *
 * Keeps the response shape flat (plain array / plain row) so the
 * existing frontend hooks work without a data-unwrap layer.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly repo: Repository<NotificationPreference>,
  ) {}

  private getUserId(req: any): string {
    return req?.user?.id ?? req?.user?.sub;
  }

  @Get()
  @ApiOperation({ summary: 'List the current user’s notification toggles' })
  async list(@Req() req: any): Promise<NotificationPreference[]> {
    const userId = this.getUserId(req);
    if (!userId) return [];
    return this.repo.find({ where: { user_id: userId } });
  }

  @Post()
  @ApiOperation({
    summary:
      'Create (or upsert) a preference for the current user on a given event+channel',
  })
  async create(
    @Req() req: any,
    @Body() body: CreatePreferenceBody,
  ): Promise<NotificationPreference> {
    const userId = this.getUserId(req);
    const existing = await this.repo.findOne({
      where: {
        user_id: userId,
        event_type: body.event_type,
        channel: body.channel,
      },
    });
    if (existing) {
      existing.is_enabled = body.is_enabled;
      existing.severity_min = body.severity_min ?? existing.severity_min;
      return this.repo.save(existing);
    }
    const row = this.repo.create({
      user_id: userId,
      event_type: body.event_type,
      channel: body.channel,
      is_enabled: body.is_enabled,
      severity_min: body.severity_min ?? null,
    });
    return this.repo.save(row);
  }

  @Patch(':eventType/:channel')
  @ApiOperation({ summary: 'Partial update by composite key' })
  async update(
    @Req() req: any,
    @Param('eventType') eventType: string,
    @Param('channel') channel: NotificationChannel,
    @Body() body: UpdatePreferenceBody,
  ): Promise<NotificationPreference> {
    const userId = this.getUserId(req);
    let row = await this.repo.findOne({
      where: { user_id: userId, event_type: eventType, channel },
    });
    if (!row) {
      // Treat PATCH on a missing row as an implicit create — matches
      // the frontend's "toggle me on" intent and avoids forcing two
      // round-trips for the first change.
      row = this.repo.create({
        user_id: userId,
        event_type: eventType,
        channel,
        is_enabled: body.is_enabled ?? true,
        severity_min: body.severity_min ?? null,
      });
      return this.repo.save(row);
    }
    if (body.is_enabled !== undefined) row.is_enabled = body.is_enabled;
    if (body.severity_min !== undefined) row.severity_min = body.severity_min;
    return this.repo.save(row);
  }
}
