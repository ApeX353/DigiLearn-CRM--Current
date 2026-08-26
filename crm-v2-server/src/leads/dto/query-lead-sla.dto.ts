import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
 import { toBool } from '../../common/transformers/to-bool';
import { LEAD_STATUSES } from '../constants';
import type { LeadStatus } from '../constants';

export class QueryLeadSLADto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({ description: 'Include inactive SLA configurations' })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  include_inactive?: boolean;
}
