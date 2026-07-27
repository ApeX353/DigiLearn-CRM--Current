# Codebase Skeleton — DigiLearn CRM

**What this is:** the map to re-orient from cold. Read this first if you
have lost context. It records how the system is built, how it is run and
deployed, the rules that govern changes, and the traps that have already
cost time. Facts here are load-bearing — verify before contradicting.

Companion documents: `BUGFIXES.md` (what broke, why, and how it was
fixed — newest first), `DEPLOYMENT-RULES.md`, `E2E-FINDINGS.md`,
`CREDENTIALS.local.md` (git-ignored).

---

## 1. Shape of the thing

Two apps in one repo, both TypeScript:

| | Path | Stack |
|---|---|---|
| API | `crm-v2-server/` | NestJS + TypeORM + PostgreSQL |
| Web | `crm-v2-client/` | React + Vite + TanStack Query + shadcn/ui |

Branches: **`dube-upgrades`** is the working branch and holds everything.
`main` is the baseline. `prod-ticketing` was a surgical branch used for
cherry-picks in July 2026 — production has since moved back to builds cut
from `dube-upgrades`.

Server layout — one directory per domain, each with
`*.controller.ts`, `*.service.ts`, `dto/`, `entities/`:

```
src/
  auth/        JWT, guards, RolesGuard, account-security (argon2)
  activities/  calls, meetings, whatsapp, notes, tasks — the busiest module
  leads/       leads + duplicate detection, SLA, temperature, qualification
  schools/     schools + contacts
  deals/ quotes/ invoices/ payments/ collections/
  bug-reports/ the in-house ticket system
  settings/    key/value settings + compliance policy switches
  database/migrations/   timestamped, guarded, run at boot
  database/seeds/        roles + permissions, admin user
```

Client layout: `src/api/<domain>/` holds `types.ts` (zod schemas +
TypeScript types) and `use-*.ts` (TanStack Query hooks). Screens live in
`src/pages/`, shared UI in `src/components/`, pure logic in `src/lib/`.

---

## 2. Permissions — read this before touching any endpoint

Two layers, and they disagree more often than you would expect:

1. **`@Roles('admin', …)`** on the controller — coarse role gate.
   ~238 declarations across 39 controllers.
2. **CASL abilities** seeded per role in
   `database/seeds/seed-roles-permissions.ts`, with JSON `conditions`
   like `{"assigned_to":"${id}"}` that services translate into SQL.

Key facts, each learned the hard way:

- **`admin_support` satisfies `admin`** via `ROLE_ALIASES` in
  `auth/guards/roles.guard.ts`. It was in zero `@Roles()` declarations
  and so was locked out app-wide (R2); the equivalence is declared once
  there rather than edited into 238 decorators.
- **Condition keys must match what the reading code expects.** An
  unmapped key passes straight through to SQL as a column name. A
  `createdBy` that no column matched caused 500s on Quotes and Invoices
  (R1); a seeded `assignedTo` where the deals board read `assigned_to`
  silently scoped *nothing* (SEED1) — no error, the rep just saw
  everything.
- **Roles on production:** `nkululeko` (admin — Mr Dube, the owner),
  `prince@me.com` (admin_support — the maintainer account),
  `mpofunk` / `busid` (sales_manager — Kim, busi), `solomon` (manager),
  `tanyag` / `manakedube` (sales_rep).
- **Managers see every lead** (`conditions: null`). Reps are scoped to
  their own. There is **no per-lead ACL** — you cannot show a lead to
  three named people. Leaving a lead unassigned hides it from all reps
  but not from managers or admins.

### Visibility rules that are policy, not accident

- **Activities follow the record's current owner** (R15, owner ruling
  2026-07-27). A rep sees an activity if they created it, are assigned
  it, or the parent lead/deal is assigned to them. Reassigning a lead
  hands the new rep its full history and removes it from the old one.
  Managers and admins are unaffected. Enforced in `findAll`, `findOne`
  and the lead-stats endpoint alike; misses read **404**, never 403, so
  ids cannot be probed.
- **Bug tracker** — three audiences, deliberately different:
  product owner (admin) sees title/severity/status/solved-date and the
  clickable plain-language detail; triagers (admin_support **and sales
  managers**, MGRBUG1) get the full list plus assign/status controls;
  everyone else sees only what they reported.

---

## 3. Running it locally

- **PostgreSQL 16** portable at `C:\Users\8Y14\pgsql-local\pgsql`, data in
  `…\pgsql-local\data`, on **127.0.0.1:5433** (5432 is an unrelated
  system service — leave it alone). Start: `start-local-postgres.ps1`.
- **API**: `start-local-server.ps1` (port 3001). **Web**: `npm run dev`
  in `crm-v2-client` (port 5173).
- **The legacy MySQL restore** — the pristine copy of the old live
  system — runs via `start-local-mysql.ps1` on 3306, database
  `digilearn_crm_v2_live`. **Never mutated.** It is the only source of
  truth for "what did the old CRM actually hold", and it has settled
  several arguments. Converted to Postgres by
  `crm-v2-server/scripts/mysql-to-pg-etl.mjs` — a straight table copy,
  no status mapping.
- Local logins: `nkululeko@clearhue.co.zw` / `doobsie81@gmail.com`, both
  `LocalAdmin2026`. Do not put `#` in dotenv values — dotenv truncates
  there.

---

## 4. Environments and deployment

| | Client | API |
|---|---|---|
| staging | staging.digilearncrm.work | api-staging.digilearncrm.work/api/v2 |
| production | crm.digilearncrm.work | api.digilearncrm.work/api/v2 |

Hosted on **CapRover** on a Contabo VPS (169.58.55.55). CapRover apps:
`api` / `crm` (production), `api-staging` / `staging`, `pg-prod`,
`pg-staging`. Dashboard `captain.digilearncrm.work`.

**Deploy recipe that works** (the CapRover CLI crashes headless — do not
use it):

```bash
git archive --format=tar.gz -o /tmp/server.tar.gz HEAD:crm-v2-server
node <scratchpad>/caprover-deploy.mjs api-staging /tmp/server.tar.gz
```

Then **poll live behaviour until it promotes.** Builds take **10–20
minutes** and a finished build is not a promoted container. Never trust
`isBuildFailed` alone.

**Traps, all of which have bitten:**
- Key the wait on the behaviour of the build you just shipped. Waiting on
  an older change's behaviour reports success on the wrong build.
- A poller crashing with `ECONNRESET` usually means the container swapped
  mid-request — that is success; re-probe.
- The client bakes `VITE_PUBLIC_API_URL` at build time; it must be set as
  a CapRover app env var or the bundle points at localhost.
- Verify the client by fetching `/` and grepping the bundle hash and a
  string you know the new build contains.

**Rules (`DEPLOYMENT-RULES.md`, and they are not optional):** staging
first, verify live per affected role, then **explicit** sign-off before
production. "Push" alone never means production — the owner says "push to
production". Slow and correct beats fast and redone.

---

## 5. Domain rules worth knowing before changing behaviour

- **Activity status vocabulary:** `scheduled`, `in_progress`,
  `completed`, `cancelled`, `overdue`. The **old CRM had only
  `scheduled` and `completed`** — no `cancelled` at all — and its
  `scheduled` was a catch-all meaning "logged, never closed" (3,663 of
  3,817 undated). Reps logged work *after* doing it. Treating those rows
  as stale open tasks is what caused the 1,287-activity mistake of
  2026-07-23. See `BUGFIXES.md` 2026-07-27.
- **Completing an activity has side effects.** It stamps `completed_at`
  **now**, and propagates to the parent lead — `last_contacted_at` and
  `last_action_at` — but only for contact types (call/meeting/whatsapp/
  email). Bulk-completing historical work therefore rewrites history and
  resets idle/SLA detection. **Check what a transition propagates before
  running it a thousand times.**
- **Completion requires an `outcome`**, and it is a fixed enum, not free
  text (`activities_completion_outcome_enum`). Free-form explanation goes
  in `completion_note`. When the true result is unknown,
  `relationship_touchpoint_complete` asserts the contact happened and
  nothing more.
- **Next-step compliance:** the server can require a next step at
  completion (`compliance.policy.enforce_next_step_on_completion`), but
  **the client never sends a `next_step` payload** — it marks done first
  and asks afterwards. With the switch on, reps get an unclearable 400 on
  any lead with nothing else scheduled. Keep it **off** until the dialog
  sends the payload (ticket NEXT2).
- **City is mandatory** for every user-created school — except the bulk
  import, which runs as admin/admin_support. Imported schools land
  city-less and show "Click here to enter city"; **any** signed-in user
  can fill a missing one (`PATCH /schools/:id/city`), while changing a
  city already set stays a manager/admin action. The exemption exists in
  **two** places — `SchoolsService` and the lead-creation path in
  `LeadsService` — because the import creates leads, not schools.
- **New leads are left unassigned** when a rep creates them (ASGN1); a
  manager assigns.
- **Hygiene score is computed client-side** in `src/lib/lead-hygiene.ts`,
  never stored: data completeness 25 + activity discipline 30 (open next
  step 12 / no overdue 6 / touched within 72h 6 / outcome compliance on
  the last five completions 6, −3 for missing notes) + process discipline
  20 + BANT qualification 25. Bands 90 / 75 / 60.
- **Duplicate detection** (`leads/services/duplicate-detection.service.ts`)
  scores name + city + district + phone against a threshold of 50.
  Schools carry no phone or email, so school name alone must reach it:
  exact 50, near-exact 45 plus one supporting signal (DUP4). Trigram
  scores alone are unsafe — "DANDA HIGH" scores 1.00 against
  "Dandanda Primary".
- **Phone matching:** normalise to the **last 9 digits**. Coverage is
  99.4% of contacts, far better than district (8% populated). A phone
  match alone must never auto-merge — 158 numbers are shared.
- **Settings are cached in-process for 30 seconds**
  (`ComplianceSettingsService`), so a policy change takes effect within
  half a minute, not instantly.

---

## 6. Migrations and seeds

`database/migrations/<timestamp>-<Name>.ts`, run at boot when
`DB_RUN_MIGRATIONS=true`. **Always guard** with `hasTable` / `hasColumn`
so a rerun is a no-op — see `1768…-AddBugReportResolvedAt.ts` and
`1769…-MakeSchoolCityNullable.ts` as the house style. Write a real
`down()`. `DB_SYNCHRONIZE` stays **false** everywhere.

Seeds run at boot when `DB_RUN_SEEDS=true`. Editing a seed only affects
fresh environments — live rows keep whatever they already have, which is
why a seed/reader mismatch can hide for months (SEED1).

---

## 7. Working practices

- **Bugs are fixed on discovery and always documented** in
  `BUGFIXES.md` — symptom, root cause, fix, data impact. Tickets live in
  the in-house tracker on **both** staging and production; file on both.
- **Write for the reader.** The owner and the sales managers read these
  tickets. Plain words, no jargon: what went wrong, what it meant for
  them, what was done.
- **Never invent data to satisfy a rule.** Leave a field blank, or say
  "not known". Numbers scope a problem; they do not name a person.
- **Read the file before naming a cause.** Two wrong diagnoses (SC2,
  DUP3) came from reasoning about code from a summary instead of opening
  it.
- **Prefer reversible.** Write a manifest or an undo file before a bulk
  change (`undo-closeoff-prod-2026-07-23.csv`, `nash-manifest-prod.json`
  are the pattern), and dry-run by default with `--apply` to commit.
- **Verify live, per role.** A passing build proves nothing about
  production behaviour.

---

## 8. Environment quirks

- Windows + Git Bash. PowerShell here-strings mangle quotes — use
  `git commit -F <file>` for commit messages.
- The permission classifier blocks: SSH, writing production settings,
  bulk production mutations, and reading credential material. Those steps
  are handed to the user to run with `!`. The pattern that does work for
  reads and small writes is
  `TOKEN=$(curl -s … /auth/login …) && curl -s … -d @body.json`.
- For SSH work handed to the user: **base64 the whole remote script** —
  a `$argon2…` string passed as an ssh argument gets expanded by the
  remote shell. And **write it to a temp file before running it**; piping
  a script into `bash` lets an inner `docker exec -i` swallow the rest of
  it, which fails silently.
- `tar --force-local` only works in Git Bash, not Windows `tar.exe`.
  `git archive` avoids the problem entirely.
- Node scripts live in the session scratchpad, not the repo. Keep the
  repo clean — no stray `*.json` API dumps at the root.
