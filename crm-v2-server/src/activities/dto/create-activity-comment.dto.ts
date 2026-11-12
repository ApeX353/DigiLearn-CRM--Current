import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateActivityCommentDto {
  @ApiProperty({
    description: 'Comment body',
    maxLength: 2000,
    example: 'Need to follow up with finance team before Friday.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment: string;
}
