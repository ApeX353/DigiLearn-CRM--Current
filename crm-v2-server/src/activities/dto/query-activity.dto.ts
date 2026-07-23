import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsNumberString,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
 import { toBool } from '../../common/transformers/to-bool';
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

  @ApiPropertyOptional({
    description:
      'Indirect filter: matches activities whose lead is owned by this school. Implemented as a join on lead.school_id, so the request still hits a single index-friendly query.',
  })
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @ApiPropertyOptional({ description: 'Filter activities from this date' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'Filter activities until this date' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({
    description:
      'Filter activities whose due_at (or scheduled_at when due_at is null) is on or after this ISO date. Used by the Activities page date-context tabs.',
  })
  @IsOptional()
  @IsDateString()
  due_from?: string;

  @ApiPropertyOptional({
    description:
      'Filter activities whose due_at (or scheduled_at when due_at is null) is on or before this ISO date.',
  })
  @IsOptional()
  @IsDateString()
  due_to?: string;

  @ApiPropertyOptional({
    description:
      'Filter by when the activity was LOGGED (created_at), not when it is due. Powers the "Logged today" tab — "what did the team actually record today", as distinct from "Due today".',
  })
  @IsOptional()
  @IsDateString()
  created_from?: string;

  @ApiPropertyOptional({
    description:
      'Upper bound for the created_at (logged) window. See created_from.',
  })
  @IsOptional()
  @IsDateString()
  created_to?: string;

  @ApiPropertyOptional({
    description:
      'Convenience filter: only "open" activities (status NOT IN completed/cancelled). Defaults to false.',
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  open_only?: boolean;

  @ApiPropertyOptional({ description: 'Filter by isPinned' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  is_pinned?: boolean;

  @ApiPropertyOptional({ description: 'Include type-specific details' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
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
