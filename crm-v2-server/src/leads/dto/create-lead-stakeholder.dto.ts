import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsEnum,
  MaxLength,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CONTACT_ROLES, PreferredContactMethod } from '../../contacts/constants';
import type { ContactRole } from '../../contacts/constants';
import {
  DecisionRole,
  InfluenceLevel,
} from '../entities/lead-stakeholders.entity';

export class CreateLeadStakeholderDto {
  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  contact_id?: string;

  @ApiPropertyOptional({ example: 'John', maxLength: 100 })
  @ValidateIf((value: CreateLeadStakeholderDto) => !value.contact_id)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', maxLength: 100 })
  @ValidateIf((value: CreateLeadStakeholderDto) => !value.contact_id)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name?: string;

  @ApiPropertyOptional({ example: 'john.doe@school.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+263712345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    example: '+263712345679',
    description: 'Optional second phone number (CON1). Never required.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  secondary_phone?: string;

  @ApiPropertyOptional({ example: '+263712345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp_number?: string;

  @ApiPropertyOptional({ enum: CONTACT_ROLES, example: 'Teacher' })
  @IsOptional()
  @IsEnum(CONTACT_ROLES)
  role?: ContactRole;

  @ApiPropertyOptional({
    enum: PreferredContactMethod,
    example: PreferredContactMethod.Email,
  })
  @IsOptional()
  @IsEnum(PreferredContactMethod)
  preferred_contact_method?: PreferredContactMethod;

  @ApiPropertyOptional({
    enum: DecisionRole,
    example: DecisionRole.INFLUENCER,
  })
  @IsOptional()
  @IsEnum(DecisionRole)
  decision_role?: DecisionRole;

  @ApiPropertyOptional({
    enum: InfluenceLevel,
    example: InfluenceLevel.MEDIUM,
  })
  @IsOptional()
  @IsEnum(InfluenceLevel)
  influence_level?: InfluenceLevel;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional({ example: 'Key ICT stakeholder for this lead' })
  @IsOptional()
  @IsString()
  notes?: string;
}
