# Bug Fixes Log

Per Mr Dube's directive (2026-07-22): bugs are fixed on discovery and
documented here. Each entry records the symptom, root cause, the fix, and
the data impact. Newest first.

---

## 2026-07-22 — Activity timeline hid ~63% of all logged activity

**Severity:** High · **Area:** Activities / lead-deal-school-contact detail pages
**Reported by:** doobsie (owner) — "manakedube has nothing on her activity timeline"

**Symptom.** On a lead's Activity tab (and every record detail page), the
activity timeline appeared almost empty for real users, even though they had
hundreds of logged calls, WhatsApps and tasks.

**Root cause.** The redesigned `EngagementWorkspace` (client) split activity
into two sections:
- **Planned** — surfaced only ONE open activity, and when none had a due
  date it fell back to "newest open", promoting a random logged interaction.
- **Activity log (Done) feed** — queried only `status = "completed"` plus
  open *notes*.

Logged calls and WhatsApps are saved with `status = "scheduled"` and **no
due date** (`due_at`/`scheduled_at` null). Such activities are open,
non-note, and undated, so they matched **neither** section and never
rendered. Only completed activities and notes showed.

**Data impact (staging DB snapshot, from the live dump).** Confirmed
systemic across every rep, not a single account:

| Rep | Total | Hidden | % hidden |
|---|---|---|---|
| tanyag | 2,240 | 1,575 | 70% |
| manakedube | 1,189 | 904 | 76% |
| mpofunk | 861 | 618 | 72% |
| busid | 783 | 415 | 53% |

System-wide: **3,525 of 5,557 activities (63%) were invisible.** Dominant
logging patterns: 1,852 calls and 1,465 WhatsApps stored as
`scheduled` / undated. No data was ever lost — purely a display defect.

**Fix.** `crm-v2-client/src/components/activities/engagement-workspace.tsx`:
- **Planned** is now strictly the next *upcoming, dated* step; the
  "newest open regardless of date" fallback was removed. With no dated
  next step, Planned shows its empty state (prompt to schedule).
- **Activity log** now lists every logged interaction — completed
  activities plus all open items (calls/WhatsApps/emails/notes) — de-duped
  by id, excluding only the single Planned card. Ordered by
  `completed_at → scheduled_at → created_at` (desc).
- Raised the two source-query limits from 25/50 to 100/100 so busy records
  aren't truncated.

**Verification.** Busiest lead went from ~3 visible items to **24**
(its full logged history). Client typecheck + build clean.

---

## 2026-07-22 — Real-time pipeline updates never reached any client

**Severity:** Medium · **Area:** Notifications / pipeline board

**Symptom.** Moving a deal to a new stage did not live-update other users'
pipeline boards; they had to refresh manually.

**Root cause.** `deals.service` emitted `pipeline:deal-updated` to a
socket.io room `pipeline:<pipeline_id>`, but the gateway only ever joins a
client to its `user:<id>` room and has no `@SubscribeMessage` handler to
join a pipeline room — so the room had zero members and the event reached
nobody.

**Fix.** Added `NotificationsGateway.emitBroadcast()` (server-wide emit) and
switched the deal-stage emit to it. The payload carries no privileged data;
clients just refetch pipeline/deal data they can already see.
Files: `notifications.gateway.ts`, `deals.service.ts`.

---

## 2026-07-22 — Notification bell badge not refreshed on live push

**Severity:** Low · **Area:** Notifications (client)

**Symptom.** The unread-count badge could lag behind newly pushed
notifications until a manual refresh.

**Root cause.** The socket handler invalidated the query key
`["notifications-unread-count"]`, but the actual unread-count query key is
`["notifications", "unread-count"]` — so that invalidation was a no-op (it
only worked incidentally via a broader prefix invalidation).

**Fix.** Invalidate the correct key.
File: `crm-v2-client/src/hooks/use-notification-socket.ts`.
