import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InvoicesService } from '../invoices.service';

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

    try {
      const invoice = await this.invoicesService.findOne(invoiceId);
      if (invoice.owner_id !== user.id) {
        throw new ForbiddenException(
          'You do not have permission to access this invoice',
        );
      }
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      return true;
    }
  }
}
