import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsArray,
  IsUUID,
  IsEnum,
  ArrayUnique,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Action } from '../../auth/constants/permissions';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'create',
    description: 'Action name (e.g., create, read, update, delete, manage)',
    maxLength: 50,
  })
  @IsEnum(Action, {
    message:
      'Action must be one of: manage, read, create, update, delete, export, import',
  })
  @IsNotEmpty()
  @MaxLength(50)
  action: Action;

  @ApiProperty({
    example: 'User',
    description: 'Subject/Resource name (e.g., User, Role, Student, all)',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  subject: string;

  @ApiProperty({
    required: false,
    example: '{"field": "ownerId"}',
    description: 'JSON string for conditional permissions',
  })
  @IsOptional()
  @IsString()
  conditions?: string;

  @ApiProperty({
    required: false,
    example: 'Allows creating new users',
    description: 'Description of the permission',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: [
      '6cbfdf6f-815f-4af6-996b-1f5895f35ef4',
      'a138a895-fb3c-11f0-a8d1-a44cc812fb15',
    ],
    description:
      'Optional role IDs to auto-assign this permission to immediately after creation',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  default_role_ids?: string[];

  @ApiProperty({
    required: false,
    example: false,
    description:
      'Whether this permission is inverted (cannot rule) instead of allow (can rule)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  inverted?: boolean;
}
