import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsDateString,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CampaignType } from '../entities/campaign.entity';

export class CreateCampaignDto {
  @ApiProperty({ example: 'NASH Congress 2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: CampaignType, example: CampaignType.CONFERENCE })
  @IsEnum(CampaignType)
  type: CampaignType;

  @ApiPropertyOptional({
    example: '2026-08-04',
    description: 'R6: date the campaign was entered into the CRM (defaults to today).',
  })
  @IsOptional()
  @IsDateString()
  entry_date?: string;

  @ApiProperty({ example: '2026-08-10' })
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional({ example: '2026-08-14' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ enum: ['USD', 'ZWG'], default: 'USD' })
  @IsOptional()
  @IsIn(['USD', 'ZWG'])
  currency?: string;
}

/** All fields optional — edit a campaign's name/type/dates/currency. */
export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
