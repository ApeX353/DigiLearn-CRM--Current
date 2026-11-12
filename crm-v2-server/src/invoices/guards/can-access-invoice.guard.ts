import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InvoicesService } from '../invoices.service';
import { InvoiceErrorCode } from '../invoice-money-rules';

@Injectable()
export class CanAccessInvoiceGuard implements CanActivate {
  constructor(private readonly invoicesService: InvoicesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const invoiceId = request.params.id || request.params.invoiceId;

    if (!invoiceId) {
      return true;
    }

    if (user.role === 'admin' || user.role === 'sales_manager') {
      return true;
    }

    // Fail closed. Until 11 Sep 2026 any error other than a refusal —
    // a missing invoice, a database timeout — was swallowed and the request
    // let through to the handler (RISK-009, CRM_AUDIT_MASTER.md). A
    // lookup failure now surfaces as itself: NotFound stays a 404, and
    // anything else is a 500 rather than a silent grant.
    const invoice = await this.invoicesService.findOne(invoiceId);
    if (invoice.owner_id !== user.id) {
      throw new ForbiddenException({
        code: InvoiceErrorCode.UPDATE_FORBIDDEN,
        message: 'You do not have permission to access this invoice',
      });
    }
    return true;
  }
}
