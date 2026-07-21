import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { Activity, ActivityStatus } from '../../activities/entities/activity.entity';
import { UserNotificationsService } from '../../notifications/user-notifications.service';
import {
  AUTOMATION_CRON,
  ROUTABLE_ROLES,
  TERMINAL_LEAD_STATUSES,
} from '../automation.constants';

/**
 * #4 — Follow-up / next-step discipline nudge.
 *
 * Tasks are barely logged (260 of 4,585 activities ≈ 6%) and the
 * `withFollowup` quality counters are frequently zero, so leads
 * silently age into SLA breach because nobody scheduled the next
 * step. This daily digest tells each rep, in one notification, how
 * many of their open leads have NO scheduled future activity — the
 * concrete "no next step" gap — so the manager doesn't have to spot
 * it after the fact.
 *
 * Read-only: it computes from `leads` + `activities` and notifies.
 * It never creates activities or touches lead timers.
 */
@Injectable()
export class FollowupDisciplineService {
  private readonly logger = new Logger(FollowupDisciplineService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly dataSource: DataSource,
    private readonly userNotificationsService: UserNotificationsService,
  ) {}

  @Cron(AUTOMATION_CRON.disciplineDigest)
  async handleDailyDisciplineDigest(): Promise<void> {
    try {
      const repIds = await this.getRoutableRepIds();
      if (repIds.length === 0) return;

      const now = new Date();
      const dateKey = now.toISOString().slice(0, 10);
      let nudged = 0;

      for (const repId of repIds) {
        const openLeads = await this.leadRepository
          .createQueryBuilder('lead')
          .select('lead.id', 'id')
          .where('lead.assigned_to = :repId', { repId })
          .andWhere('lead.deleted_at IS NULL')
          .andWhere('lead.status NOT IN (:...terminal)', {
            terminal: [...TERMINAL_LEAD_STATUSES],
          })
          .getRawMany<{ id: string }>();

        if (openLeads.length === 0) continue;
        const openLeadIds = openLeads.map((l) => l.id);

        // Lead ids that DO have a scheduled future activity (a "next step").
        const withStep = await this.activityRepository
          .createQueryBuilder('a')
          .select('DISTINCT a.lead_id', 'lead_id')
          .where('a.lead_id IN (:...ids)', { ids: openLeadIds })
          .andWhere('a.status = :scheduled', {
            scheduled: ActivityStatus.SCHEDULED,
          })
          .andWhere('a.due_at IS NOT NULL')
          .andWhere('a.due_at >= :now', { now })
          .getRawMany<{ lead_id: string }>();

        const withStepIds = new Set(withStep.map((r) => r.lead_id));
        const missing = openLeadIds.length - withStepIds.size;
        if (missing <= 0) continue;

        try {
          await this.userNotificationsService.sendToUsers({
            title: 'Follow-up discipline: leads with no next step',
            message: `${missing} of your ${openLeadIds.length} open leads have no scheduled next step. Add a follow-up with a due date so they don't age into an SLA breach.`,
            severity: 'warning',
            entity: 'Lead',
            entityId: repId,
            dedupeKey: `followup-discipline-${repId}-${dateKey}`,
            actionUrl: `/leads?assignee=${repId}`,
            userIds: [repId],
          });
          nudged++;
        } catch (e: any) {
          if (
            e?.code !== 'ER_DUP_ENTRY' &&
            e?.code !== '23505' &&
            !e?.message?.includes('duplicate')
          ) {
            this.logger.error(
              `Discipline digest: failed to notify ${repId}: ${e?.message}`,
            );
          }
        }
      }

      if (nudged > 0) {
        this.logger.log(`Discipline digest: ${nudged} rep(s) nudged`);
      }
    } catch (error: any) {
      this.logger.error(
        `Discipline digest failed: ${error?.message}`,
        error?.stack,
      );
    }
  }

  private async getRoutableRepIds(): Promise<string[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('DISTINCT user.id', 'id')
      .from('users', 'user')
      .innerJoin('user_roles', 'ur', 'ur.user_id = user.id')
      .innerJoin('roles', 'role', 'role.id = ur.role_id')
      .where('role.name IN (:...roles)', { roles: [...ROUTABLE_ROLES] })
      .andWhere('user.is_active = :active', { active: true })
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }
}
