import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealCloseStatus } from '../entities/deal.entity';

export class CloseDealDto {
  @ApiProperty({ enum: ['won', 'lost'] })
  @IsEnum([DealCloseStatus.WON, DealCloseStatus.LOST])
  close_status: DealCloseStatus.WON | DealCloseStatus.LOST;

  @ApiPropertyOptional({ description: 'Required when closing as lost' })
  @IsOptional()
  @IsString()
  lost_reason?: string;
}
