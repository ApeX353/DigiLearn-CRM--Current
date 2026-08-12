import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateLeadDto } from './create-lead.dto';
import { DISQUALIFY_REASONS, type DisqualifyReason, NURTURE_REASONS, type NurtureReason } from '../constants';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from '@nestjs/class-validator';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @ApiPropertyOptional({
    enum: NURTURE_REASONS,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(NURTURE_REASONS)
  nurture_reason?: NurtureReason;
  
  @ApiPropertyOptional({
    enum: DISQUALIFY_REASONS,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(DISQUALIFY_REASONS)
  disqualify_reason?: DisqualifyReason;

  @ApiPropertyOptional({ description: 'Include inactive SLA configurations' })
  @IsOptional()
  @IsDateString()
  follow_up_date?: string;
 
  @ApiPropertyOptional({ description: 'Value for reason if narture reason or disqualification reason is Other' })
  @IsOptional()
  @IsString()
  other_value?: string;

  @ApiPropertyOptional({ description: 'Mandatory explanation for a disqualification decision' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  disqualification_note?: string;
}
