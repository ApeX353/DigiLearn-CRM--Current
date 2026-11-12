import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Direct manager assignment. `reason` is accepted on every assignment and
 * enforced by LeadsService when the lead already belongs to somebody else.
 * Keeping that rule in the service also protects bulk/API callers.
 */
export class AssignLeadDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  assigned_to: string;

  @ApiPropertyOptional({
    example: 'Territory cover while the current owner is away',
    description: 'Required when changing an existing owner',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason?: string;
}
