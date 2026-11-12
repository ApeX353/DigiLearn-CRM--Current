import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
  IsDateString,
  IsEnum,
  IsNumberString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityAction } from '../enums/activity-action.enum';
import {
  AUDIT_CATEGORIES,
  AUDIT_EVENTS,
  type AuditCategory,
  type AuditEvent,
} from '../audit-presentation';

export class QueryActivityLogDto {
  @ApiPropertyOptional({ enum: AUDIT_CATEGORIES })
  @IsOptional()
  @IsIn(AUDIT_CATEGORIES)
  category?: AuditCategory;

  @ApiPropertyOptional({ enum: AUDIT_EVENTS })
  @IsOptional()
  @IsIn(AUDIT_EVENTS)
  event?: AuditEvent;

  @ApiPropertyOptional({ description: 'Record id, or an invoice, quotation or payment reference' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  record?: string;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 20, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Filter by entity type' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Filter by entity ID' })
  @IsOptional()
  @IsUUID()
  entity_id?: string;

  @ApiPropertyOptional({ enum: ActivityAction, description: 'Filter by action type' })
  @IsOptional()
  @IsEnum(ActivityAction)
  action?: ActivityAction;

  @ApiPropertyOptional({ description: 'Filter by user who performed action' })
  @IsOptional()
  @IsUUID()
  actioned_by?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  end_date?: string;
}
