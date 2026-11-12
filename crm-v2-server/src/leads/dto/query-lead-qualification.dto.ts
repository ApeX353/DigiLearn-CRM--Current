import {
  IsOptional,
  IsBoolean,
  IsNumberString,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
 import { toBool } from '../../common/transformers/to-bool';

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
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  is_qualified?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_needs' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  has_needs?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_plan_type' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  has_plan_type?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_timeline' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  has_timeline?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_budget' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  has_budget?: boolean;

  @ApiPropertyOptional({ description: 'Filter by has_verified_contact' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
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
