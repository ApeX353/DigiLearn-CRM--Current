import { IsOptional, IsString, IsEnum, IsNumberString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PAYMENT_TERM_TYPES } from '../constants';
import type { PaymentTermType } from '../constants';

export class QueryPaymentTermDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PAYMENT_TERM_TYPES })
  @IsOptional()
  @IsEnum(PAYMENT_TERM_TYPES)
  type?: PaymentTermType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_active?: boolean;
}
