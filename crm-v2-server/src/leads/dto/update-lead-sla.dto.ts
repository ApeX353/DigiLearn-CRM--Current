import { PartialType } from '@nestjs/swagger';
import { CreateLeadSLADto } from './create-lead-sla.dto';

export class UpdateLeadSLADto extends PartialType(CreateLeadSLADto) {}
