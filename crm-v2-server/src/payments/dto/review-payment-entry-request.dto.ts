import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewPaymentEntryRequestDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review_note?: string;
}
