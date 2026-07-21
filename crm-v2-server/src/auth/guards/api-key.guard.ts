import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard that allows access via X-API-Key header as an alternative to JWT.
 * Used by the MCP server to authenticate with a service account key.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) return true; // Let JWT guard handle it

    const validKey = this.configService.get<string>('CRM_API_KEY');
    if (!validKey) return true; // No API key configured, skip

    if (apiKey === validKey) {
      // Set a system user on the request so downstream code works
      request.user = {
        id: 'system',
        email: 'system@digilearn.com',
        first_name: 'System',
        last_name: 'API',
        roles: [{
          name: 'admin',
          rolePermissions: [{
            is_active: true,
            permission: { action: 'manage', subject: 'all' },
          }],
        }],
        sessionId: 'api-key-session',
      };
      return true;
    }

    return true; // Invalid key, let JWT guard handle it
  }
}
