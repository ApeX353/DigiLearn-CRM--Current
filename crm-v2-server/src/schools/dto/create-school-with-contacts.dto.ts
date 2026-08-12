import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  MaxLength,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { CreateSchoolDto } from './create-school.dto';
import {
  CONTACT_ROLES,
  type ContactRole,
} from '../../contacts/constants/contact-roles';
import { PreferredContactMethod } from '../../contacts/constants';

export class SchoolContactDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string;

  @ApiPropertyOptional({ example: 'john.doe@school.com' })
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === ''
      ? undefined
      : typeof value === 'string'
        ? value.trim().toLowerCase()
        : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+27123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: '+27123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_number?: string;

  @ApiPropertyOptional({ enum: CONTACT_ROLES, example: 'Principal' })
  @IsOptional()
  @IsEnum(CONTACT_ROLES)
  role?: ContactRole;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_primary: boolean;

  @ApiPropertyOptional({
    enum: PreferredContactMethod,
    example: PreferredContactMethod.Email,
    default: PreferredContactMethod.Email,
  })
  @IsOptional()
  @IsEnum(PreferredContactMethod)
  preferred_contact_method?: PreferredContactMethod;

  @ApiPropertyOptional({ example: 'Main point of contact' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSchoolWithContactsDto {
  @ApiProperty({ type: CreateSchoolDto })
  @ValidateNested()
  @Type(() => CreateSchoolDto)
  school: CreateSchoolDto;

  @ApiProperty({ type: [SchoolContactDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchoolContactDto)
  contacts: SchoolContactDto[];
}
