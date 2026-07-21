import {
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumberString,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { NOTIFICATION_CHANNELS, NOTIFICATION_SEVERITIES } from '../entities';
import type { NotificationChannel, NotificationSeverity } from '../entities';

export class QueryNotificationDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    enum: NOTIFICATION_CHANNELS,
    description: 'Filter by notification channel',
  })
  @IsOptional()
  @IsEnum(NOTIFICATION_CHANNELS)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    enum: NOTIFICATION_SEVERITIES,
    description: 'Filter by notification severity',
  })
  @IsOptional()
  @IsEnum(NOTIFICATION_SEVERITIES)
  severity?: NotificationSeverity;

  @ApiPropertyOptional({
    description: 'Filter by entity type (e.g., Lead, School, Contact)',
  })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({
    description: 'Filter by entity ID',
  })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Filter by read status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Show only unread notifications' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}
