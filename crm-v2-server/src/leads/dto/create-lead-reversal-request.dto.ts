import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { LEAD_STATUSES } from '../constants';
import type { LeadStatus } from '../constants';

export class CreateLeadReversalRequestDto {
  @ApiProperty({
    enum: LEAD_STATUSES,
    description:
      'Target lead status after reversal. Must be a valid lead status other than Converted.',
    example: 'Qualified',
  })
  @IsEnum(LEAD_STATUSES)
  status: LeadStatus;

  @ApiProperty({
    description: 'Business reason for requesting lead reversal',
    example: 'Client requested rollback due to procurement delay',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({
    description: 'Additional notes for reviewers',
    example: 'Awaiting final confirmation from decision maker',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
