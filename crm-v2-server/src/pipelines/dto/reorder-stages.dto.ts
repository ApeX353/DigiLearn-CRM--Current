import { IsArray, ValidateNested, IsUUID, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class StageOrderItem {
  @ApiProperty({ description: 'Stage UUID' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'New order position' })
  @IsInt()
  @Min(0)
  order: number;
}

export class ReorderStagesDto {
  @ApiProperty({
    type: [StageOrderItem],
    description: 'Array of stage IDs with their new order positions',
    example: [
      { id: 'uuid-1', order: 0 },
      { id: 'uuid-2', order: 1 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StageOrderItem)
  stages: StageOrderItem[];
}
