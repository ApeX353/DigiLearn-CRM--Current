import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * Typed accessor + seeder for the Compliance & Controls settings
 * surface (Phase A.3 of the compliance hardening plan).
 *
 * Why a dedicated service:
 * - The 11 thresholds were hard-coded across `dashboard.service.ts`,
 *   `activity-discipline.service.ts`, `lead-qualification.service.ts`,
 *   etc. Replacing them with per-call `settingsService.getSetting`
 *   would scatter the same fallback / coercion logic everywhere.
 * - Centralised here, every consumer reads the SAME value with the
 *   SAME fallback, and the admin UI writes through the SAME setter.
 *
 * Defaults match the constants the code shipped with so behaviour is
 * preserved on first deployment. The seeder runs once on boot to
 * populate `app_settings` rows for every key — that way the admin
 * UI can render the form even on a brand-new database.
 */

export const COMPLIANCE_CATEGORY = 'compliance';

/**
 * Single source of truth for every Compliance & Controls knob. Keep
 * this list in sync with the admin tab UI (`compliance-controls-content.tsx`).
 */
export const COMPLIANCE_SETTINGS = {
  daily_contacts_per_rep: {
    key: 'compliance.targets.daily_contacts_per_rep',
    type: 'number' as const,
    default: 40,
    label: 'Daily contacts target per rep',
    description:
      'How many first-time / outreach actionable activities each rep is expected to log per day. Drives the dashboard "Leads Contacted vs Target" card.',
  },
  // DISC2: managers carry their own (lower) daily target — they sell less
  // than a full-time rep. Default 10 vs a rep's 40.
  daily_contacts_per_manager: {
    key: 'compliance.targets.daily_contacts_per_manager',
    type: 'number' as const,
    default: 10,
    label: 'Daily contacts target per manager',
    description:
      'How many outreach actionable activities each sales MANAGER is expected to log per day. Managers get a lower target than reps (default 10 vs 40).',
  },
  stale_lead_days: {
    key: 'compliance.thresholds.stale_lead_days',
    type: 'number' as const,
    default: 14,
    label: 'Stale lead threshold (days)',
    description:
      'A lead with no meaningful touch for this many days is flagged as stale on the dashboard intervention block.',
  },
  stale_deal_days: {
    key: 'compliance.thresholds.stale_deal_days',
    type: 'number' as const,
    default: 21,
    label: 'Stale deal threshold (days)',
    description:
      'An ongoing deal with no actionable activity for this many days is flagged as stale.',
  },
  monthly_revenue_target: {
    key: 'compliance.targets.monthly_revenue',
    type: 'number' as const,
    default: 100_000,
    label: 'Monthly revenue target ($)',
    description:
      'Drives Pipeline Coverage on Funnel Health and the Executive KPIs.',
  },
  expected_win_rate: {
    key: 'compliance.thresholds.expected_win_rate',
    type: 'number' as const,
    default: 0.25,
    label: 'Expected win rate (0–1)',
    description:
      'Multiplier used to compute required pipeline value from revenue target.',
  },
  high_value_threshold: {
    key: 'compliance.thresholds.high_value_deal',
    type: 'number' as const,
    default: 20_000,
    label: 'High-value deal threshold ($)',
    description: 'Deals at or above this value land on the High-Value Deals widget.',
  },
  qualification_score_min: {
    key: 'compliance.thresholds.qualification_score',
    type: 'number' as const,
    default: 80,
    label: 'Qualification score required',
    description:
      'BANT-derived qualification score (0–100) at or above which a lead is considered Qualified.',
  },
  outcome_compliance_target: {
    key: 'compliance.targets.outcome_compliance_pct',
    type: 'number' as const,
    default: 95,
    label: 'Outcome compliance target (%)',
    description:
      '% of completed actionable activities expected to carry an outcome. Drives the Outcome Compliance card.',
  },
  next_step_compliance_target: {
    key: 'compliance.targets.next_step_compliance_pct',
    type: 'number' as const,
    default: 80,
    label: 'Next-step compliance target (%)',
    description:
      '% of completed actionable activities expected to be followed by a scheduled next step.',
  },
  allow_self_reassign: {
    key: 'compliance.policy.allow_self_reassign',
    type: 'boolean' as const,
    default: false,
    label: 'Allow reps to reassign their own leads',
    description:
      'When false, sales reps can only request reassignment via manager approval. Sales managers and admins always retain direct authority.',
  },
  // ----- Automation: lead auto-assignment engine -----
  // Default OFF so assignment stays manual until an admin / sales
  // manager explicitly turns the engine on. When enabled, the
  // LeadAutoRouterService cron (every 15 min) round-robins unassigned
  // leads to the least-loaded active sales rep.
  auto_assign_enabled: {
    key: 'compliance.policy.auto_assign_enabled',
    type: 'boolean' as const,
    default: false,
    label: 'Auto-assign new leads to reps',
    description:
      'When on, the auto-assignment engine automatically distributes unassigned leads to the least-loaded active sales rep (checked every 15 minutes). When off, leads stay unassigned until a manager assigns them manually.',
  },
  auto_assign_include_managers: {
    key: 'compliance.policy.auto_assign_include_managers',
    type: 'boolean' as const,
    default: false,
    label: 'Include managers in auto-assign',
    description:
      'When on, sales managers who have a territory configured also receive auto-assigned leads (sharing their office rep\'s territory), capped by "Manager lead cap". When off, managers only approve and reassign — reps receive.',
  },
  manager_lead_cap: {
    key: 'compliance.policy.manager_lead_cap',
    type: 'number' as const,
    default: 50,
    label: 'Manager lead cap',
    description:
      'The most open leads a manager may hold from auto-assign. Once a manager is at the cap, further leads in their territory go to the rep instead. Only applies when "Include managers in auto-assign" is on.',
  },
  tactical_disqualify_requires_approval: {
    key: 'compliance.policy.tactical_disqualify_requires_approval',
    type: 'boolean' as const,
    default: true,
    label: 'Tactical disqualify needs manager approval',
    description:
      'When true, only admin-category disqualify reasons (e.g. duplicate, gone out of business) can be applied directly. Tactical reasons (no budget, slow response) require an approved request.',
  },
  // ----- Phase B: activity discipline enforcement (write-time) -----
  // Both default OFF so existing orgs keep their current behaviour
  // until an admin explicitly turns enforcement on. The dashboard
  // already TRACKS these as compliance KPIs; turning these on BLOCKS
  // at write time so reps can't ship non-compliant work in the first
  // place.
  enforce_outcome_on_completion: {
    key: 'compliance.policy.enforce_outcome_on_completion',
    type: 'boolean' as const,
    default: false,
    label: 'Block activity completion without an outcome',
    description:
      'When on, any activity marked completed must include a completion_outcome. The single-update path already enforces this for backwards compatibility; this switch upgrades enforcement to bulk completions and to direct PUT updates that flip status to completed. Admins and sales managers always bypass.',
  },
  enforce_next_step_on_completion: {
    key: 'compliance.policy.enforce_next_step_on_completion',
    type: 'boolean' as const,
    default: false,
    label: 'Require a scheduled next step when completing an activity',
    description:
      'When on, completing an actionable activity (call / email / meeting / whatsapp / task) requires either an open future actionable activity already scheduled on the same lead/deal OR a `next_step` follow-up sub-payload that the server creates atomically. Admins and sales managers always bypass.',
  },
  require_activity_due_date: {
    key: 'compliance.policy.require_activity_due_date',
    type: 'boolean' as const,
    default: true,
    label: 'Require a date on every open activity',
    description:
      'When on, an actionable activity (call / email / meeting / whatsapp / task) that is left OPEN must carry a due date — the "when" of the commitment. Completed activities are exempt: work that has already happened needs a next step, not a due date, which is what the next-step rule covers. Turn this off to restore the previous behaviour where an activity could be saved with no date at all.',
  },
  // ----- Phase D: SLA pre-breach nudge -----
  sla_prebreach_nudge_hours: {
    key: 'compliance.policy.sla_prebreach_nudge_hours',
    type: 'number' as const,
    default: 4,
    label: 'SLA pre-breach nudge (hours before)',
    description:
      'How many hours before a lead SLA is due to breach the assigned rep should receive a heads-up notification. Set to 0 to disable pre-breach nudges entirely (the breach itself still fires).',
  },
  // ----- Demo + Commercial-Intent gate ------------------------------
  // Default OFF for safety on live data — flipping this on retroactively
  // would block deal creation on every legacy lead that pre-dates the
  // commercial-intent flag. Admins enable it once historical leads are
  // back-filled or once they're comfortable that all NEW leads will
  // route through the demo flow first.
  enforce_commercial_intent_for_deal: {
    key: 'compliance.policy.enforce_commercial_intent_for_deal',
    type: 'boolean' as const,
    default: false,
    label: 'Require commercial intent before creating a deal',
    description:
      'When on, the server blocks POST /deals unless the source lead has commercial_intent = true (set automatically by the demo activity flow) AND the lead has the minimum commercial fields (estimated value, decision-maker name). Off by default to preserve historical behaviour. Admins and sales managers always bypass.',
  },
  demo_followup_sla_hours: {
    key: 'compliance.policy.demo_followup_sla_hours',
    type: 'number' as const,
    default: 48,
    label: 'Demo follow-up SLA (hours)',
    description:
      'A demo delivery with outcome Completed / Strong Interest / Follow-up Needed / Quote Requested must have a follow-up activity within this many hours, or the lead is flagged demo_followup_sla_breached. Default 48 hours.',
  },
} as const;

type ComplianceKey = keyof typeof COMPLIANCE_SETTINGS;

@Injectable()
export class ComplianceSettingsService implements OnModuleInit {
  private readonly logger = new Logger(ComplianceSettingsService.name);
  // In-process cache with a 30s TTL. Avoids hammering the DB on
  // every dashboard read while still letting admin overrides take
  // effect quickly. We deliberately don't wire a cross-service
  // invalidation hook — that would create a circular dep between
  // SettingsService and this one. 30s is acceptable propagation
  // time for a compliance-policy change.
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 30_000;

  constructor(private readonly settings: SettingsService) {}

  async onModuleInit() {
    // Seed any missing rows so the admin UI always has every field
    // to render. Existing rows are left alone — admin overrides win.
    let seeded = 0;
    for (const k of Object.keys(COMPLIANCE_SETTINGS) as ComplianceKey[]) {
      const def = COMPLIANCE_SETTINGS[k];
      const existing = await this.settings.getSetting(def.key);
      if (existing) continue;
      await this.settings.setSetting({
        key: def.key,
        value: def.default,
        data_type: def.type === 'boolean' ? 'boolean' : 'number',
        description: def.description,
        category: COMPLIANCE_CATEGORY,
        is_public: false,
      });
      seeded++;
    }
    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} compliance setting defaults`);
    }
  }

  /**
   * Number reader with fallback. Tolerates strings ("40"), numeric
   * primitives, and `null` (returns default). Never throws.
   */
  async getNumber(name: ComplianceKey): Promise<number> {
    const def = COMPLIANCE_SETTINGS[name];
    if (def.type !== 'number') {
      throw new Error(`Setting ${name} is not a number`);
    }
    const cached = this.readCache<number>(def.key);
    if (cached !== undefined) return cached;
    const row = await this.settings.getSetting(def.key);
    const raw = row?.value;
    const num =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw)
          : NaN;
    const value = Number.isFinite(num) && num >= 0 ? num : def.default;
    this.writeCache(def.key, value);
    return value;
  }

  /**
   * Boolean reader with fallback. Tolerates "true" / "false" /
   * 1 / 0 / boolean and falls back to the documented default.
   */
  async getBoolean(name: ComplianceKey): Promise<boolean> {
    const def = COMPLIANCE_SETTINGS[name];
    if (def.type !== 'boolean') {
      throw new Error(`Setting ${name} is not a boolean`);
    }
    const cached = this.readCache<boolean>(def.key);
    if (cached !== undefined) return cached;
    const row = await this.settings.getSetting(def.key);
    const raw = row?.value;
    let value: boolean = def.default;
    if (raw === true || raw === false) value = raw;
    else if (raw === 'true' || raw === 1 || raw === '1') value = true;
    else if (raw === 'false' || raw === 0 || raw === '0') value = false;
    this.writeCache(def.key, value);
    return value;
  }

  /**
   * Drop the cache. Public so the settings UI / settings controller
   * can call this immediately after a write — but the 30s TTL also
   * naturally invalidates entries even without an explicit call.
   */
  invalidateCache() {
    this.cache.clear();
  }

  private readCache<T>(key: string): T | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  private writeCache(key: string, value: unknown) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }
}
