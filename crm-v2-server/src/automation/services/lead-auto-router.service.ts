import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';
import { LeadSLA } from '../../leads/entities/lead-sla.entity';
import { UserNotificationsService } from '../../notifications/user-notifications.service';
import { ComplianceSettingsService } from '../../settings/compliance-settings.service';
import {
  AUTOMATION_CRON,
  ROUTABLE_ROLES,
  ROUTER_BATCH_LIMIT,
  TERMINAL_LEAD_STATUSES,
} from '../automation.constants';

/**
 * #2 — Unassigned-lead auto-router + first-touch SLA start.
 *
 * ~28% of leads (474/1,709 in the snapshot) had no owner, so no
 * first-touch SLA loop ever started and they silently aged. This
 * cron drains the unassigned backlog: it load-balances each unowned,
 * non-terminal lead onto the least-loaded active rep, starts the SLA
 * clock for the lead's current status, and notifies the new owner.
 *
 * What it does NOT do: send any external message, change lead status,
 * or progress a deal. Assignment + SLA-clock start are internal,
 * reversible state changes (the existing reassignment-approval flow
 * can override). Humans still make first contact.
 */
@Injectable()
export class LeadAutoRouterService {
  private readonly logger = new Logger(LeadAutoRouterService.name);

  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadSLA)
    private readonly leadSlaRepository: Repository<LeadSLA>,
    private readonly dataSource: DataSource,
    private readonly userNotificationsService: UserNotificationsService,
    private readonly complianceSettings: ComplianceSettingsService,
  ) {}

  @Cron(AUTOMATION_CRON.unassignedRouting)
  async handleUnassignedLeadRouting(): Promise<void> {
    try {
      // Engine is opt-in: admins / sales managers turn it on from the
      // Settings → Compliance & Controls page. When off, leads stay
      // unassigned for manual distribution.
      const enabled = await this.complianceSettings.getBoolean(
        'auto_assign_enabled',
      );
      if (!enabled) {
        return;
      }

      const repIds = await this.getRoutableRepIds();
      if (repIds.length === 0) {
        this.logger.warn(
          'Auto-router: no active routable reps found — skipping pass',
        );
        return;
      }

      // Current open-lead load per routable rep (for load balancing).
      const load = await this.getOpenLeadCountsByRep(repIds);

      const unassigned = await this.leadRepository
        .createQueryBuilder('lead')
        .where('lead.assigned_to IS NULL')
        .andWhere('lead.deleted_at IS NULL')
        .andWhere('lead.status NOT IN (:...terminal)', {
          terminal: [...TERMINAL_LEAD_STATUSES],
        })
        .orderBy('lead.created_at', 'ASC')
        .limit(ROUTER_BATCH_LIMIT)
        .getMany();

      if (unassigned.length === 0) {
        return;
      }

      // Cache active SLA configs by status so first-touch clocks are
      // consistent with the SLA module's own breach computation.
      const slaByStatus = await this.getActiveSlaHoursByStatus();
      const now = new Date();
      let routed = 0;

      for (const lead of unassigned) {
        const assignee = this.pickAssignee(load);

        const patch: Partial<Lead> = { assigned_to: assignee };

        // First-touch SLA start: only set the clock if one isn't
        // already running, so we never extend an existing deadline.
        if (!lead.current_sla_due_date) {
          const slaHours = slaByStatus.get(lead.status as unknown as string);
          if (slaHours && slaHours > 0) {
            patch.current_sla_due_date = new Date(
              now.getTime() + slaHours * 3_600_000,
            );
            patch.sla_breached = false;
          }
        }

        await this.leadRepository.update(lead.id, patch);
        load.set(assignee, (load.get(assignee) ?? 0) + 1);
        routed++;

        try {
          await this.userNotificationsService.sendToUsers({
            title: 'New lead assigned to you',
            message: `Lead "${lead.lead_name}" was auto-assigned to you. Make first contact before the SLA expires.`,
            severity: 'info',
            entity: 'Lead',
            entityId: lead.id,
            dedupeKey: `lead-autoassign-${lead.id}`,
            actionUrl: `/leads/${lead.id}`,
            userIds: [assignee],
          });
        } catch (e: any) {
          if (
            e?.code !== 'ER_DUP_ENTRY' &&
            e?.code !== '23505' &&
            !e?.message?.includes('duplicate')
          ) {
            this.logger.error(
              `Auto-router: failed to notify ${assignee} for lead ${lead.id}: ${e?.message}`,
            );
          }
        }
      }

      this.logger.log(
        `Auto-router: routed ${routed} unassigned lead(s) across ${repIds.length} rep(s)`,
      );
    } catch (error: any) {
      this.logger.error(
        `Auto-router pass failed: ${error?.message}`,
        error?.stack,
      );
    }
  }

  /** Least-loaded rep, deterministic tie-break by id, then bump in caller. */
  private pickAssignee(load: Map<string, number>): string {
    let best: string | null = null;
    let bestCount = Number.POSITIVE_INFINITY;
    for (const [repId, count] of [...load.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      if (count < bestCount) {
        best = repId;
        bestCount = count;
      }
    }
    // load is guaranteed non-empty by the caller's repIds check.
    return best as string;
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

  private async getOpenLeadCountsByRep(
    repIds: string[],
  ): Promise<Map<string, number>> {
    const load = new Map<string, number>(repIds.map((id) => [id, 0]));
    const rows = await this.leadRepository
      .createQueryBuilder('lead')
      .select('lead.assigned_to', 'rep')
      .addSelect('COUNT(*)', 'cnt')
      .where('lead.assigned_to IN (:...repIds)', { repIds })
      .andWhere('lead.deleted_at IS NULL')
      .andWhere('lead.status NOT IN (:...terminal)', {
        terminal: [...TERMINAL_LEAD_STATUSES],
      })
      .groupBy('lead.assigned_to')
      .getRawMany<{ rep: string; cnt: string }>();
    for (const r of rows) {
      load.set(r.rep, Number(r.cnt));
    }
    return load;
  }

  private async getActiveSlaHoursByStatus(): Promise<Map<string, number>> {
    const configs = await this.leadSlaRepository.find({
      where: { is_active: true },
    });
    return new Map(
      configs.map((c) => [c.status as unknown as string, c.sla_hours]),
    );
  }
}
