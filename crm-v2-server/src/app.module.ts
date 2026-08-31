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
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from './auth/guards/api-key.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PasswordChangeGuard } from './auth/guards/password-change.guard';
import { ThrottlerBehindProxyGuard } from './common/guards/throttler-behind-proxy.guard';
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
import { BugReportsModule } from './bug-reports/bug-reports.module';
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
    // Global API rate limiting. The `default` throttler is a generous
    // baseline (300 req / 60s per client IP) that stops crude floods
    // without disturbing normal dashboard traffic; sensitive auth routes
    // tighten this with their own @Throttle() overrides. `ttl` is in
    // milliseconds in throttler v6.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 300 },
    ]),
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
    BugReportsModule,
  ],
  controllers: [
    RbacController
  ],
  providers: [
    RbacService,
    // Rate limiter runs first, before any auth work, so floods are shed
    // before they cost a DB round-trip.
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
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
    // AUD-H02: last, so it only ever speaks about a request that has already
    // authenticated. A user who owes a password change is refused everything
    // except the few routes that let them fix it.
    {
      provide: APP_GUARD,
      useClass: PasswordChangeGuard,
    },
  ],
})
export class AppModule {}
