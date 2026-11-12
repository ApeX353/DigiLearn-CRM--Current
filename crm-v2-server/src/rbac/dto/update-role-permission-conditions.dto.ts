import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRolePermissionConditionsDto {
  @ApiPropertyOptional({
    example: '{"department": "{{user.department}}", "status": "active"}',
    description:
      'JSON string for role-specific conditions. Set to null to use default permission conditions. Set to empty string to remove all conditions.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  conditions?: string | null;
}
