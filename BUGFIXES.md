# Bug Fixes Log

Per Mr Dube's directive (2026-07-22): bugs are fixed on discovery and
documented here. Each entry records the symptom, root cause, the fix, and
the data impact. Newest first.

---

## 2026-07-22 — "Last touch / Engagement" showed "No activity yet" incorrectly

**Severity:** Medium · **Area:** Lead & deal detail — "At a glance" panel
**Reported by:** doobsie (owner) — engagement/last-touch bug

**Symptom.** The Engagement section of a lead (and deal) showed "No activity
yet" for Last touch even when the record had many logged calls/WhatsApps.
Deals showed "No activity yet" **always**.

**Root cause (same family as the timeline bug).**
- Lead: `pickPivotalActivities` in `lead-at-a-glance.tsx` derived Last touch
  from `completed[0]` — completed activities **only**. Logged calls/WhatsApps
  (status "scheduled", no due date) were excluded, so leads worked purely by
  logged calls read as "No activity yet". `lastTouchDate` also only honoured
  `completed_at`.
- Deal: `view-deal-details.tsx` rendered `<DealAtAGlance deal={deal} />`
  without ever passing `nextActivity` / `lastActivityAt`, so the panel had no
  data and always showed "No activity yet".
- Server side was already correct: `getLeadActivityStats` computes
  `lastActivityAt` / `isStale` over ALL activities by `created_at`. Purely a
  client defect.

**Fix.**
- Extracted a shared `pickPivotalActivities()` + `activityTouchDate()` into
  `activity-kit.tsx`. Last touch = most recent activity that has actually
  happened: any completed activity, or any open activity that is undated or
  past-dated (a future-dated open item is a plan, not a touch). Effective
  date = `completed_at → scheduled_at → created_at`.
- `lead-at-a-glance.tsx` now uses the shared helper (local duplicate removed).
- `view-deal-details.tsx` now fetches the deal's activities and passes
  `nextActivity` + `lastActivityAt` into `DealAtAGlance`.

**Verification.** Client typecheck clean. Leads/deals with logged (scheduled)
calls now show a real Last-touch time and type instead of "No activity yet".

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

---

## 2026-07-23 — LCK1/C9: next-step lock trapped reps on their own activities

**Severity:** High · **Area:** Activities / follow-up discipline
**Tickets:** LCK1 (Next-step lock traps reps), C9 (Next-step compliance
gate makes completion impossible for reps)

**Symptom.** A rep completes an activity on a lead that already has a
commitment booked — say a meeting two weeks out. The "Next step required"
modal opens and cannot be dismissed: Esc, outside-click and the close
button are all intercepted, and `beforeunload` blocks refresh. The only
exit is scheduling a *second* future activity. Reported in the meeting:
a rep who phoned a client ahead of a booked meeting could not log that
call, because the modal stood between them and the Log Activity button.

**Root cause.** The client policy `shouldRequireFollowUp()` was strictly
harsher than the server gate it was supposed to mirror. The server's
`ActivitiesService.assertNextStepCompliance()` honours four escape
hatches — non-actionable types, an admin/sales_manager bypass, the
`enforce_next_step_on_completion` policy switch, and (the important one)
**an already-open actionable activity on the same lead/deal**. The client
checked only "is it a note" and "is the record terminal", so it demanded a
next step in cases the server considered already satisfied.

Two aggravating facts:
  - `compliance.policy.enforce_next_step_on_completion` is **false** in
    production, so the server never rejected these completions. The
    undismissable client modal was the *only* thing enforcing anything.
  - The dialog only opens `onSuccess` of the completion — so whenever it
    appeared, the server had already accepted the very completion the
    modal was refusing to let go of.

**Fix.**
  - `shouldRequireFollowUp(activity, context)` now takes a context bag and
    mirrors the server: exempts every non-actionable type (was: notes
    only), and returns `false` for `isManagerOrAdmin` or `hasOpenNextStep`.
  - `FollowUpPromptDialog` resolves that context — it reads the caller's
    roles and queries the parent lead/deal for other open actionable
    activities — then downgrades the prompt from a trap to a nudge when
    either hatch applies. While the lookup is in flight it stays
    permissive rather than flashing a lock it may be about to lift.
  - When a commitment already exists the dialog names it ("Meeting: Demo
    walkthrough — due 6 Aug") and offers **Keep existing next step**
    alongside **Add another step**.

The hard lock still applies where the rule genuinely bites: a sales rep
completing the *last* open actionable activity on an active lead/deal.

Files: `crm-v2-client/src/lib/follow-up-policy.ts`,
`crm-v2-client/src/components/activities/follow-up-prompt-dialog.tsx`.
