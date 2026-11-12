import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({
    example: 'sales_manager',
    description: 'Updated unique role name',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({
    example: 'Manages sales operations and reporting',
    description: 'Updated role description',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
