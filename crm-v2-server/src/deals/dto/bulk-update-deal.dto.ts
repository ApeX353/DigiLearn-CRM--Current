import {
  IsArray,
  ValidateNested,
  IsUUID,
  IsOptional,
  IsNumber,
  Min,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class BulkDealUpdateItem {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ description: 'New stage ID — triggers stage history recording' })
  @IsOptional()
  @IsUUID()
  stage_id?: string;

  @ApiPropertyOptional({
    description: 'New stage name (status) - resolves within the deal pipeline',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class BulkUpdateDealDto {
  @ApiProperty({ type: [BulkDealUpdateItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkDealUpdateItem)
  deals: BulkDealUpdateItem[];
}
