import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { join } from 'path';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';

    return {
      type: (this.configService.get<string>('DB_TYPE') || 'postgres') as any,
      host: this.configService.get<string>('DATABASE_HOST'),
      port: this.configService.get<number>('DATABASE_PORT'),
      username: this.configService.get<string>('DATABASE_USERNAME'),
      password: this.configService.get<string>('DATABASE_PASSWORD'),
      database: this.configService.get<string>('DATABASE_NAME'),

      // Auto-load entities from project root (src in dev, dist in prod)
      entities: [join(__dirname, '..', '**/*.entity{.ts,.js}')],

      // Migrations — run automatically at boot in production. The
      // Docker CMD is just `bun dist/main`, so this is the only place
      // a fresh production database gets its schema (baseline
      // 1700000000000-InitialSchema + guarded incrementals). In dev,
      // run them explicitly with `npm run migration:run`.
      migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
      migrationsRun: isProduction || this.getBoolean('DB_RUN_MIGRATIONS', false),

      // Synchronize - ONLY true in development
      synchronize: !isProduction && this.getBoolean('DB_SYNCHRONIZE', true),

      autoLoadEntities: true,

      // Logging
      logging: this.getBoolean('DB_LOGGING', false),

      // Real node-postgres (pg) pool options. The previous config used
      // mysql2 key names (connectionLimit/enableKeepAlive/connectTimeout/…)
      // which pg SILENTLY IGNORES — so TCP keepalive was OFF and behind
      // CapRover/Docker NAT idle connections died unnoticed, throwing on the
      // next query (500s on login, and 503 via validate after the hardening).
      // Applied in dev AND prod (keepAlive was off in both).
      extra: {
        max: 10,
        keepAlive: true, // load-bearing: pg calls socket.setKeepAlive(true)
        keepAliveInitialDelayMillis: 10000, // well below the ~900s NAT idle timeout
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // fail fast on acquisition, don't hang
        allowExitOnIdle: false,
        statement_timeout: 30000,
        query_timeout: 30000,
        maxUses: 7500,
      },

      // Automatic reconnection
      poolSize: 10,
      maxQueryExecutionTime: 30000, // Log slow queries

      // Retry logic
      retryAttempts: 3,
      retryDelay: 3000,
    };
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return value.toLowerCase() === 'true';
  }
}
