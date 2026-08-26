import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CONTACT_ROLES, PreferredContactMethod } from '../../contacts/constants';
import type { ContactRole } from '../../contacts/constants';
import {
  DecisionRole,
  InfluenceLevel,
} from '../entities/lead-stakeholders.entity';

/**
 * Edit an existing stakeholder on a lead.
 *
 * Deliberately has no `contact_id`: swapping the person behind a stakeholder
 * row would silently rewrite history (notes, decision role and the BANT
 * signals derived from it) onto someone else. Removing the stakeholder and
 * adding the right one is the honest way to do that.
 *
 * Everything is optional — a PATCH touches only the fields it names. Name,
 * email, phone and preferred contact method belong to the underlying contact
 * and are updated there; role, decision role, influence, primary flag and
 * notes belong to the stakeholder row.
 */
export class UpdateLeadStakeholderDto {
  @ApiPropertyOptional({ example: 'John', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', maxLength: 100 })
  @IsOptional()
  @IsString()
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

  @ApiPropertyOptional({ example: '+263712345679' })
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

  @ApiPropertyOptional({ enum: DecisionRole, example: DecisionRole.INFLUENCER })
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

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional({ example: 'Key ICT stakeholder for this lead' })
  @IsOptional()
  @IsString()
  notes?: string;
}
