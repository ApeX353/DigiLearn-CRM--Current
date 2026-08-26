#!/usr/bin/env bash
# UX validation — drives the actual flows and inspects the audit trail
# the manager would see in the activity-logs panel.

set -uo pipefail

BASE=${BASE:-http://localhost:3001/api/v2}
ADMIN_EMAIL=admin@digilearn.com
ADMIN_PW=Admin!234
REP_EMAIL=rep1@digilearn.com
REP_PW=Rep1!234

step() { printf '\n========== %s ==========\n' "$*"; }
ok()   { printf '   PASS - %s\n' "$*"; }
fail() { printf '   FAIL - %s\n' "$*"; exit 1; }

j() { python -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null; }

step "Login admin + rep1"
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\"}" | j)
REP_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$REP_EMAIL\",\"password\":\"$REP_PW\"}" | j)
[ -n "$ADMIN_TOKEN" ] && [ -n "$REP_TOKEN" ] && ok "tokens" || fail "login"

REP_ID="b72e4e04-4667-46de-90e9-76389a893677"
REP2_ID="dbadfe30-b427-4400-a938-475d8216ef4c"

step "Find an eligible rep1 lead in non-terminal status"
LEAD_JSON=$(curl -s -H "Authorization: Bearer $REP_TOKEN" "$BASE/leads?limit=100&assigned_to=$REP_ID")
LEAD_ID=$(echo "$LEAD_JSON" | python -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', [])
items = data if isinstance(data, list) else (data.get('items') or [])
m = [x for x in items if x.get('status') not in ('Disqualified','Converted')]
print(m[0]['id'] if m else '')
")
[ -n "$LEAD_ID" ] && ok "lead $LEAD_ID" || fail "no eligible lead"

step "1) FLOW: rep submits tactical_disqualify request"
REQ=$(curl -s -X POST "$BASE/leads/$LEAD_ID/reversal-requests" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"tactical_disqualify","reason":"Test: lead ghosted after 8 outreach attempts in 90 days; budget pushed to next FY","notes":"Logged calls + 3 emails. Going dark."}')
REQ_ID=$(echo "$REQ" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id') or d.get('id',''))")
[ -n "$REQ_ID" ] && ok "submitted request $REQ_ID" || fail "could not submit: $REQ"

step "1a) AUDIT TRAIL after submit (manager sees this on the lead)"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/activity-logs?entity=Lead&entity_id=$LEAD_ID&limit=5" \
  | python -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', d)
items = data if isinstance(data, list) else (data.get('items') or data.get('data') or [])
if not items:
    print('   FAIL - no activity_logs entries returned (endpoint shape may differ)')
    sys.exit(0)
for i, log in enumerate(items[:5]):
    summary = log.get('summary', '')
    action = log.get('action', '')
    actor = log.get('user_id') or log.get('performed_by') or '?'
    print(f'   [{i}] action={action} actor={actor[:8]}... summary={summary[:80]}')
print()
print('UX VERDICT: would a manager glancing at this see *what* the rep is asking for?')
"

step "1b) Pending request still blocks rep (only APPROVED unlocks)"
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/leads/$LEAD_ID" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Disqualified","disqualify_reason":"No budget"}')
CODE=$(echo "$RESP" | tail -n1)
[ "$CODE" = "403" ] && ok "PENDING blocks - good" || fail "expected 403, got $CODE"

step "1c) Manager approves"
curl -s -X POST "$BASE/lead-reversal-requests/$REQ_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"approved","review_note":"OK to close. Sufficient evidence in chase log."}' \
  | python -c "
import sys, json
d = json.load(sys.stdin).get('data', {})
print(f\"   approved by {(d.get('reviewed_by_id') or '?')[:8]}... at {d.get('reviewed_at','?')}\")
print(f'   review_note={d.get(\"review_note\",\"?\")[:60]}')
"

step "1d) Rep applies disqualify - should now be 200"
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/leads/$LEAD_ID" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Disqualified","disqualify_reason":"No budget"}')
CODE=$(echo "$RESP" | tail -n1)
[ "$CODE" = "200" ] && ok "disqualify accepted after approval" || fail "expected 200, got $CODE"

step "1e) AUDIT TRAIL after approval+apply"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/activity-logs?entity=Lead&entity_id=$LEAD_ID&limit=10" \
  | python -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', d)
items = data if isinstance(data, list) else (data.get('items') or data.get('data') or [])
print(f'Found {len(items)} log entries on this lead. Most recent 5:')
for i, log in enumerate(items[:5]):
    summary = log.get('summary', '')
    action = log.get('action', '')
    print(f'   [{i}] {action}: {summary[:90]}')
"

step "2) FLOW: reassignment - rep submits"
LEAD2=$(echo "$LEAD_JSON" | python -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', [])
items = data if isinstance(data, list) else (data.get('items') or [])
m = [x for x in items if x.get('status') not in ('Disqualified','Converted')]
print(m[1]['id'] if len(m) > 1 else '')
")
[ -n "$LEAD2" ] && ok "lead2 $LEAD2" || fail "no second lead"

REQ2=$(curl -s -X POST "$BASE/leads/$LEAD2/reversal-requests" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d "{\"kind\":\"reassignment\",\"proposed_assignee_id\":\"$REP2_ID\",\"reason\":\"Test: prospect is in Bulawayo region, better fit for Grace's territory\",\"notes\":\"Speaks Ndebele, Grace handles southern accounts.\"}")
REQ2_ID=$(echo "$REQ2" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id') or d.get('id',''))")
[ -n "$REQ2_ID" ] && ok "submitted reassignment request $REQ2_ID" || fail "could not submit: $REQ2"

step "2a) Manager approves; verify auto-flip"
curl -s -X POST "$BASE/lead-reversal-requests/$REQ2_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"approved","review_note":"Confirmed territory match."}' > /dev/null

NEW_OWNER=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/leads/$LEAD2" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('assigned_to') or d.get('assigned_to',''))")
[ "$NEW_OWNER" = "$REP2_ID" ] && ok "auto-flip works" || fail "expected $REP2_ID, got $NEW_OWNER"

step "2b) AUDIT TRAIL on lead2"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/activity-logs?entity=Lead&entity_id=$LEAD2&limit=10" \
  | python -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', d)
items = data if isinstance(data, list) else (data.get('items') or data.get('data') or [])
print(f'Found {len(items)} log entries on this lead. Most recent 5:')
for i, log in enumerate(items[:5]):
    summary = log.get('summary', '')
    action = log.get('action', '')
    print(f'   [{i}] {action}: {summary[:90]}')
"

step "3) Manager queue: scannable shape check"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/lead-reversal-requests?limit=10" \
  | python -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('data') or []
print(f'Queue returned {len(items)} requests. First 5:')
for i, r in enumerate(items[:5]):
    summary = r.get('lead_summary') or {}
    print(f'   [{i}] kind={r.get(\"kind\")} status={r.get(\"status\")} lead={(summary.get(\"lead_name\") or \"?\")[:30]} reason={r.get(\"reason\",\"\")[:40]}')
print()
print('UX checks:')
print('  - lead_summary visible per row?', 'YES' if items and items[0].get('lead_summary') else 'NO')
print('  - reviewed_by + reviewed_at visible on decided rows?', 'YES' if any(r.get('reviewed_by_id') for r in items) else 'NO')
has_reassign = [r for r in items if r.get('kind')=='reassignment']
print('  - proposed_assignee_id visible on reassignment rows?', 'YES' if has_reassign and has_reassign[0].get('proposed_assignee_id') else 'NO')
"

step "4) Compliance Report shape"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/dashboard/compliance-report?dateRange=mtd" \
  | python -c "
import sys, json
d = json.load(sys.stdin).get('data', {})
t = d.get('totals', {})
th = d.get('thresholds', {})
print(f'Org totals: completed={t.get(\"completed\")}, outcome%={t.get(\"outcome_pct\")}, next-step%={t.get(\"next_step_pct\")}')
print(f'Targets: outcome={th.get(\"outcome_target_pct\")}%, next-step={th.get(\"next_step_target_pct\")}%')
print()
print('Per-rep table top 3:')
for r in d.get('reps', [])[:3]:
    pass_o = 'PASS' if r.get('passes_outcome') else 'FAIL'
    pass_n = 'PASS' if r.get('passes_next_step') else 'FAIL'
    print(f'   {r.get(\"name\",\"\")[:30]:30} done={r.get(\"completed\",0):3} outcome={r.get(\"outcome_pct\",0)}% [{pass_o}] next-step={r.get(\"next_step_pct\",0)}% [{pass_n}]')
"

printf '\n*** UX VALIDATION FLOW: COMPLETE ***\n'
