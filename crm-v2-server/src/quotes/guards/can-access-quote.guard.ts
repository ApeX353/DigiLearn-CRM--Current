import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { QuotesService } from '../quotes.service';

@Injectable()
export class CanAccessQuoteGuard implements CanActivate {
  constructor(private readonly quotesService: QuotesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const quoteId = request.params.id || request.params.quoteId;

    if (!quoteId) {
      return true;
    }

    if (user.role === 'admin' || user.role === 'sales_manager') {
      return true;
    }

    try {
      const quote = await this.quotesService.findOne(quoteId);
      if (quote.owner_id !== user.id) {
        throw new ForbiddenException(
          'You do not have permission to access this quote',
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
