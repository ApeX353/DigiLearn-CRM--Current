import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
  MaxLength,
  MinLength,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreateQuoteItemDto } from '../../quotes/dto/create-quote.dto';

export class CreateDealCompetitorDto {
  @ApiProperty({ example: 'Competitor Corp' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Strong brand recognition' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  strengths?: string;

  @ApiPropertyOptional({ example: 'Higher pricing' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  weaknesses?: string;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'medium', enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsString()
  threat_level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateDealDto {
  @ApiProperty({ example: 'Springfield High - Digital Platform Deal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 50000, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiProperty({ description: 'Lead ID to convert into a deal' })
  @IsUUID()
  @IsNotEmpty()
  lead_id: string;

  @ApiProperty({ description: 'School/Company ID' })
  @IsUUID()
  @IsNotEmpty()
  school_id: string;

  @ApiProperty({ description: 'Initial pipeline stage ID' })
  @IsUUID()
  @IsNotEmpty()
  stage_id: string;

  @ApiProperty({ description: 'Pipeline ID' })
  @IsUUID()
  @IsNotEmpty()
  pipeline_id: string;

  @ApiProperty({ description: 'Deal Stage Probability' })
  @IsInt()
  probability: number;

  @ApiPropertyOptional({ description: 'User to assign deal to' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expected_close_date?: string;

  @ApiPropertyOptional({ type: [CreateDealCompetitorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDealCompetitorDto)
  competitors?: CreateDealCompetitorDto[];

  @ApiProperty({ type: [CreateQuoteItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items?: CreateQuoteItemDto[];

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  payment_term_id?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
 @IsNumber({ maxDecimalPlaces: 2 })
  interest?: number;

  @ApiPropertyOptional({
    example: 'Head confirmed budget approved for 4 boards this term',
    description:
      'Why this lead is commercially live. Only needed when the compliance switch enforce_commercial_intent_for_deal is on and the lead has not already earned commercial intent from a recorded signal. Stored on the lead as the intent reason and written to the audit log, so a declared intent is attributable.',
  })
  @IsOptional()
  @IsString()
  @MinLength(10, {
    message:
      'commercial_intent_reason must say something — at least 10 characters',
  })
  @MaxLength(500)
  commercial_intent_reason?: string;

  /**
   * One order, one deal (recording rule 6): creating a deal for a school
   * that already has an open deal is rejected with 409 unless the rep
   * explicitly confirms it is a genuine second order.
   */
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  duplicate_override?: boolean;
}
