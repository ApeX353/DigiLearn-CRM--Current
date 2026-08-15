import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { INVOICE_STATUSES } from '../constants';
import type { InvoiceStatus } from '../constants';

export class CreateInvoiceItemDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiProperty({ example: 'Digital Learning Platform - Annual License' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
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

export class CreateInvoiceDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  person_id?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  quote_id?: string;

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
    enum: INVOICE_STATUSES,
    default: 'Draft',
    example: 'Draft',
  })
  @IsOptional()
  @IsEnum(INVOICE_STATUSES)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ example: 'Payment due within 30 days' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  payment_term_id?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  interest?: number;

  @ApiProperty({ type: [CreateInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}
