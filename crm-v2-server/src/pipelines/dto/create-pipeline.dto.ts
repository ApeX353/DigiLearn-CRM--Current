import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePipelineDto {
  @ApiProperty({
    example: 'Sales Pipeline',
    description: 'Name of the pipeline',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this is the default pipeline',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
