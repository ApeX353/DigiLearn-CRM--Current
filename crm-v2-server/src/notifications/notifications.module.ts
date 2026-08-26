import { Module, DynamicModule, Global, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { UserNotificationsService } from './user-notifications.service';
import { UserNotificationsController } from './user-notifications.controller';
import { Notification, UserNotification } from './entities';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationConfig } from './dto';
import { SmtpEmailProvider } from './providers';

export interface NotificationsModuleOptions {
  config?: NotificationConfig;
  isGlobal?: boolean;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      UserNotification,
      NotificationPreference,
    ]),
    forwardRef(() => require('../auth/auth.module').AuthModule),
  ],
  controllers: [UserNotificationsController, NotificationPreferencesController],
  // NotificationsGateway is provided once by the global
  // NotificationsGatewayModule; UserNotificationsService injects that
  // shared singleton (it's an @Optional dependency).
  providers: [UserNotificationsService],
  exports: [UserNotificationsService],
})
export class NotificationsModule {
  static forRoot(options?: NotificationsModuleOptions): DynamicModule {
    const providers = [
      {
        provide: NotificationsService,
        useFactory: () => {
          const service = new NotificationsService(options?.config);

          if (options?.config?.email?.smtp) {
            const smtpProvider = new SmtpEmailProvider(
              options.config.email.smtp,
            );
            service.registerEmailProvider(smtpProvider);
          }

          return service;
        },
      },
    ];

    return {
      module: NotificationsModule,
      global: options?.isGlobal ?? false,
      imports: [
        TypeOrmModule.forFeature([
      Notification,
      UserNotification,
      NotificationPreference,
    ]),
        forwardRef(() => require('../auth/auth.module').AuthModule),
      ],
      controllers: [UserNotificationsController, NotificationPreferencesController],
      providers: [...providers, UserNotificationsService],
      exports: [NotificationsService, UserNotificationsService],
    };
  }

  static forRootAsync(options: {
    useFactory: (
      ...args: any[]
    ) => Promise<NotificationConfig> | NotificationConfig;
    inject?: any[];
    isGlobal?: boolean;
  }): DynamicModule {
    const providers = [
      {
        provide: 'NOTIFICATION_CONFIG',
        useFactory: options.useFactory,
        inject: options.inject || [],
      },
      {
        provide: NotificationsService,
        useFactory: (config: NotificationConfig) => {
          const service = new NotificationsService(config);

          if (config?.email?.smtp) {
            const smtpProvider = new SmtpEmailProvider(config.email.smtp);
            service.registerEmailProvider(smtpProvider);
          }

          return service;
        },
        inject: ['NOTIFICATION_CONFIG'],
      },
    ];

    return {
      module: NotificationsModule,
      global: options?.isGlobal ?? false,
      imports: [
        TypeOrmModule.forFeature([
      Notification,
      UserNotification,
      NotificationPreference,
    ]),
        forwardRef(() => require('../auth/auth.module').AuthModule),
      ],
      controllers: [UserNotificationsController, NotificationPreferencesController],
      providers: [...providers, UserNotificationsService],
      exports: [NotificationsService, UserNotificationsService],
    };
  }
}
