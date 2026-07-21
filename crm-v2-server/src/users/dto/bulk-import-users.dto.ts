import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-users.dto';

export class BulkImportUserDto {
  @ApiProperty({
    description: 'Array of staff members to import',
    type: [CreateUserDto],
    example: [
      {
        email: 'john.doe@school.com',
        first_name: 'John',
        last_name: 'Doe',
        role_ids: ['role-uuid-1'],
        password: 'SecurePassword123!',
      },
      {
        email: 'jane.smith@school.com',
        first_name: 'Jane',
        last_name: 'Smith',
        role_ids: ['role-uuid-2'],
        password: 'SecurePassword456!',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one staff member is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateUserDto)
  staff: CreateUserDto[];
}

export interface BulkImportResult {
  total: number;
  successful: number;
  failed: FailedUserImport[];
}

export interface FailedUserImport {
  index: number;
  email: string;
  error: string;
  payload: CreateUserDto;
}
