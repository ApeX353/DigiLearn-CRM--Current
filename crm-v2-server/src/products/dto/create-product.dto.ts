import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCT_TYPES, UNITS } from '../constants';
import type { ProductType, Unit } from '../constants';

export class CreateProductDto {
  @ApiProperty({ enum: PRODUCT_TYPES, example: 'product' })
  @IsEnum(PRODUCT_TYPES)
  @IsNotEmpty()
  product_type: ProductType;

  @ApiProperty({ example: 'Digital Learning Platform License', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Software', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiProperty({ example: 199.99, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Discount percentage',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({
    example: 15,
    description: 'Tax percentage',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax?: number;

  @ApiProperty({ enum: UNITS, example: 'piece', default: 'piece' })
  @IsEnum(UNITS)
  unit: Unit;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
