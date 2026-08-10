import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CreateActivityDto,
  CreateCallDetailsDto,
  CreateDemoDetailsDto,
  CreateEmailDetailsDto,
  CreateMeetingDetailsDto,
  CreateNoteDetailsDto,
  CreateTaskDetailsDto,
  CreateWhatsAppDetailsDto,
} from './create-activity.dto';

/**
 * `PartialType(CreateActivityDto)` only loosens the TOP-LEVEL fields — the
 * nested detail DTOs kept their required members, so a single-field patch
 * like `{ call: { summary } }` failed validation with a 400. The document
 * view saves one field at a time, so the detail objects must be partial
 * too. The service's update() Object.assigns each detail onto the loaded
 * row, so partial objects merge correctly.
 */
export class UpdateTaskDetailsDto extends PartialType(CreateTaskDetailsDto) {}
export class UpdateNoteDetailsDto extends PartialType(CreateNoteDetailsDto) {}
export class UpdateCallDetailsDto extends PartialType(CreateCallDetailsDto) {}
export class UpdateEmailDetailsDto extends PartialType(CreateEmailDetailsDto) {}
export class UpdateMeetingDetailsDto extends PartialType(
  CreateMeetingDetailsDto,
) {}
export class UpdateWhatsAppDetailsDto extends PartialType(
  CreateWhatsAppDetailsDto,
) {}
export class UpdateDemoDetailsDto extends PartialType(CreateDemoDetailsDto) {}

export class UpdateActivityDto extends PartialType(
  OmitType(CreateActivityDto, [
    'task',
    'note',
    'call',
    'email',
    'meeting',
    'whatsapp',
    'demo',
  ] as const),
) {
  @ApiPropertyOptional({ type: UpdateTaskDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateTaskDetailsDto)
  task?: UpdateTaskDetailsDto;

  @ApiPropertyOptional({ type: UpdateNoteDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateNoteDetailsDto)
  note?: UpdateNoteDetailsDto;

  @ApiPropertyOptional({ type: UpdateCallDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateCallDetailsDto)
  call?: UpdateCallDetailsDto;

  @ApiPropertyOptional({ type: UpdateEmailDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateEmailDetailsDto)
  email?: UpdateEmailDetailsDto;

  @ApiPropertyOptional({ type: UpdateMeetingDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateMeetingDetailsDto)
  meeting?: UpdateMeetingDetailsDto;

  @ApiPropertyOptional({ type: UpdateWhatsAppDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateWhatsAppDetailsDto)
  whatsapp?: UpdateWhatsAppDetailsDto;

  @ApiPropertyOptional({ type: UpdateDemoDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateDemoDetailsDto)
  demo?: UpdateDemoDetailsDto;
}
