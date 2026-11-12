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
 * ASSIGNMENT POLICY (confirmed 29 July, Kim — see AUTO-ASSIGN-ENGINE.md).
 * Auto-distribution goes to SALES REPS only. Recipients are active
 * sales_reps who have a territory configured (users.territory_provinces);
 * territory is the opt-in. Managers do NOT receive auto-assigned leads —
 * they approve the proposals and handle reassignment manually.
 */
export const ROUTABLE_ROLES = ['sales_rep'] as const;

/**
 * The maximum lead-count gap allowed between reps (priority 1 — fair
 * distribution). AUTO-EQUITY treats 50 as outside the accepted band: new
 * proposals go to the lighter rep until the projected gap is below 50. When
 * the gap is already below 50, territory is priority 2. When territory would
 * break the fairness band,
 * fairness wins and the lead overflows to a lighter-loaded rep even out
 * of territory. The engine only ADDS leads — it never strips an existing
 * book; rebalancing a rep down is a manager reassignment decision.
 */
export const FAIRNESS_GAP = 50;

/**
 * Batch sizes the manager may choose on the Run button. `null` = all
 * distributable leads in one go (slow is fine — it checks every lead's
 * factors one by one). The cron default, when nobody chose, is 200.
 */
export const DISTRIBUTION_BATCH_SIZES = [50, 100, 250, 500, null] as const;
export const DEFAULT_BATCH_LIMIT = 200;

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
