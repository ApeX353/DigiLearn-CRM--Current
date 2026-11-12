import { PartialType } from '@nestjs/swagger';
import { CreateQuoteItemDto } from './create-quote.dto';

export class UpdateQuoteItemDto extends PartialType(CreateQuoteItemDto) {}
