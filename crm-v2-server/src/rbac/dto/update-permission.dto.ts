import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Action } from '../../auth/constants/permissions';

export class UpdatePermissionDto {
  @ApiPropertyOptional({
    example: 'read',
    description:
      'Action name (must be one of: manage, read, create, update, delete, export, import)',
    maxLength: 50,
  })
  @IsOptional()
  @IsEnum(Action, {
    message:
      'Action must be one of: manage, read, create, update, delete, export, import',
  })
  @MaxLength(50)
  action?: Action;

  @ApiPropertyOptional({
    example: 'Lead',
    description: 'Subject/Resource name',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subject?: string;

  @ApiPropertyOptional({
    example: '{"assigned_to":"${id}"}',
    description: 'JSON string for default conditional permission logic',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  conditions?: string | null;

  @ApiPropertyOptional({
    example: 'Allows reading leads assigned to current user',
    description: 'Permission description',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    example: true,
    description:
      'When true, this permission is inverted and becomes a cannot rule',
  })
  @IsOptional()
  @IsBoolean()
  inverted?: boolean;
}
