import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateFileDto } from './create-file.dto';

export class UpdateFileDto extends PartialType(
  OmitType(CreateFileDto, ['entity_type', 'entity_id'] as const),
) {}
