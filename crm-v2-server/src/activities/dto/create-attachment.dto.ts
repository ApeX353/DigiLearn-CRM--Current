import {
  IsString,
  IsUUID,
  IsOptional,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttachmentDto {
  @ApiProperty()
  @IsUUID()
  activity_id: string;

  @ApiProperty({ example: 'document.pdf' })
  @IsString()
  @MaxLength(255)
  file_name: string;

  @ApiProperty({ example: 'https://blob.vercel-storage.com/...' })
  @IsString()
  @MaxLength(500)
  file_url: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  file_size?: number;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mime_type?: string;
}
