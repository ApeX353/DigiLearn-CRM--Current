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
    const secret = configService.get<string>('JWT_SECRET_TOKEN');
    if (!secret) {
      // Refuse to boot with a guessable signing key — a missing env var must
      // be a hard failure, never a silent fallback anyone can forge tokens for.
      throw new Error('JWT_SECRET_TOKEN environment variable is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
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
          // AUD-H02: joined onto the query that already runs rather than
          // fetched separately, so enforcing the password-change rule costs
          // no extra round trip per request.
          'account_security',
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
      // AUD-H06: admin_support is an elevated/oversight role (it already
      // satisfies `admin` at the RolesGuard via ROLE_ALIASES and holds
      // manage permissions). Derive it to the effective `admin` role here so
      // the per-record ownership guards that read @CurrentUser('role')
      // (CanAccessLead/Quote/Invoice) treat it as elevated too — previously
      // it fell through to roleNames[0]='admin_support' and was blocked from
      // records it didn't own, i.e. the "shortcut only works at one layer".
      const roleNames = user.roles?.map((r: any) => r.name) ?? [];
      const role =
        roleNames.includes('admin') || roleNames.includes('admin_support')
          ? 'admin'
          : roleNames.includes('sales_manager')
            ? 'sales_manager'
            : (roleNames[0] ?? null);

      // AUD-H02: a user who owes a password change keeps a fully valid
      // session, so the condition has to be re-read per request and enforced
      // server-side (PasswordChangeGuard). It is NOT a JWT claim on purpose:
      // an admin can set the flag on an account that is already signed in,
      // and a claim would stay stale until the token was refreshed.
      //
      // ENFORCES THE EXPLICIT FLAG ONLY, not password expiry, and that is a
      // deliberate limit. Login treats `requires_password_change || expired`
      // as one condition, but they are not the same risk: the flag is set on
      // purpose by an admin or the seeder, whereas expiry is a 90-day timer
      // that rolls over on its own. On production every active account is
      // ALREADY past its expiry (set at registration in late May, elapsed
      // 22 Aug) -- enforcing that here would have locked the whole company
      // out of the entire API in one deploy, with no warning.
      //
      // Expiry stays what it is today: a flag on the login response that the
      // client acts on by routing to /change-password. Making it a hard block
      // is a policy decision that needs its own rollout, not a side effect of
      // closing AUD-H02.
      const accountSecurity = user.account_security;
      const requiresPasswordChange =
        !!accountSecurity?.requires_password_change;

      // Return user object that will be attached to request
      return {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role,
        roles: user.roles,
        sessionId: payload.sessionId,
        requiresPasswordChange,
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
