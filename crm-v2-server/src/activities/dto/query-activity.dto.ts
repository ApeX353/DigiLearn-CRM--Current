import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsNumberString,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ActivityType, ActivityStatus } from '../entities/activity.entity';

export class QueryActivityDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @ApiPropertyOptional({ enum: ActivityStatus })
  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contact_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  created_by_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigned_to_id?: string;

  @ApiPropertyOptional({ description: 'Filter activities from this date' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'Filter activities until this date' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Filter by isPinned' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_pinned?: boolean;

  @ApiPropertyOptional({ description: 'Include type-specific details' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_details?: boolean;
}

export class ActivitySummaryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contact_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  created_by_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigned_to_id?: string;

  @ApiPropertyOptional({ description: 'Start date for summary range' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'End date for summary range' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}

export class LeadActivityStatsResponseDto {
  /** Number of activities (touches) in the last 7 days */
  touchesLast7Days: number;

  /** Hours from lead creation to first activity (null if no activities) */
  timeToFirstTouch: number | null;

  /** Number of meetings with outcome 'booked' or 'scheduled' */
  meetingsBookedCount: number;

  /** Number of activities missing required follow-up/next step (excludes notes) */
  incompleteLogsCount: number;

  /** True if no activity in the last 7 days */
  isStale: boolean;

  /** Date of the most recent activity (null if no activities) */
  lastActivityAt: Date | null;

  /** Total number of activities for this lead */
  totalActivities: number;

  /** Breakdown by activity type */
  byType: Record<string, number>;
}
