import {
  IsArray,
  IsUUID,
  ArrayNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for assigning a single permission with optional role-specific conditions
 */
export class PermissionAssignmentDto {
  @ApiProperty({
    example: 'uuid-1',
    description: 'Permission UUID to assign',
  })
  @IsUUID('4')
  permission_id: string;

  @ApiPropertyOptional({
    example: '{"department": "{{user.department}}"}',
    description:
      'Optional JSON string for role-specific conditions. If provided, overrides the default permission conditions. If null, uses default conditions from Permission entity.',
  })
  @IsOptional()
  @IsString()
  conditions?: string;
}

export class AssignPermissionsDto {
  @ApiProperty({
    example: [
      { permission_id: 'uuid-1', conditions: null },
      {
        permission_id: 'uuid-2',
        conditions: '{"department": "{{user.department}}"}',
      },
    ],
    description:
      'Array of permissions to assign with optional role-specific conditions',
    type: [PermissionAssignmentDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PermissionAssignmentDto)
  permissions: PermissionAssignmentDto[];
}

export class UnassignPermissionsDto {
  @ApiProperty({
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
    description: 'Array of permission UUIDs to remove from the role',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  permission_ids: string[];
}
