import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SettingsController } from './../src/settings/settings.controller';
import { SettingsService } from './../src/settings/settings.service';
import { JwtAuthGuard } from './../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from './../src/auth/guards/roles.guard';
import { IS_PUBLIC_KEY } from './../src/auth/decorators/public.decorator';
import { ROLES_KEY } from './../src/auth/decorators/roles.decorator';
import { SKIP_ROLES_CHECK_KEY } from './../src/auth/decorators/skip-roles-check.decorator';

class TestJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;
    if (!authHeader) {
      throw new UnauthorizedException();
    }

    request.user = {
      id: 'admin-1',
      email: 'admin@example.com',
      roles: authHeader.includes('admin') ? ['admin'] : ['sales_rep'],
    };
    return true;
  }
}

class TestRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skipRoles = this.reflector.getAllAndOverride<boolean>(
      SKIP_ROLES_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipRoles) return true;

    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userRoles = request.user?.roles ?? [];
    if (requiredRoles.some((role) => userRoles.includes(role))) {
      return true;
    }

    throw new ForbiddenException();
  }
}

describe('Settings API auth smoke (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const reflector = new Reflector();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({}),
            getAllSettings: jest.fn().mockResolvedValue([]),
            getPublicSettings: jest.fn().mockResolvedValue({ app_name: 'CRM' }),
            getSettingsByCategory: jest.fn().mockResolvedValue([]),
            getSetting: jest.fn().mockResolvedValue(null),
            setSetting: jest.fn(),
            setSettings: jest.fn(),
            deleteSetting: jest.fn(),
            hardDeleteSetting: jest.fn(),
            restoreSetting: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestJwtGuard(reflector))
      .overrideGuard(RolesGuard)
      .useValue(new TestRolesGuard(reflector))
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v2');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('blocks unauthenticated access to admin settings', async () => {
    await request(app.getHttpServer()).get('/api/v2/settings').expect(401);
    await request(app.getHttpServer()).get('/api/v2/settings/all').expect(401);
  });

  it('allows public settings without authentication only on the public endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/v2/settings/public')
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
        expect(body.data).toEqual({ app_name: 'CRM' });
      });
  });

  it('requires admin role for admin settings', async () => {
    await request(app.getHttpServer())
      .get('/api/v2/settings')
      .set('Authorization', 'Bearer rep')
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v2/settings')
      .set('Authorization', 'Bearer admin')
      .expect(200);
  });
});
