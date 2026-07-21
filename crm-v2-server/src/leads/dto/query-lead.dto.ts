import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumberString,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
 import { toBool } from '../../common/transformers/to-bool';
import { LEAD_SOURCES, LEAD_STATUSES } from '../constants';
import type { LeadSource, LeadStatus } from '../constants';
import { PROVINCES } from '../../schools/constants';

export const LEAD_ASSIGNMENT_STATES = ['assigned', 'unassigned'] as const;
export type LeadAssignmentState = (typeof LEAD_ASSIGNMENT_STATES)[number];

export class QueryLeadDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search by lead name or notes' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: LEAD_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LEAD_SOURCES, description: 'Filter by source' })
  @IsOptional()
  @IsEnum(LEAD_SOURCES)
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'Filter by school ID' })
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @ApiPropertyOptional({ description: 'Filter by assigned user ID' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @ApiPropertyOptional({
    enum: LEAD_ASSIGNMENT_STATES,
    description: 'Filter by assignment state',
  })
  @IsOptional()
  @IsEnum(LEAD_ASSIGNMENT_STATES)
  assignment_state?: LeadAssignmentState;

  @ApiPropertyOptional({ enum: PROVINCES, description: 'Filter by province' })
  @IsOptional()
  @IsEnum(PROVINCES)
  province?: string;

  @ApiPropertyOptional({ description: 'Include deleted leads' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  include_deleted?: boolean;

  @ApiPropertyOptional({ description: 'Filter by SLA breached state' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  sla_breached?: boolean;

  @ApiPropertyOptional({
    enum: ['hot', 'warm', 'cold'],
    description: 'Filter by temperature',
  })
  @IsOptional()
  @IsString()
  temperature?: string;

  @ApiPropertyOptional({
    description: 'Sort by field (e.g., temperature_score)',
  })
  @IsOptional()
  @IsString()
  sort_by?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], description: 'Sort order' })
  @IsOptional()
  @IsString()
  sort_order?: 'ASC' | 'DESC';
}
