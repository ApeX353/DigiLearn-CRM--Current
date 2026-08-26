import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { SettingDataType } from '../entities/settings.entity';

/**
 * Validated payload for POST /settings. Was previously a bare interface, so
 * the global ValidationPipe never checked it — any shape could be written,
 * including a missing key or a bogus data_type. Now every write is validated.
 */
export class SetSettingDto {
  @ApiProperty({ description: 'Setting key', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  key: string;

  // Settings hold string | number | boolean | json, so the value itself is
  // free-form — we only require that it is present (not undefined).
  @ApiProperty({ description: 'Setting value (string | number | boolean | object)' })
  @IsDefined()
  value: unknown;

  // SET-DATE-DTO: the allow-list dropped 'date', though the entity's
  // SettingDataType and inferDataType() both produce it — so a legitimate
  // date-typed write (e.g. default_fiscal_year) 400'd. Keep this in lockstep
  // with SETTING_DATA_TYPES in settings.entity.ts.
  @ApiPropertyOptional({ enum: ['string', 'number', 'boolean', 'json', 'date'] })
  @IsOptional()
  @IsIn(['string', 'number', 'boolean', 'json', 'date'])
  data_type?: SettingDataType;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}

export class BulkSetSettingsDto {
  @ApiProperty({ type: [SetSettingDto] })
  @ValidateNested({ each: true })
  @Type(() => SetSettingDto)
  settings: SetSettingDto[];
}
