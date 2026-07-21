import {
  IsEnum,
  IsUUID,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RequisitionType,
  RequisitionCurrency,
  RequisitionStatus,
} from '../entities/cash-requisition.entity';
import { RequisitionCategory } from '../entities/requisition-line-item.entity';

export class CreateRequisitionLineItemDto {
  @ApiProperty({ enum: RequisitionCategory, example: 'FUEL' })
  @IsEnum(RequisitionCategory)
  category: RequisitionCategory;

  @ApiProperty({ example: 'Fuel Harare → Gweru return, 80L' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @ApiProperty({ example: 120.5, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class CreateCashRequisitionDto {
  @ApiProperty({ enum: RequisitionType })
  @IsEnum(RequisitionType)
  type: RequisitionType;

  @ApiPropertyOptional({ description: 'Deal this cost belongs to' })
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiPropertyOptional({ description: 'Lead this cost belongs to (pre-deal)' })
  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @ApiPropertyOptional({
    description: 'Campaign/event this cost belongs to (stand fees, travel)',
  })
  @IsOptional()
  @IsUUID()
  campaign_id?: string;

  @ApiProperty({ enum: RequisitionCurrency })
  @IsEnum(RequisitionCurrency)
  currency: RequisitionCurrency;

  @ApiProperty({ example: 'Site visit to demo smartboards' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ type: [CreateRequisitionLineItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionLineItemDto)
  line_items: CreateRequisitionLineItemDto[];
}

export class UpdateCashRequisitionDto {
  @ApiPropertyOptional({ enum: RequisitionType })
  @IsOptional()
  @IsEnum(RequisitionType)
  type?: RequisitionType;

  @ApiPropertyOptional({ enum: RequisitionCurrency })
  @IsOptional()
  @IsEnum(RequisitionCurrency)
  currency?: RequisitionCurrency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;

  /** Replace-all semantics: when present, existing items are replaced. */
  @ApiPropertyOptional({ type: [CreateRequisitionLineItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionLineItemDto)
  line_items?: CreateRequisitionLineItemDto[];
}

export class QueryCashRequisitionDto {
  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ default: '20' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ enum: RequisitionStatus })
  @IsOptional()
  @IsEnum(RequisitionStatus)
  status?: RequisitionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaign_id?: string;

  @ApiPropertyOptional({
    description: "'true' = only the caller's own requisitions",
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  mine?: string;

  @ApiPropertyOptional({
    description:
      "'true' = only requisitions awaiting the caller's role-appropriate action",
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  awaiting?: string;
}

export class RejectRequisitionDto {
  @ApiProperty({ example: 'Amounts not itemised — resubmit with receipts' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
