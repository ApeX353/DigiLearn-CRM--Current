import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { LEAD_STATUSES } from '../constants';
import type { LeadStatus } from '../constants';

/**
 * Phase A.1 / A.2 — the reversal request entity now covers three
 * workflows. The `kind` field selects which one a given request
 * represents; the validators below stay loose because the service
 * does kind-specific validation (e.g. `requested_status` is only
 * required for status_reversal).
 */
export const LEAD_REVERSAL_REQUEST_KINDS = [
  'status_reversal',
  'reassignment',
  'tactical_disqualify',
] as const;
export type LeadReversalRequestKind =
  (typeof LEAD_REVERSAL_REQUEST_KINDS)[number];

export class CreateLeadReversalRequestDto {
  @ApiPropertyOptional({
    enum: LEAD_REVERSAL_REQUEST_KINDS,
    description:
      'Kind of request. Defaults to status_reversal for backwards compatibility.',
    example: 'tactical_disqualify',
  })
  @IsOptional()
  @IsEnum(LEAD_REVERSAL_REQUEST_KINDS)
  kind?: LeadReversalRequestKind;

  @ApiPropertyOptional({
    enum: LEAD_STATUSES,
    description:
      'Target lead status after reversal. Required for status_reversal kind; ignored for reassignment and tactical_disqualify.',
    example: 'Qualified',
  })
  @IsOptional()
  @IsEnum(LEAD_STATUSES)
  status?: LeadStatus;

  @ApiPropertyOptional({
    description:
      'Target user the lead should be reassigned to. Required for reassignment kind.',
    example: '11111111-2222-3333-4444-555555555555',
  })
  @IsOptional()
  @IsUUID()
  proposed_assignee_id?: string;

  @ApiProperty({
    description: 'Business reason for requesting reversal / reassignment / disqualify',
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
