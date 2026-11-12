import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { LeadsService } from '../leads.service';

/**
 * Guard to enforce lead-level authorization
 * - Admins and sales managers can access all leads
 * - Sales reps can only access leads assigned to them
 */
@Injectable()
export class CanAccessLeadGuard implements CanActivate {
  constructor(private readonly leadsService: LeadsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Extract leadId from params or body
    const leadId = request.params.leadId || request.body?.lead_id;

    if (!leadId) {
      // No lead context - allow (will be handled by other guards/validation)
      return true;
    }

    // Admin and sales_manager can access all leads
    if (user.role === 'admin' || user.role === 'sales_manager') {
      return true;
    }

    // Sales rep can only access assigned leads
    try {
      const lead = await this.leadsService.findOne(leadId);

      if (lead.assigned_to !== user.id) {
        throw new ForbiddenException(
          'You do not have permission to access this lead',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // If lead not found, let the controller handle it
      return true;
    }
  }
}
