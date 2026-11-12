import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsUUID,
  IsArray,
  ValidateNested,
  IsIn,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * The manager's Excel workbook, sent as a base64 string (optionally a
 * data: URL) so no file-upload middleware or client-side spreadsheet
 * library is needed — the server decodes and parses it with exceljs. The
 * import is STAGED for approval, not applied directly.
 */
export class ImportLeadsXlsxDto {
  @ApiProperty({ description: 'Base64-encoded .xlsx (may be a data: URL)' })
  @IsString()
  @IsNotEmpty()
  file_base64: string;

  @ApiPropertyOptional({ description: 'Original file name, for the log' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;

  @ApiPropertyOptional({
    description: 'Campaign this import belongs to; leads get attributed to it',
  })
  @IsOptional()
  @IsUUID()
  campaign_id?: string;
}

class RowDecisionDto {
  @ApiProperty()
  @IsInt()
  rowNumber: number;

  @ApiProperty({ enum: ['approve', 'skip'] })
  @IsIn(['approve', 'skip'])
  decision: 'approve' | 'skip';
}

/** Per-row approve/skip overrides applied before approving a batch. */
export class UpdateImportDecisionsDto {
  @ApiProperty({ type: [RowDecisionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RowDecisionDto)
  decisions: RowDecisionDto[];
}

/**
 * R3: the manager's urban/rural choice for a peri-urban (region-unmapped)
 * staged row. The system's school region enum is urban|rural only, so a
 * "PERI URBAN" source row can't be admitted until it's classified.
 */
export class SetImportRowRegionDto {
  @ApiProperty({ enum: ['urban', 'rural'] })
  @IsIn(['urban', 'rural'])
  region: 'urban' | 'rural';
}
