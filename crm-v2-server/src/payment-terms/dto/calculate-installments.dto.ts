import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  IsArray,
  ArrayMaxSize,
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
