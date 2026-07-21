import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SchedulingLinkLocation,
  WeeklyAvailabilityWindow,
} from '../entities/scheduling-link.entity';

/**
 * Wire-level DTO for a single availability window. class-validator can't
 * see WeeklyAvailabilityWindow directly because it's a pure TS
 * interface, so we mirror the shape here and validate.
 */
export class AvailabilityWindowDto implements WeeklyAvailabilityWindow {
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  start_minutes_from_midnight: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  end_minutes_from_midnight: number;
}

export class CreateSchedulingLinkDto {
  // Slugs feed the public URL so restrict to URL-safe chars up front,
  // otherwise a lazy owner types "Jane's 30m!" and it breaks sharing.
  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/, {
    message: 'slug must be lowercase letters/digits/hyphens (3–80 chars)',
  })
  slug: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(SchedulingLinkLocation)
  location_type: SchedulingLinkLocation;

  @IsOptional()
  @IsString()
  location_detail?: string;

  @IsInt()
  @Min(5)
  @Max(8 * 60)
  duration_minutes: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  buffer_before_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  buffer_after_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7 * 24 * 60)
  min_notice_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  max_days_ahead?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(28) // 7 days * 4 windows/day is plenty
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  availability?: AvailabilityWindowDto[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/**
 * All fields optional. We reuse the validators from create by marking
 * them optional so partial PATCHes don't silently drop validation on the
 * fields they DO send.
 */
export class UpdateSchedulingLinkDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(SchedulingLinkLocation)
  location_type?: SchedulingLinkLocation;

  @IsOptional()
  @IsString()
  location_detail?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(8 * 60)
  duration_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  buffer_before_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  buffer_after_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7 * 24 * 60)
  min_notice_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  max_days_ahead?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  availability?: AvailabilityWindowDto[];

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** Payload for `POST /book/:slug/hold` — provisional slot reservation. */
export class CreateHoldDto {
  /**
   * ISO8601 start timestamp. We use the string form on the wire so the
   * frontend doesn't have to re-derive a UTC string from a Date built
   * in the owner's timezone.
   */
  @IsString()
  start_at: string;

  @IsOptional()
  @IsEmail()
  invitee_email?: string;
}

/** Payload for `POST /book/:slug/confirm` — finalise the booking. */
export class ConfirmHoldDto {
  @IsString()
  hold_id: string;

  @IsEmail()
  invitee_email: string;

  @IsString()
  @MinLength(1)
  invitee_name: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
