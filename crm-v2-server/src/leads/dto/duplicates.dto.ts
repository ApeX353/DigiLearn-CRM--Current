import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DUPLICATE_RECORD_TYPES,
  DUPLICATE_SUSPICION_STATUSES,
  type DuplicateRecordType,
  type DuplicateSuspicionStatus,
} from '../entities/duplicate-suspicion.entity';

/**
 * Validated bodies for the /duplicates surface. These handlers took bare
 * interface literals until 11 Sep 2026, so the global ValidationPipe never
 * ran on them and an empty or malformed body reached the service as
 * `undefined` — `PATCH /duplicates/:id/review` and `POST /duplicates/:id/merge`
 * answered 500 with a TypeError (BUG-052, AUDIT_COVERAGE_V2.md). Every field
 * below mirrors what the service already accepted; nothing new is allowed.
 */

export class PeekLeadDuplicatesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lead_name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  school_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  primary_contact_id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string | null;
}

export class PeekSchoolDuplicatesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string | null;
}

export class PeekContactDuplicatesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  school_id?: string | null;
}

export class DuplicateSignalDto {
  @ApiProperty({ example: 'phone_exact' })
  @IsString()
  @MaxLength(100)
  kind: string;

  @ApiProperty({ example: 0.6 })
  @IsNumber()
  weight: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string | null;
}

export class RecordDuplicateSuspicionDto {
  @ApiProperty({ enum: DUPLICATE_RECORD_TYPES })
  @IsIn(DUPLICATE_RECORD_TYPES)
  record_type: DuplicateRecordType;

  @ApiProperty()
  @IsUUID()
  new_record_id: string;

  @ApiProperty()
  @IsUUID()
  existing_record_id: string;

  // The service clamps to 0..100 (recordSuspicion); the bound here only
  // refuses nonsense such as negative or thousand-point scores.
  @ApiProperty({ description: 'Confidence 0..100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiProperty({ type: [DuplicateSignalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DuplicateSignalDto)
  signals: DuplicateSignalDto[];
}

export class ScanDuplicatesDto {
  @ApiPropertyOptional({ enum: DUPLICATE_RECORD_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(DUPLICATE_RECORD_TYPES, { each: true })
  record_types?: DuplicateRecordType[];
}

/** Decisions a manager may record; `pending` is not a decision. */
export const DUPLICATE_REVIEW_DECISIONS = [
  'merged',
  'kept_separate',
  'false_positive',
] as const satisfies readonly DuplicateSuspicionStatus[];

export class ReviewDuplicateSuspicionDto {
  @ApiProperty({ enum: DUPLICATE_REVIEW_DECISIONS })
  @IsIn(DUPLICATE_REVIEW_DECISIONS)
  status: (typeof DUPLICATE_REVIEW_DECISIONS)[number];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class MergeDuplicateSuspicionDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export const DUPLICATE_LIST_STATUSES = [
  ...DUPLICATE_SUSPICION_STATUSES,
  'all',
] as const;

export class QueryDuplicateSuspicionsDto {
  @ApiPropertyOptional({ enum: DUPLICATE_LIST_STATUSES, default: 'pending' })
  @IsOptional()
  @IsIn(DUPLICATE_LIST_STATUSES)
  status?: DuplicateSuspicionStatus | 'all';

  @ApiPropertyOptional({ enum: DUPLICATE_RECORD_TYPES })
  @IsOptional()
  @IsIn(DUPLICATE_RECORD_TYPES)
  record_type?: DuplicateRecordType;
}
