import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumberString,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
 import { toBool } from '../../common/transformers/to-bool';
import { INVOICE_STATUSES, PAYMENT_STATUSES } from '../constants';
import type { InvoiceStatus, PaymentStatus } from '../constants';

export class QueryInvoiceDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Search by invoice number or client name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: INVOICE_STATUSES })
  @IsOptional()
  @IsEnum(INVOICE_STATUSES)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ enum: PAYMENT_STATUSES })
  @IsOptional()
  @IsEnum(PAYMENT_STATUSES)
  payment_status?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  owner_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiPropertyOptional({ description: 'Filter overdue invoices only' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'Include child invoices generated from multiple-invoice terms',
    default: false,
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  include_children?: boolean;
}
