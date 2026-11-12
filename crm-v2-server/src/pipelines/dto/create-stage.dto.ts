import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStageDto {
  @ApiProperty({
    example: 'Qualified Lead',
    description: 'Name of the stage',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 1,
    description: 'Order/position of the stage in the pipeline',
  })
  @IsInt()
  @Min(0)
  order: number;

  @ApiPropertyOptional({
    example: 7,
    description: 'SLA in days for this stage',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sla_days?: number;

  @ApiPropertyOptional({
    example: 25.5,
    description: 'Win probability percentage (0-100)',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  probability?: number;

  @ApiPropertyOptional({
    example: '#6366f1',
    description: 'Hex color code for the stage',
    default: '#6366f1',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid hex color code (e.g., #6366f1)',
  })
  color?: string;

  @ApiPropertyOptional({
    example: 'Leads that have been qualified and are ready for proposal',
    description: 'Description of the stage',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
