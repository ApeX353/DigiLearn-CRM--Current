import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsArray, IsUUID } from 'class-validator';
import { CreateUserDto } from './create-users.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['email', 'password', 'role_ids'] as const),
) {
  @ApiPropertyOptional({
    example: ['role-uuid-1', 'role-uuid-2'],
    description: 'Array of role UUIDs to assign to the staff member',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  role_ids?: string[];
}
