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

    // Extract the lead id from params or body. Lead routes are declared
    // as `:id`; only the side routes use `:leadId`. Reading `leadId` alone
    // made this guard a no-op on every main lead route (RISK-005,
    // CRM_AUDIT_MASTER.md). Apply it only to routes whose `:id` IS a lead.
    const leadId =
      request.params.leadId || request.params.id || request.body?.lead_id;

    if (!leadId) {
      // No lead context - allow (will be handled by other guards/validation)
      return true;
    }

    // Admin and sales_manager can access all leads
    if (user.role === 'admin' || user.role === 'sales_manager') {
      return true;
    }

    // Sales rep can only access assigned leads. Fail closed: a missing
    // lead is a 404 and a lookup failure is a 500, never a silent grant
    // (the previous catch returned true on anything but a refusal).
    const lead = await this.leadsService.findOne(leadId);

    if (lead.assigned_to !== user.id) {
      throw new ForbiddenException(
        'You do not have permission to access this lead',
      );
    }

    return true;
  }
}
