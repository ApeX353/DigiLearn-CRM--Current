import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body for DELETE /user-notifications/my-notifications. Until 11 Sep 2026
 * the handler read `@Body('notificationIds')` with no DTO, so an empty body
 * reached the service as `undefined` and TypeORM's `In(undefined)` threw a
 * 500 (BUG-052). Same shape and rules as MarkAsReadDto.
 */
export class DeleteMyNotificationsDto {
  @ApiProperty({
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    description: 'Notification IDs to delete; must belong to the caller',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  notificationIds: string[];
}
