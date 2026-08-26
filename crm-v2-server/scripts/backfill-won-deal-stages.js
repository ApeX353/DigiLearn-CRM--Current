/**
 * Backfill: move already-won deals onto their pipeline's terminal stage.
 *
 * WHY
 * ---
 * Until the closeDeal fix, "Mark Won" set `close_status` and left the
 * card where it stood. Landing on a terminal stage flipped the status,
 * but nothing did the reverse. Production accumulated deals that are
 * won in the data yet still sitting in mid-pipeline stages, so the
 * board counted closed revenue as live work.
 *
 * The code fix is forward-only. This script repairs the deals that were
 * already stranded.
 *
 * WHAT IT TOUCHES
 * ---------------
 * For each won deal not already on a terminal WON stage, in one
 * transaction:
 *   - deals.current_stage_id / current_status  -> the terminal stage
 *   - deals.current_stage_since                -> now (fresh stage clock)
 *   - deals.position                           -> end of the target stage
 *   - deals.sla_breached / last_breached_at    -> cleared
 *   - deal_stage_history                       -> one row per deal
 *
 * It does NOT touch close_status, actual_close_date, value, owner, or
 * anything on lost/ongoing deals. Deals whose pipeline has no terminal
 * WON stage are reported and skipped, never guessed at.
 *
 * SAFETY
 * ------
 *   - Read-only by default. Nothing is written without --apply.
 *   - Targets the .env database unless --database says otherwise, so
 *     touching live has to be deliberate.
 *   - Writes a JSON snapshot of every affected row before applying, and
 *     emits a matching revert.sql beside it.
 *   - Idempotent: a second run finds nothing to do.
 *
 * USAGE
 * -----
 *   node scripts/backfill-won-deal-stages.js --database digilearn_crm_live
 *   node scripts/backfill-won-deal-stages.js --database digilearn_crm_live --apply
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const dbIndex = argv.indexOf('--database');
const DATABASE =
  dbIndex !== -1 ? argv[dbIndex + 1] : process.env.DATABASE_NAME;

// Same rule the application uses (DealsService.getTerminalStageKind), kept
// in step deliberately: a stage is terminal-won if its name says won or
// commissioned. Duplicated rather than imported so this script stays
// runnable against a database without building the Nest app.
const normalize = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isWonStage = (name) => {
  const n = normalize(name);
  return !/\blost\b/.test(n) && (/\bwon\b/.test(n) || /\bcommissioned\b/.test(n));
};

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: DATABASE,
  });
  await client.connect();

  console.log(`database : ${DATABASE}`);
  console.log(`mode     : ${APPLY ? 'APPLY (writes)' : 'DRY RUN (read-only)'}\n`);

  // Terminal WON stage per pipeline, highest order wins.
  const { rows: stages } = await client.query(
    `SELECT id, pipeline_id, name, "order", is_active
       FROM stages WHERE is_active = true ORDER BY "order" DESC`,
  );
  const terminalByPipeline = new Map();
  for (const s of stages) {
    if (isWonStage(s.name) && !terminalByPipeline.has(s.pipeline_id)) {
      terminalByPipeline.set(s.pipeline_id, s);
    }
  }

  const { rows: candidates } = await client.query(
    `SELECT d.id, d.title, d.pipeline_id, d.value,
            d.current_stage_id, d.current_status, d.current_stage_since,
            d.position, d.sla_breached, d.last_breached_at,
            s.name AS stage_name
       FROM deals d
       LEFT JOIN stages s ON s.id = d.current_stage_id
      WHERE d.close_status = 'won'
      ORDER BY d.title`,
  );

  const toMove = [];
  const skipped = [];
  for (const d of candidates) {
    const target = terminalByPipeline.get(d.pipeline_id);
    if (!target) {
      skipped.push({ ...d, reason: 'pipeline has no terminal won stage' });
    } else if (d.current_stage_id === target.id) {
      // Already correct — this is what idempotency looks like.
    } else {
      toMove.push({ deal: d, target });
    }
  }

  console.log(`won deals            : ${candidates.length}`);
  console.log(`already correct      : ${candidates.length - toMove.length - skipped.length}`);
  console.log(`to move              : ${toMove.length}`);
  console.log(`skipped (no stage)   : ${skipped.length}\n`);

  for (const { deal, target } of toMove) {
    console.log(
      `  ${String(deal.title).slice(0, 34).padEnd(34)} ` +
        `${String(deal.stage_name).padEnd(26)} -> ${target.name}`,
    );
  }
  for (const s of skipped) {
    console.log(`  SKIP ${String(s.title).slice(0, 34).padEnd(34)} (${s.reason})`);
  }

  if (!toMove.length) {
    console.log('\nNothing to do.');
    await client.end();
    return;
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write these changes.');
    await client.end();
    return;
  }

  // Snapshot + revert script before any write. These go to .runtime/,
  // which .gitignore already covers — generated artifacts should not
  // turn up as untracked files in someone's next commit.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, '..', '.runtime');
  fs.mkdirSync(outDir, { recursive: true });
  const snapshotPath = path.join(outDir, `backfill-won-snapshot-${stamp}.json`);
  const revertPath = path.join(outDir, `backfill-won-revert-${stamp}.sql`);
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(toMove.map((m) => m.deal), null, 2),
  );
  fs.writeFileSync(
    revertPath,
    toMove
      .map(({ deal: d }) =>
        `UPDATE deals SET current_stage_id = '${d.current_stage_id}', ` +
        `current_status = ${d.current_status === null ? 'NULL' : `'${String(d.current_status).replace(/'/g, "''")}'`}, ` +
        `current_stage_since = ${d.current_stage_since ? `'${new Date(d.current_stage_since).toISOString()}'` : 'NULL'}, ` +
        `position = ${d.position}, sla_breached = ${d.sla_breached}, ` +
        `last_breached_at = ${d.last_breached_at ? `'${new Date(d.last_breached_at).toISOString()}'` : 'NULL'} ` +
        `WHERE id = '${d.id}';`,
      )
      .join('\n') + '\n',
  );
  console.log(`\nsnapshot : ${snapshotPath}`);
  console.log(`revert   : ${revertPath}`);

  const now = new Date();
  try {
    await client.query('BEGIN');

    // Next free position per target stage, advanced as we go so the
    // moved deals stack rather than collide.
    const nextPosition = new Map();
    for (const [, target] of terminalByPipeline) {
      const { rows } = await client.query(
        `SELECT COALESCE(MAX(position), 0) AS max FROM deals WHERE current_stage_id = $1`,
        [target.id],
      );
      nextPosition.set(target.id, Number(rows[0].max));
    }

    for (const { deal, target } of toMove) {
      const position = nextPosition.get(target.id) + 1000;
      nextPosition.set(target.id, position);

      await client.query(
        `UPDATE deals
            SET current_stage_id = $1, current_status = $2,
                current_stage_since = $3, position = $4,
                sla_breached = false, last_breached_at = NULL
          WHERE id = $5 AND close_status = 'won'`,
        [target.id, target.name, now, position, deal.id],
      );

      const daysInStage = deal.current_stage_since
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - new Date(deal.current_stage_since).getTime()) /
                86400000,
            ),
          )
        : null;

      // moved_by stays NULL: no human performed this move, and
      // attributing it to one would falsify the audit trail.
      await client.query(
        `INSERT INTO deal_stage_history
           (id, deal_id, from_status, to_status, moved_at, moved_by,
            time_in_stage, sla_compliant, notes)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, true, $7)`,
        [
          uuidv4(),
          deal.id,
          deal.current_status,
          target.name,
          now,
          daysInStage,
          'Backfill: deal was already won but had been left in a ' +
            'non-terminal stage by the pre-fix Mark Won button.',
        ],
      );
    }

    await client.query('COMMIT');
    console.log(`\nMoved ${toMove.length} deal(s). Committed.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`\nFAILED, rolled back: ${e.message}`);
    process.exitCode = 1;
  }

  await client.end();
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
