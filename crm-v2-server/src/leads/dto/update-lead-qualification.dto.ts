import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLeadQualificationDto } from './create-lead-qualification.dto';

export class UpdateLeadQualificationDto extends PartialType(
  OmitType(CreateLeadQualificationDto, ['lead_id'] as const),
) {}
