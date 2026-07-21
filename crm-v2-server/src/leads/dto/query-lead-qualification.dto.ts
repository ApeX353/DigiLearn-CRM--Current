import {
  IsOptional,
  IsBoolean,
  IsNumberString,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class QueryLeadQualificationDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Filter by lead ID' })
  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @ApiPropertyOptional({ description: 'Filter by qualified status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is_qualified?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_needs' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  has_needs?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_plan_type' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  has_plan_type?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_timeline' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  has_timeline?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_budget' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  has_budget?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_verified_contact' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  has_verified_contact?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum qualification score',
    example: 50,
  })
  @IsOptional()
  @IsNumberString()
  min_score?: string;

  @ApiPropertyOptional({
    description: 'Maximum qualification score',
    example: 100,
  })
  @IsOptional()
  @IsNumberString()
  max_score?: string;
}
