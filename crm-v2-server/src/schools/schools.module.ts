import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolsService } from './schools.service';
import { SchoolsController } from './schools.controller';
import { School } from './entities/schools.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([School, Contact]),
    forwardRef(() => AuthModule),
    ActivityLogsModule,
    ContactsModule,
  ],
  controllers: [SchoolsController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
