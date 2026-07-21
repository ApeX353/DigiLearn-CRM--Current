import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import {
  DEAL_ROLLBACK_REQUEST_STATUSES,
  type DealRollbackRequestStatus,
} from '../entities/deal-rollback-request.entity';

export class QueryDealRollbackRequestsDto {
  @ApiPropertyOptional({
    enum: DEAL_ROLLBACK_REQUEST_STATUSES,
    description: 'Filter rollback requests by status',
  })
  @IsOptional()
  @IsEnum(DEAL_ROLLBACK_REQUEST_STATUSES)
  status?: DealRollbackRequestStatus;

  @ApiPropertyOptional({
    description: 'Filter rollback requests by pipeline',
    example: '3c07f8a4-44f0-4fdd-a7ee-d6d95e64cbb5',
  })
  @IsOptional()
  @IsUUID()
  pipeline_id?: string;
}
