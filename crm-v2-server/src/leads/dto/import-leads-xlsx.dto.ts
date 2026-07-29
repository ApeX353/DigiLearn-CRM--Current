import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * The manager's Excel workbook, sent as a base64 string (optionally a
 * data: URL) so no file-upload middleware or client-side spreadsheet
 * library is needed — the server decodes and parses it with exceljs.
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
}
