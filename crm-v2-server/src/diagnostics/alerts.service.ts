import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DiagnosticsService } from './diagnostics.service';

/**
 * The system raising its hand. Each rule sends two in-app notifications:
 * a plain-language one to the owner (admin) and a technical one to support
 * (admin_support), both deduped so a repeating failure makes one noise per
 * window, not one per occurrence. Everything else stays on the System Health
 * page, not in anyone's bell.
 *
 * UserNotificationsService lives in a module this global module must not
 * import (cycle), so it is resolved lazily through ModuleRef.
 */
@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);
  private notifications: UserNotificationsService | null = null;

  constructor(
    private readonly moduleRef: ModuleRef,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly diagnostics: DiagnosticsService,
  ) {}

  onModuleInit(): void {
    try {
      this.notifications = this.moduleRef.get(UserNotificationsService, { strict: false });
    } catch {
      this.notifications = null;
      this.logger.warn('UserNotificationsService not available; system alerts will only be recorded, not pushed');
    }
    this.diagnostics.setAlertSink(this);
    // The provider funnel is factory-built and cannot inject us; hand it the recorder.
    try {
      this.moduleRef.get(NotificationsService, { strict: false }).attachDeliveryRecorder(this.diagnostics);
    } catch {
      this.logger.warn('NotificationsService not available; e-mail and SMS attempts will not be recorded');
    }
  }

  async jobFailed(name: string, title: string, reference: string, message: string): Promise<void> {
    const hour = new Date().toISOString().slice(0, 13);
    await this.send({
      plain: {
        title: `${title} did not complete`,
        message: `The scheduled "${title}" job failed just now. Support has the details under reference ${reference}.`,
      },
      technical: {
        title: `Job failed: ${name}`,
        message: `${reference} — ${message}`.slice(0, 255),
      },
      dedupeKey: `sys-job-failed-${name}-${hour}`,
      severity: 'error',
      reference,
      entity: 'JobRun',
    });
  }

  async deliveryFailures(channel: string, consecutive: number, lastError: string | null): Promise<void> {
    const quarter = Math.floor(Date.now() / (15 * 60_000));
    const channelName = channel === 'email' ? 'E-mail' : channel === 'whatsapp' ? 'WhatsApp' : channel;
    await this.send({
      plain: {
        title: `${channelName} messages are failing`,
        message: `${consecutive} ${channelName} sends in a row have failed. Messages to schools may not be going out.`,
      },
      technical: {
        title: `${consecutive} consecutive ${channel} delivery failures`,
        message: (lastError ?? 'no provider error text').slice(0, 255),
      },
      dedupeKey: `sys-delivery-${channel}-${quarter}`,
      severity: 'warning',
      entity: 'DeliveryAttempt',
    });
  }

  async errorBurst(count: number, windowMinutes: number, sampleReference: string | null): Promise<void> {
    const hour = new Date().toISOString().slice(0, 13);
    await this.send({
      plain: {
        title: 'The CRM is hitting errors',
        message: `${count} errors in the last ${windowMinutes} minutes. Support has been told; if people are stuck, ask them for the reference code on their screen.`,
      },
      technical: {
        title: `Error burst: ${count} server errors in ${windowMinutes} min`,
        message: sampleReference ? `Latest reference ${sampleReference}. See System Health → Problems today.` : 'See System Health → Problems today.',
      },
      dedupeKey: `sys-error-burst-${hour}`,
      severity: 'error',
      reference: sampleReference ?? undefined,
    });
  }

  async userStruggling(userId: string, userName: string, errors: number, denials: number, page: string | null): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const where = page ? ` on ${page}` : '';
    await this.send({
      plain: null, // the owner sees this on the People view; only support is pinged
      technical: {
        title: `${userName} is running into trouble today`,
        message: `${errors} errors and ${denials} refused actions${where} so far today. Worth a call before they give up.`,
      },
      dedupeKey: `sys-user-struggling-${userId}-${day}`,
      severity: 'warning',
      entity: 'User',
      entityId: userId,
      actionUrl: `/admin/system-health?tab=people&user=${userId}`,
    });
  }

  private async send(input: {
    plain: { title: string; message: string } | null;
    technical: { title: string; message: string };
    dedupeKey: string;
    severity: 'info' | 'warning' | 'error';
    reference?: string;
    entity?: string;
    entityId?: string;
    actionUrl?: string;
  }): Promise<void> {
    if (!this.notifications) return;
    try {
      const [supportIds, adminIds] = await Promise.all([
        this.userIdsWithRoles(['admin_support']),
        this.userIdsWithRoles(['admin']),
      ]);
      const actionUrl = input.actionUrl ?? (input.reference ? `/admin/system-health?ref=${input.reference}` : '/admin/system-health');
      if (supportIds.length) {
        await this.notifications.sendToUsers({
          title: input.technical.title.slice(0, 255),
          message: input.technical.message.slice(0, 255),
          severity: input.severity,
          channel: 'in-app',
          entity: input.entity ?? 'SystemEvent',
          entityId: input.entityId ?? input.reference,
          dedupeKey: `${input.dedupeKey}-support`,
          actionUrl,
          eventType: 'system.alert',
          userIds: supportIds,
        } as never);
      }
      // Owners who also hold admin_support get the technical one only. The
      // owner's plain-language alerts start when diagnostics.visible_to_admin
      // is switched on (the layer is shown to support first).
      const ownerIds = adminIds.filter((id) => !supportIds.includes(id));
      const ownerOn = await this.diagnostics.getFlag('diagnostics.visible_to_admin', false);
      if (input.plain && ownerIds.length && ownerOn) {
        await this.notifications.sendToUsers({
          title: input.plain.title.slice(0, 255),
          message: input.plain.message.slice(0, 255),
          severity: input.severity,
          channel: 'in-app',
          entity: input.entity ?? 'SystemEvent',
          entityId: input.entityId ?? input.reference,
          dedupeKey: `${input.dedupeKey}-owner`,
          actionUrl,
          eventType: 'system.alert',
          userIds: ownerIds,
        } as never);
      }
    } catch (e) {
      // Dedupe collisions are expected; anything else is logged, never thrown.
      const code = (e as { code?: string })?.code;
      if (code !== '23505') this.logger.warn(`System alert not sent: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async userIdsWithRoles(roleNames: string[]): Promise<string[]> {
    const rows = await this.users
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('role.name IN (:...roleNames)', { roleNames })
      .andWhere('user.is_active = true')
      .select('user.id', 'id')
      .getRawMany<{ id: string }>();
    return [...new Set(rows.map((r) => r.id))];
  }
}
