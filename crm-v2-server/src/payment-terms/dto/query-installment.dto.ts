import { IsOptional, IsUUID, IsEnum, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { INSTALLMENT_STATUSES } from '../constants';
import type { InstallmentStatus } from '../constants';

export class QueryInstallmentDto {
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
  @IsUUID()
  document_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  applied_payment_term_id?: string;

  @ApiPropertyOptional({ enum: INSTALLMENT_STATUSES })
  @IsOptional()
  @IsEnum(INSTALLMENT_STATUSES)
  status?: InstallmentStatus;
}
