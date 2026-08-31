/**
 * Reconcile a Sales Pipeline's stages with the rulebook.
 *
 * WHY
 * ---
 * CLAUDE.md section 4 defines the deal pipeline: eight stages, in order,
 * with Won/Lost carried as `close_status` rather than as stages. Local
 * and staging match it. Production has drifted — stages were added,
 * renamed and retired over time, leaving orders 1,5,6,7,8,9,10,11,12,13,14
 * and names the rulebook doesn't know ("Solution Proposal", "Procurement
 * Process", "Contract Finalization", "Implementation & Delivery",
 * "Finance Approved"), while the rulebook's terminal stage
 * ("Commissioned / Training Completed") is missing entirely.
 *
 * The drift is not cosmetic:
 *   - "Solution Proposal" was retired while holding 12 open deals worth
 *     $148,200, which is why the pipeline header read $248,700 against
 *     $100,500 of visible columns;
 *   - with no terminal WON stage, closing a deal as won has nowhere to
 *     move the card, so 27 won deals sit in "Delivery & Installation"
 *     and the board counts closed revenue as live work.
 *
 * WHAT IT DOES
 * ------------
 * For ONE pipeline, in a single transaction:
 *   1. renames near-matches            (e.g. "Negotiation" -> "Negotiation / Revision")
 *   2. creates missing canonical stages (e.g. "Commissioned / Training Completed")
 *   3. moves deals off legacy stages onto their canonical target, writing
 *      a deal_stage_history row for each move
 *   4. retires legacy stages once they are empty
 *   5. renumbers the canonical stages 1..8 so the board reads in order
 *
 * It NEVER touches close_status, value, owner, dates, or anything on a
 * deal other than which stage it stands in. Deals in stages that are
 * already canonical are left alone.
 *
 * THE MAPPING IS A JUDGEMENT CALL — READ IT BEFORE APPLYING.
 * The dry run prints every move with its reasoning. "Finance Approved"
 * in particular is mapped to Committee Review rather than PO/Contract
 * Received, because the rulebook's PO stage asserts that a purchase
 * order or accepted quotation actually exists, and approval alone does
 * not prove that. Override the table below if the business says
 * otherwise.
 *
 * SAFETY
 * ------
 *   - Read-only by default. Nothing is written without --apply.
 *   - Targets the .env database unless --database says otherwise.
 *   - Writes a JSON snapshot and a matching revert.sql before applying.
 *   - Idempotent: a second run finds nothing to do.
 *
 * USAGE
 * -----
 *   node scripts/reconcile-pipeline-stages.js --database digilearn_crm_live
 *   node scripts/reconcile-pipeline-stages.js --database digilearn_crm_live --apply
 *   (optional: --pipeline "Sales Pipeline")
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : fallback;
};
const DATABASE = arg('--database', process.env.DATABASE_NAME);
const PIPELINE_NAME = arg('--pipeline', 'Sales Pipeline');

/** CLAUDE.md section 4, in order. Won/Lost are close_status, not stages. */
const CANONICAL = [
  { name: 'Demo Booked', probability: 10, sla_days: 5, color: '#6366f1' },
  { name: 'Demo Completed', probability: 20, sla_days: 3, color: '#8b5cf6' },
  { name: 'Quote Submitted', probability: 40, sla_days: 3, color: '#ec4899' },
  { name: 'Committee Review', probability: 55, sla_days: 21, color: '#f59e0b' },
  { name: 'Negotiation / Revision', probability: 70, sla_days: 7, color: '#f97316' },
  { name: 'PO/Contract Received', probability: 85, sla_days: 5, color: '#14b8a6' },
  { name: 'Delivery & Installation', probability: 95, sla_days: 14, color: '#0ea5e9' },
  { name: 'Commissioned / Training Completed', probability: 100, sla_days: 7, color: '#22c55e' },
];

/** Legacy name -> canonical name, with the reason shown in the dry run. */
const RENAMES = {
  Negotiation: {
    to: 'Negotiation / Revision',
    why: 'same step, rulebook wording — renamed in place, no deal moves',
  },
};

const MOVES = {
  'Solution Proposal': {
    to: 'Quote Submitted',
    why: 'a proposal/quotation has gone to the school — the rulebook calls that Quote Submitted',
  },
  'Implementation & Delivery': {
    to: 'Delivery & Installation',
    why: 'same step under a different name',
  },
  'Finance Approved': {
    to: 'Committee Review',
    why: 'the school approved the spend but no PO/accepted quote is proven; PO/Contract Received would assert evidence we do not have',
  },
  'Procurement Process': {
    to: 'Committee Review',
    why: "the school's internal procurement/decision process",
  },
  'Contract Finalization': {
    to: 'Negotiation / Revision',
    why: 'terms still being settled; the PO stage requires the PO to exist',
  },
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
  console.log(`pipeline : ${PIPELINE_NAME}`);
  console.log(`mode     : ${APPLY ? 'APPLY (writes)' : 'DRY RUN (read-only)'}\n`);

  const { rows: pipes } = await client.query(
    `SELECT id, name FROM pipelines WHERE name = $1`,
    [PIPELINE_NAME],
  );
  if (!pipes.length) {
    console.error(`No pipeline named "${PIPELINE_NAME}".`);
    await client.end();
    process.exitCode = 1;
    return;
  }
  const pipelineId = pipes[0].id;

  const { rows: stages } = await client.query(
    `SELECT id, name, "order", is_active, probability, sla_days, color
       FROM stages WHERE pipeline_id = $1 ORDER BY "order"`,
    [pipelineId],
  );
  const { rows: dealRows } = await client.query(
    `SELECT d.id, d.title, d.value, d.close_status, d.current_stage_id,
            d.current_status, d.current_stage_since, d.position,
            s.name AS stage_name
       FROM deals d
       LEFT JOIN stages s ON s.id = d.current_stage_id
      WHERE d.pipeline_id = $1`,
    [pipelineId],
  );

  const byName = new Map(stages.map((s) => [norm(s.name), s]));
  const plan = { renames: [], creates: [], moves: [], retires: [], reorders: [] };

  // 1. Renames — only when the target name is not already taken.
  for (const [from, spec] of Object.entries(RENAMES)) {
    const stage = byName.get(norm(from));
    if (!stage) continue;
    if (byName.has(norm(spec.to))) continue; // target exists: handle as a move
    plan.renames.push({ stage, to: spec.to, why: spec.why });
    byName.set(norm(spec.to), { ...stage, name: spec.to });
  }

  // 2. Missing canonical stages.
  for (const c of CANONICAL) {
    const existing = byName.get(norm(c.name));
    const renamedInto = plan.renames.some((r) => norm(r.to) === norm(c.name));
    if (!existing && !renamedInto) plan.creates.push(c);
  }

  // 3. Deals standing on legacy stages.
  for (const [from, spec] of Object.entries(MOVES)) {
    const stage = byName.get(norm(from));
    if (!stage) continue;
    const held = dealRows.filter((d) => d.current_stage_id === stage.id);
    if (held.length) plan.moves.push({ from: stage, toName: spec.to, why: spec.why, deals: held });
  }

  // 4. Legacy stages that will be empty afterwards.
  const canonicalNames = new Set(CANONICAL.map((c) => norm(c.name)));
  const movingStageIds = new Set(plan.moves.map((m) => m.from.id));
  for (const s of stages) {
    if (canonicalNames.has(norm(s.name))) continue;
    if (plan.renames.some((r) => r.stage.id === s.id)) continue;
    const stillHeld = dealRows.filter(
      (d) => d.current_stage_id === s.id && !movingStageIds.has(s.id),
    );
    if (stillHeld.length === 0 && s.is_active) {
      plan.retires.push({ stage: s, why: 'not in the rulebook and holds no deals' });
    } else if (stillHeld.length) {
      plan.retires.push({
        stage: s,
        blocked: stillHeld.length,
        why: `NOT retired — still holds ${stillHeld.length} deal(s) with no mapping; add one to MOVES or move them by hand`,
      });
    }
  }

  console.log('PLAN');
  console.log('----');
  for (const r of plan.renames) console.log(`  rename  "${r.stage.name}" -> "${r.to}"  (${r.why})`);
  for (const c of plan.creates) console.log(`  create  "${c.name}"`);
  for (const m of plan.moves) {
    const ongoing = m.deals.filter((d) => d.close_status === 'ongoing');
    const value = ongoing.reduce((a, d) => a + Number(d.value || 0), 0);
    console.log(
      `  move    ${m.deals.length} deal(s) "${m.from.name}" -> "${m.toName}"` +
        ` (${ongoing.length} open, $${value.toLocaleString('en-US')})`,
    );
    console.log(`            why: ${m.why}`);
    for (const d of m.deals.slice(0, 40)) {
      console.log(`            · ${String(d.title).slice(0, 40).padEnd(40)} ${d.close_status}`);
    }
  }
  for (const r of plan.retires) {
    console.log(`  ${r.blocked ? 'KEEP  ' : 'retire'}  "${r.stage.name}"  (${r.why})`);
  }
  console.log(`  reorder canonical stages to 1..${CANONICAL.length}`);

  const nothing =
    !plan.renames.length && !plan.creates.length && !plan.moves.length &&
    !plan.retires.some((r) => !r.blocked);
  if (nothing) {
    // Orders may still need tightening; report and stop if they are fine.
    const orderOk = CANONICAL.every((c, i) => {
      const s = byName.get(norm(c.name));
      return s && Number(s.order) === i + 1;
    });
    if (orderOk) {
      console.log('\nAlready reconciled — nothing to do.');
      await client.end();
      return;
    }
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write these changes.');
    await client.end();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, '..', '.runtime');
  fs.mkdirSync(outDir, { recursive: true });
  const snapPath = path.join(outDir, `reconcile-stages-snapshot-${stamp}.json`);
  const revertPath = path.join(outDir, `reconcile-stages-revert-${stamp}.sql`);
  fs.writeFileSync(snapPath, JSON.stringify({ stages, deals: dealRows }, null, 2));
  const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
  fs.writeFileSync(
    revertPath,
    [
      ...stages.map(
        (s) =>
          `UPDATE stages SET name = ${q(s.name)}, "order" = ${s.order}, is_active = ${s.is_active} WHERE id = ${q(s.id)};`,
      ),
      ...dealRows.map(
        (d) =>
          `UPDATE deals SET current_stage_id = ${q(d.current_stage_id)}, current_status = ${q(d.current_status)} WHERE id = ${q(d.id)};`,
      ),
    ].join('\n') + '\n',
  );
  console.log(`\nsnapshot : ${snapPath}`);
  console.log(`revert   : ${revertPath}`);

  const now = new Date();
  try {
    await client.query('BEGIN');

    for (const r of plan.renames) {
      await client.query(`UPDATE stages SET name = $1, updated_at = $2 WHERE id = $3`, [
        r.to, now, r.stage.id,
      ]);
    }

    // Park every canonical stage on a high, unique order first: the table
    // has UNIQUE(pipeline_id, "order"), so renumbering in place collides.
    let park = 1000;
    for (const s of stages) {
      await client.query(`UPDATE stages SET "order" = $1 WHERE id = $2`, [park++, s.id]);
    }

    const idByName = new Map();
    const { rows: after1 } = await client.query(
      `SELECT id, name FROM stages WHERE pipeline_id = $1`, [pipelineId],
    );
    for (const s of after1) idByName.set(norm(s.name), s.id);

    for (const c of plan.creates) {
      const id = uuidv4();
      await client.query(
        `INSERT INTO stages (id, pipeline_id, name, "order", sla_days, probability, color, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$8)`,
        [id, pipelineId, c.name, park++, c.sla_days, c.probability, c.color, now],
      );
      idByName.set(norm(c.name), id);
    }

    for (const m of plan.moves) {
      const targetId = idByName.get(norm(m.toName));
      if (!targetId) throw new Error(`target stage "${m.toName}" missing`);
      for (const d of m.deals) {
        await client.query(
          `UPDATE deals SET current_stage_id = $1, current_status = $2, updated_at = $3 WHERE id = $4`,
          [targetId, m.toName, now, d.id],
        );
        // moved_by stays NULL: no human performed this move.
        await client.query(
          `INSERT INTO deal_stage_history (id, deal_id, from_status, to_status, moved_at, moved_by, sla_compliant, notes)
           VALUES ($1,$2,$3,$4,$5,NULL,true,$6)`,
          [uuidv4(), d.id, d.current_status, m.toName, now,
           `Pipeline reconciliation: "${m.from.name}" is not a rulebook stage. ${m.why}.`],
        );
      }
    }

    for (const r of plan.retires) {
      if (r.blocked) continue;
      await client.query(`UPDATE stages SET is_active = false, updated_at = $1 WHERE id = $2`, [now, r.stage.id]);
    }

    for (let i = 0; i < CANONICAL.length; i++) {
      const id = idByName.get(norm(CANONICAL[i].name));
      if (!id) continue;
      await client.query(
        `UPDATE stages SET "order" = $1, is_active = true, updated_at = $2 WHERE id = $3`,
        [i + 1, now, id],
      );
    }

    await client.query('COMMIT');
    console.log('\nReconciled. Committed.');
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
