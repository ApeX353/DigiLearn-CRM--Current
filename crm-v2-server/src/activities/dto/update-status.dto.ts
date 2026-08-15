import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
 * Atomic next-step payload. Every newly completed actionable activity on an
 * active lead/deal must carry this payload. The source completion and its new
 * follow-up are saved in the same transaction. Existing open work and the
 * caller's role do not satisfy this obligation.
 */
export class NextStepPayloadDto {
  @ApiProperty({
    enum: ActivityType,
    description: 'Type of follow-up activity',
  })
  @IsEnum(ActivityType)
  type: ActivityType;

  @ApiProperty({
    description: 'Subject of the follow-up activity',
    maxLength: 255,
  })
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

  @ApiPropertyOptional({
    description: 'Contact selected for this follow-up activity',
  })
  @IsOptional()
  @IsUUID()
  contact_id?: string;
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
      'Follow-up scheduled atomically alongside completion. Required when a newly completed actionable activity belongs to an active lead or deal.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NextStepPayloadDto)
  next_step?: NextStepPayloadDto;
}
