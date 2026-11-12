import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsObject,
  MaxLength,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STORAGE_PROVIDERS,
  FILE_ENTITY_TYPES,
  type StorageProvider,
  type FileEntityType,
} from '../constants/providers';

export class CreateFileDto {
  @ApiProperty({ example: 'proposal.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  file_name: string;

  @ApiProperty({ example: 'https://blob.vercel-storage.com/abc123/proposal.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  file_url: string;

  @ApiProperty({ enum: STORAGE_PROVIDERS, example: 'vercel' })
  @IsIn(STORAGE_PROVIDERS)
  provider: StorageProvider;

  @ApiProperty({
    enum: FILE_ENTITY_TYPES,
    example: 'lead',
    description: 'Type of entity this file belongs to',
  })
  @IsIn(FILE_ENTITY_TYPES)
  entity_type: FileEntityType;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'ID of the entity this file belongs to',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  entity_id: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  file_type?: string;

  @ApiPropertyOptional({ example: 102400, description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  file_size?: number;

  @ApiPropertyOptional({
    example: { originalName: 'Quote_v2.pdf', version: 2 },
    description: 'Flexible key-value metadata',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
