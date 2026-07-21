import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/entities/user.entity';
import { AccountSecurity } from './auth/entities/account-security.entity';
import { Permission } from './auth/entities/permission.entity';
import { RolePermission } from './auth/entities/role-permission.entity';
import { Role } from './auth/entities/role.entity';
import { RbacController } from './rbac/rbac.controller';
import { RbacService } from './rbac/rbac.service';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from './auth/guards/api-key.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PipelinesModule } from './pipelines/pipelines.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { LeadsModule } from './leads/leads.module';
import { SchoolsModule } from './schools/schools.module';
import { ContactsModule } from './contacts/contacts.module';
import { SettingsModule } from './settings/settings.module';
import { Settings } from './settings/entities/settings.entity';
import { DealsModule } from './deals/deals.module';
import { Deal } from './deals/entities/deal.entity';
import { DealStageHistory } from './deals/entities/deal-stage-history.entity';
import { ProductsModule } from './products/products.module';
import { QuotesModule } from './quotes/quotes.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { PaymentTermsModule } from './payment-terms/payment-terms.module';
import { ActivitiesModule } from './activities/activities.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FileManagerModule } from './file-manager/file-manager.module';
import { SlaModule } from './sla/sla.module';
import { ReportsModule } from './reports/reports.module';
import { EmailSequencesModule } from './email-sequences/email-sequences.module';
import { AuditModule } from './audit/audit.module';
import { UserEmailModule } from './user-email/user-email.module';
import { CalendarSyncModule } from './calendar-sync/calendar-sync.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { VideoIntegrationsModule } from './video-integrations/video-integrations.module';
import { AutomationModule } from './automation/automation.module';
import { CashRequisitionsModule } from './cash-requisitions/cash-requisitions.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { NotificationsGatewayModule } from './notifications/notifications-gateway.module';

@Module({
  imports: [
    NotificationsGatewayModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CommonModule,
    UsersModule,
    AuthModule,
    ActivityLogsModule,
    TypeOrmModule.forFeature([
      Permission,
      Role,
      RolePermission,
      User,
      AccountSecurity,
      Settings,
      Deal,
      DealStageHistory,
    ]),
    PipelinesModule,
    LeadsModule,
    SchoolsModule,
    ContactsModule,
    SettingsModule,
    DealsModule,
    ProductsModule,
    QuotesModule,
    InvoicesModule,
    PaymentsModule,
    PaymentTermsModule,
    ActivitiesModule,
    DashboardModule,
    FileManagerModule,
    SlaModule,
    ReportsModule,
    EmailSequencesModule,
    AuditModule,
    UserEmailModule,
    CalendarSyncModule,
    SchedulingModule,
    VideoIntegrationsModule,
    AutomationModule,
    CashRequisitionsModule,
    CampaignsModule,
  ],
  controllers: [
    RbacController
  ],
  providers: [
    RbacService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Apply roles guard globally (after JWT guard)
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
