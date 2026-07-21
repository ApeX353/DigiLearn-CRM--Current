import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { LEAD_STATUSES } from '../constants';
import type { LeadStatus } from '../constants';

export class QueryLeadSLADto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({ description: 'Include inactive SLA configurations' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  include_inactive?: boolean;
}
