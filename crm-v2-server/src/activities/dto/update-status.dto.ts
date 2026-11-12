import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ActivityOutcome,
  ActivityStatus,
  ActivityType,
} from '../entities/activity.entity';

/**
 * Phase B — atomic next-step payload. When the
 * `enforce_next_step_on_completion` policy is on AND no future
 * actionable activity exists on the parent lead/deal, the caller
 * must include this so the server schedules the follow-up in the
 * SAME transaction as the completion. Optional in all other cases.
 */
export class NextStepPayloadDto {
  @ApiProperty({ enum: ActivityType, description: 'Type of follow-up activity' })
  @IsEnum(ActivityType)
  type: ActivityType;

  @ApiProperty({ description: 'Subject of the follow-up activity', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  subject: string;

  @ApiProperty({ description: 'When the follow-up is due (ISO 8601)' })
  @IsDateString()
  due_at: string;

  @ApiPropertyOptional({ description: 'Optional description', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

/**
 * Payload for `PATCH /activities/:id/status`.
 *
 * CRM discipline rule: every transition to `completed` must carry
 * an `outcome` so the record keeps a meaningful audit trail and the
 * rep is forced to evaluate "what happened?" before the activity
 * disappears into history. The service layer enforces this —
 * attempting to POST { status: "completed" } without an outcome is
 * rejected with a 400.
 *
 * Reopening (status ← scheduled / in_progress / cancelled) does NOT
 * require an outcome; those transitions are administrative.
 */
export class UpdateStatusDto {
  @ApiProperty({ enum: ActivityStatus })
  @IsEnum(ActivityStatus)
  status: ActivityStatus;

  @ApiPropertyOptional({
    enum: ActivityOutcome,
    description:
      'Required when `status === "completed"`. Captures the outcome of the activity.',
  })
  @IsOptional()
  @IsEnum(ActivityOutcome)
  outcome?: ActivityOutcome;

  @ApiPropertyOptional({
    description: 'Optional free-form note recorded alongside the outcome.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  completion_note?: string;

  @ApiPropertyOptional({
    type: NextStepPayloadDto,
    description:
      'Phase B: optional follow-up activity to schedule atomically alongside the completion. Required by the server only when the next-step compliance policy is on AND no other future actionable activity exists on the parent lead/deal.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NextStepPayloadDto)
  next_step?: NextStepPayloadDto;

  @ApiPropertyOptional({
    description:
      '"Already planned": id of an existing OPEN, DATED, actionable activity on the same lead/deal/contact that is the next step. Satisfies the next-step rule without creating a new row. Mutually exclusive with next_step in spirit — if both are sent, next_step is still created.',
  })
  @IsOptional()
  @IsUUID()
  next_step_existing_id?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      '"This also covered…": ids of other OPEN activities on the same record that this interaction settled. They are completed in the same transaction with the same outcome and a note pointing back at this activity. Max 20.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  also_complete?: string[];
}
