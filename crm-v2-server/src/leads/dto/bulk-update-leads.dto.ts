import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { LEAD_STATUSES, type LeadStatus } from '../constants/lead-statuses';

export const BULK_LEAD_ACTIONS = ['assign', 'status', 'delete'] as const;
export type BulkLeadAction = (typeof BULK_LEAD_ACTIONS)[number];

/**
 * Body for PATCH /leads/bulk-update. Was an untyped literal until 11 Sep
 * 2026, so the global ValidationPipe never ran and an empty body crashed the
 * handler with "leadIds is undefined" (BUG-052). The per-action requirement
 * (assign needs assigneeId, status needs status) was previously a silent
 * no-op — the loop counted nothing and reported "0/N updated" with a 200.
 */
export class BulkUpdateLeadsDto {
  @ApiProperty({ type: [String], description: 'Lead IDs to act on' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  leadIds: string[];

  @ApiProperty({ enum: BULK_LEAD_ACTIONS })
  @IsIn(BULK_LEAD_ACTIONS)
  action: BulkLeadAction;

  @ApiPropertyOptional({ description: 'Required when action = assign' })
  @ValidateIf((o: BulkUpdateLeadsDto) => o.action === 'assign')
  @IsUUID('4', { message: 'assigneeId is required for the assign action' })
  assigneeId?: string;

  @ApiPropertyOptional({ enum: LEAD_STATUSES, description: 'Required when action = status' })
  @ValidateIf((o: BulkUpdateLeadsDto) => o.action === 'status')
  @IsIn(LEAD_STATUSES, { message: 'status is required for the status action' })
  status?: LeadStatus;
}
