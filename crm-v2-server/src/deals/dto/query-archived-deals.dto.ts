import {
  IsOptional,
  IsString,
  IsNumberString,
  IsEnum,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DealCloseStatus } from '../entities/deal.entity';

export class QueryArchivedDealsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ enum: ['won', 'lost'] })
  @IsOptional()
  @IsEnum([DealCloseStatus.WON, DealCloseStatus.LOST])
  close_status?: DealCloseStatus;

  @ApiPropertyOptional({ description: 'Search by deal title or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by pipeline ID' })
  @IsOptional()
  @IsUUID('all')
  pipeline_id?: string;

  @ApiPropertyOptional({ description: 'Filter from this close date' })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ description: 'Filter until this close date' })
  @IsOptional()
  @IsDateString()
  date_to?: string;
}
