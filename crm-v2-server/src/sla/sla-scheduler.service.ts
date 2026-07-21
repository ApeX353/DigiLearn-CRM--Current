import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, Not, In, Brackets } from 'typeorm';
import { Activity, ActivityType, ActivityStatus, ActivityOutcome } from '../activities/entities/activity.entity';
import { SlaBreachService } from './sla-breach.service';
import { Lead } from '../leads/entities/lead.entity';
import { LeadSLA } from '../leads/entities/lead-sla.entity';
import { LeadSLAHistory } from '../leads/entities/lead-sla-history.entity';
import { Deal, DealCloseStatus } from '../deals/entities/deal.entity';
import { Stage } from '../pipelines/entities/stage.entity';
import { User } from '../users/entities/user.entity';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ComplianceSettingsService } from '../settings/compliance-settings.service';
import { DataSource } from 'typeorm';

@Injectable()
export class SlaSchedulerService {
  private readonly logger = new Logger(SlaSchedulerService.name);

  constructor(
    private readonly slaBreachService: SlaBreachService,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadSLA)
    private readonly leadSlaRepository: Repository<LeadSLA>,
    @InjectRepository(LeadSLAHistory)
    private readonly leadSlaHistoryRepository: Repository<LeadSLAHistory>,
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    @InjectRepository(Stage)
    private readonly stageRepository: Repository<Stage>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly notificationsService: NotificationsService,
    private readonly complianceSettings: ComplianceSettingsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Demo Follow-up SLA cron. Runs every 30 minutes. For each
   * DEMO_DELIVERY activity completed with one of the
   * follow-up-required outcomes, checks whether a real follow-up
   * activity exists on the same lead within the SLA window
   * (default 48 hours). Notes do NOT satisfy this — we explicitly
   * exclude type='note' from the follow-up predicate.
   *
   * The cron sets `lead.demo_followup_sla_breached = true` once per
   * breach (idempotent) and emits a manager-visible warning. When
   * the follow-up eventually lands, the next pass clears the flag.
   *
   * Follow-up-required outcomes (per spec):
   *   COMPLETED, STRONG_INTEREST, FOLLOW_UP_NEEDED, QUOTE_REQUESTED
   */
  @Cron('0 */30 * * * *')
  async handleDemoFollowupSlaCheck() {
    try {
      const slaHours = await this.complianceSettings.getNumber(
        'demo_followup_sla_hours',
      );
      if (slaHours <= 0) return;
      const slaMs = slaHours * 60 * 60 * 1000;
      const now = new Date();
      const FOLLOWUP_REQUIRED: ActivityOutcome[] = [
        ActivityOutcome.DEMO_COMPLETED,
        ActivityOutcome.STRONG_INTEREST,
        ActivityOutcome.FOLLOW_UP_NEEDED,
        ActivityOutcome.QUOTE_REQUESTED,
      ];
      const FOLLOWUP_TYPES: ActivityType[] = [
        ActivityType.DEMO_FOLLOWUP,
        ActivityType.CALL,
        ActivityType.WHATSAPP,
        ActivityType.EMAIL,
        ActivityType.MEETING,
      ];

      // Eligible deliveries: DEMO_DELIVERY activities with one of
      // the trigger outcomes, completed >= slaHours ago, with a
      // lead. We don't pre-filter on the breach flag so re-runs can
      // both flip TRUE and clear FALSE.
      const eligible = await this.activityRepository
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.lead', 'lead')
        .where('a.type = :t', { t: ActivityType.DEMO_DELIVERY })
        .andWhere('a.status = :s', { s: ActivityStatus.COMPLETED })
        .andWhere('a.completed_at IS NOT NULL')
        .andWhere('a.lead_id IS NOT NULL')
        .andWhere('a.completion_outcome IN (:...os)', { os: FOLLOWUP_REQUIRED })
        .getMany();

      let breached = 0;
      let cleared = 0;
      for (const delivery of eligible) {
        if (!delivery.lead || !delivery.completed_at) continue;
        const deadline = new Date(delivery.completed_at.getTime() + slaMs);
        const overdue = now > deadline;

        // Look for any actionable follow-up on the same lead created
        // AFTER the delivery. Notes are excluded by the type filter.
        const followupCount = await this.activityRepository
          .createQueryBuilder('f')
          .where('f.lead_id = :lid', { lid: delivery.lead_id })
          .andWhere('f.type IN (:...types)', { types: FOLLOWUP_TYPES })
          .andWhere('f.created_at >= :since', {
            since: delivery.completed_at,
          })
          .getCount();

        const shouldBreach = overdue && followupCount === 0;
        if (shouldBreach && !delivery.lead.demo_followup_sla_breached) {
          await this.leadRepository.update(delivery.lead.id, {
            demo_followup_sla_breached: true,
          });
          breached++;
          // Notify the assigned rep (and managers) once per breach.
          if (delivery.lead.assigned_to) {
            try {
              await this.userNotificationsService.sendToUsers({
                title: 'Demo follow-up overdue',
                message: `Demo Delivery on "${delivery.lead.lead_name}" was completed ${slaHours}+ hours ago with outcome ${delivery.completion_outcome} and still has no follow-up activity. Notes don't count.`,
                severity: 'warning',
                entity: 'Lead',
                entityId: delivery.lead.id,
                dedupeKey: `demo-followup-sla-${delivery.lead.id}-${delivery.completed_at
                  .toISOString()
                  .slice(0, 10)}`,
                actionUrl: `/leads/${delivery.lead.id}`,
                userIds: [delivery.lead.assigned_to],
              });
            } catch (e: any) {
              if (
                e?.code !== 'ER_DUP_ENTRY' &&
                e?.code !== '23505' &&
                !e?.message?.includes('duplicate')
              ) {
                this.logger.error(
                  `Failed to send demo follow-up SLA notification for lead ${delivery.lead.id}: ${e?.message}`,
                );
              }
            }
          }
        } else if (!shouldBreach && delivery.lead.demo_followup_sla_breached) {
          // Follow-up landed (or SLA window not yet over) — clear the
          // flag so the rep stops being penalised.
          await this.leadRepository.update(delivery.lead.id, {
            demo_followup_sla_breached: false,
          });
          cleared++;
        }
      }

      if (breached > 0 || cleared > 0) {
        this.logger.log(
          `Demo Follow-up SLA check: ${breached} newly breached, ${cleared} cleared`,
        );
      }
    } catch (e: any) {
      this.logger.error(
        `Demo Follow-up SLA cron failed: ${e?.message}`,
        e?.stack,
      );
    }
  }

  /**
   * Check for SLA breaches every 30 minutes
   */
  @Cron('0 */30 * * * *')
  async handleBreachCheck() {
    try {
      this.logger.log('Running scheduled SLA breach check...');
      const leadResult = await this.slaBreachService.checkLeadSlaBreaches();
      const dealResult = await this.slaBreachService.checkDealSlaBreaches();
      this.logger.log(
        `SLA breach check complete: ${leadResult.breachedCount} leads, ${dealResult.breachedCount} deals breached`,
      );
    } catch (error) {
      this.logger.error(`SLA breach check failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Check for escalations every hour
   * Finds leads where sla_breached = true AND breached_at + escalation_after_hours < now
   */
  @Cron('0 0 * * * *')
  async handleEscalationCheck() {
    try {
      this.logger.log('Running scheduled escalation check...');

      const activeSlaConfigs = await this.leadSlaRepository.find({
        where: { is_active: true },
      });

      if (activeSlaConfigs.length === 0) return;

      const now = new Date();
      const adminManagerIds = await this.getAdminAndManagerUserIds();
      let escalatedCount = 0;

      for (const slaConfig of activeSlaConfigs) {
        // Find breached leads in this status that need escalation
        const leads = await this.leadRepository
          .createQueryBuilder('lead')
          .leftJoinAndSelect('lead.assignee', 'assignee')
          .where('lead.status = :status', { status: slaConfig.status })
          .andWhere('lead.sla_breached = :breached', { breached: true })
          .andWhere('lead.deleted_at IS NULL')
          .getMany();

        for (const lead of leads) {
          // Find the breach history to determine breached_at
          const history = await this.leadSlaHistoryRepository.findOne({
            where: {
              lead_id: lead.id,
              status: slaConfig.status,
              sla_breached: true,
              exited_status_at: IsNull(),
            },
            order: { created_at: 'DESC' },
          });

          if (!history || !history.breached_at) continue;

          // Check if escalation_after_hours has passed since breach
          const escalationThreshold = new Date(
            history.breached_at.getTime() +
              slaConfig.escalation_after_hours * 3600000,
          );

          if (now < escalationThreshold) continue;

          // Prevent repeat escalation emails (check last_escalated_at)
          if (lead.last_escalated_at) {
            const hoursSinceLastEscalation =
              (now.getTime() - lead.last_escalated_at.getTime()) / 3600000;
            // Don't re-escalate within the escalation window
            if (hoursSinceLastEscalation < slaConfig.escalation_after_hours) {
              continue;
            }
          }

          // Calculate breach duration
          const breachDurationHours = Math.round(
            (now.getTime() - history.breached_at.getTime()) / 3600000,
          );
          const breachDuration =
            breachDurationHours >= 24
              ? `${Math.floor(breachDurationHours / 24)}d ${breachDurationHours % 24}h`
              : `${breachDurationHours}h`;

          // Send escalation notification (severity: error)
          const dedupeKey = `lead-sla-escalation-${lead.id}-${slaConfig.status}-${now.toISOString().slice(0, 13)}`;
          try {
            await this.userNotificationsService.sendToUsers({
              title: 'SLA Escalation - Immediate Action Required',
              message: `Lead "${lead.lead_name}" has been breached for ${breachDuration} in status "${slaConfig.status}". Escalation triggered.`,
              severity: 'error',
              entity: 'Lead',
              entityId: lead.id,
              dedupeKey,
              actionUrl: `/leads/${lead.id}`,
              userIds: adminManagerIds,
            });
          } catch (error) {
            if (
              error?.code !== 'ER_DUP_ENTRY' && error?.code !== '23505' &&
              !error?.message?.includes('duplicate')
            ) {
              this.logger.error(
                `Failed to send escalation notification for lead ${lead.id}: ${error.message}`,
              );
            }
          }

          // Send escalation email to managers
          const managers = await this.getAdminAndManagerUsers();
          for (const manager of managers) {
            try {
              await this.notificationsService.sendEmailWithTemplate(
                manager.email,
                `SLA Escalation: Lead "${lead.lead_name}" requires immediate attention`,
                'sla-escalation',
                {
                  name: `${manager.first_name} ${manager.last_name}`,
                  leadName: lead.lead_name,
                  status: slaConfig.status,
                  breachDuration,
                  assigneeName: lead.assignee
                    ? `${lead.assignee.first_name} ${lead.assignee.last_name}`
                    : 'Unassigned',
                  actionUrl: `${process.env.CORS_ORIGIN || 'http://localhost:5173'}/leads/${lead.id}`,
                  appName: 'DigiLearn CRM',
                  year: new Date().getFullYear(),
                },
              );
            } catch (emailError) {
              this.logger.error(
                `Failed to send escalation email to ${manager.email}: ${emailError.message}`,
              );
            }
          }

          // Update lead and history
          await this.leadRepository.update(lead.id, {
            last_escalated_at: now,
          });

          await this.leadSlaHistoryRepository.update(history.id, {
            escalated: true,
            escalated_at: now,
          });

          escalatedCount++;
        }
      }

      this.logger.log(`Escalation check complete: ${escalatedCount} leads escalated`);
    } catch (error) {
      this.logger.error(
        `Escalation check failed: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Check for idle leads every 2 hours
   * Finds leads where last_action_at + idle_alert_hours < now
   */
  @Cron('0 0 */2 * * *')
  async handleIdleLeadCheck() {
    try {
      this.logger.log('Running scheduled idle lead check...');

      const activeSlaConfigs = await this.leadSlaRepository.find({
        where: { is_active: true },
      });

      if (activeSlaConfigs.length === 0) return;

      const now = new Date();
      let alertCount = 0;

      for (const slaConfig of activeSlaConfigs) {
        // Skip statuses where leads are done
        if (
          slaConfig.status === 'Disqualified' ||
          slaConfig.status === 'Converted'
        ) {
          continue;
        }

        const leads = await this.leadRepository
          .createQueryBuilder('lead')
          .leftJoinAndSelect('lead.assignee', 'assignee')
          .where('lead.status = :status', { status: slaConfig.status })
          .andWhere('lead.sla_breached = :breached', { breached: false })
          .andWhere('lead.deleted_at IS NULL')
          .andWhere('lead.assigned_to IS NOT NULL')
          .andWhere('lead.last_action_at IS NOT NULL')
          .getMany();

        for (const lead of leads) {
          if (!lead.last_action_at) continue;

          const idleThreshold = new Date(
            lead.last_action_at.getTime() +
              slaConfig.idle_alert_hours * 3600000,
          );

          if (now < idleThreshold) continue;

          // Check if we already sent an idle alert for this period
          const existingHistory = await this.leadSlaHistoryRepository.findOne({
            where: {
              lead_id: lead.id,
              status: slaConfig.status,
              idle_alert_sent: true,
              exited_status_at: IsNull(),
            },
          });

          // If we already sent an idle alert and last_action_at hasn't changed, skip
          if (
            existingHistory &&
            existingHistory.idle_alert_sent_at &&
            existingHistory.last_action_at &&
            existingHistory.last_action_at.getTime() ===
              lead.last_action_at.getTime()
          ) {
            continue;
          }

          // Send nudge notification to assigned rep
          const dedupeKey = `lead-idle-alert-${lead.id}-${now.toISOString().slice(0, 13)}`;
          try {
            await this.userNotificationsService.sendToUsers({
              title: 'Idle Lead Alert',
              message: `Lead "${lead.lead_name}" has had no activity for ${slaConfig.idle_alert_hours}+ hours. Please follow up.`,
              severity: 'warning',
              entity: 'Lead',
              entityId: lead.id,
              dedupeKey,
              actionUrl: `/leads/${lead.id}`,
              userIds: [lead.assigned_to!],
            });
          } catch (error) {
            if (
              error?.code !== 'ER_DUP_ENTRY' && error?.code !== '23505' &&
              !error?.message?.includes('duplicate')
            ) {
              this.logger.error(
                `Failed to send idle alert for lead ${lead.id}: ${error.message}`,
              );
            }
          }

          // Send idle alert email to assigned rep
          if (lead.assignee) {
            try {
              await this.notificationsService.sendEmailWithTemplate(
                lead.assignee.email,
                `Idle Lead Alert: "${lead.lead_name}" needs attention`,
                'idle-lead-alert',
                {
                  name: `${lead.assignee.first_name} ${lead.assignee.last_name}`,
                  leadName: lead.lead_name,
                  status: slaConfig.status,
                  idleHours: slaConfig.idle_alert_hours,
                  actionUrl: `${process.env.CORS_ORIGIN || 'http://localhost:5173'}/leads/${lead.id}`,
                  appName: 'DigiLearn CRM',
                  year: new Date().getFullYear(),
                },
              );
            } catch (emailError) {
              this.logger.error(
                `Failed to send idle alert email for lead ${lead.id}: ${emailError.message}`,
              );
            }
          }

          // Update SLA history
          if (existingHistory) {
            await this.leadSlaHistoryRepository.update(existingHistory.id, {
              idle_alert_sent: true,
              idle_alert_sent_at: now,
              last_action_at: lead.last_action_at,
            });
          }

          alertCount++;
        }
      }

      this.logger.log(`Idle lead check complete: ${alertCount} alerts sent`);
    } catch (error) {
      this.logger.error(
        `Idle lead check failed: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Phase D — SLA pre-breach nudge.
   *
   * Sends the assigned rep a heads-up notification N hours before a
   * lead's SLA is due to breach. N is admin-configurable via
   * `compliance.policy.sla_prebreach_nudge_hours` (default 4). When
   * the setting is 0, this entire job no-ops.
   *
   * Dedupe: the lead row carries `last_prebreach_nudge_at`; we only
   * send once per breach window (i.e. if the SLA window resets the
   * nudge can fire again, otherwise it doesn't repeat).
   */
  @Cron('0 */15 * * * *') // every 15 minutes — finer than breach so we land before, not after
  async handleSlaPrebreachNudge() {
    try {
      const hours = await this.complianceSettings.getNumber(
        'sla_prebreach_nudge_hours',
      );
      if (hours <= 0) {
        return;
      }
      const windowMs = hours * 60 * 60 * 1000;
      const now = new Date();
      const cutoff = new Date(now.getTime() + windowMs);

      // Eligible leads: have an SLA due date strictly between now and
      // now+windowMs, not already breached, not already nudged for the
      // current window. We use `current_sla_due_date - last_prebreach_nudge_at`
      // recency: if a nudge was sent in the last windowMs we suppress.
      const leads = await this.leadRepository
        .createQueryBuilder('lead')
        .leftJoinAndSelect('lead.assignee', 'assignee')
        .where('lead.deleted_at IS NULL')
        .andWhere('lead.sla_breached = FALSE')
        .andWhere('lead.assigned_to IS NOT NULL')
        .andWhere('lead.current_sla_due_date IS NOT NULL')
        .andWhere('lead.current_sla_due_date > :now', { now })
        .andWhere('lead.current_sla_due_date <= :cutoff', { cutoff })
        .andWhere(
          new Brackets((qb) => {
            qb.where('lead.last_prebreach_nudge_at IS NULL').orWhere(
              'lead.last_prebreach_nudge_at < (lead.current_sla_due_date - INTERVAL \'1 hour\' * :h)',
              { h: hours },
            );
          }),
        )
        .getMany();

      let sent = 0;
      for (const lead of leads) {
        if (!lead.assigned_to) continue;
        const minutesLeft = Math.max(
          1,
          Math.round(
            (lead.current_sla_due_date!.getTime() - now.getTime()) / 60000,
          ),
        );
        const dedupeKey = `lead-sla-prebreach-${lead.id}-${lead
          .current_sla_due_date!.toISOString()
          .slice(0, 13)}`;
        try {
          await this.userNotificationsService.sendToUsers({
            title: 'SLA Pre-breach Nudge',
            message: `Lead "${lead.lead_name}" SLA is due in ~${minutesLeft >= 60 ? `${Math.round(minutesLeft / 60)}h` : `${minutesLeft}m`}. Take action before it breaches.`,
            severity: 'warning',
            entity: 'Lead',
            entityId: lead.id,
            dedupeKey,
            actionUrl: `/leads/${lead.id}`,
            userIds: [lead.assigned_to],
          });
          sent++;
        } catch (e: any) {
          if (
            e?.code !== 'ER_DUP_ENTRY' &&
            e?.code !== '23505' &&
            !e?.message?.includes('duplicate')
          ) {
            this.logger.error(
              `Failed to send SLA pre-breach nudge for lead ${lead.id}: ${e?.message}`,
            );
          }
        }

        await this.leadRepository.update(lead.id, {
          last_prebreach_nudge_at: now,
        });
      }

      if (sent > 0) {
        this.logger.log(`SLA pre-breach nudges sent: ${sent}`);
      }
    } catch (e: any) {
      this.logger.error(
        `SLA pre-breach nudge cron failed: ${e?.message}`,
        e?.stack,
      );
    }
  }

  /**
   * Phase A.4 — Stage-aged deal alerts.
   *
   * The lead-side SLA scheduler treats every breach via a per-status
   * SLA config; deals don't have an equivalent table. Instead each
   * stage carries its own `sla_days` value, so a deal "breaches" when
   * `currentStageSince + stage.sla_days < now`. We persist a boolean
   * (`deal.sla_breached`) and the timestamp of the last notification
   * (`deal.last_breached_at`) so we don't spam managers every 30
   * minutes for the same deal.
   *
   * As a safety net, we also pick up a generic "deal idle" threshold
   * via `compliance.thresholds.stale_deal_days` for stages that
   * carry no SLA (sla_days = 0). That ensures the org-wide
   * configurable bar from Compliance & Controls applies even where
   * a pipeline owner forgot to set a per-stage SLA.
   *
   * Notification semantics:
   *   - audience: admin + sales_manager users (deal owner's team)
   *   - severity: warning
   *   - dedupe key: `deal-stage-sla-${id}-${stageId}-${YYYY-MM-DDTHH}`
   *     so we send at most one notification per deal-stage pair per
   *     hour even if the cron runs more frequently.
   */
  @Cron('0 */30 * * * *')
  async handleDealStageBreachCheck() {
    try {
      this.logger.log('Running scheduled deal stage SLA check...');
      const now = new Date();
      const fallbackStaleDays = Math.max(
        1,
        Math.round(
          await this.complianceSettings.getNumber('stale_deal_days'),
        ),
      );

      // We grab every ongoing deal and compute eligibility in JS
      // rather than building a complex JOIN — typical orgs have a few
      // hundred ongoing deals which is well within budget for a 30
      // min cron job. Eager-loading `current_stage` and `assigned_user`
      // keeps the per-row work O(1).
      const deals = await this.dealRepository.find({
        where: { closeStatus: DealCloseStatus.ONGOING },
        relations: ['current_stage', 'assigned_user'],
      });

      if (deals.length === 0) {
        this.logger.log('No ongoing deals to check');
        return;
      }

      const managerIds = await this.getAdminAndManagerUserIds();
      let breachedCount = 0;
      let notifiedCount = 0;

      for (const deal of deals) {
        if (!deal.currentStageSince) continue;

        const stageSlaDays = deal.current_stage?.sla_days ?? 0;
        const effectiveSlaDays =
          stageSlaDays > 0 ? stageSlaDays : fallbackStaleDays;

        const breachAt = new Date(
          deal.currentStageSince.getTime() +
            effectiveSlaDays * 24 * 60 * 60 * 1000,
        );

        if (now < breachAt) {
          // Not breached yet. If the deal was previously flagged but
          // somehow rolled back into compliance (e.g. admin extended
          // the stage SLA), clear the flag so the UI updates.
          if (deal.sla_breached) {
            await this.dealRepository.update(deal.id, {
              sla_breached: false,
              last_breached_at: null,
            });
          }
          continue;
        }

        // Breached. Persist the flag (idempotent).
        const wasAlreadyBreached = deal.sla_breached;
        if (!wasAlreadyBreached) {
          await this.dealRepository.update(deal.id, {
            sla_breached: true,
            last_breached_at: now,
          });
          breachedCount++;
        }

        // Notify at most once per hour per deal-stage. The dedupe key
        // collapses repeats when the cron fires twice in the same
        // wall-clock hour and `last_breached_at` recency provides a
        // longer-window suppression after the first alert lands.
        const recentlyNotified =
          deal.last_breached_at &&
          now.getTime() - deal.last_breached_at.getTime() <
            60 * 60 * 1000;
        if (wasAlreadyBreached && recentlyNotified) {
          continue;
        }

        const breachAgeHours = Math.round(
          (now.getTime() - breachAt.getTime()) / (60 * 60 * 1000),
        );
        const breachAgeStr =
          breachAgeHours >= 24
            ? `${Math.floor(breachAgeHours / 24)}d ${breachAgeHours % 24}h`
            : `${breachAgeHours}h`;
        const stageName = deal.current_stage?.name || 'Unknown stage';
        const ownerName = deal.assigned_user
          ? `${deal.assigned_user.first_name} ${deal.assigned_user.last_name}`
          : 'Unassigned';

        const dedupeKey = `deal-stage-sla-${deal.id}-${deal.current_stage_id}-${now
          .toISOString()
          .slice(0, 13)}`;

        try {
          await this.userNotificationsService.sendToUsers({
            title: 'Deal Stage SLA Breached',
            message: `Deal "${deal.title}" has been in stage "${stageName}" for ${breachAgeStr} past its ${effectiveSlaDays}-day SLA. Owner: ${ownerName}.`,
            severity: 'warning',
            entity: 'Deal',
            entityId: deal.id,
            dedupeKey,
            actionUrl: `/deals/${deal.id}`,
            userIds: managerIds,
          });
          notifiedCount++;
        } catch (error: any) {
          if (
            error?.code !== 'ER_DUP_ENTRY' &&
            error?.code !== '23505' &&
            !error?.message?.includes('duplicate')
          ) {
            this.logger.error(
              `Failed to send deal SLA breach notification for deal ${deal.id}: ${error.message}`,
            );
          }
        }

        // Bump last_breached_at on every successful notification so
        // the recency check above suppresses the next pass.
        if (wasAlreadyBreached) {
          await this.dealRepository.update(deal.id, {
            last_breached_at: now,
          });
        }
      }

      this.logger.log(
        `Deal stage SLA check complete: ${breachedCount} newly breached, ${notifiedCount} manager notifications sent`,
      );
    } catch (error: any) {
      this.logger.error(
        `Deal stage SLA check failed: ${error.message}`,
        error.stack,
      );
    }
  }

  private async getAdminAndManagerUserIds(): Promise<string[]> {
    const users = await this.dataSource
      .createQueryBuilder()
      .select('DISTINCT user.id', 'id')
      .from('users', 'user')
      .innerJoin('user_roles', 'ur', 'ur.user_id = user.id')
      .innerJoin('roles', 'role', 'role.id = ur.role_id')
      .where('role.name IN (:...roles)', { roles: ['admin', 'sales_manager'] })
      .andWhere('user.is_active = :active', { active: true })
      .getRawMany();

    return users.map((u: any) => u.id);
  }

  private async getAdminAndManagerUsers(): Promise<User[]> {
    return this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin('user_roles', 'ur', 'ur.user_id = user.id')
      .innerJoin('roles', 'role', 'role.id = ur.role_id')
      .where('role.name IN (:...roles)', { roles: ['admin', 'sales_manager'] })
      .andWhere('user.is_active = :active', { active: true })
      .getMany();
  }
}
