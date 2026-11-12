import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records of things that already happened were stored as future work.
 *
 * The "Log Activity" modal historically posted calls, WhatsApps, emails
 * and notes WITHOUT a status, so every one of them took the column
 * default — `scheduled` — with no scheduled_at and no due_at. 3,436 of
 * the 3,802 "scheduled" activities in production are these: subjects
 * like "Call: No answer", "WhatsApp: Report sent", "Note: …". They are
 * history, not plans. Left as open rows they:
 *
 *   - sat in the open queue forever wearing "Not scheduled / No
 *     follow-up" chips, so a rep's actual call read as unscheduled work;
 *   - were invisible to every overdue metric (NULL < NOW() is false) yet
 *     counted as "an open next step" for the compliance gate and the
 *     no-next-step dashboards — so the server said a lead had a future
 *     while the screen said "No next step planned";
 *   - inflated "+N more open activities" on every record they were on and
 *     could occupy the Planned / Next-step slot (newest created wins when
 *     nothing is dated), presenting a past call as the planned future;
 *   - never moved the lead's last_contacted_at, so ~3,400 real contacts
 *     were missing from stale-lead and SLA-touch metrics.
 *
 * This flips them to `completed`, stamped with the moment they were
 * logged (created_at is the truthful completion time for a "log a past
 * interaction" row), and moves each lead's last_contacted_at forward to
 * its latest such contact where that is later than what is recorded.
 *
 * Scope is deliberately narrow — only the four types that are
 * unambiguously records when undated. Undated `scheduled` meetings and
 * tasks are left alone: a meeting with no date might be legacy minutes
 * or might be a genuinely planned-but-undated item, and that is a call a
 * human makes (the UI now flags them "Needs a date").
 *
 * Idempotent: the predicate matches nothing once applied. The down()
 * is best-effort — it reopens rows whose completed_at still equals
 * created_at and that carry no outcome, which is the fingerprint this
 * migration leaves and no UI path produces.
 */
export class BackfillLoggedInteractionsAsCompleted1781000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. The records themselves.
    await queryRunner.query(`
      UPDATE activities
         SET status       = 'completed',
             completed_at = created_at,
             updated_at   = NOW()
       WHERE status = 'scheduled'
         AND due_at IS NULL
         AND scheduled_at IS NULL
         AND type IN ('call', 'whatsapp', 'email', 'note')
    `);

    // 2. The contact clock those records should have moved. Only contact
    //    types count as contact (a note is not a touch), and only forward:
    //    never pull a later real contact back to an older logged one.
    await queryRunner.query(`
      UPDATE leads l
         SET last_contacted_at = x.latest,
             updated_at        = NOW()
        FROM (
              SELECT a.lead_id, MAX(a.created_at) AS latest
                FROM activities a
               WHERE a.status = 'completed'
                 AND a.completed_at = a.created_at
                 AND a.completion_outcome IS NULL
                 AND a.due_at IS NULL
                 AND a.scheduled_at IS NULL
                 AND a.type IN ('call', 'whatsapp', 'email')
                 AND a.lead_id IS NOT NULL
               GROUP BY a.lead_id
             ) x
       WHERE l.id = x.lead_id
         AND (l.last_contacted_at IS NULL OR l.last_contacted_at < x.latest)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE activities
         SET status       = 'scheduled',
             completed_at = NULL,
             updated_at   = NOW()
       WHERE status = 'completed'
         AND completed_at = created_at
         AND completion_outcome IS NULL
         AND completion_note IS NULL
         AND due_at IS NULL
         AND scheduled_at IS NULL
         AND type IN ('call', 'whatsapp', 'email', 'note')
    `);
    // last_contacted_at is not rolled back: the contacts did happen.
  }
}
