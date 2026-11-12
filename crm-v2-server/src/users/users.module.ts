import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { AccountSecurity } from '../auth/entities/account-security.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, AccountSecurity]),
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
