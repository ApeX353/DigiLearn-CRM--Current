import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDealRollbackRequestDto {
  @ApiProperty({
    description: 'Earlier stage to move the deal back to once approved',
    example: '84c1124f-0c1a-4eb8-87fb-0d7a2a8c8e2f',
  })
  @IsUUID()
  to_stage_id: string;

  @ApiProperty({
    description: 'Business reason for requesting the rollback',
    example: 'The client asked us to revisit qualification before we continue.',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
