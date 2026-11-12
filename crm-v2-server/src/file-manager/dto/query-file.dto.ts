import { IsOptional, IsString, IsUUID, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  STORAGE_PROVIDERS,
  FILE_ENTITY_TYPES,
  type StorageProvider,
  type FileEntityType,
} from '../constants/providers';

export class QueryFileDto {
  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ default: '10' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ enum: FILE_ENTITY_TYPES })
  @IsOptional()
  @IsIn(FILE_ENTITY_TYPES)
  entity_type?: FileEntityType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entity_id?: string;

  @ApiPropertyOptional({ enum: STORAGE_PROVIDERS })
  @IsOptional()
  @IsIn(STORAGE_PROVIDERS)
  provider?: StorageProvider;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  file_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  uploaded_by?: string;

  @ApiPropertyOptional({ description: 'Search in file name' })
  @IsOptional()
  @IsString()
  search?: string;
}
