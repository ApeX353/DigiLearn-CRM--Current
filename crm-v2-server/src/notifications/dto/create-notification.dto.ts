import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsObject,
  MaxLength,
  IsUrl,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NOTIFICATION_CHANNELS, NOTIFICATION_SEVERITIES } from '../entities';
import type { NotificationChannel, NotificationSeverity } from '../entities';

export class CreateNotificationDto {
  @ApiProperty({ example: 'New Lead Assigned', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example: 'You have been assigned a new lead: Springfield High School',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  message: string;

  @ApiPropertyOptional({
    enum: NOTIFICATION_CHANNELS,
    example: 'in-app',
    default: 'in-app',
  })
  @IsEnum(NOTIFICATION_CHANNELS)
  @IsOptional()
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    enum: NOTIFICATION_SEVERITIES,
    example: 'info',
    default: 'info',
  })
  @IsEnum(NOTIFICATION_SEVERITIES)
  @IsOptional()
  severity?: NotificationSeverity;

  @ApiPropertyOptional({
    example: 'Lead',
    maxLength: 100,
    description: 'Entity type (e.g., Lead, School, Contact)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Entity ID',
  })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({
    example: 'lead_123_assigned_456',
    maxLength: 255,
    description: 'Unique key for deduplication',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  dedupeKey?: string;

  @ApiPropertyOptional({
    example: '/leads/123e4567-e89b-12d3-a456-426614174000',
    maxLength: 500,
    description: 'URL to navigate when notification is clicked',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionUrl?: string;

  @ApiPropertyOptional({
    example: { leadName: 'Springfield High', assignedBy: 'John Doe' },
    description: 'Additional context data for the notification',
  })
  @IsOptional()
  @IsObject()
  contextJson?: Record<string, any>;

  @ApiPropertyOptional({
    example: { priority: 'high', soundEnabled: true },
    description: 'Additional notification options',
  })
  @IsOptional()
  @IsObject()
  notificationOptions?: Record<string, any>;
}
