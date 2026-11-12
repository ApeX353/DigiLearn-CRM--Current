import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumberString,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { toBool } from '../../common/transformers/to-bool';
import { PreferredContactMethod } from '../constants/preferred-contact-method';
import { CONTACT_ROLES } from '../constants/contact-roles';
import type { ContactRole } from '../constants/contact-roles';
import { STAKEHOLDER_TYPES } from '../constants/stakeholder-types';
import type { StakeholderType } from '../constants/stakeholder-types';

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
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  is_primary?: boolean;

  @ApiPropertyOptional({ description: 'Include inactive contacts' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  include_inactive?: boolean;

  /**
   * Filter by stakeholder relationship category (e.g. GovernmentStakeholder,
   * Partner, DecisionMaker). Independent of `is_sales_lead` — a contact
   * can be both a lead contact AND a decision maker.
   */
  @ApiPropertyOptional({
    enum: STAKEHOLDER_TYPES,
    description: 'Filter by stakeholder type',
  })
  @IsOptional()
  @IsString()
  stakeholder_type?: StakeholderType;

  /**
   * When `false`, returns only pure stakeholders (government, partners,
   * donors, etc.) — the people who aren't sales leads but matter for
   * relationship history.
   */
  @ApiPropertyOptional({
    description: 'Filter by sales-lead flag (true = lead contacts only)',
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  is_sales_lead?: boolean;
}

