import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class QueryEventsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ enum: ['error', 'warn', 'info'] })
  @IsOptional()
  @IsIn(['error', 'warn', 'info'])
  level?: string;

  @ApiPropertyOptional({ description: 'http_5xx, http_403, validation, db_constraint, ws_error, unhandled_rejection, uncaught_exception, logged_error, job_failure, delivery_failure, custom' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  kind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  request_id?: string;

  @ApiPropertyOptional({ description: 'Substring of the request path' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;

  @ApiPropertyOptional({ description: 'Substring of the message or reference' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'ISO 8601' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO 8601' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
