/**
 * Configuration for the Automation module (Phase-2 rep/marketing
 * efficiency features built from the DigiLearn automation register).
 *
 * These are deliberately constants in one place rather than scattered
 * magic numbers so the founder can tune policy without hunting through
 * service code. Where a value encodes a *business decision that was not
 * yet confirmed* (e.g. the lead-assignment rule), it is flagged inline
 * — change it here, not in the services.
 *
 * CARDINAL RULE (AGENTS.md Golden Rules): automation DRAFTS and QUEUES;
 * humans decide. No service here sends an external message or
 * auto-progresses a deal. Reactivation/discipline jobs only notify the
 * rep with a suggestion; the auto-router only sets ownership + starts
 * the SLA clock (an internal state change, fully reversible).
 */

/** Lead statuses that are terminal — never routed, nudged, or reactivated. */
export const TERMINAL_LEAD_STATUSES = ['Disqualified', 'Converted'] as const;

/**
 * ASSIGNMENT POLICY (confirmed 29 July meeting, see AUTO-ASSIGN-ENGINE.md).
 * Recipients are active users who have a territory configured
 * (users.territory_provinces) AND hold one of these roles. Territory is
 * the opt-in: a user with no territory set never receives auto-assigned
 * leads. Both reps and managers receive; they are balanced within their
 * own role cohort (a rep against reps, a manager against managers).
 */
export const ROUTABLE_ROLES = ['sales_rep', 'sales_manager'] as const;

/**
 * The maximum lead-count gap allowed WITHIN a role cohort (priority 1 —
 * fair distribution). No cohort member may end up more than this many
 * leads ahead of the least-loaded member of the same cohort. This is a
 * HARD cap: when honouring territory would break it, fairness wins and
 * the lead overflows to the lighter-loaded member even out of territory.
 */
export const FAIRNESS_GAP = 50;

/** Max leads routed per cron pass (keeps a backlog drain from spiking the DB). */
export const ROUTER_BATCH_LIMIT = 200;

/** Reactivation cohort thresholds (days). */
export const REACTIVATION = {
  /** "Contacted graveyard": Contacted with no action for this many days. */
  contactedStaleDays: 14,
  /** Nurture re-engagement window: revisit between these bounds. */
  nurtureMinDays: 30,
  nurtureMaxDays: 60,
  /** Ongoing deal considered aged when in-stage longer than this. */
  agedDealDays: 30,
  /** Max suggestions emitted per rep per pass (anti-spam). */
  perRepLimit: 15,
} as const;

/** Cron schedules (6-field: sec min hour dom mon dow), Africa/Harare server time. */
export const AUTOMATION_CRON = {
  /** Intake routing — frequent so new leads get an owner fast. */
  unassignedRouting: '0 */15 * * * *',
  /** Daily reactivation sweep at 06:30. */
  reactivation: '0 30 6 * * *',
  /** Daily follow-up discipline digest at 06:00. */
  disciplineDigest: '0 0 6 * * *',
} as const;
