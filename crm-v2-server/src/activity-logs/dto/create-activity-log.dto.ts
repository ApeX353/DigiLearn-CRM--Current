import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsObject,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityAction } from '../enums/activity-action.enum';

export class CreateActivityLogDto {
  @ApiProperty({ example: 'Pipeline', description: 'Entity type' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  entity: string;

  @ApiProperty({ example: 'uuid-here', description: 'Entity UUID' })
  @IsUUID()
  @IsNotEmpty()
  entity_id: string;

  @ApiProperty({ enum: ActivityAction, example: ActivityAction.CREATE })
  @IsEnum(ActivityAction)
  @IsNotEmpty()
  action: ActivityAction;

  @ApiProperty({ example: 'Created new pipeline "Sales Pipeline"' })
  @IsString()
  @IsNotEmpty()
  summary: string;

  @ApiPropertyOptional({ description: 'User ID who performed the action' })
  @IsOptional()
  @IsUUID()
  actioned_by?: string;

  @ApiPropertyOptional({ description: 'Additional metadata (IP, user agent, etc.)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Previous values before change' })
  @IsOptional()
  @IsObject()
  old_values?: Record<string, any>;

  @ApiPropertyOptional({ description: 'New values after change' })
  @IsOptional()
  @IsObject()
  new_values?: Record<string, any>;
}
