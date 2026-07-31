import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Activity, ActivityType } from '../activities/entities/activity.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Deal, DealCloseStatus } from '../deals/entities/deal.entity';
import { LeadReversalRequest } from '../leads/entities/lead-reversal-request.entity';
import { User } from '../users/entities/user.entity';
import { ComplianceSettingsService } from '../settings/compliance-settings.service';
import {
  DashboardFiltersDto,
  type DateRangeType,
} from './dto/dashboard-filters.dto';

/**
 * Phase E — Compliance Report.
 *
 * Aggregates org + per-rep compliance scoring against the very same
 * thresholds Phase A.3 made admin-tunable. The dashboard's Activity
 * Discipline cards already render these numbers in real time; this
 * service produces a different shape: a print-friendly per-period
 * report covering every rep with per-row pass/fail vs target. Used
 * by the new Compliance Report admin page (and CSV export).
 */

const ACTIONABLE_TYPES: ActivityType[] = [
  ActivityType.TASK,
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.MEETING,
  ActivityType.WHATSAPP,
];

// Compliance scoring is a SALES report (TEST-BACKLOG #15/#11): score only the
// people who carry a sales book. Admins/admin_support/non-sales managers must
// not appear or skew the org totals.
const SALES_ROLES = ['sales_rep', 'sales_manager'];

export interface ComplianceReportRepRow {
  user_id: string;
  name: string;
  email: string | null;
  contacts: number; // first-time contacts in window
  completed: number; // completed actionable activities in window
  with_outcome: number;
  outcome_pct: number;
  next_step_compliant: number;
  next_step_pct: number;
  overdue: number;
  stale_leads: number;
  passes_outcome: boolean;
  passes_next_step: boolean;
}

export interface ComplianceReportResponse {
  window: { start: string; end: string; range: DateRangeType };
  thresholds: {
    outcome_target_pct: number;
    next_step_target_pct: number;
    daily_contacts_per_rep: number;
    stale_lead_days: number;
    stale_deal_days: number;
  };
  totals: {
    completed: number;
    with_outcome: number;
    outcome_pct: number;
    next_step_compliant: number;
    next_step_pct: number;
    overdue: number;
    stale_leads: number;
    pending_approvals: {
      tactical_disqualify: number;
      reassignment: number;
      status_reversal: number;
    };
  };
  reps: ComplianceReportRepRow[];
}

@Injectable()
export class ComplianceReportService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Deal) private readonly dealRepo: Repository<Deal>,
    @InjectRepository(LeadReversalRequest)
    private readonly reversalRepo: Repository<LeadReversalRequest>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly compliance: ComplianceSettingsService,
  ) {}

  async compute(
    filters: DashboardFiltersDto,
  ): Promise<ComplianceReportResponse> {
    const { start, end } = this.resolveRange(filters);

    const [
      outcomeTargetPct,
      nextStepTargetPct,
      dailyContactsPerRep,
      staleLeadDays,
      staleDealDays,
    ] = await Promise.all([
      this.compliance.getNumber('outcome_compliance_target'),
      this.compliance.getNumber('next_step_compliance_target'),
      this.compliance.getNumber('daily_contacts_per_rep'),
      this.compliance.getNumber('stale_lead_days'),
      this.compliance.getNumber('stale_deal_days'),
    ]);

    // Sales scoreboard only — select active users holding a sales role via
    // an IN-subquery on the roles relation. Avoids the leftJoinAndSelect +
    // .take() pagination trap where a to-many join makes TypeORM hydrate
    // `roles` as an empty array for some rows, silently dropping reps
    // (see activity-discipline.service for the full write-up).
    const users = await this.userRepo
      .createQueryBuilder('u')
      .where('u.is_active = TRUE')
      .andWhere((qb) => {
        const sub = qb
          .subQuery()
          .select('su.id')
          .from(User, 'su')
          .innerJoin('su.roles', 'sr')
          .where('sr.name IN (:...salesRoles)')
          .getQuery();
        return `u.id IN ${sub}`;
      })
      .setParameter('salesRoles', SALES_ROLES)
      .take(200)
      .getMany();

    const reps = await Promise.all(
      users.map((u) =>
        this.repRow(u, start, end, outcomeTargetPct, nextStepTargetPct, staleLeadDays),
      ),
    );

    // Org totals — sum the rep rows so the header agrees with the table.
    const totals = reps.reduce(
      (acc, r) => {
        acc.completed += r.completed;
        acc.with_outcome += r.with_outcome;
        acc.next_step_compliant += r.next_step_compliant;
        acc.overdue += r.overdue;
        acc.stale_leads += r.stale_leads;
        return acc;
      },
      {
        completed: 0,
        with_outcome: 0,
        next_step_compliant: 0,
        overdue: 0,
        stale_leads: 0,
      },
    );

    const outcomePct = totals.completed
      ? Math.round((totals.with_outcome / totals.completed) * 100)
      : 0;
    const nextStepPct = totals.completed
      ? Math.round((totals.next_step_compliant / totals.completed) * 100)
      : 0;

    const [tacticalPending, reassignPending, statusPending] = await Promise.all([
      this.reversalRepo.count({
        where: { status: 'pending', kind: 'tactical_disqualify' },
      }),
      this.reversalRepo.count({
        where: { status: 'pending', kind: 'reassignment' },
      }),
      this.reversalRepo.count({
        where: { status: 'pending', kind: 'status_reversal' },
      }),
    ]);

    return {
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        range: (filters.dateRange || 'mtd') as DateRangeType,
      },
      thresholds: {
        outcome_target_pct: outcomeTargetPct,
        next_step_target_pct: nextStepTargetPct,
        daily_contacts_per_rep: dailyContactsPerRep,
        stale_lead_days: Math.round(staleLeadDays),
        stale_deal_days: Math.round(staleDealDays),
      },
      totals: {
        completed: totals.completed,
        with_outcome: totals.with_outcome,
        outcome_pct: outcomePct,
        next_step_compliant: totals.next_step_compliant,
        next_step_pct: nextStepPct,
        overdue: totals.overdue,
        stale_leads: totals.stale_leads,
        pending_approvals: {
          tactical_disqualify: tacticalPending,
          reassignment: reassignPending,
          status_reversal: statusPending,
        },
      },
      reps: reps.sort(
        (a, b) =>
          a.outcome_pct - b.outcome_pct ||
          a.next_step_pct - b.next_step_pct ||
          b.overdue - a.overdue,
      ),
    };
  }

  private async repRow(
    user: User,
    start: Date,
    end: Date,
    outcomeTargetPct: number,
    nextStepTargetPct: number,
    staleLeadDays: number,
  ): Promise<ComplianceReportRepRow> {
    const uid = user.id;

    const completedBase = this.activityRepo
      .createQueryBuilder('a')
      .where('a.completed_at BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
      .andWhere("a.status = 'completed'")
      .andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', { u: uid });

    const [contacts, completed, withOutcome, nextStepCompliant, overdue] =
      await Promise.all([
        // First-time contacts in window
        this.activityRepo
          .createQueryBuilder('a')
          .where('a.lead_id IS NOT NULL')
          .andWhere('a.completed_at BETWEEN :s AND :e', { s: start, e: end })
          .andWhere("a.status = 'completed'")
          .andWhere('a.completed_at IS NOT NULL')
          .andWhere('a.type IN (:...types)', {
            types: [
              ActivityType.CALL,
              ActivityType.EMAIL,
              ActivityType.WHATSAPP,
              ActivityType.MEETING,
            ],
          })
          .andWhere(
            `NOT EXISTS (
              SELECT 1 FROM activities a2
              WHERE a2.lead_id = a.lead_id
                AND a2.type IN ('call','email','whatsapp','meeting')
                AND a2.status = 'completed'
                AND a2.completed_at IS NOT NULL
                AND a2.completed_at < a.completed_at
            )`,
          )
          .andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', {
            u: uid,
          })
          .getCount(),
        completedBase.clone().getCount(),
        completedBase
          .clone()
          .andWhere('a.completion_outcome IS NOT NULL')
          .getCount(),
        completedBase
          .clone()
          .andWhere(
            `EXISTS (
              SELECT 1 FROM activities n
              WHERE n.type IN (:...nsTypes)
                AND (
                  (a.lead_id IS NOT NULL AND n.lead_id = a.lead_id)
                  OR (a.deal_id IS NOT NULL AND n.deal_id = a.deal_id)
                )
                AND n.id <> a.id
                AND n.created_at >= a.completed_at
                AND n.status NOT IN ('completed','cancelled')
                AND n.completed_at IS NULL
                AND (n.due_at IS NULL OR n.due_at >= a.completed_at)
            )`,
            { nsTypes: ACTIONABLE_TYPES },
          )
          .getCount(),
        this.activityRepo
          .createQueryBuilder('a')
          .where('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
          .andWhere("a.status NOT IN ('completed','cancelled')")
          .andWhere('a.completed_at IS NULL')
          .andWhere('a.due_at < NOW()')
          .andWhere('a.assigned_to_id = :u', { u: uid })
          .getCount(),
      ]);

    const staleLeads = await this.leadRepo
      .createQueryBuilder('l')
      .where('l.status NOT IN (:...term)', {
        term: ['Converted', 'Disqualified'],
      })
      .andWhere('l.assigned_to = :u', { u: uid })
      .andWhere(
        `COALESCE(l.last_action_at, l.last_contacted_at, l.created_at)
         < (NOW() - INTERVAL '${Math.round(staleLeadDays)} days')`,
      )
      .getCount();

    const outcomePct = completed
      ? Math.round((withOutcome / completed) * 100)
      : 0;
    const nextStepPct = completed
      ? Math.round((nextStepCompliant / completed) * 100)
      : 0;

    return {
      user_id: uid,
      name:
        [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
        user.email ||
        'Unnamed',
      email: user.email ?? null,
      contacts,
      completed,
      with_outcome: withOutcome,
      outcome_pct: outcomePct,
      next_step_compliant: nextStepCompliant,
      next_step_pct: nextStepPct,
      overdue,
      stale_leads: staleLeads,
      passes_outcome: completed === 0 ? true : outcomePct >= outcomeTargetPct,
      passes_next_step:
        completed === 0 ? true : nextStepPct >= nextStepTargetPct,
    };
  }

  private resolveRange(f: DashboardFiltersDto): { start: Date; end: Date } {
    const now = new Date();
    const end = this.endOfDay(now);
    const range = (f.dateRange || 'mtd') as DateRangeType;
    switch (range) {
      case 'today':
        return { start: this.startOfDay(now), end };
      case 'wtd': {
        const day = now.getDay();
        const backToMonday = (day + 6) % 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - backToMonday);
        return { start: this.startOfDay(monday), end };
      }
      case 'mtd':
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
      case 'qtd': {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        return { start: new Date(now.getFullYear(), qm, 1), end };
      }
      case 'ytd':
        return { start: new Date(now.getFullYear(), 0, 1), end };
      case 'custom':
        return {
          start: f.startDate
            ? new Date(f.startDate)
            : new Date(now.getFullYear(), now.getMonth(), 1),
          end: f.endDate ? new Date(f.endDate) : end,
        };
      default:
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    }
  }
  private startOfDay(d: Date): Date {
    const n = new Date(d);
    n.setHours(0, 0, 0, 0);
    return n;
  }
  private endOfDay(d: Date): Date {
    const n = new Date(d);
    n.setHours(23, 59, 59, 999);
    return n;
  }
}
