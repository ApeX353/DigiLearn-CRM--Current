import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { join } from 'path';

@Injectable()
export class DatabaseConfigService implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'mysql',
      host: this.configService.get<string>('DATABASE_HOST'),
      port: this.configService.get<number>('DATABASE_PORT'),
      username: this.configService.get<string>('DATABASE_USERNAME'),
      password: this.configService.get<string>('DATABASE_PASSWORD'),
      database: this.configService.get<string>('DATABASE_NAME'),

      // Auto-load entities from project root (src in dev, dist in prod)
      entities: [join(__dirname, '..', '**/*.entity{.ts,.js}')],

      // // Migrations
      // migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
      // migrationsRun: false,

      // Synchronize - ONLY true in development
      synchronize:
        this.configService.get<boolean>('DB_SYNCHRONIZE') ||
        process.env.NODE_ENV !== 'production',

      autoLoadEntities: true,

      // Logging
      logging:
        this.configService.get<boolean>('DB_LOGGING') ||
        process.env.NODE_ENV === 'production',

      extra:
        process.env.NODE_ENV === 'production'
          ? {
              connectionLimit: 10,
              waitForConnections: true,
              queueLimit: 0,

              // Keep connections alive
              enableKeepAlive: true,
              keepAliveInitialDelay: 0,

              // Timeouts
              connectTimeout: 60000, // 60 seconds
              acquireTimeout: 60000,
              timeout: 60000,
            }
          : {},

      // Automatic reconnection
      poolSize: 10,
      maxQueryExecutionTime: 30000, // Log slow queries

      // Retry logic
      retryAttempts: 3,
      retryDelay: 3000,
    };
  }
}
