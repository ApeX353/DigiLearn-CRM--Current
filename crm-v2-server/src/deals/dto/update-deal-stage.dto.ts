import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDealStageDto {
  @ApiProperty({ description: 'Target stage UUID' })
  @IsUUID()
  @IsNotEmpty()
  stage_id: string;

  @ApiPropertyOptional({ description: 'Notes about the stage transition' })
  @IsOptional()
  @IsString()
  notes?: string;
}
