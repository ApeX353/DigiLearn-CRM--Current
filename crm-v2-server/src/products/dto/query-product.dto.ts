import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumberString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
 import { toBool } from '../../common/transformers/to-bool';
import { PRODUCT_TYPES } from '../constants';
import type { ProductType } from '../constants';

export class QueryProductDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search by product name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PRODUCT_TYPES })
  @IsOptional()
  @IsEnum(PRODUCT_TYPES)
  product_type?: ProductType;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Filter by active status',
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  is_active?: boolean;
}
