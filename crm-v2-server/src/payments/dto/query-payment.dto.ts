import { IsOptional, IsUUID, IsNumberString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryPaymentDto {
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
  invoice_id?: string;

  @ApiPropertyOptional({ description: 'Filter payments from this date' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'Filter payments until this date' })
  @IsOptional()
  @IsDateString()
  end_date?: string;
}
