import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Work-Tracker redesign, phase 1 backfill
 * (BUG-TRACKER-CLASSIFICATION-REDESIGN.md, 2026-08-02).
 *
 * Why a data migration and not a startup routine: the classification is a
 * one-time, controlled correction of historical rows that must run exactly
 * once, in a transaction, with a manifest — precisely what a migration is.
 * A startup routine would re-scan on every boot and would need its own
 * idempotency + advisory-lock machinery to be safe under multiple
 * instances. TypeORM already wraps each migration in a single transaction
 * and records it in the migrations table so it never repeats.
 *
 * Safety properties:
 *  - Idempotent: work_type is set by exact bracket-code match; status moves
 *    are guarded on the expected prior status, so a second run is a no-op.
 *  - No invented data: only rows whose title carries a code from the doc's
 *    tables are touched. Everything else keeps work_type='bug' (the schema
 *    default) and is reported in the manifest, never guessed.
 *  - Transaction-wrapped by TypeORM; a failure rolls the whole thing back.
 *  - Logs a before/after manifest (counts by status and by work_type) plus
 *    a per-code match tally so a zero-match code is visible, not silent.
 *
 * Deferred to Phase 2 (logged, not done here): splitting the mixed tickets
 * (ACT5, IMPORT2, HYG2) into child work, and linking the R7 / TEST ARTEFACT
 * duplicate pairs via duplicate_of_id.
 */
export class BackfillWorkTrackerClassification1776000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('bug_reports'))) return;
    // If the schema step never landed, do nothing rather than half-apply.
    if (!(await queryRunner.hasColumn('bug_reports', 'work_type'))) return;

    const log = (msg: string) =>
      // eslint-disable-next-line no-console
      console.log(`[Backfill 1776 WorkTracker] ${msg}`);

    const manifest = async (label: string) => {
      const byStatus = (await queryRunner.query(
        `SELECT status, COUNT(*)::int AS n FROM bug_reports GROUP BY status ORDER BY status`,
      )) as Array<{ status: string; n: number }>;
      const byType = (await queryRunner.query(
        `SELECT work_type, COUNT(*)::int AS n FROM bug_reports GROUP BY work_type ORDER BY work_type`,
      )) as Array<{ work_type: string; n: number }>;
      const [{ total }] = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM bug_reports`,
      )) as Array<{ total: number }>;
      log(`--- ${label} manifest (total ${total}) ---`);
      log(
        `  by status: ${byStatus.map((r) => `${r.status}=${r.n}`).join(', ')}`,
      );
      log(
        `  by work_type: ${byType.map((r) => `${r.work_type}=${r.n}`).join(', ')}`,
      );
    };

    await manifest('BEFORE');

    /**
     * Set work_type for every ticket carrying `code` as a bracketed title
     * prefix, e.g. "[AUTO1] manager gate…". Bracket matching is exact:
     * "[AUTO1]%" cannot match "[AUTO10] …" because a ']' is required. The
     * update is unconditional on work_type, so re-running is harmless.
     * Returns the number of rows matched (for the manifest).
     */
    const setType = async (code: string, workType: string): Promise<number> => {
      const rows = (await queryRunner.query(
        `UPDATE bug_reports SET work_type = $1
           WHERE title ILIKE $2
         RETURNING id`,
        [workType, `[${code}]%`],
      )) as Array<{ id: string }>;
      return rows.length;
    };

    /** Move status only when the row is still in its expected prior state. */
    const moveStatus = async (
      code: string,
      from: string,
      to: string,
      stamp?: 'closed_at' | 'verified_at',
    ): Promise<number> => {
      const setStamp = stamp ? `, ${stamp} = COALESCE(${stamp}, now())` : '';
      const rows = (await queryRunner.query(
        `UPDATE bug_reports SET status = $1${setStamp}
           WHERE title ILIKE $2 AND status = $3
         RETURNING id`,
        [to, `[${code}]%`, from],
      )) as Array<{ id: string }>;
      return rows.length;
    };

    // ---- Feature / enhancement — 26 ------------------------------------
    // Resolved features were actually delivered -> done.
    const featureDone = [
      'LNAME2',
      'NEXT4',
      'SCHLEAD2',
      'DISC2',
      'SCH3',
      'QDL1',
      'SCHLEAD1',
    ];
    // Closed features were shelved into the abused `closed` bucket -> backlog.
    const featureBacklog = [
      'EMAIL1',
      'NUM1',
      'AUTO3',
      'HEAD1',
      'STAKE1',
      'CSV7',
      'INV2',
      'MGRBUG1',
      'DUP6',
      'AUTO2',
      'AUTO1',
      'REM-ERP',
      'QSYNC1',
      'ASGN1',
      'REA1',
      'ESC1',
    ];
    // Open / in-progress features stay where they are; only the type changes.
    const featureKeep = ['CSV6', 'CON1', 'CSV4'];

    const tallies: Array<{ code: string; matched: number; note: string }> = [];

    for (const code of [...featureDone, ...featureBacklog, ...featureKeep]) {
      const matched = await setType(code, 'feature');
      tallies.push({ code, matched, note: 'feature' });
    }
    let featuresToBacklog = 0;
    let featuresToDone = 0;
    for (const code of featureBacklog) {
      featuresToBacklog += await moveStatus(code, 'closed', 'backlog');
    }
    for (const code of featureDone) {
      featuresToDone += await moveStatus(code, 'resolved', 'done', 'verified_at');
    }

    // ---- Other / mixed — 15 (mapped per the doc's per-ticket table) ----
    const dataTasks = ['WANEZI1', 'ACT5', 'IMPORT2', 'IMPORT1', 'ACT3', 'PROD-BOARD'];
    const investigations = ['DATA1', 'METRICS1', 'QUOTE5'];
    const tasksKeep = ['NEXT1']; // documentation task, keep its status

    for (const code of dataTasks) {
      const matched = await setType(code, 'data_task');
      tallies.push({ code, matched, note: 'data_task' });
    }
    for (const code of investigations) {
      const matched = await setType(code, 'investigation');
      tallies.push({ code, matched, note: 'investigation' });
    }
    for (const code of tasksKeep) {
      const matched = await setType(code, 'task');
      tallies.push({ code, matched, note: 'task' });
    }

    // REM-OPENAI: a commercial reminder, not engineering work -> wont_do.
    {
      const rowsT = (await queryRunner.query(
        `UPDATE bug_reports SET work_type = 'task'
           WHERE title ILIKE $1 RETURNING id`,
        ['[REM-OPENAI]%'],
      )) as Array<{ id: string }>;
      const rowsS = (await queryRunner.query(
        `UPDATE bug_reports SET status = 'wont_do', closed_at = COALESCE(closed_at, now())
           WHERE title ILIKE $1 AND status NOT IN ('wont_do','cancelled') RETURNING id`,
        ['[REM-OPENAI]%'],
      )) as Array<{ id: string }>;
      tallies.push({ code: 'REM-OPENAI', matched: rowsT.length, note: 'task/wont_do' });
      log(`REM-OPENAI moved to wont_do: ${rowsS.length}`);
    }

    // TEST ARTEFACT (both copies): test data -> task + cancelled. No bracket
    // code, so matched by title substring.
    {
      const rowsT = (await queryRunner.query(
        `UPDATE bug_reports SET work_type = 'task'
           WHERE title ILIKE '%TEST ARTEFACT%' RETURNING id`,
      )) as Array<{ id: string }>;
      const rowsS = (await queryRunner.query(
        `UPDATE bug_reports SET status = 'cancelled', closed_at = COALESCE(closed_at, now())
           WHERE title ILIKE '%TEST ARTEFACT%' AND status NOT IN ('cancelled','wont_do') RETURNING id`,
      )) as Array<{ id: string }>;
      tallies.push({
        code: 'TEST ARTEFACT',
        matched: rowsT.length,
        note: 'task/cancelled',
      });
      log(`TEST ARTEFACT moved to cancelled: ${rowsS.length}`);
    }

    // Activities "I can only see mine": needs a role/expectation decision,
    // not a fix -> investigation. No bracket code; matched by title phrase.
    {
      const rows = (await queryRunner.query(
        `UPDATE bug_reports SET work_type = 'investigation'
           WHERE title ILIKE '%only see mine%'
              OR title ILIKE '%can only see my%'
         RETURNING id`,
      )) as Array<{ id: string }>;
      tallies.push({
        code: 'Activities(see-mine)',
        matched: rows.length,
        note: 'investigation',
      });
    }

    // HYG2 is a mixed feature+bug in the doc — it maps cleanly to neither
    // data_task nor investigation, so it is deliberately LEFT as the bug
    // default and flagged for a Phase-2 split rather than mis-bucketed.
    {
      const [{ n }] = (await queryRunner.query(
        `SELECT COUNT(*)::int AS n FROM bug_reports WHERE title ILIKE $1`,
        ['[HYG2]%'],
      )) as Array<{ n: number }>;
      if (n > 0) {
        log(
          `HYG2 (mixed feature+bug) left as work_type=bug for Phase-2 split — ${n} row(s)`,
        );
      }
    }

    // ---- Report per-code tallies + zero-match warnings -----------------
    const zero = tallies.filter((t) => t.matched === 0);
    log(
      `Classified codes: ${tallies
        .filter((t) => t.matched > 0)
        .map((t) => `${t.code}=${t.matched}(${t.note})`)
        .join(', ')}`,
    );
    if (zero.length) {
      log(
        `NO MATCH (left as default bug, verify title prefixes): ${zero
          .map((t) => t.code)
          .join(', ')}`,
      );
    }
    log(
      `Feature status moves: ${featuresToBacklog} closed->backlog, ${featuresToDone} resolved->done`,
    );

    // Anything still on the bug default is fine (the doc's 104 bugs plus any
    // unmatched) — reported so nothing is silently reclassified.
    const [{ stillBug }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS "stillBug" FROM bug_reports WHERE work_type = 'bug'`,
    )) as Array<{ stillBug: number }>;
    log(`Remaining work_type=bug (defect default): ${stillBug}`);

    await manifest('AFTER');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A classification backfill is not cleanly reversible: it does not
    // record each row's prior work_type/status, and reversing would risk
    // clobbering triage done since. Deliberately a no-op — the schema
    // migration (1775) owns structural rollback.
    void queryRunner;
  }
}
