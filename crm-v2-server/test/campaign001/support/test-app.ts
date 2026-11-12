/**
 * Campaign 001 — test application builder.
 *
 * Builds a Nest application from the REAL feature modules, the REAL global
 * guard chain in production order (throttler → API key → JWT → roles →
 * password-change), the real JwtStrategy against real auth_sessions rows,
 * and the real CASL factory. It does NOT import AppModule, DatabaseModule
 * (auto-migrate / auto-seed), ScheduleModule.forRoot() (cron jobs) or the
 * WebSocket gateway module; outbound notification delivery is replaced by a
 * recording stub.
 */
import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AuthModule } from '../../../src/auth/auth.module';
import { ApiKeyGuard } from '../../../src/auth/guards/api-key.guard';
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { PasswordChangeGuard } from '../../../src/auth/guards/password-change.guard';
import { RolesGuard } from '../../../src/auth/guards/roles.guard';
import { CommonModule } from '../../../src/common/common.module';
import { ThrottlerBehindProxyGuard } from '../../../src/common/guards/throttler-behind-proxy.guard';
import { DiagnosticsModule } from '../../../src/diagnostics/diagnostics.module';
import { NotificationsGateway } from '../../../src/notifications/notifications.gateway';
import { DisposableDatabase, SRC_DIR } from './disposable-db';
import { assertNoInheritedAppEnv } from './env-guard';
import { buildTestConfig, TestConfig } from './test-config';

/** Records what the application tried to push over WebSockets; delivers nothing. */
export class RecordingGatewayStub {
  public readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args });
  }
  emitToUser(...args: unknown[]) { this.record('emitToUser', args); }
  emitToUsers(...args: unknown[]) { this.record('emitToUsers', args); }
  emitToRole(...args: unknown[]) { this.record('emitToRole', args); }
  emitToAll(...args: unknown[]) { this.record('emitToAll', args); }
  broadcast(...args: unknown[]) { this.record('broadcast', args); }
  notifyUser(...args: unknown[]) { this.record('notifyUser', args); }
  sendToUser(...args: unknown[]) { this.record('sendToUser', args); }
  isUserConnected() { return false; }
}

export const gatewayStub = new RecordingGatewayStub();

/**
 * A bare SchedulerRegistry so modules that import `ScheduleModule` (without
 * forRoot) resolve. ScheduleModule.forRoot() is deliberately NOT imported:
 * that is what discovers @Cron handlers and starts them. With only the
 * registry present no job is ever registered, which tests assert.
 */
export const schedulerRegistry = new SchedulerRegistry();

@Global()
@Module({
  providers: [
    { provide: NotificationsGateway, useValue: gatewayStub },
    { provide: SchedulerRegistry, useValue: schedulerRegistry },
  ],
  exports: [NotificationsGateway, SchedulerRegistry],
})
export class StubNotificationsGatewayModule {}

export interface TestApp {
  app: INestApplication;
  http: any;
  dataSource: DataSource;
  jwt: JwtService;
  config: TestConfig;
  close(): Promise<void>;
}

export async function createTestApp(
  db: DisposableDatabase,
  featureModules: any[],
): Promise<TestApp> {
  assertNoInheritedAppEnv();
  const config = buildTestConfig();

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => config as unknown as Record<string, unknown>],
      }),
      TypeOrmModule.forRoot({
        ...db.connectionOptions(),
        entities: [join(SRC_DIR, '**', '*.entity{.ts,.js}')],
        autoLoadEntities: true,
        retryAttempts: 1,
        retryDelay: 500,
      }),
      // Same throttler module the app uses, with a limit the suite cannot hit.
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100_000 }]),
      StubNotificationsGatewayModule,
      DiagnosticsModule,
      CommonModule,
      AuthModule,
      ...featureModules,
    ],
    providers: [
      // Identical order to src/app.module.ts on 5b9c72ce.
      { provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard },
      { provide: APP_GUARD, useClass: ApiKeyGuard },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: PasswordChangeGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v2');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  return {
    app,
    http: app.getHttpServer(),
    dataSource: app.get(DataSource),
    jwt: app.get(JwtService),
    config,
    close: async () => {
      await app.close();
    },
  };
}
