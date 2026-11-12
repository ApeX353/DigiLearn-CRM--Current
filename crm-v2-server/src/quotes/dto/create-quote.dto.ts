import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QUOTE_STATUSES } from '../constants';
import type { QuoteStatus } from '../constants';

export class CreateQuoteItemDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiProperty({ example: 'Digital Learning Platform - Annual License' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 199.99, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_price: number;

  @ApiPropertyOptional({ example: 10.0, default: 0, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({
    example: 15.0,
    default: 0,
    description: 'Tax rate percentage',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax_rate?: number;
}

export class CreateQuoteDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  person_id?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  school_id: string;

  @ApiProperty({ example: 'Springfield High School' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  client_name: string;

  @ApiPropertyOptional({ example: 'admin@springfield.edu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  client_email?: string;

  @ApiPropertyOptional({ example: '123 Main St, Harare' })
  @IsOptional()
  @IsString()
  client_address?: string;

  @ApiPropertyOptional({
    enum: QUOTE_STATUSES,
    default: 'Draft',
    example: 'Draft',
  })
  @IsOptional()
  @IsEnum(QUOTE_STATUSES)
  status?: QuoteStatus;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  valid_until?: string;

  @ApiPropertyOptional({ example: 'Special pricing for bulk order' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  po_received?: boolean;

  @ApiProperty({ type: [CreateQuoteItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items: CreateQuoteItemDto[];

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
    @IsOptional()
    @IsUUID()
    payment_term_id?: string;
  
    @ApiPropertyOptional({ example: 5 })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    interest?: number;

  /**
   * The agreed instalment due dates, one per instalment, in order (YYYY-MM-DD
   * or ISO). Optional: when absent the term's own spacing (periods, term
   * length in days, or calendar months) produces the dates as before. Used
   * when the arrangement is tied to a calendar the term cannot express, such
   * as "balance at the next school-term opening". The amounts still come
   * from the term; only the dates are supplied.
   */
  @ApiPropertyOptional({ type: [String], example: ['2026-11-05', '2027-01-12'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(36)
  @IsDateString({}, { each: true })
  installment_due_dates?: string[];
}
