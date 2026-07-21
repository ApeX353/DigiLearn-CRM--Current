import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumberString,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SCHOOL_TYPES } from '../constants/school-types';
import type { SchoolType } from '../constants/school-types';

export class QuerySchoolDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search by name, city, or region' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SCHOOL_TYPES, description: 'Filter by school type' })
  @IsOptional()
  @IsEnum(SCHOOL_TYPES)
  school_type?: SchoolType;

  @ApiPropertyOptional({ description: 'Filter by province' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: 'Filter by region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Include inactive schools' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  include_inactive?: boolean;
}
