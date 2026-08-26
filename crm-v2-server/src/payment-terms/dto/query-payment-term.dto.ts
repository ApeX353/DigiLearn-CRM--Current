import { IsOptional, IsString, IsEnum, IsNumberString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
 import { toBool } from '../../common/transformers/to-bool';
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
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  is_active?: boolean;
}
