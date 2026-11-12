import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications';
import { CommonModule } from '../common/common.module';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CaslAbilityFactory } from './casl/casl-ability.factory';
import { AbilityScopeService } from './casl/ability-scope.service';
import { RolesGuard } from './guards/roles.guard';
import { User } from '../users/entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { AccountSecurity } from './entities/account-security.entity';
import { AuthSession } from './entities/auth-session.entity';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: (() => {
          const secret = configService.get<string>('JWT_SECRET_TOKEN');
          if (!secret) {
            throw new Error('JWT_SECRET_TOKEN environment variable is required');
          }
          return secret;
        })(),
        signOptions: {
          expiresIn: `${configService.get('JWT_EXPIRATION') || 7}d`,
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      AccountSecurity,
      AuthSession,
    ]),
    NotificationsModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        email: {
          defaultFrom: configService.get('EMAIL_FROM') || 'noreply@digilearn.com',
          smtp: configService.get('SMTP_HOST') ? {
            host: configService.get('SMTP_HOST') || '',
            port: parseInt(configService.get('SMTP_PORT') || '587'),
            secure: configService.get('SMTP_SECURE') === 'true',
            auth: {
              user: configService.get('SMTP_USER') || '',
              pass: configService.get('SMTP_PASS') || '',
            },
          } : undefined,
          sendgrid: configService.get('SENDGRID_API_KEY') ? {
            apiKey: configService.get('SENDGRID_API_KEY') || '',
            from: configService.get('EMAIL_FROM') || 'noreply@digilearn.com',
          } : undefined,
        },
        sms: {
          defaultFrom: configService.get('TWILIO_PHONE_NUMBER') || '',
          twilio: configService.get('TWILIO_ACCOUNT_SID') ? {
            accountSid: configService.get('TWILIO_ACCOUNT_SID') || '',
            authToken: configService.get('TWILIO_AUTH_TOKEN') || '',
            from: configService.get('TWILIO_PHONE_NUMBER') || '',
          } : undefined,
          awsSns: configService.get('AWS_SNS_REGION') ? {
            region: configService.get('AWS_SNS_REGION') || '',
            accessKeyId: configService.get('AWS_ACCESS_KEY_ID') || '',
            secretAccessKey: configService.get('AWS_SECRET_ACCESS_KEY') || '',
          } : undefined,
        },
        templates: {
          cache: true,
        },
      }),
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  controllers: [
    AuthController
  ],
  providers: [
    AuthService,
    TwoFactorService,
    {
      provide: 'TWO_FACTOR_SETUP',
      useFactory: (authService: AuthService, twoFactorService: TwoFactorService) => {
        authService.setTwoFactorService(twoFactorService);
        return true;
      },
      inject: [AuthService, TwoFactorService],
    },
    JwtStrategy,
    CaslAbilityFactory,
    AbilityScopeService,
    RolesGuard,
  ],
  exports: [
    AuthService,
    TwoFactorService,
    CaslAbilityFactory,
    AbilityScopeService,
    RolesGuard,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
