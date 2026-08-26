import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateQuoteDto } from './create-quote.dto';

export class UpdateQuoteDto extends PartialType(
  OmitType(CreateQuoteDto, ['items'] as const),
) {}
