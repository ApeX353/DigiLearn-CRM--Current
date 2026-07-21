import {
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { APPLIED_DOCUMENT_TYPES } from '../constants';
import type { AppliedDocumentType } from '../constants';

export class ApplyPaymentTermDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  document_id: string;

  @ApiProperty({ enum: APPLIED_DOCUMENT_TYPES, example: 'invoice' })
  @IsEnum(APPLIED_DOCUMENT_TYPES)
  @IsNotEmpty()
  document_type: AppliedDocumentType;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  payment_term_id: string;

  @ApiPropertyOptional({ example: '2026-01-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  interest?: number;
}
