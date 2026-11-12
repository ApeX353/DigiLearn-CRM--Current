import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateInvoiceDto } from './create-invoice.dto';

export class UpdateInvoiceDto extends PartialType(
  // Editing an invoice never reschedules it: lines go through the item routes
  // and the instalment dates belong to the applied term.
  OmitType(CreateInvoiceDto, ['items', 'installment_due_dates'] as const),
) {}
