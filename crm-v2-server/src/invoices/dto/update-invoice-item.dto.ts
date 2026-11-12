import { PartialType } from '@nestjs/swagger';
import { CreateInvoiceItemDto } from './create-invoice.dto';

export class UpdateInvoiceItemDto extends PartialType(CreateInvoiceItemDto) {}
