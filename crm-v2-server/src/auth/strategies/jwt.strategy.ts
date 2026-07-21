import { Injectable, UnauthorizedException } from '@nestjs/common';
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

    // Update session activity
    session.last_activity_at = new Date();
    await this.authSessionRepository.save(session);

    // Return user object that will be attached to request
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      roles: user.roles,
      sessionId: payload.sessionId,
    };
  }
}
