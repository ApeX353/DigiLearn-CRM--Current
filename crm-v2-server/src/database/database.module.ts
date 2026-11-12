import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseConfigService } from './database-config.service';
import { SeedRunnerService } from './seed-runner.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useClass: DatabaseConfigService,
      inject: [ConfigService],
    }),
  ],
  providers: [DatabaseConfigService, SeedRunnerService],
  exports: [DatabaseConfigService],
})
export class DatabaseModule {}
