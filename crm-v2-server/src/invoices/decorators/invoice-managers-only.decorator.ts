import { applyDecorators, UseGuards } from '@nestjs/common';
import { ForbiddenRefusal } from '../../auth/decorators/forbidden-refusal.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CanAccessInvoiceGuard } from '../guards/can-access-invoice.guard';
import { InvoiceErrorCode } from '../invoice-money-rules';

/**
 * Changing an existing invoice is a manager's decision (EBI-FOCUS-001 Fix 2). One
 * declaration for every such route, so a new route copies a single line rather than
 * a role list. Reps keep creating invoices and recording receipts; those are not
 * edits to an invoice, and their routes do not use this.
 */
export const InvoiceManagersOnly = () =>
  applyDecorators(
    Roles('admin', 'sales_manager'),
    ForbiddenRefusal(
      InvoiceErrorCode.UPDATE_FORBIDDEN,
      'Only a manager can change an invoice.',
    ),
    UseGuards(CanAccessInvoiceGuard),
  );
