/**
 * seed-demo-data.js
 *
 * Seeds a rich, deterministic set of demo data so every UX surface in the
 * Pipedrive-inspired redesign has something meaningful to show:
 *
 *   /leads            — LeadRowMarkers covering all severity chips
 *   /leads/:id        — LeadAtAGlance with varied completeness + BANT
 *   /pipeline         — Kanban headers with overdue + hot chips
 *   /tasks            — Smart views: my-overdue, due-today, upcoming,
 *                       no-next, completed, all
 *
 * The script is idempotent on tag — it deletes any previously seeded
 * demo rows (identified by a `[DEMO]` prefix in their name / subject)
 * and re-inserts a fresh set. Run it any number of times.
 *
 * Usage:
 *   node scripts/seed-demo-data.js
 */

/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
});

const DEMO_TAG = '[DEMO]';

const client = new Client({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'digilearn_crm',
});

// ---------- time helpers ----------
const now = () => new Date();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysAhead = (n) => new Date(Date.now() + n * 86400000);
const hoursAhead = (n) => new Date(Date.now() + n * 3600000);
const hoursAgo = (n) => new Date(Date.now() - n * 3600000);
const todayAt = (hour) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
};

// ---------- tiny uuid helper ----------
const id = () => randomUUID();

async function main() {
  await client.connect();
  console.log('→ connected to postgres');

  // --- 1. grab real users and stages ---
  const users = (
    await client.query(
      `SELECT u.id, u.email, u.first_name
         FROM users u
        WHERE u.email IN ('admin@digilearn.com','rep1@digilearn.com','rep2@digilearn.com','manager@digilearn.com')`,
    )
  ).rows;
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  const admin = byEmail['admin@digilearn.com'];
  const rep1 = byEmail['rep1@digilearn.com']; // Tendai
  const rep2 = byEmail['rep2@digilearn.com']; // Grace
  const rep3 = byEmail['manager@digilearn.com']; // Sarah
  if (!admin || !rep1 || !rep2 || !rep3) {
    throw new Error('Expected 4 seeded users (admin + 3 sales_reps). Got: ' + users.map((u) => u.email).join(', '));
  }
  console.log(`→ users: admin=${admin.id.slice(0, 8)} tendai=${rep1.id.slice(0, 8)} grace=${rep2.id.slice(0, 8)} sarah=${rep3.id.slice(0, 8)}`);

  const stageRows = (
    await client.query(
      `SELECT s.id, s.name, s.sla_days, s.probability
         FROM stages s
         JOIN pipelines p ON p.id = s.pipeline_id
        ORDER BY s."order"`,
    )
  ).rows;
  const stageByName = Object.fromEntries(stageRows.map((s) => [s.name, s]));
  const pipelineId = (
    await client.query(`SELECT id FROM pipelines ORDER BY created_at LIMIT 1`)
  ).rows[0]?.id;
  if (!pipelineId) throw new Error('No pipeline found — cannot seed deals.');
  console.log(`→ pipeline ${pipelineId.slice(0, 8)} with ${stageRows.length} stages`);

  // --- 2. grab a diverse set of schools by name ---
  const schoolNames = [
    'Gateway Academy Harare',
    'Harare High School',
    'Bulawayo Primary',
    'Chinhoyi High School',
    'Gweru Central Primary',
    'Chipinge Primary',
    'Bindura Primary',
    'Epworth Community School',
    'Chiredzi Government School',
    'Beitbridge Primary',
  ];
  const schoolRows = (
    await client.query(
      `SELECT id, name, city, province FROM schools WHERE name = ANY($1::text[])`,
      [schoolNames],
    )
  ).rows;
  const schoolByName = Object.fromEntries(schoolRows.map((s) => [s.name, s]));
  for (const n of schoolNames) {
    if (!schoolByName[n]) console.warn(`⚠ school missing: ${n}`);
  }

  // --- 3. wipe any previously seeded demo rows ---
  console.log('→ wiping previous demo rows');
  // activities tagged as DEMO
  const prevActivityIds = (
    await client.query(
      `SELECT id FROM activities WHERE subject LIKE $1 OR description LIKE $1`,
      [`%${DEMO_TAG}%`],
    )
  ).rows.map((r) => r.id);
  if (prevActivityIds.length) {
    await client.query(`DELETE FROM activities WHERE id = ANY($1::uuid[])`, [prevActivityIds]);
  }
  // deals tagged as DEMO (by title prefix)
  const prevDealIds = (
    await client.query(`SELECT id FROM deals WHERE title LIKE $1`, [`%${DEMO_TAG}%`])
  ).rows.map((r) => r.id);
  if (prevDealIds.length) {
    await client.query(`DELETE FROM deals WHERE id = ANY($1::uuid[])`, [prevDealIds]);
  }
  // leads tagged as DEMO — cascades to qualification_criteria
  const prevLeadIds = (
    await client.query(`SELECT id FROM leads WHERE lead_name LIKE $1`, [`%${DEMO_TAG}%`])
  ).rows.map((r) => r.id);
  if (prevLeadIds.length) {
    await client.query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [prevLeadIds]);
  }
  // demo contacts
  await client.query(`DELETE FROM contacts WHERE notes LIKE $1`, [`%${DEMO_TAG}%`]);
  console.log(`  wiped ${prevActivityIds.length} activities, ${prevDealIds.length} deals, ${prevLeadIds.length} leads`);

  // --- 4. upsert a primary contact per school (so leads have phone/email) ---
  console.log('→ upserting primary contacts');
  const contactByschool = {};
  const contactsToSeed = [
    { school: 'Gateway Academy Harare', first: 'Tatenda', last: 'Mukono', role: 'Head', phone: '+263772111222', email: 'head@gatewayacademy.co.zw' },
    { school: 'Harare High School',      first: 'Rudo',    last: 'Chikwava', role: 'Head', phone: '+263772333444', email: 'principal@hararehigh.ac.zw' },
    { school: 'Bulawayo Primary',        first: 'Simba',   last: 'Ndlovu',   role: 'Deputy Head', phone: '+263772555666', email: 'deputy@bulawayoprimary.ac.zw' },
    { school: 'Chinhoyi High School',    first: 'Chipo',   last: 'Mhlanga',  role: 'ICT Coordinator', phone: '+263772777888', email: 'ict@chinhoyihigh.ac.zw' },
    { school: 'Gweru Central Primary',   first: 'Panashe', last: 'Dube',     role: 'Bursar', phone: '+263772999000', email: null },
    { school: 'Chipinge Primary',        first: 'Nyasha',  last: 'Moyo',     role: 'Head', phone: null, email: 'head@chipingeprimary.ac.zw' }, // missing phone → incomplete
    { school: 'Bindura Primary',         first: 'Tafadzwa',last: 'Gumbo',    role: 'Head', phone: '+263773111222', email: 'head@binduraprimary.ac.zw' },
    { school: 'Epworth Community School',first: 'Rufaro',  last: 'Zulu',     role: 'Administrator', phone: '+263773333444', email: 'admin@epworthschool.ac.zw' },
    { school: 'Chiredzi Government School',first: 'Blessing',last: 'Mangwiro',role: 'Head', phone: '+263773555666', email: null }, // missing email
    { school: 'Beitbridge Primary',      first: 'Munashe', last: 'Sibanda',  role: 'Head', phone: null, email: null }, // missing both → very incomplete
  ];
  for (const c of contactsToSeed) {
    const s = schoolByName[c.school];
    if (!s) continue;
    const cid = id();
    await client.query(
      `INSERT INTO contacts
        (id, school_id, first_name, last_name, role, is_primary, email, phone, whatsapp_number, preferred_contact_method, notes, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9,$10,TRUE,NOW(),NOW())`,
      [cid, s.id, c.first, c.last, c.role, c.email, c.phone, c.phone, c.phone ? 'phone' : 'email', `${DEMO_TAG} primary contact seed`],
    );
    contactByschool[c.school] = cid;
  }
  console.log(`  seeded ${Object.keys(contactByschool).length} contacts`);

  // --- 5. seed leads with deliberate UX states ---
  console.log('→ seeding demo leads');
  /*
   * Coverage matrix (each row triggers specific markers on the list + at-a-glance panel):
   *
   *   #  status       temp   SLA state          assignee  contact   qualification   notes
   *   1  Qualified    hot    ok (future)        rep1      yes       full            "gold standard" — everything complete
   *   2  Contacted    warm   breached           rep1      yes       needs BANT      SLA breach chip + qualify chip
   *   3  Nurture      cold   due_soon (past)    rep2      yes       partial         Due chip + partial data
   *   4  Contacted    hot    ok                 rep2      missing   none            critical data marker (no contact)
   *   5  New          null   null (no activity) rep1      yes       n/a             clean baseline
   *   6  Qualified    hot    ok                 rep3      yes       full            hot + qualified + complete
   *   7  Nurture      warm   null (no-next)     rep1      yes       partial         No-next chip + partial
   *   8  Contacted    cold   breached           rep2      partial   needs BANT      SLA + data chip combo
   *   9  Qualified    warm   ok                 rep3      yes       full            warm qualified
   *  10  Disqualified cold   null               rep2      yes       n/a             terminal state
   */
  const leadSeeds = [
    {
      name: `${DEMO_TAG} Gateway Academy — LMS rollout 2026`,
      school: 'Gateway Academy Harare', assignee: rep1, status: 'Qualified',
      source: 'Referral', estimated_value: 42000, temperature: 'hot', temperature_score: 88,
      sla_date: daysAhead(3), sla_breached: false,
      last_contacted_at: daysAgo(1), last_action_at: hoursAgo(6),
      notes: 'Principal asked for full ecosystem rollout starting next term. Budget approved by SDC.',
      qualification: { has_needs: true, has_plan_type: true, has_timeline: true, has_budget: true, has_verified_contact: true, has_influential_contact: true, plan_type: 'Annual subscription', timeline_type: 'next-term', budget_indicator: 'high', budget_amount: 42000, dmName: 'Tatenda Mukono', dmTitle: 'Head', score: 92, is_qualified: true },
      activities: [
        { type: 'call',    status: 'completed', subj: 'Discovery call — Head',                when: { completed_at: daysAgo(7) } },
        { type: 'meeting', status: 'completed', subj: 'Live demo with ICT staff',              when: { completed_at: daysAgo(2) } },
        { type: 'note',    status: 'completed', subj: 'Budget paper approved by SDC',          when: { completed_at: daysAgo(1) } },
        { type: 'task',    status: 'scheduled', subj: 'Send proposal + MSA draft',             when: { due_at: daysAhead(2), assignee: rep1 } },
        { type: 'meeting', status: 'scheduled', subj: 'Contract walk-through with Bursar',     when: { scheduled_at: daysAhead(5) } },
      ],
    },
    {
      name: `${DEMO_TAG} Harare High — Smart classroom pilot`,
      school: 'Harare High School', assignee: rep1, status: 'Contacted',
      source: 'Website', estimated_value: 18500, temperature: 'warm', temperature_score: 62,
      sla_date: daysAgo(4), sla_breached: true,
      last_contacted_at: daysAgo(9), last_action_at: daysAgo(9),
      notes: 'Interested but has not confirmed budget or decision-maker yet.',
      qualification: { has_needs: true, has_plan_type: false, has_timeline: false, has_budget: false, has_verified_contact: false, has_influential_contact: false, plan_type: null, timeline_type: null, budget_indicator: null, budget_amount: null, dmName: null, dmTitle: null, score: 30, is_qualified: false },
      activities: [
        { type: 'call',     status: 'completed',  subj: 'Intro call — receptionist',     when: { completed_at: daysAgo(9) } },
        { type: 'email',    status: 'completed',  subj: 'Sent brochure + pricing',       when: { completed_at: daysAgo(8) } },
        { type: 'task',     status: 'scheduled',  subj: 'Follow up on brochure',         when: { due_at: daysAgo(3), assignee: rep1 } }, // overdue
      ],
    },
    {
      name: `${DEMO_TAG} Bulawayo Primary — SMS student records`,
      school: 'Bulawayo Primary', assignee: rep2, status: 'Nurture',
      source: 'Event', estimated_value: 9200, temperature: 'cold', temperature_score: 28,
      sla_date: hoursAgo(10), sla_breached: false, // due passed but flag not toggled yet → "Due" chip
      last_contacted_at: daysAgo(22), last_action_at: daysAgo(22),
      notes: 'Mid-year contact from expo. Interest is low but keep warm for 2027 budget cycle.',
      qualification: { has_needs: true, has_plan_type: false, has_timeline: true, has_budget: false, has_verified_contact: true, has_influential_contact: false, plan_type: null, timeline_type: 'within-1-year', budget_indicator: null, budget_amount: null, dmName: 'Simba Ndlovu', dmTitle: 'Deputy Head', score: 48, is_qualified: false },
      activities: [
        { type: 'note',     status: 'completed',  subj: 'Met at Edu Expo Bulawayo',      when: { completed_at: daysAgo(22) } },
        { type: 'whatsapp', status: 'completed',  subj: 'WhatsApp ping — follow-up',     when: { completed_at: daysAgo(15) } },
        { type: 'task',     status: 'scheduled',  subj: 'Re-engage Q3 call',             when: { due_at: hoursAgo(10), assignee: rep2 } },
      ],
    },
    {
      name: `${DEMO_TAG} Chinhoyi High — Teacher training bundle`,
      school: 'Chinhoyi High School', assignee: rep2, status: 'Contacted',
      source: 'Cold Call', estimated_value: 15500, temperature: 'hot', temperature_score: 75,
      sla_date: daysAhead(1), sla_breached: false,
      last_contacted_at: daysAgo(2), last_action_at: daysAgo(2),
      notes: 'Very interested but no named decision-maker confirmed yet.',
      // No primary_contact will be attached → triggers "Data" critical marker
      skipPrimaryContact: true,
      qualification: { has_needs: true, has_plan_type: false, has_timeline: false, has_budget: false, has_verified_contact: false, has_influential_contact: false, plan_type: null, timeline_type: null, budget_indicator: null, budget_amount: null, dmName: null, dmTitle: null, score: 20, is_qualified: false },
      activities: [
        { type: 'call',     status: 'completed', subj: 'Cold call — reception routed',  when: { completed_at: daysAgo(3) } },
        { type: 'task',     status: 'scheduled', subj: 'Get ICT Coordinator name',      when: { due_at: todayAt(15), assignee: rep2 } }, // due today
      ],
    },
    {
      name: `${DEMO_TAG} Gweru Central — Smartboard upgrade`,
      school: 'Gweru Central Primary', assignee: rep1, status: 'New',
      source: 'Website', estimated_value: null, temperature: null, temperature_score: null,
      sla_date: null, sla_breached: false,
      last_contacted_at: null, last_action_at: null,
      notes: 'Just came in via website form today.',
      // New leads usually have no qualification rows
    },
    {
      name: `${DEMO_TAG} Chipinge Primary — Attendance & fees system`,
      school: 'Chipinge Primary', assignee: rep3, status: 'Qualified',
      source: 'Referral', estimated_value: 32000, temperature: 'hot', temperature_score: 91,
      sla_date: daysAhead(2), sla_breached: false,
      last_contacted_at: hoursAgo(20), last_action_at: hoursAgo(20),
      notes: 'Referred by Gateway Academy. Head is the decision-maker and wants start before end-of-term.',
      qualification: { has_needs: true, has_plan_type: true, has_timeline: true, has_budget: true, has_verified_contact: true, has_influential_contact: true, plan_type: 'Annual subscription + training', timeline_type: 'this-term', budget_indicator: 'high', budget_amount: 32000, dmName: 'Nyasha Moyo', dmTitle: 'Head', score: 95, is_qualified: true },
      activities: [
        { type: 'call',    status: 'completed', subj: 'Discovery — Head + Bursar',     when: { completed_at: daysAgo(5) } },
        { type: 'meeting', status: 'completed', subj: 'On-site demo',                  when: { completed_at: daysAgo(1) } },
        { type: 'task',    status: 'scheduled', subj: 'Send contract + payment plan',  when: { due_at: todayAt(17), assignee: rep3 } }, // due today
        { type: 'meeting', status: 'scheduled', subj: 'Sign-off meeting with SDC',     when: { scheduled_at: daysAhead(4) } },
      ],
    },
    {
      name: `${DEMO_TAG} Bindura Primary — Library digitisation`,
      school: 'Bindura Primary', assignee: rep1, status: 'Nurture',
      source: 'Email Campaign', estimated_value: 6400, temperature: 'warm', temperature_score: 54,
      sla_date: null, sla_breached: false,
      last_contacted_at: daysAgo(18), last_action_at: daysAgo(18),
      notes: 'Open to discussion but no next activity scheduled.',
      qualification: { has_needs: true, has_plan_type: false, has_timeline: false, has_budget: false, has_verified_contact: true, has_influential_contact: false, plan_type: null, timeline_type: null, budget_indicator: 'low', budget_amount: null, dmName: 'Tafadzwa Gumbo', dmTitle: 'Head', score: 40, is_qualified: false },
      activities: [
        { type: 'email', status: 'completed', subj: 'Replied to campaign email', when: { completed_at: daysAgo(18) } },
        { type: 'call',  status: 'completed', subj: 'Quick catch-up call',       when: { completed_at: daysAgo(14) } },
      ],
    },
    {
      name: `${DEMO_TAG} Epworth Community — Remote learning pack`,
      school: 'Epworth Community School', assignee: rep2, status: 'Contacted',
      source: 'Social Media', estimated_value: 7800, temperature: 'cold', temperature_score: 31,
      sla_date: daysAgo(2), sla_breached: true,
      last_contacted_at: daysAgo(12), last_action_at: daysAgo(12),
      notes: 'Missed 3 callbacks. Consider disqualifying if no response in 2 weeks.',
      qualification: { has_needs: false, has_plan_type: false, has_timeline: false, has_budget: false, has_verified_contact: false, has_influential_contact: false, plan_type: null, timeline_type: null, budget_indicator: null, budget_amount: null, dmName: null, dmTitle: null, score: 10, is_qualified: false },
      activities: [
        { type: 'call', status: 'completed', subj: 'Intro — voicemail',          when: { completed_at: daysAgo(12) } },
        { type: 'task', status: 'scheduled', subj: 'Third and final callback',   when: { due_at: daysAgo(2), assignee: rep2 } }, // overdue
      ],
    },
    {
      name: `${DEMO_TAG} Chiredzi Gov — Full ecosystem contract`,
      school: 'Chiredzi Government School', assignee: rep3, status: 'Qualified',
      source: 'Event', estimated_value: 58000, temperature: 'warm', temperature_score: 70,
      sla_date: daysAhead(5), sla_breached: false,
      last_contacted_at: daysAgo(3), last_action_at: daysAgo(3),
      notes: 'Large contract, procurement committee involved. Timing depends on government fiscal cycle.',
      qualification: { has_needs: true, has_plan_type: true, has_timeline: true, has_budget: true, has_verified_contact: true, has_influential_contact: true, plan_type: 'Multi-year subscription', timeline_type: 'within-6-months', budget_indicator: 'medium', budget_amount: 58000, dmName: 'Blessing Mangwiro', dmTitle: 'Head', score: 85, is_qualified: true },
      activities: [
        { type: 'meeting', status: 'completed', subj: 'Procurement committee meeting', when: { completed_at: daysAgo(10) } },
        { type: 'email',   status: 'completed', subj: 'Sent draft contract',           when: { completed_at: daysAgo(3) } },
        { type: 'task',    status: 'scheduled', subj: 'Chase procurement signoff',     when: { due_at: daysAhead(3), assignee: rep3 } },
        { type: 'task',    status: 'scheduled', subj: 'Align on training schedule',    when: { due_at: daysAhead(7), assignee: rep3 } },
      ],
    },
    {
      name: `${DEMO_TAG} Beitbridge Primary — Reporting module`,
      school: 'Beitbridge Primary', assignee: rep2, status: 'Disqualified',
      source: 'Cold Call', estimated_value: null, temperature: 'cold', temperature_score: 12,
      sla_date: null, sla_breached: false,
      last_contacted_at: daysAgo(30), last_action_at: daysAgo(30),
      notes: 'Out of budget for 2026. Archive.',
      reason: 'Out of budget for 2026.',
    },
  ];

  const leadIdByName = {};
  for (const seed of leadSeeds) {
    const school = schoolByName[seed.school];
    if (!school) continue;
    const leadId = id();
    leadIdByName[seed.name] = leadId;
    const primaryContactId = seed.skipPrimaryContact ? null : contactByschool[seed.school] ?? null;
    await client.query(
      `INSERT INTO leads
        (id, lead_name, status, reason, source, estimated_value, school_id, primary_contact_id, assigned_to, stage_id,
         notes, last_contacted_at, converted_at, current_sla_due_date, sla_breached, sla_breach_count,
         last_action_at, last_escalated_at, temperature, temperature_score, temperature_last_calculated,
         created_at, updated_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,
         $10,$11,NULL,$12,$13,$14,
         $15,NULL,$16,$17,$18,
         NOW() - INTERVAL '14 days', NOW())`,
      [
        leadId, seed.name, seed.status, seed.reason ?? null, seed.source,
        seed.estimated_value, school.id, primaryContactId, seed.assignee.id,
        seed.notes, seed.last_contacted_at, seed.sla_date, seed.sla_breached, seed.sla_breached ? 1 : 0,
        seed.last_action_at, seed.temperature, seed.temperature_score, seed.temperature ? daysAgo(1) : null,
      ],
    );

    if (seed.qualification) {
      const q = seed.qualification;
      await client.query(
        `INSERT INTO lead_qualification_criteria
          (id, lead_id, needs, qualification_needs, has_needs, plan_type, has_plan_type,
           timeline_type, specific_date, has_timeline,
           budget_indicator, budget_amount, has_budget,
           has_verified_contact, decision_maker_name, decision_maker_title, has_influential_contact,
           checklist, qualification_score, is_qualified, created_at, updated_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())`,
        [
          id(), leadId,
          q.has_needs ? 'LMS + attendance + fees' : null,
          q.has_needs ? JSON.stringify([{ id: id(), name: 'LMS annual', price: 20000, tax: 0, discount: 0 }]) : null,
          q.has_needs,
          q.plan_type, q.has_plan_type,
          q.timeline_type, q.has_timeline,
          q.budget_indicator, q.budget_amount, q.has_budget,
          q.has_verified_contact, q.dmName, q.dmTitle, q.has_influential_contact,
          JSON.stringify({ phone_verified: q.has_verified_contact, email_verified: q.has_verified_contact, province_verified: true }),
          q.score, q.is_qualified,
        ],
      );
    }

    // activities for the lead
    for (const a of seed.activities ?? []) {
      const aw = a.when || {};
      await client.query(
        `INSERT INTO activities
          (id, type, status, subject, description, lead_id, deal_id, contact_id,
           created_by_id, assigned_to_id, scheduled_at, due_at, completed_at, duration,
           is_automated, is_pinned, created_at, updated_at, archived_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9,$10,$11,$12,NULL,FALSE,FALSE,NOW(),NOW(),NULL)`,
        [
          id(), a.type, a.status, `${DEMO_TAG} ${a.subj}`, `${DEMO_TAG} seeded for demo`,
          leadId, primaryContactId, admin.id, (aw.assignee ?? seed.assignee).id,
          aw.scheduled_at ?? null, aw.due_at ?? null, aw.completed_at ?? null,
        ],
      );
    }
  }
  console.log(`  seeded ${Object.keys(leadIdByName).length} leads (+ qualification rows + activity feed)`);

  // --- 6. seed deals across every pipeline stage ---
  console.log('→ seeding demo deals across all stages');
  /*
   * Each deal references a qualified lead. Stage + currentStageSince combo is tuned
   * so at least one deal in each non-terminal stage is past its SLA (triggers
   * "N overdue" chip in kanban header), and a mix have temperature=hot on the
   * parent lead (triggers "N hot" chip via the join condition).
   *
   *   Discovery (sla 3)       : 2 deals  — 1 ok,      1 overdue (6d)
   *   Demo Scheduled (sla 5)  : 2 deals  — 1 ok (hot),1 overdue (8d, hot)
   *   Proposal Sent (sla 7)   : 3 deals  — 1 ok (hot),1 ok warm, 1 overdue (12d)
   *   Negotiation (sla 10)    : 2 deals  — 1 ok (hot),1 overdue (14d hot)
   *   Closed Won (sla 0)      : 1 deal   — won last week
   *   Closed Lost (sla 0)     : 1 deal   — lost 3 weeks ago
   */
  const dealSeeds = [
    { lead: leadSeeds[0].name, stage: 'Discovery',      stageAge: 1,  value: 42000, hot: true,  close: 'ongoing' },
    { lead: leadSeeds[4].name, stage: 'Discovery',      stageAge: 6,  value: 11500, hot: false, close: 'ongoing' }, // overdue (no lead.temperature=hot → won't count as hot)
    { lead: leadSeeds[5].name, stage: 'Demo Scheduled', stageAge: 2,  value: 32000, hot: true,  close: 'ongoing' },
    { lead: leadSeeds[3].name, stage: 'Demo Scheduled', stageAge: 8,  value: 15500, hot: true,  close: 'ongoing' }, // overdue + hot
    { lead: leadSeeds[8].name, stage: 'Proposal Sent',  stageAge: 3,  value: 58000, hot: false, close: 'ongoing' },
    { lead: leadSeeds[0].name, stage: 'Proposal Sent',  stageAge: 4,  value: 21000, hot: true,  close: 'ongoing', titleSuffix: ' Phase 2' },
    { lead: leadSeeds[1].name, stage: 'Proposal Sent',  stageAge: 12, value: 18500, hot: false, close: 'ongoing' }, // overdue
    { lead: leadSeeds[5].name, stage: 'Negotiation',    stageAge: 4,  value: 32000, hot: true,  close: 'ongoing', titleSuffix: ' renewal terms' },
    { lead: leadSeeds[8].name, stage: 'Negotiation',    stageAge: 14, value: 58000, hot: true,  close: 'ongoing', titleSuffix: ' multi-year' }, // overdue + hot
    { lead: leadSeeds[0].name, stage: 'Closed Won',     stageAge: 6,  value: 42000, hot: true,  close: 'won',    closeAgo: 6 },
    { lead: leadSeeds[1].name, stage: 'Closed Lost',    stageAge: 20, value: 9500,  hot: false, close: 'lost',   closeAgo: 20, lostReason: 'Chose competitor on price' },
  ];

  const leadRowsById = (
    await client.query(
      `SELECT id, lead_name, school_id, temperature, assigned_to, estimated_value FROM leads WHERE id = ANY($1::uuid[])`,
      [Object.values(leadIdByName)],
    )
  ).rows;
  const leadById = Object.fromEntries(leadRowsById.map((l) => [l.id, l]));

  for (const d of dealSeeds) {
    const leadId = leadIdByName[d.lead];
    if (!leadId) continue;
    const lead = leadById[leadId];
    const stage = stageByName[d.stage];
    if (!stage) continue;

    const dealId = id();
    const currentStageSince = daysAgo(d.stageAge);
    const expectedClose = d.close === 'ongoing' ? daysAhead(14) : null;
    const actualClose = d.closeAgo ? daysAgo(d.closeAgo) : null;
    const title = `${DEMO_TAG} ${lead.lead_name.replace(DEMO_TAG, '').trim()}${d.titleSuffix || ''}`;
    // Override temperature of parent lead to match if requested (deals render based on lead.temperature via join).
    if (d.hot && lead.temperature !== 'hot') {
      await client.query(`UPDATE leads SET temperature='hot', temperature_score=80 WHERE id=$1`, [leadId]);
    }

    await client.query(
      `INSERT INTO deals
        (id, lead_id, school_id, current_stage_id, pipeline_id, assigned_to, title, description,
         value, currency, current_status, current_stage_since, probability, position, rollback_count,
         expected_close_date, actual_close_date, lost_reason,
         health_score, health_score_stakeholder_engagement, health_score_timing, health_score_competition, health_score_budget,
         health_score_last_calculated, close_status, created_at, updated_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,
         $9,'USD',$10,$11,$12,1000,0,
         $13,$14,$15,
         $16,$17,$18,$19,$20,
         NOW(),$21,NOW(),NOW())`,
      [
        dealId, leadId, lead.school_id, stage.id, pipelineId, lead.assigned_to, title, `${DEMO_TAG} auto-seeded demo deal`,
        d.value, stage.name, currentStageSince, Math.round(Number(stage.probability)),
        expectedClose, actualClose, d.lostReason ?? null,
        d.hot ? 78 : 55, d.hot ? 80 : 60, d.hot ? 80 : 50, 70, d.hot ? 90 : 55,
        d.close,
      ],
    );

    // Add one scheduled task tied to the deal so the deal shows activity (also flows into Tasks hub)
    if (d.close === 'ongoing') {
      await client.query(
        `INSERT INTO activities
          (id, type, status, subject, description, lead_id, deal_id, contact_id,
           created_by_id, assigned_to_id, scheduled_at, due_at, completed_at, duration,
           is_automated, is_pinned, created_at, updated_at, archived_at)
         VALUES
          ($1,'task','scheduled',$2,$3,$4,$5,NULL,$6,$7,NULL,$8,NULL,NULL,FALSE,FALSE,NOW(),NOW(),NULL)`,
        [
          id(), `${DEMO_TAG} Advance ${stage.name} — ${lead.lead_name.slice(DEMO_TAG.length + 1, 60)}`,
          `${DEMO_TAG} auto-seeded task for deal`,
          leadId, dealId, admin.id, lead.assigned_to, daysAhead(Math.max(1, stage.sla_days - d.stageAge)),
        ],
      );
    }
  }
  console.log(`  seeded ${dealSeeds.length} deals`);

  // --- 7. extra standalone tasks to fill the Tasks Hub smart views ---
  //     We deliberately add a tranche of tasks assigned to admin so the admin's
  //     "my overdue / due today / upcoming / no due" counts are meaningful.
  console.log('→ seeding extra tasks for admin so smart-view counts pop');
  const adminLead = leadIdByName[leadSeeds[0].name];
  const extraTasks = [
    // my-overdue (admin)
    { subj: 'Review Q2 pipeline forecast',       due_at: daysAgo(5), assignee: admin, lead: adminLead, status: 'scheduled' },
    { subj: 'Sign off Gateway Academy proposal', due_at: daysAgo(2), assignee: admin, lead: adminLead, status: 'scheduled' },
    { subj: 'Escalate: 2 SLA-breached leads',    due_at: daysAgo(1), assignee: admin, lead: null,      status: 'scheduled' },
    // due today (admin)
    { subj: 'Weekly 1-1 with Tendai',            due_at: todayAt(14), assignee: admin, lead: null, status: 'scheduled' },
    { subj: 'Approve Chipinge contract',         due_at: todayAt(16), assignee: admin, lead: leadIdByName[leadSeeds[5].name], status: 'scheduled' },
    // upcoming (admin)
    { subj: 'Prep monthly board report',         due_at: daysAhead(2), assignee: admin, lead: null, status: 'scheduled' },
    { subj: 'Interview new SDR candidate',       due_at: daysAhead(4), assignee: admin, lead: null, status: 'scheduled' },
    { subj: 'Quarterly pipeline review',         due_at: daysAhead(9), assignee: admin, lead: null, status: 'scheduled' },
    // no-due (admin)
    { subj: 'Backlog: audit lost-reason taxonomy',                assignee: admin, lead: null, status: 'scheduled' },
    { subj: 'Backlog: pilot ROI write-up for Gateway Academy',     assignee: admin, lead: adminLead, status: 'scheduled' },
    // completed (admin) — recent
    { subj: 'Approved training schedule for Chiredzi', completed_at: daysAgo(1), assignee: admin, lead: leadIdByName[leadSeeds[8].name], status: 'completed' },
    { subj: 'Closed out Beitbridge lead as disqualified', completed_at: daysAgo(3), assignee: admin, lead: leadIdByName[leadSeeds[9].name], status: 'completed' },
    { subj: 'Onboarded new school Gateway Academy', completed_at: daysAgo(4), assignee: admin, lead: adminLead, status: 'completed' },
    { subj: 'Reviewed monthly SLA compliance report', completed_at: daysAgo(6), assignee: admin, lead: null, status: 'completed' },
  ];
  for (const t of extraTasks) {
    await client.query(
      `INSERT INTO activities
        (id, type, status, subject, description, lead_id, deal_id, contact_id,
         created_by_id, assigned_to_id, scheduled_at, due_at, completed_at, duration,
         is_automated, is_pinned, created_at, updated_at, archived_at)
       VALUES
        ($1,'task',$2,$3,$4,$5,NULL,NULL,$6,$7,NULL,$8,$9,NULL,FALSE,FALSE,NOW(),NOW(),NULL)`,
      [
        id(), t.status, `${DEMO_TAG} ${t.subj}`, `${DEMO_TAG} seeded for Tasks Hub`,
        t.lead, admin.id, t.assignee.id,
        t.due_at ?? null, t.completed_at ?? null,
      ],
    );
  }
  console.log(`  seeded ${extraTasks.length} extra tasks for admin`);

  // --- 8. summary ---
  const summary = (
    await client.query(`
      SELECT
        (SELECT count(*) FROM leads WHERE lead_name LIKE $1) AS demo_leads,
        (SELECT count(*) FROM deals WHERE title LIKE $1) AS demo_deals,
        (SELECT count(*) FROM activities WHERE subject LIKE $1) AS demo_activities,
        (SELECT count(*) FROM activities WHERE subject LIKE $1 AND type = 'task') AS demo_tasks,
        (SELECT count(*) FROM activities WHERE subject LIKE $1 AND type = 'task' AND status = 'scheduled' AND due_at IS NOT NULL AND due_at < NOW()) AS overdue_tasks,
        (SELECT count(*) FROM leads WHERE lead_name LIKE $1 AND sla_breached = true) AS breached_leads
    `, [`%${DEMO_TAG}%`])
  ).rows[0];

  console.log('\n=== seed summary ===');
  console.table(summary);

  await client.end();
  console.log('\n✓ demo seed complete');
}

main().catch((e) => {
  console.error('SEED FAILED:', e);
  client.end().catch(() => {});
  process.exit(1);
});
