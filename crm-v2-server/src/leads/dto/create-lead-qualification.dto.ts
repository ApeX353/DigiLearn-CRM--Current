import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsIn,
  IsDateString,
  ValidateNested,
  IsUUID,
  MaxLength,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  PAYMENT_TERM_TYPES,
  type PaymentTermType,
} from '../../payment-terms/constants';
import {
  TIMELINE_TYPES,
  BUDGET_INDICATORS,
  type TimelineType,
  type BudgetIndicator,
} from '../constants';
import { IsInt } from '@nestjs/class-validator';

export class ChecklistDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  phone_verified?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  email_verified?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  province_verified?: boolean;
}

export class QualificationNeedsDto {
  @ApiProperty({ example: 'uuid' })
  @IsString()
  id: string;
 
  @ApiProperty({ example: 'Product item name' })
  @IsString()
  name: string;
  
  @ApiProperty({ example: '22.60' })
  @IsInt()
  price: number;

  @ApiProperty({ example: '15' })
  @IsInt()
  tax: number;

  @ApiProperty({ example: '10' })
  @IsInt()
  discount: number;
}

export class CreateLeadQualificationDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  lead_id: string;

  // ===== NEED ASSESSMENT =====

  @ApiPropertyOptional({ example: 'Needs digital learning platform for 500 students' })
  @IsOptional()
  @IsString()
  needs?: string;

  @ApiPropertyOptional({ example: 'Needs digital learning platform for 500 students' })
  @IsOptional()
  @IsString()
  qualification_needs?: QualificationNeedsDto[];

  // ===== PLAN TYPE =====

  @ApiPropertyOptional({
    example: '3-term',
    description: 'Payment term type the lead is interested in',
  })
  @IsString()
  @IsOptional()
  plan_type?: PaymentTermType;

  // ===== TIMELINE =====

  @ApiPropertyOptional({
    example: 'this-term',
    enum: TIMELINE_TYPES,
    description: 'When the lead plans to make a decision',
  })
  @IsOptional()
  @IsIn(TIMELINE_TYPES)
  timeline_type?: TimelineType;

  @ApiPropertyOptional({
    example: '2026-03-15',
    description: 'Specific date when timeline_type is "specific-date"',
  })
  @IsOptional()
  @IsDateString()
  specific_date?: string;

  // ===== BUDGET =====

  @ApiPropertyOptional({
    example: 'high',
    enum: BUDGET_INDICATORS,
    description: 'Budget level indicator',
  })
  @IsOptional()
  @IsIn(BUDGET_INDICATORS)
  budget_indicator?: BudgetIndicator;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget_amount?: number;

  // ===== AUTHORITY / DECISION MAKER =====

  @ApiPropertyOptional({ example: 'John Smith', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  decision_maker_name?: string;

  @ApiPropertyOptional({ example: 'Principal', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  decision_maker_title?: string;

  // ===== CHECKLIST =====

  @ApiPropertyOptional({
    type: ChecklistDto,
    description: 'Verification checklist',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChecklistDto)
  checklist?: ChecklistDto;
}
