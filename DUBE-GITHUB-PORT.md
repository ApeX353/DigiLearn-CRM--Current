# Port of Mr Dube's GitHub upgrades — working doc

*Branch `port-dube-github` (off `dube-upgrades`). Started 2026-08-11. Local only —
nothing deployed. Review here before anything moves to staging.*

## What this is

Mr Dube vibe-coded client upgrades against a ~5-week-old copy of the code and
pushed them to `github.com/DigiLearnzw/crm-v2-client` (client repo only, no
server). His `main` = the **6 July base + 15 commits dated 7–8 Aug**. The July
20–22 commits sit on side branches and are not part of his line. We cherry-picked
exactly those 15 commits (`2d35771..main`, `-X subtree=crm-v2-client`) so his
stale base never touched us, resolving every collision by hand:
**our bug-fixes win; his features are re-expressed around them.**

His code comments reference our server DTOs by name (e.g.
`CreateWhatsAppDetailsDto`), so he clearly had our server source in front of his
AI — but any server changes he made were never pushed. **Decision (2026-08-11):
we build the server side ourselves.**

## Status

- [x] All 15 commits ported; `tsc` clean; full production build passes
- [x] Server anatomy reviewed; gap catalogue verified against server code (below)
- [x] **All server gaps built** (2026-08-11, commits `bda92e2` S1, `0bc0cf9` S2,
      `d039d1d` S3–S5). Server builds clean; unit suite 84/86 — the 2 failures
      are the pre-existing dashboard daily-target specs (fail on `dube-upgrades`
      too, unrelated).
- [ ] Full local smoke test per role (task #5) — needs the local stack up +
      a login; migration 1780 (product sku/description) applies on first boot
      with `DB_RUN_MIGRATIONS=true`
- [ ] Review with Mr Dube / Kim, then staging per DEPLOYMENT-RULES.md
- [x] **Second port, 15 Aug 2026** — three further client commits brought
      across onto branch `port-2026-08-15` (see below). `tsc` clean,
      production build passes (4,068 modules).

## Second port — 15 Aug 2026 (branch `port-2026-08-15`)

Three client commits, cherry-picked in date order with
`-X subtree=crm-v2-client` off `github.com/DigiLearnzw/crm-v2-client` `main`:

| Upstream | Local | What it does |
|---|---|---|
| `7b9a177` 13 Aug | `376bcd9` | Closed deals stop pretending to be live; columns stack deterministically |
| `d7cbe13` 14 Aug | `f28a244` | The CRM records the sale; the rep records the work |
| `e2b066c` 15 Aug | `2c0a861` | A mistyped lead URL is a 400 and a clear message, not a 500 |

Plus `34513c3`, a conflict-resolution fixup.

**Four conflicts, resolved by hand** (same rule as the first port — our
bug-fixes win, his features re-expressed around them):

- `compact-deal-card.tsx` — **both.** His `isClosed` gate is required by the
  already-merged `atRisk` lines below it; our millisecond-precise
  `stageBreachAt` is the more accurate breach test than his integer
  `daysInStage > sla_days`. Kept ours, gated by his.
- `pipeline-stages-page.tsx` — **ours.** His Won/Lost tiles reduce over
  `archivedDealsData`, which undercounts as soon as that list paginates. Ours
  reads the server aggregates (`won_invoice_total`, `lost_deal_value`) and
  keeps the deal-count sub-line.
- `add-deal-modal-container.tsx` — **his, carrying our intent.** His
  duplicate-conflict branch is the point of the commit, and his
  `response.data.message` extraction actually achieves what our DEAL-GHOST1
  comment wanted: an axios error's own `.message` is only "Request failed with
  status code 400", so ours was never surfacing the server's reason. Kept his
  extraction, added our `err.message` as the last fallback.
- `add-payment-modal.tsx` — **his.** Ours omitted a blank reference
  (`|| undefined`); his commit makes the bank reference mandatory (schema
  `.min(1)`, "Recording rule 4") and types the payload field as a required
  string. Our fallback both broke the type and contradicted the new rule.

**Not ported:** the server side. Only the three client SHAs were requested.
The two matching server commits on `crm-v2-server` `master` — `4b75f2a`
(mistyped lead URL → 400) and `262ef61` (fractional probability/position
rejected at the DTO) — are **not** in local. Note `4b75f2a` rewrites
`leads.controller.ts` `assignLead` and would remove the undeclared-`status`
ship-blocker that local still carries at `leads.controller.ts:577`.

**Build notes:** the duplicates scan endpoint is synchronous by design (the
button shows a spinner) — on a big book it can run long; if HTTP timeouts bite,
convert to background + poll. The idle-schools ranking computes two EXISTS
subqueries per row in the ORDER BY — fine at current scale, add an index if the
plan degrades. Generic contact merge is unique-safe on lead_stakeholders
(re-points only non-conflicting rows, drops the rest).

## What arrived (his 15 commits, in order)

| Commit | What it does |
|---|---|
| Pipedrive-style timeline + inline composer + duplicate tooling | The big one: unified activity timeline, in-place composer, expand-in-place entries, scan/merge duplicate tooling |
| Search the whole table | Activities search box queries the server, not the loaded page *(needs gap S1)* |
| Rich-text composers + date+time + work-queue ordering | contentEditable rich text (no external dep), datetime pickers, `sort=work_queue` *(needs gap S2)* |
| Close the loop | Completion dialog: mandatory outcome + note, then next step OR a record decision (nurture / disqualify / close deal) |
| Kill phantom follow-up task | Client stopped double-rendering the server-spawned follow-up |
| Dead records close their queue | Disqualify/lose cancels open queue; cancelled items stay in the log as history |
| Short bodies become headings | One log style everywhere |
| Clean up | Deletes the dead activities table view + stray artifacts |
| Products carry SKU + sales description | Flows onto document line items *(needs gap S3)* |
| Converted leads link to their deal | Instead of offering to convert again *(needs gap S4)* |
| Next-step discipline at deal birth; idle schools | Deal creation requires a next step; schools list surfaces idleness *(needs gap S5)* |
| Rank idle schools first | Schools list doubles as the worklist *(needs gap S5)* |
| Signal-driven lead lifecycle | Quotes/invoices pages advance lead status on real signals — client-only, uses existing endpoints |
| Quote/invoice prefill fix | Prefilled school shown; blank-form race closed |
| Compress pipeline deal cards | Visual only |

## Collision resolutions worth remembering

- **Kept ours inside his redesigns:** DURATION1 (call duration), ACT2 (follow-up
  date sent), eea1c4ae (completion note visible), the ≈63% last-touch rule
  (`pickPivotalActivities`), **NEXT4 plural planned cards** (his single
  "Next step" slot was adapted to our all-planned-as-cards design; his
  "+N more open" chip now counts undated open items), admin_support on the
  duplicates queue, DUP-EMAIL1 Rebuild button, the DUP2 survivor-choice lead
  merge (server exists, works today).
- **Took his over ours:** required follow-up dates on call/email/WhatsApp forms
  (matches the server's `require_activity_due_date` gate + his discipline push);
  his close-the-loop dialog **replaces** our NEXT2 client patch and the old
  follow-up-prompt store/dialog (both deleted) — and fixes a reopen bug ours had
  (keying the prompt on stale `completed_at`).
- **Both, side by side:** duplicates page has our Rebuild + his Scan; his
  one-click generic merge is **school/contact only** — leads keep the DUP2 panel.
- **His removals accepted:** lead-page WhatsApp + Audit History tabs (the
  timeline absorbs them — *tell Kim*), the old activities table view.
- **Campaigns add/add: ours wholesale** (his repo grew a parallel campaigns
  feature; ours is wired to auto-assign + the real server).
- Port fix-up commit: his prefill `subtitle: school.province || undefined`
  collapsed to the bare enum under our strict province type — inner arrays now
  annotated `AutocompleteOption[]`.

## Server anatomy (how new endpoints must be built)

35 modules under `crm-v2-server/src/<domain>/` — each: `*.module.ts`,
`*.controller.ts` (+`.spec`), `*.service.ts` (+`.spec`), `dto/`, `entities/`,
`constants/`. Verified conventions that bind the gap work:

- **Guards:** `@UseGuards(JwtAuthGuard, RolesGuard)` at controller,
  `@Roles('admin', 'sales_manager', …)` per route; `admin_support` satisfies
  `admin` via `ROLE_ALIASES` (roles.guard.ts). CASL conditions are seeded in
  `database/seeds/seed-roles-permissions.ts` — **condition keys must map to real
  columns** (R1/SEED1 scars).
- **DTOs:** class-validator + `@nestjs/swagger` decorators;
  `PartialType(CreateDto)` for updates (note: loosens top level only — that is
  exactly gap S1c).
- **Migrations:** `database/migrations/<timestamp>-<Name>.ts`, guarded
  creation (house style = the `1768…`/`1769…` files), always a real `down()`.
  Auto-run in production; `DB_RUN_MIGRATIONS=true` locally.
- **Audit:** consequential mutations write `activity_logs` via
  `ActivityLogsService.logUpdate/logDelete` in-line (see
  `lead-auto-router.service.ts` for the pattern). `audit_logs` has no writer —
  don't start now.
- **Side-effect discipline:** notification/dup-scan failures never unwind the
  main write (try/catch + logger.warn — same file, same pattern).
- **Reference precedent:** `leads/duplicates.controller.ts` already hosts
  `POST /duplicates/rebuild` (fire-and-forget void + toast-style message) and
  `PATCH /duplicates/:id/review`; `LeadsService.mergeLeads` (DUP2) is the
  in-transaction child-reparenting precedent for the generic merge.

## Server gaps — verified against server code, in build order

**S1 — Activities API catches up with the client contract** *(one PR-sized change)*
   - a. `GET /activities?search=` — `query-activity.dto.ts` has **no** search
     field; service never filters on it. Add: ILIKE across `subject`,
     `description` + joined subtype content (call.summary, note.content,
     whatsapp.message, email.subject/body, meeting.agenda/minutes_notes).
     Client already sends it; today the box silently returns everything.
   - b. `GET /activities?sort=work_queue|recent` — service has task-hub CASE
     ordering precedent (~line 976); implement: open before closed, most
     overdue first, undated last; `recent` = current default unchanged.
   - c. `PUT /activities/:id` nested partials — `UpdateActivityDto extends
     PartialType(CreateActivityDto)` keeps nested Create*Dto members required,
     so the document view's single-field patches 400. Mirror the client type:
     top-level partial + `Partial<>` sub-DTOs.
   - d. `POST /activities` accepts `completion_outcome` + `completion_note`
     **only when the create arrives completed**; strip on scheduled creates
     (client type documents exactly this contract).

**S2 — Duplicates: scan + generic merge + labels**
   - a. Queue payload: serve `new_record_label/sublabel` +
     `existing_record_label/sublabel` (school → name/city·province,
     contact → name/school, lead → lead_name/school). Client falls back to
     `*_name`, so this can ship last without breaking anything.
   - b. `POST /duplicates/scan` → `{ created: number }` — synchronous sweep of
     leads + schools + contacts via the existing detection service;
     already-reviewed pairs are not re-flagged (recordSuspicion de-dupes).
     Distinct from `rebuild` (which purges pending first) — keep both.
   - c. `POST /duplicates/:id/merge` → `{ suspicion, merged: { winner_id,
     loser_id, moved: [{table, column, moved}] } }` — school/contact only
     (leads 400 → "use the lead merge"), transactional child re-pointing,
     loser soft-deleted, suspicion → `merged`, activity-log both records.
     Model on `LeadsService.mergeLeads`.

**S3 — Product SKU + sales description**
   - Entity + guarded migration: `sku varchar(64) NULL` (unique, nullable),
     `description text NULL`. Create/Update DTOs + list/search (`search` also
     matches sku). PROD-BOARD rule holds: description prefills **Draft**
     document lines on selection only — no rewriting issued documents.

**S4 — Lead detail includes its deals**
   - `LeadsService.findOne`: load `deals` relation (id, title, close_status,
     created_at) on the DETAIL endpoint only — the Converted lead page links to
     the deal instead of offering to convert again.

**S5 — Schools list: `is_idle` + idle-first ranking**
   - Computed on the list endpoint: school has ≥1 non-terminal lead AND no open
     activity (scheduled/in_progress with a future-or-today date) under any of
     its leads. `is_idle` desc as leading sort. EXISTS subqueries, no schema
     change. Watch query cost on the full book — add index if the plan is ugly.

**Already served — no work needed (verified):** `next_step` payload on the
status route (`NextStepPayloadDto`), call/WhatsApp `follow_up_date` spawning the
open follow-up task (activities.service.ts:555–654), lead status transitions
used by the signal-driven lifecycle, quote/invoice prefill endpoints.

## Known trade-offs to raise in review

- Lead page lost the separate WhatsApp and Audit History tabs (his design; the
  timeline + changelog weave covers both). If Kim misses them, restoring is a
  small revert on `view-lead-page.tsx`.
- His Scan and Merge buttons render now but 404 until S2 lands — build S2
  before anyone demos the duplicates page from this branch.
- The old client bug where `enforce_next_step_on_completion` could 400 (NEXT2)
  is structurally gone: the dialog collects the next step up front and sends it
  in the completion request.
