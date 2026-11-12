import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsEnum,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LEAD_STATUSES } from '../constants';
import type { LeadStatus } from '../constants';

export class CreateLeadSLADto {
  @ApiProperty({ enum: LEAD_STATUSES, example: 'New' })
  @IsEnum(LEAD_STATUSES)
  @IsNotEmpty()
  status: LeadStatus;

  @ApiProperty({ example: 24, description: 'SLA time limit in hours' })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  sla_hours: number;

  @ApiProperty({
    example: 48,
    description: 'Hours after which to escalate if no action',
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  escalation_after_hours: number;

  @ApiProperty({
    example: 12,
    description: 'Hours of inactivity before sending alert',
  })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  idle_alert_hours: number;

  @ApiPropertyOptional({
    example: 'New leads must be contacted within 24 hours',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example:
      'Lead {lead_name} has not been contacted. SLA breach imminent. Please take action.',
  })
  @IsOptional()
  @IsString()
  message?: string;
}
