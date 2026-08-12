import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { Contact } from './entities/contact.entity';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { User } from '../users/entities/user.entity';
import { CustomerIdentityService } from './services/customer-identity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, User]),
    forwardRef(() => AuthModule),
    ActivityLogsModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService, CustomerIdentityService],
  exports: [ContactsService, CustomerIdentityService],
})
export class ContactsModule {}
