import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export const DEAL_ROLLBACK_REVIEW_DECISIONS = ['approved', 'rejected'] as const;

export type DealRollbackReviewDecision =
  (typeof DEAL_ROLLBACK_REVIEW_DECISIONS)[number];

export class ReviewDealRollbackRequestDto {
  @ApiProperty({
    enum: DEAL_ROLLBACK_REVIEW_DECISIONS,
    description: 'Review decision for the rollback request',
  })
  @IsEnum(DEAL_ROLLBACK_REVIEW_DECISIONS)
  decision: DealRollbackReviewDecision;

  @ApiPropertyOptional({
    description: 'Optional note recorded with the review decision',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review_note?: string;
}
