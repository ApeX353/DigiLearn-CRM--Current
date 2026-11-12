import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const CLIENT_EVENT_KINDS = ['js_error', 'unhandled_rejection', 'render_error', 'failed_request', 'console_error'] as const;

export class ClientEventDto {
  @ApiProperty({ enum: CLIENT_EVENT_KINDS })
  @IsIn(CLIENT_EVENT_KINDS as readonly string[])
  kind: (typeof CLIENT_EVENT_KINDS)[number];

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  stack?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appCommit?: string;

  @ApiPropertyOptional({ description: 'The ERR- reference the API answered with' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  apiReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  statusCode?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'ISO 8601, when it happened in the browser' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}

export class ClientEventsBatchDto {
  @ApiProperty({ type: [ClientEventDto], maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClientEventDto)
  events: ClientEventDto[];
}
