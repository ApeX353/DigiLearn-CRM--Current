import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LEAD_SOURCES, LEAD_STATUSES } from '../constants';
import type { LeadSource, LeadStatus } from '../constants';

export class CreateLeadDto {
  @ApiProperty({ example: 'Springfield High School - Digital Learning Platform', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  lead_name: string;

  @ApiPropertyOptional({ enum: LEAD_STATUSES, example: 'New', default: 'New' })
  @IsOptional()
  @IsEnum(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiProperty({ enum: LEAD_SOURCES, example: 'Website' })
  @IsEnum(LEAD_SOURCES)
  @IsNotEmpty()
  source: LeadSource;

  @ApiPropertyOptional({ example: 50000.00, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimated_value?: number;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @ApiPropertyOptional({
    description: 'Optional catalogue product this pursuit is about',
  })
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174001' })
  @IsOptional()
  @IsUUID()
  primary_contact_id?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174002' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174003' })
  @IsOptional()
  @IsUUID()
  stage_id?: string;

  @ApiPropertyOptional({ example: 'Interested in our digital learning platform for 850 students' })
  @IsOptional()
  @IsString()
  notes?: string;
}
