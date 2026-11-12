import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';

/**
 * Who may read the diagnostics surface. admin_support always; admin (the
 * product owner) only once the setting `diagnostics.visible_to_admin` is
 * true. The owner asked for the layer to be shown to him later, after
 * support has lived with it; flipping the setting does that without a deploy.
 * Runs after RolesGuard, which already limited the routes to those two roles.
 */
@Injectable()
export class DiagnosticsVisibilityGuard implements CanActivate {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: { roles?: Array<{ name?: string } | string> } }>();
    const roles = (req.user?.roles ?? []).map((r) => (typeof r === 'string' ? r : (r.name ?? '')));
    if (roles.includes('admin_support')) return true;
    if (roles.includes('admin') && (await this.diagnostics.getFlag('diagnostics.visible_to_admin', false))) return true;
    throw new ForbiddenException('System Health is not switched on for your account yet.');
  }
}
