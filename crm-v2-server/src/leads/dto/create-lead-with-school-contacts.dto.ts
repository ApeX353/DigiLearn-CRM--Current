import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsEmail,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { LEAD_SOURCES } from '../constants';
import type { LeadSource } from '../constants';
import {
  CONTACT_ROLES,
  PreferredContactMethod,
  type ContactRole,
} from '../../contacts/constants';
import {
  DecisionRole,
  InfluenceLevel,
} from '../entities/lead-stakeholders.entity';
import {
  CHURCH_DENOMINATIONS,
  type ChurchDenomination,
  OWNERSHIP_TYPES,
  type OwnershipType,
  PROVINCES,
  type Province,
  REGIONS,
  type Region,
  SCHOOL_TYPES,
  type SchoolType,
} from '../../schools/constants';

export class CreateContactDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  contact_id?: string;

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

  @ApiPropertyOptional({
    example: '+27123456780',
    description: 'Optional second phone number (CON1). Never required.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  secondary_phone?: string;

  @ApiPropertyOptional({ example: '+27123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_number?: string;

  @ApiPropertyOptional({ enum: CONTACT_ROLES, example: 'Principal' })
  @IsOptional()
  @IsEnum(CONTACT_ROLES)
  role?: ContactRole;

  @ApiPropertyOptional({
    enum: DecisionRole,
    example: DecisionRole.DECISION_MAKER,
    default: DecisionRole.INFLUENCER,
  })
  @IsOptional()
  @IsEnum(DecisionRole)
  decision_role?: DecisionRole;

  @ApiPropertyOptional({
    enum: PreferredContactMethod,
    example: PreferredContactMethod.Email,
    default: PreferredContactMethod.Email,
  })
  @IsOptional()
  @IsEnum(PreferredContactMethod)
  preferred_contact_method?: PreferredContactMethod;

  @ApiPropertyOptional({
    enum: InfluenceLevel,
    example: InfluenceLevel.HIGH,
    default: InfluenceLevel.MEDIUM,
  })
  @IsOptional()
  @IsEnum(InfluenceLevel)
  influence_level?: InfluenceLevel;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_primary: boolean;

  @ApiPropertyOptional({
    example: 'Key decision maker for technology purchases',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSchoolDto {
  @ApiProperty({ example: 'Springfield High School' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'Public',
    enum: ['Public', 'Private', 'Charter', 'Other'],
  })
  @IsString()
  @IsNotEmpty()
  school_type: string;

  @ApiPropertyOptional({ example: 'Johannesburg' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: 'Gauteng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province: string;

  @ApiProperty({ example: 'North' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  region: string;

  @ApiPropertyOptional({ example: '123 Main Street, Johannesburg' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '2000' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postal_code?: string;

  @ApiPropertyOptional({ example: 'South Africa', default: 'South Africa' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: '+27123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'info@springfield.edu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'www.springfield.edu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ example: 'Dr. Jane Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  principal_name?: string;

  @ApiPropertyOptional({ example: 850 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  student_count?: number;
}

export class LeadInfoDto {
  @ApiProperty({
    example: 'Springfield High School - Digital Learning Platform',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: LEAD_SOURCES, example: 'Website' })
  @IsEnum(LEAD_SOURCES)
  @IsNotEmpty()
  source: LeadSource;

  @ApiPropertyOptional({ example: 50000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimated_value?: number;

  @ApiPropertyOptional({ example: 'Interested in digital learning platform' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Campaign/event this lead was sourced from',
  })
  @IsOptional()
  @IsUUID()
  source_campaign_id?: string;

  // For existing school
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  school_id?: string;

  // For new school
  @ApiProperty({ example: 'Harare High School' })
  @IsString()
  @MaxLength(255)
  school_name: string;

  @ApiPropertyOptional({
    enum: OWNERSHIP_TYPES,
    example: 'Government',
  })
  @IsOptional()
  @IsEnum(OWNERSHIP_TYPES)
  ownership_type?: OwnershipType;

  @ApiPropertyOptional({
    enum: CHURCH_DENOMINATIONS,
    example: 'Methodist',
  })
  @IsOptional()
  @IsEnum(CHURCH_DENOMINATIONS)
  church_denomination?: ChurchDenomination;

  @ApiPropertyOptional({
    enum: SCHOOL_TYPES,
    example: 'Methodist',
  })
  @IsOptional()
  @IsEnum(SCHOOL_TYPES)
  school_type?: SchoolType;

  @ApiPropertyOptional({ example: 'Harare' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ enum: PROVINCES, example: 'Harare' })
  @IsOptional()
  @IsEnum(PROVINCES)
  province?: Province;

  @ApiPropertyOptional({ example: 'Harare' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ enum: REGIONS, example: 'North' })
  @IsOptional()
  @IsEnum(REGIONS)
  region?: Region;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsString()
  assigned_to?: string;
}

export class CreateLeadWithSchoolContactsDto {
  @ApiProperty({ type: LeadInfoDto })
  @ValidateNested()
  @Type(() => LeadInfoDto)
  lead: LeadInfoDto;

  @ApiProperty({ type: [CreateContactDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  contacts: CreateContactDto[];
}
