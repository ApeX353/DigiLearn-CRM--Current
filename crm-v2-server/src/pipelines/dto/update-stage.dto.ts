import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateStageDto } from './create-stage.dto';

export class UpdateStageDto extends PartialType(
  OmitType(CreateStageDto, ['order'] as const),
) {}
