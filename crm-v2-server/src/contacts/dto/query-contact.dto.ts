import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumberString,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PreferredContactMethod } from '../constants/preferred-contact-method';
import { CONTACT_ROLES } from '../constants/contact-roles';
import type { ContactRole } from '../constants/contact-roles';

export class QueryContactDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10, description: 'Items per page' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search by first name, last name, or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by school ID' })
  @IsOptional()
  @IsUUID()
  school_id?: string;

  @ApiPropertyOptional({ enum: CONTACT_ROLES, description: 'Filter by contact role' })
  @IsOptional()
  @IsString()
  role?: ContactRole;

  @ApiPropertyOptional({
    enum: PreferredContactMethod,
    description: 'Filter by preferred contact method',
  })
  @IsOptional()
  @IsEnum(PreferredContactMethod)
  preferred_contact_method?: PreferredContactMethod;

  @ApiPropertyOptional({ description: 'Filter primary contacts only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional({ description: 'Include inactive contacts' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  include_inactive?: boolean;
}
