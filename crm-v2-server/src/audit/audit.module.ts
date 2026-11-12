import { Module, MiddlewareConsumer, NestModule, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditContextMiddleware } from './audit-context.middleware';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditContextMiddleware).forRoutes('*');
  }
}
