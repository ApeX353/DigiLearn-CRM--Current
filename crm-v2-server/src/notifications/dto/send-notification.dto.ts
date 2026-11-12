import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateNotificationDto } from './create-notification.dto';

export class SendNotificationDto extends CreateNotificationDto {
  /**
   * The Settings-page preference key this alert belongs to (for example
   * `lead.sla_breached`, `lead.idle_alert`). When set, recipients who turned
   * that event off — or whose minimum severity is above this alert's — are
   * dropped before fan-out. Omit for alerts that must always be delivered.
   */
  @ApiPropertyOptional({ example: 'lead.sla_breached' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @ApiProperty({
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '987fcdeb-51a2-43f1-b456-789012345678',
    ],
    description: 'Array of user IDs to send notification to',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  userIds: string[];
}
