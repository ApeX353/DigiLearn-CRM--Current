import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../leads/entities/lead.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Activity } from '../activities/entities/activity.entity';
import { DealStageHistory } from '../deals/entities/deal-stage-history.entity';
import { Stage } from '../pipelines/entities/stage.entity';

/**
 * Discipline metrics (Phase 4 of the management-control pass).
 *
 * Four categories — Volume, Quality, Discipline, Progression. Each
 * metric is a {current, label} value with an optional target; the UI
 * renders a slim row per metric and flags the ones that fall below
 * target. A single endpoint returns all four categories in one
 * round-trip to avoid N queries per dashboard paint.
 *
 * Windowing: `mtd` (month-to-date) | `week` | `quarter` | `year`.
 * Defaults to mtd.
 *
 * Rep-scoped: pass `userId` to narrow every metric to that rep's
 * owned leads/deals/activities. Omit for a team-wide view.
 */

export type MetricWindow = 'week' | 'mtd' | 'quarter' | 'year';

export interface Metric {
  key: string;
  label: string;
  value: number;
  target?: number;
  pct?: number;
}

export interface DisciplineMetrics {
  window: MetricWindow;
  volume: Metric[];
  quality: Metric[];
  discipline: Metric[];
  progression: Metric[];
}

@Injectable()
export class DisciplineMetricsService {
  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Deal) private readonly dealRepo: Repository<Deal>,
    @InjectRepository(Activity)
    private readonly actRepo: Repository<Activity>,
    @InjectRepository(DealStageHistory)
    private readonly stageHistRepo: Repository<DealStageHistory>,
    @InjectRepository(Stage)
    private readonly stageRepo: Repository<Stage>,
  ) {}

  async compute(
    window: MetricWindow = 'mtd',
    userId?: string,
  ): Promise<DisciplineMetrics> {
    const { from, to } = this.range(window);
    const days = Math.max(1, Math.ceil((+to - +from) / 86_400_000));

    // ===== Volume =====
    const volume = await this.computeVolume(from, to, days, userId);

    // ===== Quality =====
    const quality = await this.computeQuality(from, to, userId);

    // ===== Discipline =====
    const discipline = await this.computeDiscipline(userId);

    // ===== Progression =====
    const progression = await this.computeProgression(from, to, userId);

    return { window, volume, quality, discipline, progression };
  }

  // --------------------------------------------------------------
  // Category computations. Each returns the 4-5 metrics the spec
  // called out plus `pct` where appropriate.
  // --------------------------------------------------------------

  private async computeVolume(
    from: Date,
    to: Date,
    days: number,
    userId?: string,
  ): Promise<Metric[]> {
    const actionableTypes = ['task', 'call', 'email', 'meeting', 'whatsapp'];
    const baseQb = this.actRepo
      .createQueryBuilder('a')
      .where('a.created_at BETWEEN :from AND :to', { from, to });
    if (userId) {
      baseQb.andWhere(
        '(a.assigned_to_id = :uid OR a.created_by_id = :uid)',
        { uid: userId },
      );
    }

    const contacts = await baseQb
      .clone()
      .andWhere('a.type IN (:...types)', { types: actionableTypes })
      .getCount();

    const all = await baseQb.clone().getCount();

    const followUps = await baseQb
      .clone()
      .andWhere('a.due_at IS NOT NULL')
      .andWhere('a.due_at > NOW()')
      .getCount();

    const meetings = await baseQb
      .clone()
      .andWhere('a.type = :t', { t: 'meeting' })
      .andWhere('a.status = :s', { s: 'completed' })
      .getCount();

    const demos = await baseQb
      .clone()
      .andWhere('a.subject ILIKE :p', { p: '%demo%' })
      .andWhere('a.status = :s', { s: 'completed' })
      .getCount();

    return [
      {
        key: 'contactsMade',
        label: 'Contacts made',
        value: contacts,
        target: 40 * days, // 40 contacts/rep/day default
      },
      {
        key: 'activitiesLogged',
        label: 'Activities logged',
        value: all,
      },
      {
        key: 'followUpsScheduled',
        label: 'Follow-ups scheduled',
        value: followUps,
      },
      { key: 'meetingsHeld', label: 'Meetings held', value: meetings },
      { key: 'demosHeld', label: 'Demos held', value: demos },
    ];
  }

  private async computeQuality(
    from: Date,
    to: Date,
    userId?: string,
  ): Promise<Metric[]> {
    const baseQb = this.actRepo
      .createQueryBuilder('a')
      .where('a.status = :s', { s: 'completed' })
      .andWhere('a.completed_at BETWEEN :from AND :to', { from, to });
    if (userId) {
      baseQb.andWhere(
        '(a.assigned_to_id = :uid OR a.created_by_id = :uid)',
        { uid: userId },
      );
    }

    const totalCompleted = await baseQb.clone().getCount();
    const withOutcome = await baseQb
      .clone()
      .andWhere('a.completion_outcome IS NOT NULL')
      .getCount();

    const pct = (num: number, denom: number) =>
      denom > 0 ? Math.round((num / denom) * 100) : 0;

    // Proposals sent = quotes transitioned to 'Sent' in window. Cheap:
    // count activities with subject pattern for now; upgrade to a
    // quotes-status query once that table has reliable timestamps.
    const proposalsSent = await baseQb
      .clone()
      .andWhere('a.subject ILIKE :p', { p: '%proposal%' })
      .getCount();

    return [
      {
        key: 'outcomeRecorded',
        label: '% with outcome recorded',
        value: pct(withOutcome, totalCompleted),
        target: 100,
        pct: pct(withOutcome, totalCompleted),
      },
      { key: 'totalCompleted', label: 'Completed activities', value: totalCompleted },
      { key: 'proposalsSent', label: 'Proposals sent', value: proposalsSent },
    ];
  }

  private async computeDiscipline(userId?: string): Promise<Metric[]> {
    // Leads / deals currently without an open actionable next step.
    // Uses NOT EXISTS rather than leftJoin+groupBy+having because
    // TypeORM's `getCount()` does not wrap a grouped query in an
    // outer COUNT, so the previous implementation returned 0 on
    // real data. Audit (Apr 2026) caught this in production.
    const leadQb = this.leadRepo
      .createQueryBuilder('l')
      .where('l.status NOT IN (:...term)', {
        term: ['Converted', 'Disqualified'],
      })
      .andWhere('l.deleted_at IS NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.lead_id = l.id
            AND a.status NOT IN ('completed','cancelled')
            AND a.completed_at IS NULL
            AND a.type IN ('task','call','email','meeting','whatsapp')
        )`,
      );
    if (userId) leadQb.andWhere('l.assigned_to = :uid', { uid: userId });
    const leadNoNextStep = await leadQb.getCount();

    const dealQb = this.dealRepo
      .createQueryBuilder('d')
      .where("d.close_status = 'ongoing'")
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.deal_id = d.id
            AND a.status NOT IN ('completed','cancelled')
            AND a.completed_at IS NULL
            AND a.type IN ('task','call','email','meeting','whatsapp')
        )`,
      );
    if (userId) dealQb.andWhere('d.assigned_to = :uid', { uid: userId });
    const dealNoNextStep = await dealQb.getCount();

    const overdue = await this.actRepo
      .createQueryBuilder('a')
      .where("a.status NOT IN ('completed','cancelled')")
      .andWhere('a.completed_at IS NULL')
      .andWhere('a.due_at < NOW()')
      .andWhere(userId ? 'a.assigned_to_id = :uid' : '1=1', { uid: userId })
      .getCount();

    const slaBreached = await this.leadRepo
      .createQueryBuilder('l')
      .where('l.sla_breached = true')
      .andWhere(userId ? 'l.assigned_to = :uid' : '1=1', { uid: userId })
      .getCount();

    return [
      {
        key: 'leadsNoNextStep',
        label: 'Leads with no next step',
        value: leadNoNextStep,
        target: 0,
      },
      {
        key: 'dealsNoNextStep',
        label: 'Deals with no next step',
        value: dealNoNextStep,
        target: 0,
      },
      { key: 'overdueFollowUps', label: 'Overdue follow-ups', value: overdue, target: 0 },
      { key: 'slaBreaches', label: 'Lead SLA breaches', value: slaBreached, target: 0 },
    ];
  }

  private async computeProgression(
    from: Date,
    to: Date,
    userId?: string,
  ): Promise<Metric[]> {
    // Leads qualified = leads whose status changed to Qualified in window.
    // Approximate via leads.updated_at + current status.
    const leadsQualified = await this.leadRepo
      .createQueryBuilder('l')
      .where('l.status = :s', { s: 'Qualified' })
      .andWhere('l.updated_at BETWEEN :from AND :to', { from, to })
      .andWhere(userId ? 'l.assigned_to = :uid' : '1=1', { uid: userId })
      .getCount();

    const dealsWon = await this.dealRepo
      .createQueryBuilder('d')
      .where("d.close_status = 'won'")
      .andWhere('d.actualCloseDate BETWEEN :from AND :to', { from, to })
      .andWhere(userId ? 'd.assigned_to = :uid' : '1=1', { uid: userId })
      .getCount();

    // Deals advanced — stage history rows in window. Forward-only not
    // filtered here; the history entity stores fromStatus/toStatus as
    // strings, so a stage-order lookup would be expensive. Reasonable
    // approximation for the widget.
    const dealsAdvanced = await this.stageHistRepo
      .createQueryBuilder('h')
      .where('h.movedAt BETWEEN :from AND :to', { from, to })
      .getCount();

    return [
      { key: 'leadsQualified', label: 'Leads qualified', value: leadsQualified },
      { key: 'dealsAdvanced', label: 'Deal stage moves', value: dealsAdvanced },
      { key: 'dealsWon', label: 'Deals won', value: dealsWon },
    ];
  }

  // --------------------------------------------------------------
  private range(w: MetricWindow): { from: Date; to: Date } {
    const now = new Date();
    const to = now;
    const from = new Date(now);
    switch (w) {
      case 'week':
        from.setDate(from.getDate() - 7);
        break;
      case 'mtd':
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        break;
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        from.setMonth(q * 3, 1);
        from.setHours(0, 0, 0, 0);
        break;
      }
      case 'year':
        from.setMonth(0, 1);
        from.setHours(0, 0, 0, 0);
        break;
    }
    return { from, to };
  }
}
