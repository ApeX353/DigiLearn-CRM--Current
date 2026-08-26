import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsUrl,
  IsInt,
  Min,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SCHOOL_TYPES } from '../constants/school-types';
import type { SchoolType } from '../constants/school-types';
import {
  CHURCH_DENOMINATIONS,
  type ChurchDenomination,
  OWNERSHIP_TYPES,
  type OwnershipType,
  PROVINCES,
  type Province,
  REGIONS,
  type Region,
} from '../constants';

export class CreateSchoolDto {
  @ApiProperty({ example: 'Springfield High School', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: SCHOOL_TYPES, example: 'Secondary' })
  @IsEnum(SCHOOL_TYPES)
  @IsNotEmpty()
  school_type: SchoolType;

  @ApiProperty({ enum: CHURCH_DENOMINATIONS, example: 'Other' })
  @IsEnum(CHURCH_DENOMINATIONS)
  @IsNotEmpty()
  church_denomination: ChurchDenomination;

  @ApiProperty({ enum: OWNERSHIP_TYPES, example: 'Government' })
  @IsEnum(OWNERSHIP_TYPES)
  @IsNotEmpty()
  ownership_type: OwnershipType;

  @ApiPropertyOptional({ example: '123 Main Street, Suburb' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Johannesburg', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ enum: PROVINCES, example: 'Harare' })
  @IsEnum(PROVINCES)
  @IsNotEmpty()
  province: Province;

  @ApiPropertyOptional({ example: 'Harare' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ enum: REGIONS, example: 'North' })
  @IsEnum(REGIONS)
  @IsNotEmpty()
  region: Region;

  @ApiPropertyOptional({ example: 850, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  student_count?: number;
}
