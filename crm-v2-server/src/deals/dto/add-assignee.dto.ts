import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddAssigneeDto {
  @ApiProperty({ description: 'User UUID to assign to the deal' })
  @IsUUID()
  @IsNotEmpty()
  user_id: string;
}
