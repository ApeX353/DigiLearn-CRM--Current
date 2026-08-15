# Product Owner — 11 Aug integration trail

Date: 2026-08-12
Branch: `port-dube-github`
Source: Mr Dube's three 11 Aug GitHub changes (`9a04225`, `4577762`, `ff14c11`) and matching server changes (`07f5689`, `f9866bf`).

## Safety boundary

- No production access or production writes in this batch.
- No Git push, commit, or staging deployment without a separate user instruction.
- Existing pending auto-assignment approvals are not read, modified, approved, or superseded.
- Existing Scrum Staging work is preserved and adapted rather than overwritten.
- Database changes are additive, nullable, guarded, and reversible.

## Included

- Always-on deal entry bar for sales reps: Qualified or commercial intent, plus value greater than zero. Admin and sales-manager override remains.
- Optional catalogue `product_id` on leads, exposed in create DTOs, list/detail responses, and the create-lead picker.
- One server-owned nurture wake-up task, serialized on the lead row and re-dated instead of duplicated.
- Close-the-loop usability: honest note defaults/suggestions, defer-until-later, and honest bulk outcomes.

## Deliberately excluded

The source `80e266b6` SQL is not applied. It deletes pipeline stages, remaps live deals, changes probabilities/SLAs, and rewrites lead names using hard-coded production assumptions. That work requires a read-only live-data preview, an explicit mapping approval, a backup/rollback plan, and a separately approved maintenance window.

The old direct sales-rep disqualification path is also not restored. Current policy requires a manager-reviewed request with a reason and explanatory note; the close-the-loop flow must use that policy.

## Verification record

- Server production build: passed (`nest build`) on 2026-08-12.
- Client production build: passed (`tsc -b` and Vite production build) on 2026-08-12; bundle `index-B0RZvhjy.js`.
- `git diff --check`: passed (only repository line-ending notices).
- Staging deployed and verified on 2026-08-13: API image version `72`, client image version `55`, client bundle `index-jNFaG24Z.js`.
- Staging database backup created before deployment at `/tmp/crm-staging-pre-po-20260812-182014.dump` (27,451,212 bytes).
- The guarded nullable `product_id` migration ran on staging. The column is `uuid`, nullable, and existing leads were not rewritten.
- No Git commit/push was made, and production was not accessed or changed.
- Close-loop adaptations retained current policy: reps create a manager-review request with the completion note as evidence; managers/admins may disqualify directly; pending requests get a dated check-decision task.
- Nurture transition plus wake-up creation is transactional. A lead-row pessimistic lock serializes create/re-date requests so one open wake-up is reused.

## Staging verification

1. Active Leads is `All - Disqualified - Converted`: 2,089 - 235 - 30 = 1,824. Both the authenticated `active=true` list and `status-counts.Active` returned 1,824; this includes 368 unassigned active leads.
2. Qualification metrics agree across both dashboard endpoints: 2,089 leads, 51 qualified, average score 4.8. The score-distribution buckets also sum to 2,089.
3. Pending auto-assignment approvals were untouched: 224 rows before and after, with identical content checksum `e24fd0172340bb54536c13947ce594da`.
4. The deployed bundle contains `All Leads`, `Active Leads`, `Disqualified by`, `Request disqualification`, and `Decide later today`, and points to the staging API.
5. Fresh API startup logs show the application listening with no Mustache or startup error. A Bun/CommonJS Mustache namespace-import incompatibility discovered during verification was corrected with the same default-import form already used by the user-email service.
