# Staging — what it runs, what it proves, what is still owed

*Single source of truth for staging. Last verified **24 August 2026** against the
running containers and both databases. Supersedes `VER-16AUG.md`,
`VERIFY-AUG11-ON-STAGING.md` and `TEST-PLAN-DUBE-AUG1718.md`, which this file
replaces.*

- **Client** https://staging.digilearncrm.work · **API** https://api-staging.digilearncrm.work/api/v2
- CapRover apps `staging` / `api-staging` / `pg-staging` · database `digilearn_crm_staging`
- Logins are in `CREDENTIALS.local.md`. Several tests below only prove anything
  when a **rep** does them, because managers bypass the controls being tested.

---

## 1. What staging is actually running

Verified 24 Aug by grepping the running containers, not by trusting the deploy log:

| App | Image | Container started | Evidence |
|---|---|---|---|
| `api-staging` | `img-captain-api-staging:96` | 21 Aug 14:38 UTC | guard string present in `/usr/src/app/dist/invoices/invoices.service.js` |
| `staging` | `img-captain-staging:77` | 21 Aug 14:46 UTC | no `ZAR` anywhere in `/usr/share/nginx/html/assets` |

**How to probe a build properly.** Grep only for strings that survive a
production build — a thrown message on the server, a string literal on the
client. Two probes that looked like proof of absence and were worthless: the
server lives at `/usr/src/app`, **not** `/app`; and `configuredCurrency` is a
local const that Vite minifies away. Check the path exists before believing an
empty grep.

Staging's client and API deploy separately and drift. Rule out build skew
before diagnosing any staging bug.

---

## 2. Proven on staging

- **Disqualification approval workflow — verified 12/12 end to end.** Rep raises
  a disqualification, managers are notified; manager asks for more information,
  the rep is notified; rep answers, it returns to the manager. The lead reports
  `pending_approval` with `waiting_on` flipping between `manager` and `rep`,
  which drives the banner.
- **Invoice status guard.** `Paid` is refused unless the money is on the
  invoice; `Partially-Paid` unless a payment exists. Both refusals name the
  invoice and the amounts.
- **Currency fix.** The deal form takes the configured currency via
  `useCurrency()` instead of a hardcoded `ZAR`.
- **Notification flood stopped.** 806 idle alerts every two hours, down to 1 in
  24 hours.
- **`ruvheneko-school-merge.sql` committed 20 Aug** — 3 records became 1,
  verified through the API (1 school, 3 leads, invoices reachable).
- **`currency-relabel-zar-to-usd.sql` committed 24 Aug** — 26 deals relabelled,
  0 ZAR left, USD 15 to 41, $315,265 of value. Backup table
  `currency_relabel_backup_20260821`; undo at the foot of the script.

### Known-bad rows still on staging

Two legacy invoices are `Paid` with `amount_paid = 0.00`: **INV-2026-0056**
(last touched 14 Aug) and **INV-2026-0062** (20 March). Both predate the guard —
**no invoice has entered that state since it deployed.** They need a person to
correct them, but see the warning in section 4.

---

## 3. Staging vs production — the current diff (24 Aug, measured)

Staging runs branch **`dube-aug2324`**; production runs **`prod-fixes-aug20`**.
Code compared with `git cherry` (patch content, so cherry-picks are matched
correctly — ancestry is useless here because every cherry-pick changes the
hash). Data compared by querying both databases.

### 3a. Code on staging that production does NOT have

**The Aug 17–18 Dube port (11 commits)**
- Unblock qualification: leads had no stakeholder, and nobody had payment plans
- Clicking an activity opens the record it belongs to
- Show an activity's lead and deal on the row; owner is for managers
- Finance sees the activity owner too
- Invoice stats counted split invoices twice; drafts counted as sales
- A school's outstanding balance stops counting instalment children, or paid money
- Disqualification answers its own question, and the approval rule holds everywhere
- Finish the sweep: a malformed id is a 400 everywhere, not a 500
- Port fix-ups + the port doc

**The Aug 23–24 Dube port (4 commits)**
- History is history, the record owes one next step, and a dead lead is archived
- The gate cannot be fed its own casualties, and a logged email is never sent

**Ours**
- Commercial intent becomes satisfiable without weakening it
- SLA escalation stops skipping leads whose history moved on (`8b1f72b`)
- Correcting a wrong Paid badge is a person's call, and must not email anyone (`85965b4`)
- Won and Lost stop reporting NaN (`5032cfc`) — **prod still shows `$NaN`**
- New deals take the configured currency, not a hardcoded ZAR
- An invoice status has to match the money on it
- Disqualification approval tells people, and the lead says it is waiting
- Migrations get unique timestamps

### 3b. Code on production that staging's branch does NOT have

Five commits, all from the production line's own malformed-id and
converted-lead work:

- A mistyped id is a 400 on leads too, and Ruvheneko becomes one school
- Import ParseUUIDPipe where the baseline lacked it
- Finish the malformed-id sweep on the production line
- Delete the Ingwalo repair script — its premise was wrong
- A converted lead can still be worked

Several are the **same fix expressed on a different lineage** (both lines fixed
the malformed-id 500 and the converted-lead block independently), so they show
as missing only because the patches differ. **Check each before the next prod
deploy** — a naive merge could revert a live production fix, which is exactly
the mistake made on staging on 24 Aug (see §3d).

### 3c. Data differences — both databases have moved, in opposite directions

| | Production | Staging |
|---|---|---|
| `app_settings.currency` | **no row** → falls back to `USD` | **`"ZAR"`** |
| Deals labelled ZAR | **29** | 0 (relabelled 24 Aug) |
| Leads, live | 2,125 | 2,089 |
| Leads disqualified | 241 | 236 |
| `lead_stakeholders` rows | 2,598 | **5,163** (backfilled) |
| Notes still `scheduled` | **271** | 0 (flipped by 1781) |
| Notifications | 220,168 | **314,615** |
| `user_notifications` rows | 254,306 | **375,515** |
| Invoices `Cancelled` | **0** | 6 (by 1784) |
| False-Paid invoices | **3** | 2 |
| His migrations 1781–1784 run | **0** | yes |

Two things worth reading twice:

- **The notification cleanup ran on PRODUCTION, not staging.** Prod carries
  254,306 fan-out rows; staging still has 375,515 including the whole idle-alert
  backlog. This is the one place production is *cleaner* than staging.
- **The currency setting is the whole "ZAR" story.** Production has no
  `currency` row at all, so `use-currency.ts` falls back to `DEFAULT_CURRENCY =
  "USD"`. Staging's row literally says `ZAR`, which is why the identical build
  renders ZAR there and USD on prod. One row, not a code difference.

### 3d. What the 24 Aug staging deploy got wrong

`dube-aug2324` was cut from `notif-aug20`, but staging was running
`disqualify-only`, which carried three fixes cherry-picked onto it on 21 August
that `notif-aug20` never had. The first deploy therefore **rolled back** the
disqualification approval workflow, the invoice status guard and the currency
fix. Confirmed by the running build: `notifyAboutRequest` and
`Record the payment and the` both absent, and `ZAR` back in the client bundle.

All three were cherry-picked back on and redeployed the same evening.

**The lesson:** before deploying, ask what the branch being *replaced* has that
the new one does not. Checking only that the new branch carries its own intended
work, and that it type-checks, will not catch a rollback.

### 3e. The migration renumbering re-ran two migrations on staging

`b293ac9` renumbered his four migrations to unique timestamps, on the stated
grounds that "his have run nowhere." **That was not verified and was wrong.**
Staging's `migrations` table already held `BackfillLeadStakeholders1768000000000`
and `CancelDuplicateMarchInvoices1770000000000` (ids 25 and 26), so renaming
them made TypeORM treat them as new work and **run both a second time** (ids 29
and 30).

No damage: both are written to be idempotent — the stakeholder backfill only
inserts where no row exists, and the invoice cancellation skips anything already
`Cancelled`. A non-idempotent migration would have done real harm.

**Production has never run any of the four** (checked: zero matching rows), so
they will run exactly once there.

**The lesson:** "has this migration run?" is answered by the deployed
`migrations` table, never by the source tree.


## 4. Committed, deployed nowhere

All on branch `notif-aug20`, which also carries the 11-commit Aug 17–18 port.

- **`8b1f72b` — SLA escalation fallback.** 16 leads are breached, in an
  escalating status, overdue since as far back as March, and have never
  escalated once. The sweep matched an open breached history row on the lead's
  *current* status; only `transitionStatus` closes the old row, and it closes
  only the row naming the status being left — so a stale row can never be
  closed by normal operation. 166 of 719 open rows on prod name a status the
  lead has left. The lookup now falls back to the most recent open breached row.
- **`85965b4` — safe invoice correction.** See below.

> **Do not correct an invoice status in the app until `85965b4` ships.**
> On the deployed build, moving an invoice from `Paid` back to `Sent`
> regenerates the PDF and **emails the address on the invoice** — and staging
> carries real school addresses. `Sent` is exactly where a false-Paid invoice
> belongs, so doing the right thing sends the wrong letter.

`85965b4` limits issuing to `Draft → Sent`, surfaces the server's refusal in the
client instead of a generic toast, and states in the confirmation what a
correction does and does not change. `Cancelled → Sent` no longer re-emails
either; deliberate re-issue wants its own action.

Still a decision for a person: `PATCH /invoices/:id/status` is
`@Roles('admin','sales_manager','sales_rep')`, so a rep can undo a money claim
on any invoice they can reach. Restricting corrections of a *settled* status to
manager/admin is proposed, not taken.

---

## 5. The Aug 17–18 port — test plan

Eleven commits, six things a person can see plus one database change. Test as
the rep `manakedube` where marked; record PASS/FAIL and what you saw. "Nothing
happened" is enough — we can find the rest.

1. **Qualification stopped being a dead end** *(rep)* — completing qualification
   asks for a decision maker, and that list used to be empty for almost every
   lead, so a lead could never be qualified and never converted.
2. **Activities say what they are about, and open it** *(rep + manager)*.
3. **Invoice figures stopped double-counting** *(manager)*.
4. **A school's outstanding balance got honest** *(manager)*.
5. **Disqualifying needs a manager, everywhere — the important one** *(rep)*.
   The Disqualify dialog enforced approval but a second route did not, so the
   control could be walked around. On production **234 leads are disqualified
   and not one approval request was ever recorded.** Expect: the rep is told it
   needs approval and a request appears in the manager's queue, and the lead is
   **not** disqualified on the spot; a manager can disqualify directly; a rep
   may fill in a missing reason but cannot overwrite one already on record;
   Contacted, Nurture and Converted are unaffected.
6. **A mistyped web address** *(anyone)* — `/leads/not-a-real-id`, and the same
   for a quote, an invoice and a school, gives a clear message, never a 500.

---

## 5b. The Aug 23–24 port (branch `dube-aug2324`) — deployed to staging 24 Aug

Four commits, two per repo, ported onto `notif-aug20`:

| Upstream | Ported | What |
|---|---|---|
| `72de3d2` / `dad7365` | `b9bbbc5` / `cab549e` | History is history; the record owes one next step; a dead lead is archived |
| `56fda99` / `d26fb9a` | `44591fa` / `9316062` | The adversarial follow-up: the gate cannot be fed its own casualties, and a logged email is never sent |

Plus `b293ac9` (migration renumbering) and `5032cfc` (the Won/Lost NaN fix).

**Rule applied, on the product owner's instruction: his work wins.** Where our
code and his collided, his behaviour was taken. Three exceptions, all recorded
in the commits:

1. **The lead CSV export** went to *neither* side. A rep does not export leads
   at all, so the endpoint is `admin` + `sales_manager` only, with his
   `include_archived: true` for the managers who can reach it.
2. **ACT4 is superseded.** Ours kept a logged interaction's own past date as the
   completion moment; his stamps the moment of logging, consistent with his
   migration 1781. His wins.
3. **C-02 scope checks kept.** A rep still cannot file an activity onto someone
   else's record, or transition one outside their scope. His rewrite happened to
   sit on top of those checks; they are orthogonal to his behaviour, so they were
   re-expressed inside his structure rather than dropped silently.

**Left out deliberately:** his "stage automation (recording rule 3)" blocks in
both `create()` and `updateStatus()`. They need `demoStageTarget()` and
`this.dealStageAutomation` from an *earlier* commit of his that our line has
never taken, and neither symbol exists here. Not part of the 23/24 August work.
Porting recording rule 3 is its own job.

**What it does to our data** (measured against live prod, not his figures — his
numbers describe a different, older dataset):

| His commit says | Our production |
|---|---|
| 3,436 of 3,802 scheduled activities are undated logs | **713 scheduled**, of which **271 undated — all notes** |
| ~3,400 contacts missing from the contact clock | **0 leads** move `last_contacted_at` |
| Leads 1,712 → 1,478 | **2,125 → 1,884** (241 disqualified become Archive) |

Zero rows already match migration 1781's `down()` fingerprint, so a rollback is
clean. Every scheduled call, WhatsApp, task and meeting on our prod already
carries a `due_at`; only the 271 notes match.

## 6. The two data migrations in that port — reviewed 24 Aug against live prod

### A. `BackfillLeadStakeholders` — safe, ship it

Verified against production:

- **No crash-loop risk.** The `c.role::text::lead_stakeholders_role_enum` cast is
  the dangerous line; a label the stakeholder enum lacks would throw and
  boot-loop the API. **Zero mismatches.**
- `lead_stakeholders.role` is **nullable**, so the one primary contact with a
  NULL role cannot abort it either — and it is not one of the affected leads.
- **It inserts 2 rows**, not the 1,721 its comment describes. Prod has 2,499
  leads, all with a primary contact, and only Jotsholo Secondary School and
  Ngwalongwalo lack a stakeholder row. The self-heal in `findLeadStakeholders`
  has already done the work.

Idempotent, guarded, reversible.

### B. `CancelDuplicateMarchInvoices` — pull it from the deploy

The decision is sound (the founder confirmed the duplicates); the migration is
the wrong instrument.

1. **It silently skips 2 of 8 pairs.** On prod `INV-2026-0047` is
   **"Mrs Chigumundu"**, not "Nyamhuka Primary School", and `INV-2026-0033` is
   **"Mr Saiti S"**, not "Chiredzi Government Primary School". The guard needs
   number + client + total, so both are left alone — **$35,100 of duplicate
   value stays on the books** and nothing reports it. Failing safe is right;
   failing *silently* is not.
2. **Its premise about the money is false for two pairs.** The comment argues
   payments landed on both copies as distinct transactions. Actual receipts:

   | Pair | Keep | Cancel |
   |---|---|---|
   | Herentials | 13,000 paid, 2 receipts | 18,500 paid, **0 receipts** |
   | Corpus Christ | 15,600 paid, 1 receipt | 15,600 paid, **0 receipts** |
   | Adelaide | 3,400 paid, 1 receipt | 3,900 paid, **2 receipts** |
   | Ruware / TN Capital | mirrored, 1 each | mirrored, 1 each |
   | Chiredzi | 0, none | 0, none |

   **$34,100 of `amount_paid` sits on two production invoices with no payment
   rows behind it** — the same class of fault as the false-Paid invoices, on
   different rows. Adelaide's duplicate holds *more* receipts than the original,
   so cancelling it leaves the survivor showing 3,400 of 3,900 owed by a school
   with 7,300 in receipts across the two. That is a human reconciliation.
3. **`down` is not a faithful inverse** — it restores status from `amount_paid`,
   which for Herentials and Corpus Christ means restoring `Partially-Paid` from
   a figure with nothing behind it.
4. **A boot migration is the wrong vehicle for a money reconciliation.** It
   cannot be dry-run or rehearsed, it reports nothing, and if it throws the API
   crash-loops on boot — which has already happened here once, on the v25
   redesign migration that caused the 502 and the rollback.

**Recommendation:** ship the port with A in and B removed, and rewrite B as a
`db-ops` script — dry run by default, every row backed up, undo block, an
explicit report of which pairs matched and which were skipped, `-v commit=1` to
keep it.

---

## 7. db-ops scripts and their state

All follow the same pattern: dry run by default, `-v apply=1` rehearses inside a
transaction and rolls back, `-v apply=1 -v commit=1` keeps it, every removed or
changed row backed up, undo block at the foot.

| Script | Staging | Production |
|---|---|---|
| `notif-backlog-cleanup.sql` | dry run | **committed 21 Aug** — 90,604 rows removed |
| `ruvheneko-school-merge.sql` | **committed 20 Aug** | not run (4 records there, not 3) |
| `currency-relabel-zar-to-usd.sql` | **committed 24 Aug** | not run — 29 deals, $400,165 |
| `sla-history-tidy.sql` | not run | rehearsed on a prod copy only |

**Run long prod transactions server-side**, with output to a file on the box, so
an SSH drop costs you the *report* and not the *work*. The interactive version
lost both, twice:

    scp db-ops/SCRIPT.sql root@169.58.55.55:/tmp/
    ssh root@169.58.55.55 'C=$(docker ps -qf name=srv-captain--pg-prod | head -1); docker cp /tmp/SCRIPT.sql $C:/tmp/; docker exec $C psql -U crm -d digilearn_crm -v apply=1 -v commit=1 -f /tmp/SCRIPT.sql > /tmp/out.log 2>&1; tail -30 /tmp/out.log'

### The trap in `sla-history-tidy.sql`

75 of the 166 stale history rows belong to **still-active** leads, and those are
exactly what the escalation fallback reads. Closing them would re-strand the
leads the code fix rescues, and the two changes would silently cancel out. The
script touches finished leads only (Disqualified and Converted) and excludes
Nurture, because a parked lead can come back.

**It is not purely cosmetic.** Clearing `sla_breached` moves live dashboard
numbers — `activity-discipline.service.ts:304-306` (SLA compliance %, will
rise), `:758` and `discipline-metrics.service.ts:243` (breach counts, will fall
by up to 30), and `dashboard.service.ts:1157`. None of those filter by status.

---

## 8. The 11 August batch — unported, decision owed

Checked 21 Aug by git ancestry for all seven commits, then marker-level content
checks against both the staging source tree and the served bundle. **None of
them is on staging or anywhere in our lineage.**

Genuinely missing:

1. **Product as data** — `product_id` on the lead, and the catalogue picker on
   lead creation (`4577762` + `07f5689`).
2. **The entry bar** on lead creation.
3. **One stage vocabulary** — the deals-service half of the same pair.
4. **The data-model cleanup migration** (`80e266b`) — renames stages, backfills
   `product_id`, tidies lead names. It renames 822 leads, so it needs the same
   scrutiny the March-invoice migration just got. **Deferred to Mr Dube.**

Two more are **duplicated by our own equivalents** (close-the-loop, and the
server-side nurture wake-up task). Those need a decision, not a port: if his
versions land later they will collide with ours and one has to win. Worth asking
Mr Dube which close-the-loop he prefers, since both are in daily use on
different lines.

---

## 9. Recovery notes for the three ported client commits (16 Aug)

The code is **not** lost. It is in `github.com/DigiLearnzw/crm-v2-client` `main`
as `7b9a177`, `d7cbe13`, `e2b066c`, and ported locally on `port-2026-08-15` as
`376bcd9`, `f28a244`, `2c0a861`, `34513c3`. Full diffs live in git; only the
reasoning below is not recoverable from a repository.

    git cherry-pick 376bcd9 f28a244 2c0a861 34513c3     # replay the ported form

**This client needs server support.** `d7cbe13` sends a new field,
`duplicate_override`, on `POST /deals`, and only server commit `07ab979`
whitelists it. The server runs `forbidNonWhitelisted`, so an unaware server
rejects the whole request — verified live: `400 ["property duplicate_override
should not exist"]`. Redeploying this client requires the server to carry
`07ab979`, or the field to be stripped, or the DTO to gain it.

**The four conflict resolutions** — the rule was: our bug-fixes win, his
features are re-expressed around them.

- `compact-deal-card.tsx` — **both.** His `isClosed` gate is required by the
  merged `atRisk` lines beneath the hunk; our millisecond-precise
  `stageBreachAt` is more accurate than his `daysInStage > stage.sla_days`.
- `pipeline-stages-page.tsx` — **ours.** His Won/Lost tiles reduce over
  `archivedDealsData`, which undercounts as soon as that list paginates. Note
  ours depends on server aggregates the GitHub server line does not return.
- `add-deal-modal-container.tsx` — **his**, carrying our intent. His
  `response.data.message` extraction actually achieves what our DEAL-GHOST1
  comment claimed to do: an axios error's own `.message` is only "Request
  failed with status code 400".
- `add-payment-modal.tsx` — **his.** `d7cbe13` makes the bank reference
  mandatory (Recording rule 4); our blank-omit both broke the type and
  contradicted the rule.

**The client repo will not build with `--frozen-lockfile`** — `bun.lock` was
last regenerated 7 Apr while `package.json` changed 11 Jun, and Bun's text
lockfile embeds that metadata. Client `main` has been unbuildable from a clean
checkout since June. Workaround: tarball deploy with the flag dropped, as the
server's `captain-definition` already does. Proper fix: run `bun install` in the
client repo and commit the regenerated lockfile.

---

## 10. Open items

**Owed by people**

- Adelaide Council Secondary: did they pay 3,400 or 7,300? Blocks the duplicate
  cancellation.
- The three false-Paid invoices on prod (`INV-2026-0022`, `INV-2026-0023`,
  `INV-2026-0070` — $19,500) are each a human's call, not a script's.
- Ruvheneko's records split into two contact groups (Mashaba / Bake), merged as
  one school on instruction. If they are different schools, the undo is in the
  script.
- `compliance.policy.enforce_next_step_on_completion` is **true on prod**.
- Mr Dube: the 11 August batch above, and the data-model cleanup migration.

**Tagged for a future change — lineage scoping divergence**

Mr Dube's repos have never carried our rep-scoping work: `scopeUserId` appears
**0 times** in his `activities.service.ts`, `leads.service.ts` and
`leads.controller.ts`, against **46 / 12 / 8** in ours. It is not something he
removed — his fork predates it. Every port therefore has to re-apply the same
access control by hand, and the gap grows with each one.

Settled for now on the lead CSV export: **a rep does not export leads at all**
(confirmed 24 Aug as the intended rule), so the endpoint is `admin` and
`sales_manager` only and the export is a full data dump including archived
leads. The wider divergence stays open.

The durable fix is to converge the lineages — either his repos take our scoping
work as a one-off merge, or our line becomes the upstream he builds on.
Otherwise one of these hand re-applications will eventually miss a reference.

**Still to do**

- ~~Back up the live DB to this machine as a zip.~~ **Done 24 Aug** — a complete
  production dump from 20 Aug now lives at
  `C:\Users\8Y14\Desktop\crm-db-backups\digilearn_crm-prod-20260820.zip`
  (148 MB raw, 30.5 MB zipped, outside the repo so it cannot be committed). It
  had been sitting in a session scratchpad that gets cleaned automatically.
  **It predates the 21 Aug notification cleanup**, so it is a valid restore
  point for the 20th but not a current backup — take a fresh one before the
  next production data change. Instructions are in that folder's README.
- Sweep the whole `invoices` table for `amount_paid` with no payment rows —
  $34,100 found in a twelve-row sample.
- Rewrite `CancelDuplicateMarchInvoices` as a db-ops script and cut it from the
  port branch.
- FU5 — the Nurture re-engage task stays open after the lead leaves Nurture.
- Disqualification reasons shown nowhere: a reviewed implementation reportedly
  sits uncommitted in a working tree (`GET /leads/disqualification-summary` plus
  a Disqualified-tab breakdown). Find it before rebuilding it.
