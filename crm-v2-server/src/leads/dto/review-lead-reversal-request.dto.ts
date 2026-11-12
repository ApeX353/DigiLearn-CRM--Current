import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export const LEAD_REVERSAL_REVIEW_DECISIONS = [
  'approved',
  'rejected',
] as const;

export type LeadReversalReviewDecision =
  (typeof LEAD_REVERSAL_REVIEW_DECISIONS)[number];

export class ReviewLeadReversalRequestDto {
  @ApiProperty({
    enum: LEAD_REVERSAL_REVIEW_DECISIONS,
    description: 'Review decision for the lead reversal request',
    example: 'approved',
  })
  @IsEnum(LEAD_REVERSAL_REVIEW_DECISIONS)
  decision: LeadReversalReviewDecision;

  @ApiPropertyOptional({
    description: 'Optional review note for approval or rejection',
    maxLength: 2000,
    example: 'Approved after validating supporting documents',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review_note?: string;
}
