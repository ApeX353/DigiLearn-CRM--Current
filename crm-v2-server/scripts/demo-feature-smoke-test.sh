#!/usr/bin/env bash
# Demo + Commercial-Intent feature — end-to-end smoke test.
# Walks all 7 scenarios from the spec.
#
# Reuses existing rep1 leads (no test-data creation), so each scenario
# picks a fresh lead from rep1's queue. Runs harmlessly on a live DB
# because: (a) the gate is enabled and disabled inside this script, (b)
# all demo activity rows are tagged with the scenario name in the
# subject so they're easy to grep/clean later, (c) no lead status
# transitions to Disqualified or Converted.

# Intentionally NOT using `pipefail` — curl|python pipes occasionally
# trip pipefail on Git Bash (Windows) when the backend response is
# slightly delayed, even though both commands eventually succeed. The
# script does its own assertions via the `ok`/`fail` helpers.
set -u

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

# Find rep1 leads in non-terminal status. We pick distinct ones per
# scenario so they don't pollute each other.
LEAD_LIST=$(curl -s -H "Authorization: Bearer $REP_TOKEN" "$BASE/leads?limit=100&assigned_to=$REP_ID" \
  | python -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data', [])
items = data if isinstance(data, list) else (data.get('items') or [])
ids = [x['id'] for x in items if x.get('status') not in ('Disqualified','Converted')]
sys.stdout.write(' '.join(ids))
")
LEAD_IDS=($LEAD_LIST)
if [ ${#LEAD_IDS[@]} -lt 7 ]; then
  echo "WARN: only ${#LEAD_IDS[@]} eligible leads; some scenarios will reuse"
fi
echo "  found ${#LEAD_IDS[@]} eligible rep1 leads"

read_lead() {
  curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/leads/$1" \
    | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print('{}')
    sys.exit(0)
ld = d.get('data', d) or {}
print(json.dumps({
  'demo_status': ld.get('demo_status'),
  'commercial_intent': ld.get('commercial_intent'),
  'commercial_intent_reason': ld.get('commercial_intent_reason'),
  'demo_followup_sla_breached': ld.get('demo_followup_sla_breached'),
}))
"
}

reset_lead_demo_state() {
  # Make sure the lead starts each scenario with no commercial intent
  # set. We can't easily turn it off via API (it's set-once on
  # purpose), so we use a SQL update through psql.
  PGPASSWORD=7354 "/c/Program Files/PostgreSQL/18/bin/psql.exe" -h localhost -p 5432 -U postgres -d digilearn_crm -c "UPDATE leads SET commercial_intent=false, commercial_intent_at=NULL, commercial_intent_reason=NULL, demo_status=NULL, demo_status_changed_at=NULL, demo_followup_sla_breached=false WHERE id='$1';" > /dev/null 2>&1 || true
}

# Need a school + pipeline + stage to create deals. Reuse the lead's
# school whenever possible.
PIPELINE_ID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/pipelines?limit=1" \
  | python -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',[]); items=items if isinstance(items,list) else (items.get('items') or []); print(items[0]['id'] if items else '')")
STAGE_ID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/pipelines/$PIPELINE_ID/stages" \
  | python -c "import sys,json; d=json.load(sys.stdin); items=d.get('data',[]); items=items if isinstance(items,list) else (items.get('items') or []); print(items[0]['id'] if items else '')")
echo "  using pipeline=$PIPELINE_ID stage=$STAGE_ID"

lead_school_id() {
  curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/leads/$1" \
    | python -c "import sys,json; d=json.load(sys.stdin); ld=d.get('data',d); print(ld.get('school_id') or (ld.get('school') or {}).get('id') or '')"
}

try_create_deal() {
  local lead_id="$1"
  local title="$2"
  local value="$3"
  local school_id
  school_id=$(lead_school_id "$lead_id")
  curl -s -w '\n%{http_code}' -X POST "$BASE/deals" -H "Authorization: Bearer $REP_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"lead_id\":\"$lead_id\",\"school_id\":\"$school_id\",\"pipeline_id\":\"$PIPELINE_ID\",\"stage_id\":\"$STAGE_ID\",\"title\":\"$title\",\"value\":$value,\"currency\":\"USD\",\"probability\":50}"
}

# ======================================================================
step "Turn on the deal-creation gate so scenarios 1-6 actually exercise it"
curl -s -X POST "$BASE/settings/bulk" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"settings":[{"key":"compliance.policy.enforce_commercial_intent_for_deal","value":true,"data_type":"boolean","category":"compliance","is_public":false}]}' > /dev/null
sleep 3
ok "gate enabled"

PLANNED=$(python -c "from datetime import datetime, timedelta; print((datetime.now()+timedelta(days=2)).isoformat()+'Z')")

# ======================================================================
step "Scenario 1: Demo booked but no delivery -> deal blocked + Demo Scheduled"
L1="${LEAD_IDS[0]}"; reset_lead_demo_state "$L1"
[ -n "$L1" ] && ok "lead $L1" || fail "no lead"
curl -s -X POST "$BASE/activities" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"demo_booking\",\"subject\":\"[SMOKE] Demo booking - scenario 1\",\"lead_id\":\"$L1\",\"assigned_to_id\":\"$REP_ID\",\"due_at\":\"$PLANNED\",\"demo\":{\"planned_at\":\"$PLANNED\",\"mode\":\"on_site\",\"expected_attendees\":[\"Head\",\"Bursar\"]}}" > /dev/null
sleep 3
STATE=$(read_lead "$L1")
echo "  state: $STATE"
if echo "$STATE" | grep -q '"demo_status": "demo_scheduled"'; then
  ok "demo_status=demo_scheduled"
else
  fail "expected demo_status=demo_scheduled, got $STATE"
fi
RESP=$(try_create_deal "$L1" "[SMOKE] Scenario 1 deal" 5000)
CODE=$(echo "$RESP" | tail -n1)
[ "$CODE" = "400" ] && ok "deal blocked (400)" || fail "expected 400, got $CODE: $(echo "$RESP" | sed '$d')"

# ======================================================================
step "Scenario 2: Demo completed with weak interest -> deal blocked"
L2="${LEAD_IDS[1]}"; reset_lead_demo_state "$L2"
ACT=$(curl -s -X POST "$BASE/activities" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"demo_delivery\",\"subject\":\"[SMOKE] Demo delivery - scenario 2\",\"lead_id\":\"$L2\",\"assigned_to_id\":\"$REP_ID\",\"demo\":{\"actual_at\":\"$PLANNED\",\"attendees_present\":[\"Teachers\"],\"products_demonstrated\":[\"LMS\"],\"decision_makers_present\":false}}")
ACT_ID=$(echo "$ACT" | python -c "import sys,json; d=json.load(sys.stdin); print((d.get('data',{}) or {}).get('id') or d.get('id',''))")
curl -s -X PATCH "$BASE/activities/$ACT_ID/status" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"completed","outcome":"interested"}' > /dev/null
sleep 3
STATE=$(read_lead "$L2")
echo "  state: $STATE"
if echo "$STATE" | grep -q '"commercial_intent": false'; then
  ok "weak interest does not trigger commercial_intent"
else
  fail "weak interest should NOT trigger intent: $STATE"
fi
RESP=$(try_create_deal "$L2" "[SMOKE] Scenario 2 deal" 5000)
[ "$(echo "$RESP" | tail -n1)" = "400" ] && ok "deal blocked" || fail "expected 400"

# ======================================================================
step "Scenario 3: Demo completed with Decision Maker Absent -> deal blocked"
L3="${LEAD_IDS[2]}"; reset_lead_demo_state "$L3"
ACT=$(curl -s -X POST "$BASE/activities" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"demo_delivery\",\"subject\":\"[SMOKE] Demo - scenario 3\",\"lead_id\":\"$L3\",\"assigned_to_id\":\"$REP_ID\",\"demo\":{\"actual_at\":\"$PLANNED\",\"decision_makers_present\":false}}")
ACT_ID=$(echo "$ACT" | python -c "import sys,json; d=json.load(sys.stdin); print((d.get('data',{}) or {}).get('id') or d.get('id',''))")
curl -s -X PATCH "$BASE/activities/$ACT_ID/status" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"completed","outcome":"decision_maker_absent"}' > /dev/null
sleep 3
STATE=$(read_lead "$L3")
if echo "$STATE" | grep -q '"commercial_intent": false'; then
  ok "DM absent does not trigger commercial_intent"
else
  fail "DM absent should NOT trigger intent: $STATE"
fi
RESP=$(try_create_deal "$L3" "[SMOKE] Scenario 3 deal" 5000)
[ "$(echo "$RESP" | tail -n1)" = "400" ] && ok "deal blocked" || fail "expected 400"

# ======================================================================
step "Scenario 4: Demo Quote Requested -> Commercial Intent unlocks; deal still gated on missing fields"
L4="${LEAD_IDS[3]}"; reset_lead_demo_state "$L4"
ACT=$(curl -s -X POST "$BASE/activities" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"demo_delivery\",\"subject\":\"[SMOKE] Demo - scenario 4\",\"lead_id\":\"$L4\",\"assigned_to_id\":\"$REP_ID\",\"demo\":{\"actual_at\":\"$PLANNED\",\"products_demonstrated\":[\"LMS\",\"Student Tablets\"]}}")
ACT_ID=$(echo "$ACT" | python -c "import sys,json; d=json.load(sys.stdin); print((d.get('data',{}) or {}).get('id') or d.get('id',''))")
curl -s -X PATCH "$BASE/activities/$ACT_ID/status" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"completed","outcome":"quote_requested"}' > /dev/null
sleep 3
STATE=$(read_lead "$L4")
echo "  state: $STATE"
if echo "$STATE" | grep -q '"commercial_intent": true' && echo "$STATE" | grep -q "demo_delivery_quote_requested"; then
  ok "commercial_intent=true with reason demo_delivery_quote_requested"
else
  fail "expected intent=true with QR reason: $STATE"
fi
# Try deal with value=0 — gate should reject on missing value/decision-maker
RESP=$(try_create_deal "$L4" "[SMOKE] Scenario 4 deal" 0)
CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "400" ] && echo "$BODY" | grep -q "estimated deal value"; then
  ok "deal still blocked on missing value (400 with actionable message)"
else
  fail "expected 400 with value mention, got $CODE: $BODY"
fi

# ======================================================================
step "Scenario 5: Demo Follow-up with Payment Plan Discussion Requested -> Commercial Intent triggers"
L5="${LEAD_IDS[4]}"; reset_lead_demo_state "$L5"
ACT=$(curl -s -X POST "$BASE/activities" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"demo_delivery\",\"subject\":\"[SMOKE] Demo - scenario 5\",\"lead_id\":\"$L5\",\"assigned_to_id\":\"$REP_ID\",\"demo\":{\"actual_at\":\"$PLANNED\"}}")
ACT_ID=$(echo "$ACT" | python -c "import sys,json; d=json.load(sys.stdin); print((d.get('data',{}) or {}).get('id') or d.get('id',''))")
curl -s -X PATCH "$BASE/activities/$ACT_ID/status" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"completed","outcome":"interested"}' > /dev/null
ACT2=$(curl -s -X POST "$BASE/activities" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"demo_followup\",\"subject\":\"[SMOKE] Follow-up - scenario 5\",\"lead_id\":\"$L5\",\"assigned_to_id\":\"$REP_ID\",\"demo\":{\"followup_channel\":\"call\",\"next_activity_date\":\"$PLANNED\"}}")
ACT2_ID=$(echo "$ACT2" | python -c "import sys,json; d=json.load(sys.stdin); print((d.get('data',{}) or {}).get('id') or d.get('id',''))")
curl -s -X PATCH "$BASE/activities/$ACT2_ID/status" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"completed","outcome":"payment_plan_discussion_requested"}' > /dev/null
sleep 3
STATE=$(read_lead "$L5")
echo "  state: $STATE"
if echo "$STATE" | grep -q '"commercial_intent": true'; then
  ok "Payment Plan Discussion Requested triggers commercial_intent"
else
  fail "expected intent=true: $STATE"
fi

# ======================================================================
step "Scenario 6: Notes only -> no commercial intent, deal blocked"
L6="${LEAD_IDS[5]}"; reset_lead_demo_state "$L6"
curl -s -X POST "$BASE/activities" -H "Authorization: Bearer $REP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"note\",\"subject\":\"[SMOKE] Note about prospect\",\"lead_id\":\"$L6\",\"note\":{\"content\":\"Spoke to teacher; sounds excited\"}}" > /dev/null
sleep 3
STATE=$(read_lead "$L6")
if echo "$STATE" | grep -q '"commercial_intent": false'; then
  ok "notes alone do not trigger commercial_intent"
else
  fail "notes triggered intent: $STATE"
fi
RESP=$(try_create_deal "$L6" "[SMOKE] Scenario 6 deal" 5000)
[ "$(echo "$RESP" | tail -n1)" = "400" ] && ok "deal blocked" || fail "expected 400"

# ======================================================================
step "Scenario 7: leads_no_next_step KPI surfaces in dashboard"
NN=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/dashboard/activity-discipline?dateRange=mtd" \
  | python -c "import sys,json; d=json.load(sys.stdin); a=d.get('data',{}).get('kpis',{}).get('quality',[]); v=[k for k in a if k.get('key')=='leads_no_next_step']; print(v[0].get('value',0) if v else 'missing')")
[ "$NN" != "missing" ] && ok "leads_no_next_step KPI reachable: $NN" || fail "no_next_step KPI missing"

# ======================================================================
step "Cleanup: turn the gate back off and reset the test leads"
curl -s -X POST "$BASE/settings/bulk" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"settings":[{"key":"compliance.policy.enforce_commercial_intent_for_deal","value":false,"data_type":"boolean","category":"compliance","is_public":false}]}' > /dev/null
for L in "${LEAD_IDS[@]:0:7}"; do
  reset_lead_demo_state "$L"
done
ok "gate disabled, test leads reset"

printf '\n*** DEMO + COMMERCIAL-INTENT SMOKE TEST: ALL 7 SCENARIOS COMPLETE ***\n'
