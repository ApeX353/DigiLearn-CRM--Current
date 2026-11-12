import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pipeline } from './entities/pipeline.entity';
import { Stage } from './entities/stage.entity';
import { Deal } from '../deals/entities/deal.entity';
import { PipelinesService } from './pipelines.service';
import { StagesService } from './stages.service';
import { PipelinesController } from './pipelines.controller';
import { StagesController } from './stages.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pipeline, Stage, Deal]),
    ActivityLogsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [PipelinesController, StagesController],
  providers: [PipelinesService, StagesService],
  exports: [PipelinesService, StagesService],
})
export class PipelinesModule {}
