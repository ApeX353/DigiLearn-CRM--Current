import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { ComplianceSettingsService } from '../settings/compliance-settings.service';
import { Activity, ActivityType } from '../activities/entities/activity.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Deal, DealCloseStatus } from '../deals/entities/deal.entity';
import { DealStageHistory } from '../deals/entities/deal-stage-history.entity';
import { User } from '../users/entities/user.entity';
import {
  DashboardFiltersDto,
  type DateRangeType,
} from './dto/dashboard-filters.dto';

/**
 * Activity Discipline aggregation (dashboard).
 *
 * Returns a single bundled payload for the manager-grade Activity
 * Discipline section. One endpoint, one request — multiple concurrent
 * COUNTs against the same window so the dashboard paints in one round
 * trip.
 *
 * Why one service and one payload:
 *   - The dashboard already pays a cost per widget; a fresh N-query
 *     "discipline" widget per metric would be prohibitive for the 5+
 *     KPIs + per-rep leaderboard.
 *   - All the metrics share the same filter (date range, rep, province
 *     on leads) so the filter resolution only happens once.
 *   - The per-rep table needs the exact same counts as the top-line
 *     KPIs — computing them separately would invite drift.
 *
 * Notes never inflate discipline: any count named "actionable" or
 * "completion" here excludes `note` activities. The product rule is
 * that Notes are logging, not commitment.
 *
 * Overdue / no-next-step / stale states use point-in-time counts
 * (NOW() against the record's state) — they are NOT windowed by the
 * filter, because "there are 12 stale deals right now" doesn't change
 * when the user clicks QTD. Windowed metrics (contacts made, outcomes
 * recorded, demos held, deals won) DO respect the filter.
 */

const ACTIONABLE_TYPES = [
  ActivityType.TASK,
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.MEETING,
  ActivityType.WHATSAPP,
];

const CONTACT_TYPES = [
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.WHATSAPP,
  ActivityType.MEETING,
];

// Rep Discipline is a SALES scoreboard (TEST-BACKLOG #10/#11): only people who
// carry a sales book belong here — sales reps and the sales managers who sell
// (Kim, Manake, Tanya, Busi). Admins, admin_support and non-sales managers
// (SG Sithole, Nkululeko, Prince) must NOT appear.
const SALES_ROLES = ['sales_rep', 'sales_manager'];

// Threshold constants previously defined here (DEFAULT_DAILY_CONTACTS_TARGET,
// STALE_LEAD_DAYS, STALE_DEAL_DAYS) have moved to ComplianceSettingsService
// (Phase A.3). They are now read at compute time so admins can adjust them
// from Admin Settings → Compliance & Controls without a redeploy.

export interface DisciplineKpi {
  key: string;
  label: string;
  value: number;
  /** Denominator when the metric is a percentage (so the UI can show "12/48"). */
  denom?: number;
  /** 0–100 pct when relevant; same number as `value` for pct-typed metrics. */
  pct?: number;
  /** Target the metric SHOULD hit. Lets the UI colour good/bad. */
  target?: number;
  /** "higher-better" | "lower-better" — UI colouring cue. */
  tone: 'higher-better' | 'lower-better';
  hint?: string;
}

export interface ProgressionKpi {
  key: string;
  label: string;
  value: number;
  hint?: string;
}

export interface AtRiskItem {
  key: string;
  label: string;
  value: number;
  hint?: string;
}

export interface RepDisciplineRow {
  user_id: string;
  name: string;
  email: string | null;
  /** Contacts completed in the window (calls/emails/whatsapp/meetings). */
  contacts: number;
  /** All actionable activities completed in window. */
  completed: number;
  /** % of completed actionable activities with an outcome recorded. */
  outcome_pct: number;
  outcome_missing: number;
  /** % of completed actionable activities followed by a future actionable activity on the same lead/deal. */
  next_step_pct: number;
  /** Open actionable activities whose due date has passed. */
  overdue: number;
  /** Active leads/deals owned by this rep that currently have no open actionable next step. */
  no_next_step_records: number;
  deals_advanced: number;
  stale_records: number;
}

export interface ActivityDisciplineResponse {
  window: { start: string; end: string; range: DateRangeType };
  /**
   * Block-grouped KPIs. Each block is a separate array so the UI
   * renders them in manager-priority order with distinct headings.
   *
   *   prospecting — first-touch discipline (locked-to-today +
   *                 window-level SLA touch %)
   *   volume      — how much outreach actually happened in the window
   *   quality     — compliance % and counts-of-shame
   *
   * `progression` / `at_risk` / `reps` stay as their own fields
   * because their shape differs from the generic DisciplineKpi.
   */
  kpis: {
    prospecting: DisciplineKpi[];
    volume: DisciplineKpi[];
    quality: DisciplineKpi[];
  };
  progression: ProgressionKpi[];
  at_risk: AtRiskItem[];
  /** Per-rep discipline table. Scopes to filter.salesRepId when set. */
  reps: RepDisciplineRow[];
}

@Injectable()
export class ActivityDisciplineService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Deal) private readonly dealRepo: Repository<Deal>,
    @InjectRepository(DealStageHistory)
    private readonly stageHistRepo: Repository<DealStageHistory>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly compliance: ComplianceSettingsService,
  ) {}

  // =========================================================
  // Public entry
  // =========================================================

  async compute(
    filters: DashboardFiltersDto,
  ): Promise<ActivityDisciplineResponse> {
    const { start, end } = this.resolveRange(filters);
    const uid = filters.salesRepId;
    const days = Math.max(
      1,
      Math.ceil((+end - +start) / (24 * 60 * 60 * 1000)),
    );

    const [prospecting, volume, quality, progression, atRisk, reps] =
      await Promise.all([
        this.computeProspecting(start, end, uid),
        this.computeVolume(start, end, days, uid),
        this.computeQuality(start, end, uid),
        this.computeProgression(start, end, uid),
        this.computeAtRisk(uid),
        this.computeRepRows(start, end, uid),
      ]);

    return {
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        range: (filters.dateRange || 'mtd') as DateRangeType,
      },
      kpis: { prospecting, volume, quality },
      progression,
      at_risk: atRisk,
      reps,
    };
  }

  // =========================================================
  // Prospecting Discipline
  //
  // "First-time lead contact" = the FIRST actionable activity
  // (call/email/meeting/whatsapp/task) logged against a lead. Not a
  // repeat touch; not a note; not a school/account relationship
  // touch. The canonical source is `activities` — for each lead we
  // find the earliest actionable activity and count the leads whose
  // earliest one falls in the window.
  //
  // We expose two KPIs:
  //   1. first_time_contacts_today — locked to TODAY regardless of
  //      the dashboard filter, shown against a per-rep-per-day
  //      target. Mirrors the legacy "Leads Contacted vs Target"
  //      semantics but strictly limited to first touches.
  //   2. new_leads_sla_touch_pct   — among leads CREATED in the
  //      window whose SLA window has already come due, what % were
  //      touched in time? Uses the pre-computed `sla_breached` flag
  //      on the lead record.
  // =========================================================

  private async computeProspecting(
    start: Date,
    end: Date,
    uid?: string,
  ): Promise<DisciplineKpi[]> {
    // --- KPI 1: first-time lead contacts TODAY ----------------
    const firstTimeTodayQb = this.activityRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.lead_id)', 'c')
      .where('a.lead_id IS NOT NULL')
      .andWhere('a.type IN (:...types)', { types: CONTACT_TYPES })
      .andWhere("a.status = 'completed'")
      .andWhere('a.completed_at IS NOT NULL')
      .andWhere("a.completed_at::date = CURRENT_DATE")
      // "First-time" — no earlier completed contact on the same lead.
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM activities a2
          WHERE a2.lead_id = a.lead_id
            AND a2.type IN (:...types2)
            AND a2.status = 'completed'
            AND a2.completed_at IS NOT NULL
            AND a2.completed_at < a.completed_at
        )`,
        { types2: CONTACT_TYPES },
      );
    if (uid) {
      firstTimeTodayQb.andWhere(
        '(a.assigned_to_id = :u OR a.created_by_id = :u)',
        { u: uid },
      );
    }
    const firstTimeTodayRow = await firstTimeTodayQb.getRawOne<{ c: string }>();
    const firstTimeToday = Number(firstTimeTodayRow?.c ?? 0);

    // Target = compliance.daily_contacts_per_rep × active reps in scope.
    // Per-rep view uses the rep's own target; team view multiplies by
    // the headcount of active users so the expectation scales.
    // Settings-driven (Phase A.3) — admins tune the daily target
    // via Admin Settings → Compliance & Controls without a deploy.
    let repCount = 1;
    if (!uid) {
      const activeUsers = await this.userRepo
        .createQueryBuilder('u')
        .where('u.is_active = TRUE')
        .getCount();
      repCount = Math.max(1, activeUsers);
    }
    const perRepTarget = await this.compliance.getNumber(
      'daily_contacts_per_rep',
    );
    const dailyTarget = perRepTarget * repCount;

    // --- KPI 2: New Leads Touched Within SLA ------------------
    // Denominator: leads created in window whose SLA clock has come
    // due (i.e. they are either breached or already touched). Leads
    // whose SLA window is still open and uncontacted aren't counted
    // either way — they're pending, not compliant or non-compliant.
    const slaBaseQb = this.leadRepo
      .createQueryBuilder('l')
      .where('l.created_at BETWEEN :s AND :e', { s: start, e: end });
    if (uid) slaBaseQb.andWhere('l.assigned_to = :u', { u: uid });

    const [slaCompliant, slaBreached, slaPending] = await Promise.all([
      slaBaseQb
        .clone()
        .andWhere('l.last_contacted_at IS NOT NULL')
        .andWhere('l.sla_breached = FALSE')
        .getCount(),
      slaBaseQb.clone().andWhere('l.sla_breached = TRUE').getCount(),
      slaBaseQb
        .clone()
        .andWhere('l.last_contacted_at IS NULL')
        .andWhere('l.sla_breached = FALSE')
        .getCount(),
    ]);

    const slaDue = slaCompliant + slaBreached;
    const slaPct = slaDue > 0 ? Math.round((slaCompliant / slaDue) * 100) : 0;

    return [
      {
        key: 'first_time_contacts_today',
        label: 'Leads Contacted vs Target',
        value: firstTimeToday,
        denom: dailyTarget,
        target: dailyTarget,
        tone: 'higher-better',
        hint: 'First-time lead contacts made today vs required daily target',
      },
      {
        key: 'new_leads_sla_touch_pct',
        label: 'New Leads Touched Within SLA',
        value: slaPct,
        denom: slaDue,
        pct: slaPct,
        target: 100,
        tone: 'higher-better',
        hint:
          slaPending > 0
            ? `${slaPending} new leads still within their SLA window`
            : '% of new leads contacted before SLA breach',
      },
    ];
  }

  // =========================================================
  // Volume
  // =========================================================

  private async computeVolume(
    start: Date,
    end: Date,
    days: number,
    uid?: string,
  ): Promise<DisciplineKpi[]> {
    const base = this.activityRepo
      .createQueryBuilder('a')
      .where('a.created_at BETWEEN :s AND :e', { s: start, e: end });
    if (uid) {
      base.andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', {
        u: uid,
      });
    }

    // Total Outreach Actions — ALL actionable activities touched in
    // the window across every record type (leads, deals, schools,
    // contacts). Includes first-time AND follow-up touches. Notes
    // are excluded because they're logging, not outreach.
    //
    // Completed Actionable Activities — subset: actionables that
    // actually TRANSITIONED to 'completed' in the window. Uses
    // `completed_at` (not `created_at`) so it aligns exactly with
    // the outcome-compliance denominator in Quality below. An
    // activity created weeks ago but completed this week counts
    // here; an activity created this week but not yet completed
    // does not.
    //
    // Meetings Held & Demos Held — both require type='meeting'
    // explicitly; a task or email with "demo" in its subject is
    // not a demo being held. Seed data with "[DEMO]" prefixes
    // previously over-reported demos by ~10x.
    const completedBase = this.activityRepo
      .createQueryBuilder('a')
      .where('a.completed_at BETWEEN :s AND :e', { s: start, e: end })
      .andWhere("a.status = 'completed'");
    if (uid) {
      completedBase.andWhere(
        '(a.assigned_to_id = :u OR a.created_by_id = :u)',
        { u: uid },
      );
    }

    const [
      totalOutreach,
      completedActionable,
      followUpsScheduled,
      meetings,
      demos,
    ] = await Promise.all([
      base
        .clone()
        .andWhere('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
        .getCount(),
      completedBase
        .clone()
        .andWhere('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
        .getCount(),
      base
        .clone()
        .andWhere('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
        .andWhere("a.status NOT IN ('completed','cancelled')")
        .andWhere('a.due_at > NOW()')
        .getCount(),
      completedBase.clone().andWhere("a.type = 'meeting'").getCount(),
      // Demos held: completed DEMO_DELIVERY activities. Replaced the
      // previous brittle `subject ILIKE '%demo%'` predicate which
      // overcounted ~10× on seed data with "[DEMO]" subject prefixes
      // and missed any demo activity whose subject didn't include
      // the literal word "demo".
      completedBase.clone().andWhere("a.type = 'demo_delivery'").getCount(),
    ]);

    // Void the now-unused `days` param — kept in the signature for
    // callsite symmetry with other compute* methods.
    void days;

    return [
      {
        key: 'total_outreach',
        label: 'Total Outreach Actions',
        value: totalOutreach,
        tone: 'higher-better',
        hint: 'All sales touches logged across leads, deals, schools & contacts',
      },
      {
        key: 'completed_actionables',
        label: 'Completed Actionable Activities',
        value: completedActionable,
        tone: 'higher-better',
        hint: 'Completed calls, meetings, tasks, emails, WhatsApps. Notes excluded.',
      },
      {
        key: 'follow_ups_scheduled',
        label: 'Follow-Ups Scheduled',
        value: followUpsScheduled,
        tone: 'higher-better',
        hint: 'Actionables planned with a future due date',
      },
      {
        key: 'meetings_held',
        label: 'Meetings Held',
        value: meetings,
        tone: 'higher-better',
      },
      {
        key: 'demos_held',
        label: 'Demos Held',
        value: demos,
        tone: 'higher-better',
      },
    ];
  }

  // =========================================================
  // Quality / Compliance
  // =========================================================

  private async computeQuality(
    start: Date,
    end: Date,
    uid?: string,
  ): Promise<DisciplineKpi[]> {
    // Completed actionable activities in window.
    const cbase = this.activityRepo
      .createQueryBuilder('a')
      .where('a.completed_at BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
      .andWhere("a.status = 'completed'");
    if (uid) {
      cbase.andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', {
        u: uid,
      });
    }

    const [completed, withOutcome, nextStepCompliant] = await Promise.all([
      cbase.clone().getCount(),
      cbase.clone().andWhere('a.completion_outcome IS NOT NULL').getCount(),
      // Next-step compliance: for every completed actionable activity,
      // did the same lead_id/deal_id receive another actionable activity
      // AFTER the completion? A cheap existence subquery against
      // lead_id OR deal_id avoids building a reverse index.
      cbase
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
    ]);

    // Point-in-time (NOT windowed) — tells management what the
    // pipeline currently looks like regardless of window.
    const overdueQ = this.activityRepo
      .createQueryBuilder('a')
      .where('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
      .andWhere("a.status NOT IN ('completed','cancelled')")
      .andWhere('a.completed_at IS NULL')
      .andWhere('a.due_at < NOW()');
    if (uid) {
      overdueQ.andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', {
        u: uid,
      });
    }
    const overdue = await overdueQ.getCount();

    const [leadsNoNextStep, dealsNoNextStep] = await Promise.all([
      this.countLeadsWithNoNextStep(uid),
      this.countDealsWithNoNextStep(uid),
    ]);

    const outcomePct = completed ? Math.round((withOutcome / completed) * 100) : 0;
    const nextStepPct = completed
      ? Math.round((nextStepCompliant / completed) * 100)
      : 0;

    // Settings-driven compliance targets (Phase A.3) — admins can
    // dial them up/down per-org without a deploy.
    const outcomeTarget = await this.compliance.getNumber(
      'outcome_compliance_target',
    );
    const nextStepTarget = await this.compliance.getNumber(
      'next_step_compliance_target',
    );

    return [
      {
        key: 'outcome_pct',
        label: 'Outcome compliance',
        value: outcomePct,
        denom: completed,
        pct: outcomePct,
        target: outcomeTarget,
        tone: 'higher-better',
        hint: 'Completed activities with an outcome recorded',
      },
      {
        key: 'next_step_pct',
        label: 'Next-step compliance',
        value: nextStepPct,
        denom: completed,
        pct: nextStepPct,
        target: nextStepTarget,
        tone: 'higher-better',
        hint: 'Completions followed by a scheduled next actionable activity',
      },
      {
        key: 'overdue',
        label: 'Overdue follow-ups',
        value: overdue,
        target: 0,
        tone: 'lower-better',
        hint: 'Open actionable activities past due',
      },
      {
        key: 'leads_no_next_step',
        label: 'Active leads with no next step',
        value: leadsNoNextStep,
        target: 0,
        tone: 'lower-better',
      },
      {
        key: 'deals_no_next_step',
        label: 'Active deals with no next step',
        value: dealsNoNextStep,
        target: 0,
        tone: 'lower-better',
      },
      {
        key: 'outcome_missing',
        label: 'Completions missing outcome',
        value: Math.max(0, completed - withOutcome),
        target: 0,
        tone: 'lower-better',
      },
    ];
  }

  // =========================================================
  // Progression
  // =========================================================

  private async computeProgression(
    start: Date,
    end: Date,
    uid?: string,
  ): Promise<ProgressionKpi[]> {
    // `leads_contacted` was removed from Progression because it's
    // now the dedicated "Leads Contacted vs Target" card in the
    // Prospecting Discipline block (with the stricter first-time-
    // contact definition). Keeping it here would double-count.
    const leadsQualifiedQ = this.leadRepo
      .createQueryBuilder('l')
      .where('l.status = :q', { q: 'Qualified' })
      .andWhere('l.updated_at BETWEEN :s AND :e', { s: start, e: end });
    if (uid) leadsQualifiedQ.andWhere('l.assigned_to = :u', { u: uid });

    const dealsWonQ = this.dealRepo
      .createQueryBuilder('d')
      .where('d.close_status = :won', { won: DealCloseStatus.WON })
      .andWhere('d.actualCloseDate BETWEEN :s AND :e', { s: start, e: end });
    if (uid) dealsWonQ.andWhere('d.assigned_to = :u', { u: uid });

    const stageMovesQ = this.stageHistRepo
      .createQueryBuilder('h')
      .where('h.movedAt BETWEEN :s AND :e', { s: start, e: end });

    // Demos Booked — DEMO_BOOKING activities CREATED in the period
    // (i.e. booked, not necessarily held). The legacy detection used
    // `subject ILIKE '%demo%'` on meeting activities and overcounted
    // ~11× on seed data with "[DEMO]" prefixes; the explicit type
    // is correct without prefix games.
    const demosBookedQ = this.activityRepo
      .createQueryBuilder('a')
      .where('a.created_at BETWEEN :s AND :e', { s: start, e: end })
      .andWhere("a.type = 'demo_booking'");
    if (uid) {
      demosBookedQ.andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', {
        u: uid,
      });
    }

    // Quotes / Proposals Sent — completed activities whose subject
    // mentions "quote" OR whose captured outcome is `proposal_sent`.
    // The OR MUST be wrapped in a Brackets() — otherwise the
    // generated SQL reads as
    //     completed_at∈window AND status='completed' AND subject ILIKE '…'
    //     OR completion_outcome='proposal_sent'
    // which OR-collapses everything and returns every
    // proposal_sent row regardless of date or status.
    const quotesSentQ = this.activityRepo
      .createQueryBuilder('a')
      .where('a.completed_at BETWEEN :s AND :e', { s: start, e: end })
      .andWhere("a.status = 'completed'")
      .andWhere(
        new Brackets((qb) =>
          qb
            .where('a.subject ILIKE :p', { p: '%quote%' })
            .orWhere('a.completion_outcome = :po', { po: 'proposal_sent' }),
        ),
      );
    if (uid) {
      quotesSentQ.andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', {
        u: uid,
      });
    }

    const [leadsQualified, stageMoves, demosBooked, quotesSent, dealsWon] =
      await Promise.all([
        leadsQualifiedQ.getCount(),
        stageMovesQ.getCount(),
        demosBookedQ.getCount(),
        quotesSentQ.getCount(),
        dealsWonQ.getCount(),
      ]);

    return [
      {
        key: 'leads_qualified',
        label: 'Leads Qualified',
        value: leadsQualified,
        hint: 'Leads advanced to Qualified status in period',
      },
      {
        key: 'demos_booked',
        label: 'Demos Booked',
        value: demosBooked,
        hint: 'Demo activities created in period',
      },
      {
        key: 'quotes_sent',
        label: 'Quotes / Proposals Sent',
        value: quotesSent,
        hint: 'Activities closed with a proposal-sent outcome or quote subject',
      },
      {
        key: 'deals_advanced',
        label: 'Deals Progressed',
        value: stageMoves,
        hint: 'Deal stage advances recorded in period',
      },
      {
        key: 'deals_won',
        label: 'Deals Won',
        value: dealsWon,
        hint: 'Deals closed-won in period',
      },
    ];
  }

  // =========================================================
  // At-Risk (point-in-time)
  // =========================================================

  private async computeAtRisk(uid?: string): Promise<AtRiskItem[]> {
    // Settings-driven thresholds (Phase A.3) — admins tune via
    // Admin Settings → Compliance & Controls. Cached 30s in
    // ComplianceSettingsService so this isn't a per-request DB hit.
    const staleLeadDays = Math.round(
      await this.compliance.getNumber('stale_lead_days'),
    );
    const staleDealDays = Math.round(
      await this.compliance.getNumber('stale_deal_days'),
    );

    // Stale leads — active (non-terminal) leads whose last meaningful
    // action happened more than `staleLeadDays` ago.
    const staleLeadsQ = this.leadRepo
      .createQueryBuilder('l')
      .where('l.status NOT IN (:...term)', {
        term: ['Converted', 'Disqualified'],
      })
      .andWhere(
        `COALESCE(l.last_action_at, l.last_contacted_at, l.created_at)
         < (NOW() - INTERVAL '${staleLeadDays} days')`,
      );
    if (uid) staleLeadsQ.andWhere('l.assigned_to = :u', { u: uid });

    // Stale deals — ongoing deals with no actionable activity in the
    // last `staleDealDays` days (or none ever). Uses NOT EXISTS
    // for the same reason `countLeadsWithNoNextStep` was rewritten:
    // TypeORM's `getCount()` cannot combine with GROUP BY + HAVING
    // without silently returning 0.
    const staleDealsQ = this.dealRepo
      .createQueryBuilder('d')
      .where("d.close_status = 'ongoing'")
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.deal_id = d.id
            AND a.type IN ('task','call','email','meeting','whatsapp')
            AND COALESCE(a.completed_at, a.created_at)
              >= (NOW() - INTERVAL '${staleDealDays} days')
        )`,
      );
    if (uid) staleDealsQ.andWhere('d.assigned_to = :u', { u: uid });

    const slaBreachedQ = this.leadRepo
      .createQueryBuilder('l')
      .where('l.sla_breached = TRUE');
    if (uid) slaBreachedQ.andWhere('l.assigned_to = :u', { u: uid });

    const [staleLeads, staleDeals, slaBreached] = await Promise.all([
      staleLeadsQ.getCount(),
      staleDealsQ.getCount(),
      slaBreachedQ.getCount(),
    ]);

    return [
      {
        key: 'stale_leads',
        label: 'Stale leads',
        value: staleLeads,
        hint: `No meaningful touch in ${staleLeadDays}+ days`,
      },
      {
        key: 'stale_deals',
        label: 'Stale deals',
        value: staleDeals,
        hint: `No actionable activity in ${staleDealDays}+ days`,
      },
      {
        key: 'sla_breached',
        label: 'Leads SLA breached',
        value: slaBreached,
      },
    ];
  }

  // =========================================================
  // Per-rep table
  // =========================================================

  private async computeRepRows(
    start: Date,
    end: Date,
    uid?: string,
  ): Promise<RepDisciplineRow[]> {
    // Get candidate users (active, scoped to filter if given).
    // Sales scoreboard only: active users who hold a sales role. We select
    // them with an IN-subquery on the roles relation rather than
    // leftJoinAndSelect + a JS filter. A to-many join combined with .take()
    // makes TypeORM paginate via a distinct-id subquery whose row order is
    // undefined; the entity transformer then hydrates `roles` as an empty
    // array for some rows, so the JS filter silently dropped EVERYONE on the
    // team view (the single-rep view happened to survive). The subquery has
    // no such dependency and is deterministic regardless of take().
    const usersQb = this.userRepo
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
      .setParameter('salesRoles', SALES_ROLES);
    if (uid) usersQb.andWhere('u.id = :uid', { uid });
    // Limit the table width — team views are naturally capped at ~30
    // reps in this product, take 50 for safety.
    usersQb.take(50);
    const users = await usersQb.getMany();

    if (users.length === 0) return [];

    // Batch-compute per user in parallel. We keep each count query
    // tight and indexed so 30 reps stay under 200 ms total.
    const rows = await Promise.all(
      users.map((u) => this.repRow(u, start, end)),
    );

    // Sort by a composite discipline signal: overdue desc, outcome_pct
    // asc. Biggest offenders first, which is what managers scan for.
    return rows.sort(
      (a, b) =>
        b.overdue - a.overdue ||
        a.outcome_pct - b.outcome_pct ||
        b.no_next_step_records - a.no_next_step_records,
    );
  }

  private async repRow(
    user: User,
    start: Date,
    end: Date,
  ): Promise<RepDisciplineRow> {
    const uid = user.id;

    const completedBase = this.activityRepo
      .createQueryBuilder('a')
      .where('a.completed_at BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('a.type IN (:...types)', { types: ACTIONABLE_TYPES })
      .andWhere("a.status = 'completed'")
      .andWhere('(a.assigned_to_id = :u OR a.created_by_id = :u)', { u: uid });

    const [contacts, completed, withOutcome, nextStepCompliant, overdue] =
      await Promise.all([
        this.activityRepo
          .createQueryBuilder('a')
          .where('a.completed_at BETWEEN :s AND :e', { s: start, e: end })
          .andWhere('a.type IN (:...types)', { types: CONTACT_TYPES })
          .andWhere("a.status = 'completed'")
          .andWhere('a.completed_at IS NOT NULL')
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

    // No-next-step records owned by this rep (leads + deals combined).
    const [leadsNoNext, dealsNoNext] = await Promise.all([
      this.countLeadsWithNoNextStep(uid),
      this.countDealsWithNoNextStep(uid),
    ]);

    const dealsAdvanced = await this.stageHistRepo
      .createQueryBuilder('h')
      .where('h.movedAt BETWEEN :s AND :e', { s: start, e: end })
      .innerJoin(Deal, 'd', 'd.id = h.deal_id')
      .andWhere('d.assigned_to = :u', { u: uid })
      .getCount();

    const staleLeadDays = Math.round(
      await this.compliance.getNumber('stale_lead_days'),
    );
    const staleLeads = await this.leadRepo
      .createQueryBuilder('l')
      .where('l.status NOT IN (:...term)', {
        term: ['Converted', 'Disqualified'],
      })
      .andWhere('l.assigned_to = :u', { u: uid })
      .andWhere(
        `COALESCE(l.last_action_at, l.last_contacted_at, l.created_at)
         < (NOW() - INTERVAL '${staleLeadDays} days')`,
      )
      .getCount();

    const outcome_pct = completed
      ? Math.round((withOutcome / completed) * 100)
      : 0;
    const next_step_pct = completed
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
      outcome_pct,
      outcome_missing: Math.max(0, completed - withOutcome),
      next_step_pct,
      overdue,
      no_next_step_records: leadsNoNext + dealsNoNext,
      deals_advanced: dealsAdvanced,
      stale_records: staleLeads,
    };
  }

  // =========================================================
  // Shared predicates
  // =========================================================

  // NOTE: the previous implementations used
  //   leftJoin(activities) + groupBy(l.id) + having(COUNT(a.id)=0) + getCount()
  // which TypeORM serialises as `SELECT COUNT(1) ... GROUP BY ... HAVING ...`
  // without wrapping in a subquery. That produces one row per group
  // and `getCount()` returns 0 (or a misleading first-group count).
  // Audit (Apr 2026) showed `leads_no_next_step` coming back as 0
  // when the database actually had 20 such leads. Rewritten to
  // use `NOT EXISTS`, which is both correct and cheaper.

  private async countLeadsWithNoNextStep(uid?: string): Promise<number> {
    const qb = this.leadRepo
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
    if (uid) qb.andWhere('l.assigned_to = :u', { u: uid });
    return qb.getCount();
  }

  private async countDealsWithNoNextStep(uid?: string): Promise<number> {
    const qb = this.dealRepo
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
    if (uid) qb.andWhere('d.assigned_to = :u', { u: uid });
    return qb.getCount();
  }

  private resolveRange(f: DashboardFiltersDto): { start: Date; end: Date } {
    const now = new Date();
    const end = this.endOfDay(now);
    const range = (f.dateRange || 'mtd') as DateRangeType;
    switch (range) {
      case 'today':
        return { start: this.startOfDay(now), end };
      case 'wtd': {
        // Week-to-date, week starts Monday (Zimbabwe convention).
        const day = now.getDay(); // 0=Sun..6=Sat
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
