import {
  IsArray,
  IsNotEmpty,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateNotificationDto } from './create-notification.dto';

export class SendNotificationDto extends CreateNotificationDto {
  @ApiProperty({
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '987fcdeb-51a2-43f1-b456-789012345678',
    ],
    description: 'Array of user IDs to send notification to',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  userIds: string[];
}
