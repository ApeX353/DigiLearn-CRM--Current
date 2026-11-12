import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsArray, IsUUID, IsString } from 'class-validator';
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

  /**
   * AUTO2: provinces this rep covers, used by the auto-assign engine's
   * location-first routing. Stored as JSON text on the user row.
   */
  @ApiPropertyOptional({
    example: ['Bulawayo', 'Matabeleland South'],
    description: 'Provinces this rep covers for auto-assign routing',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  territory_provinces?: string[];
}
