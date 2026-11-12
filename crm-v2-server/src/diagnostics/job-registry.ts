import { AUTOMATION_CRON } from '../automation/automation.constants';

/**
 * Every scheduled job the API runs, described once, in words a non-technical
 * reader understands. The System Health page and the job-run summary read
 * this; the cron handlers reference these names when they run through
 * JobRunnerService, so a job that is not listed here cannot be tracked.
 *
 * `everyMs` is how often the job is meant to run; a job whose last run is
 * older than twice that (plus five minutes of slack) is shown as overdue.
 */
export interface JobDefinition {
  /** Plain-language title, e.g. "Lead SLA breach check". */
  title: string;
  /** What the job does, one sentence, for the owner. */
  purpose: string;
  cron: string;
  everyMs: number;
  /** Turns the counters a run reported into one sentence. */
  describe: (counts: Record<string, number>) => string;
  /**
   * Counters that report a standing state rather than work done this run
   * (e.g. "20 deals are past their stage limit"). A run whose only non-zero
   * counters are standing ones did nothing new; the day log folds it with
   * the quiet runs and states the standing number once.
   */
  standing?: string[];
  /** Sentence for the standing counters alone, used when folding. */
  describeStanding?: (counts: Record<string, number>) => string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const n = (counts: Record<string, number>, key: string) => counts[key] ?? 0;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export const JOBS = {
  'sla.demo_followup': {
    title: 'Demo follow-up check',
    purpose: 'Flags leads whose demo was delivered but never followed up within the agreed hours.',
    cron: '0 */30 * * * *',
    everyMs: 30 * MIN,
    describe: (c) => `looked at ${plural(n(c, 'checked'), 'delivered demo')}, ${n(c, 'breached')} newly overdue, ${n(c, 'cleared')} cleared`,
  },
  'sla.breach_check': {
    title: 'Lead and deal SLA breach check',
    purpose: 'Marks leads and deals that have passed their response deadline and alerts the owners.',
    cron: '0 */30 * * * *',
    everyMs: 30 * MIN,
    describe: (c) => `${plural(n(c, 'leads_breached'), 'lead')} newly breached; ${plural(n(c, 'deals_past_sla'), 'deal')} past their stage limit`,
    standing: ['deals_past_sla'],
    describeStanding: (c) => `${plural(n(c, 'deals_past_sla'), 'deal')} past their stage limit`,
  },
  'sla.escalation': {
    title: 'SLA escalation check',
    purpose: 'Escalates leads that stayed breached past the escalation window to a manager.',
    cron: '0 0 * * * *',
    everyMs: HOUR,
    describe: (c) => `${plural(n(c, 'escalated'), 'lead')} escalated`,
  },
  'sla.idle_leads': {
    title: 'Idle lead check',
    purpose: 'Warns reps about leads nobody has touched for longer than the idle limit.',
    cron: '0 0 */2 * * *',
    everyMs: 2 * HOUR,
    describe: (c) => `${plural(n(c, 'alerts'), 'idle alert')} sent`,
  },
  'sla.prebreach_nudge': {
    title: 'SLA heads-up before breach',
    purpose: 'Nudges a rep a few hours before a lead is about to breach its SLA.',
    cron: '0 */15 * * * *',
    everyMs: 15 * MIN,
    describe: (c) => `${plural(n(c, 'candidates'), 'lead')} close to breaching, ${n(c, 'sent')} nudged`,
  },
  'sla.deal_stage_breach': {
    title: 'Deal stage SLA check',
    purpose: 'Finds deals that have sat in one pipeline stage longer than that stage allows.',
    cron: '0 */30 * * * *',
    everyMs: 30 * MIN,
    describe: (c) => `${n(c, 'breached')} deals newly overdue in their stage, ${n(c, 'notified')} manager alerts sent`,
  },
  'automation.unassigned_routing': {
    title: 'Unassigned lead routing',
    purpose: 'Proposes an owner for leads nobody holds (off unless the auto-assign setting is on).',
    cron: AUTOMATION_CRON.unassignedRouting,
    everyMs: 15 * MIN,
    describe: (c) => `${plural(n(c, 'proposed'), 'proposal')} made, ${n(c, 'skipped')} leads left for a manager`,
  },
  'automation.reactivation': {
    title: 'Reactivation suggestions',
    purpose: 'Suggests a message for leads and deals that have gone quiet.',
    cron: AUTOMATION_CRON.reactivation,
    everyMs: DAY,
    describe: (c) => `${plural(n(c, 'lead_drafts'), 'lead draft')} and ${plural(n(c, 'deal_nudges'), 'deal nudge')} suggested`,
  },
  'automation.discipline_digest': {
    title: 'Follow-up discipline digest',
    purpose: 'Tells each rep how many of their open leads have no next step planned.',
    cron: AUTOMATION_CRON.disciplineDigest,
    everyMs: DAY,
    describe: (c) => `${plural(n(c, 'reps'), 'rep')} checked, ${n(c, 'nudged')} told about missing next steps`,
  },
  'automation.followup_reminders': {
    title: 'Follow-up reminders',
    purpose: 'Reminds reps of follow-ups due soon and ones recently missed.',
    cron: AUTOMATION_CRON.followupReminders,
    everyMs: HOUR,
    describe: (c) => `${n(c, 'due')} due-soon and ${n(c, 'missed')} missed reminders sent`,
  },
  'automation.demo_followup_drafts': {
    title: 'Demo follow-up drafts',
    purpose: 'Drafts a follow-up message for demos that were never followed up.',
    cron: '0 0 7 * * *',
    everyMs: DAY,
    describe: (c) => `${plural(n(c, 'candidates'), 'lead')} found, ${n(c, 'drafted')} drafts suggested`,
  },
  'email.sequence_queue': {
    title: 'Email sequence queue',
    purpose: 'Sends the e-mails that automated sequences have queued.',
    cron: '0 */15 * * * *',
    everyMs: 15 * MIN,
    describe: (c) => `${n(c, 'sent')} sent, ${n(c, 'failed')} failed`,
  },
  'bugs.screenshot_retention_notice': {
    title: 'Bug screenshot retention notice',
    purpose: 'Tells triagers which closed tickets have screenshots ready for deletion review.',
    cron: '0 0 * * * *',
    everyMs: HOUR,
    describe: (c) => `${plural(n(c, 'tickets'), 'ticket')} with screenshots due for review, ${n(c, 'notified')} notices sent`,
  },
  'calendar.reconcile': {
    title: 'Calendar reconcile',
    purpose: 'Pulls calendar changes that the live sync may have missed.',
    cron: '0 */30 * * * *',
    everyMs: 30 * MIN,
    describe: (c) => `${plural(n(c, 'pulled'), 'calendar event')} pulled`,
  },
  'scheduling.expire_holds': {
    title: 'Booking hold expiry',
    purpose: 'Releases booking slots that were held but never confirmed.',
    cron: '0 */5 * * * *',
    everyMs: 5 * MIN,
    describe: (c) => `${plural(n(c, 'expired'), 'hold')} released`,
  },
  'leads.temperature_sweep': {
    title: 'Nightly lead temperature',
    purpose: 'Re-scores every open lead so quiet leads cool down over time.',
    cron: '0 0 2 * * *',
    everyMs: DAY,
    describe: (c) => `${plural(n(c, 'processed'), 'lead')} re-scored, ${n(c, 'failed')} failed`,
  },
  'quotes.expire_overdue': {
    title: 'Quote expiry',
    purpose: 'Marks quotes as expired once their validity date has passed.',
    cron: '0 0 1 * * *',
    everyMs: DAY,
    describe: (c) => `${plural(n(c, 'expired'), 'quote')} expired`,
  },
  'finance.reconcile': {
    title: 'Money figures check',
    purpose: 'Every night, checks that receipts, instalments and invoices agree with each other and flags any that do not.',
    cron: '0 30 3 * * *',
    everyMs: DAY,
    describe: (c) =>
      n(c, 'errors') + n(c, 'review') === 0
        ? 'all money figures agree'
        : `${plural(n(c, 'errors'), 'figure')} out of step, ${plural(n(c, 'review'), 'item')} for review`,
  },
  'diagnostics.prune': {
    title: 'Diagnostics clean-up',
    purpose: 'Deletes diagnostics older than the retention setting and marks runs that never finished.',
    cron: '0 15 3 * * *',
    everyMs: DAY,
    describe: (c) => `${n(c, 'system_events') + n(c, 'job_runs') + n(c, 'delivery_attempts') + n(c, 'client_events')} old rows removed, ${n(c, 'lost_runs')} abandoned runs marked`,
  },
} satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof JOBS;

export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export function jobDefinition(name: string): JobDefinition | undefined {
  return (JOBS as Record<string, JobDefinition>)[name];
}

/**
 * A run is overdue when nothing has started within twice its interval plus
 * slack. A job that has never run is only overdue once the tracking itself
 * has been live for that long (`trackingSince` = the first job_runs row of
 * any job); until then a daily job that has not reached its first slot is
 * simply "not yet", not a problem.
 */
export function isOverdue(
  name: string,
  lastStartedAt: Date | null,
  now = new Date(),
  trackingSince: Date | null = null,
): boolean {
  const def = jobDefinition(name);
  if (!def) return false;
  const limit = def.everyMs * 2 + 5 * MIN;
  if (!lastStartedAt) {
    if (!trackingSince) return false;
    return now.getTime() - trackingSince.getTime() > limit;
  }
  return now.getTime() - lastStartedAt.getTime() > limit;
}
