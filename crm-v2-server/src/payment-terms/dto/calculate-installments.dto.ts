import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CalculateInstallmentsDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  payment_term_id: string;

  @ApiProperty({ example: 25000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  document_total: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  interest?: number;

  @ApiPropertyOptional({ example: '2026-01-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  start_date?: string;
}
