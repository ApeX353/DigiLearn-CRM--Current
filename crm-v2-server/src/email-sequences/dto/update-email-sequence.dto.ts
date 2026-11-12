import { PartialType } from '@nestjs/swagger';
import { CreateEmailSequenceDto } from './create-email-sequence.dto';

export class UpdateEmailSequenceDto extends PartialType(CreateEmailSequenceDto) {}
