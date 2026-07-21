import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashRequisition } from './entities/cash-requisition.entity';
import { RequisitionLineItem } from './entities/requisition-line-item.entity';
import { User } from '../users/entities/user.entity';
import { CashRequisitionsService } from './cash-requisitions.service';
import { CashRequisitionsController } from './cash-requisitions.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    // User repo is needed to resolve approver user-ids by role name
    TypeOrmModule.forFeature([CashRequisition, RequisitionLineItem, User]),
    // RolesGuard needs CaslAbilityFactory etc. from AuthModule
    forwardRef(() => AuthModule),
  ],
  controllers: [CashRequisitionsController],
  providers: [CashRequisitionsService],
  exports: [CashRequisitionsService],
})
export class CashRequisitionsModule {}
