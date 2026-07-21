import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const DATE_RANGE_TYPES = [
  'today',
  'mtd',
  'qtd',
  'ytd',
  'custom',
] as const;
export type DateRangeType = (typeof DATE_RANGE_TYPES)[number];

export class DashboardFiltersDto {
  @ApiPropertyOptional({ enum: DATE_RANGE_TYPES, default: 'mtd' })
  @IsOptional()
  @IsIn(DATE_RANGE_TYPES)
  dateRange?: DateRangeType;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salesRepId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;
}
