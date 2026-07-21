import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(AuthSession)
    private authSessionRepository: Repository<AuthSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET_TOKEN') ||
        'your-secret-key-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    try {
      // Verify session is still active
      const session = await this.authSessionRepository.findOne({
        where: { id: payload.sessionId, is_active: true },
      });

      if (!session) {
        throw new UnauthorizedException('Session expired or revoked');
      }

      // Get user with roles and permissions
      const user = await this.usersRepository.findOne({
        where: { id: payload.sub },
        relations: [
          'roles',
          'roles.rolePermissions',
          'roles.rolePermissions.permission',
        ],
      });

      if (!user || !user.is_active) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Targeted, guarded activity bump. The old full-entity save() could
      // RESURRECT a session that a concurrent enforceActiveSessionLimit had
      // just revoked (it re-wrote the stale in-memory is_active=true), and it
      // churned last_activity_at on every request. The WHERE is_active=true
      // guard means a revoked session is never revived.
      await this.authSessionRepository.update(
        { id: payload.sessionId, is_active: true },
        { last_activity_at: new Date() },
      );

      // Derive a single representative role for owner-scope checks that read
      // @CurrentUser('role'): the auth model is multi-role (user.roles[]), and
      // without this `role` was undefined, so admins/sales_managers never got
      // their owner-scope bypass and could not see invoices/quotes they didn't own.
      const roleNames = user.roles?.map((r: any) => r.name) ?? [];
      const role = roleNames.includes('admin')
        ? 'admin'
        : roleNames.includes('sales_manager')
          ? 'sales_manager'
          : (roleNames[0] ?? null);

      // Return user object that will be attached to request
      return {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role,
        roles: user.roles,
        sessionId: payload.sessionId,
      };
    } catch (err) {
      // Genuine auth failures stay 401. A transient DB/connection error must
      // NOT masquerade as a logout — surface it as a retryable 503 instead of
      // a raw 500 on every protected endpoint.
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    }
  }
}
