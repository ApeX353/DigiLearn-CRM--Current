import { PartialType } from '@nestjs/swagger';
import { CreatePaymentTermDto } from './create-payment-term.dto';

export class UpdatePaymentTermDto extends PartialType(CreatePaymentTermDto) {}
