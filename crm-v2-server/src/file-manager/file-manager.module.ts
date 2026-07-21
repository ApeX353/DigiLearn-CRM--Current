import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileManagerController } from './file-manager.controller';
import { FileManagerService } from './file-manager.service';
import { ManagedFile } from './entities/managed-file.entity';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManagedFile]),
    ActivityLogsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [FileManagerController],
  providers: [FileManagerService],
  exports: [FileManagerService],
})
export class FileManagerModule {}
