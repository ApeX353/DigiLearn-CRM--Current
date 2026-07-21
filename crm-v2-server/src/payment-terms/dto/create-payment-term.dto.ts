import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  PAYMENT_TERM_TYPES,
  INTEREST_CALCULATION_METHODS,
  INVOICE_STRATEGIES,
  PERIOD_TYPES,
} from '../constants';
import type {
  PaymentTermType,
  InterestCalculationMethod,
  InvoiceStrategy,
  PeriodType,
} from '../constants';

export class CreatePaymentTermPeriodDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  period_number: number;

  @ApiProperty({ enum: PERIOD_TYPES, example: 'active' })
  @IsEnum(PERIOD_TYPES)
  period_type: PeriodType;

  @ApiProperty({ example: 90 })
  @IsInt()
  @Min(1)
  duration_days: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  due_date_offset_days?: number;
}

export class CreatePaymentTermDto {
  @ApiPropertyOptional({ example: 'Standard 3-Term Plan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ enum: PAYMENT_TERM_TYPES, example: '3-term' })
  @IsEnum(PAYMENT_TERM_TYPES)
  @IsNotEmpty()
  type: PaymentTermType;

  @ApiPropertyOptional({ example: 2.5, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  interest_rate?: number;

  @ApiPropertyOptional({
    enum: INTEREST_CALCULATION_METHODS,
    default: 'simple',
  })
  @IsOptional()
  @IsEnum(INTEREST_CALCULATION_METHODS)
  interest_calculation_method?: InterestCalculationMethod;

  @ApiPropertyOptional({
    enum: INVOICE_STRATEGIES,
    default: 'single_with_installments',
  })
  @IsOptional()
  @IsEnum(INVOICE_STRATEGIES)
  invoice_strategy?: InvoiceStrategy;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  number_of_terms?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  term_length_days?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  days_until_due?: number;

  @ApiPropertyOptional({ example: 7, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  grace_period_days?: number;

  @ApiPropertyOptional({ example: 2.0, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  late_fee_percentage?: number;

  @ApiPropertyOptional({ example: 50.0, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  late_fee_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terms_and_conditions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ type: [CreatePaymentTermPeriodDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentTermPeriodDto)
  periods?: CreatePaymentTermPeriodDto[];
}
