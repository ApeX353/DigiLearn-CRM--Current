import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ActivityOutcome,
  ActivityStatus,
} from '../entities/activity.entity';

/**
 * Body for `PATCH /activities/bulk-status`.
 *
 * The "mark done for lots of things at once" case is explicitly called
 * out in Section 1 of the spec. We cap at 200 so one request can't
 * lock tables or blow the payload limit, but a normal user clearing
 * their morning list will be nowhere near that.
 */
export class BulkStatusDto {
  @ApiProperty({
    description: 'Activity UUIDs to update',
    type: [String],
    maxItems: 200,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({
    description: 'New status to apply to every listed activity',
    enum: ActivityStatus,
    example: ActivityStatus.COMPLETED,
  })
  @IsEnum(ActivityStatus)
  status: ActivityStatus;

  @ApiPropertyOptional({
    enum: ActivityOutcome,
    description:
      'Required when `status === "completed"`. Applied uniformly to every updated row in this batch.',
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
}
