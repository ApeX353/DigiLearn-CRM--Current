import {
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  invoice_id: string;

  @ApiProperty({ example: 500.0, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: '2026-01-30T00:00:00.000Z' })
  @IsDateString()
  payment_date: string;

  @ApiPropertyOptional({ example: 'Bank Transfer' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string;

  @ApiPropertyOptional({ example: 'TXN-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({ example: 'First instalment' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Cash'})
  @IsOptional()
  @IsString()
  payment_method?: string;
}
