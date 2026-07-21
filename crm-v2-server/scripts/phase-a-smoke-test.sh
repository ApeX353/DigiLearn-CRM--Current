#!/usr/bin/env bash
# Phase A — end-to-end smoke test
#
# Exercises every gate built in Phase A against a running backend
# (default http://localhost:3001/api/v2). Requires admin + rep1
# accounts (passwords Admin!234 / Rep1!234) and at least one lead
# owned by rep1 that is currently in a non-terminal status.
#
# All errors fail the script (set -e). Each step prints a one-line
# PASS / FAIL and the relevant payload excerpt.

set -uo pipefail

BASE=${BASE:-http://localhost:3001/api/v2}
ADMIN_EMAIL=admin@digilearn.com
ADMIN_PW=Admin!234
REP_EMAIL=rep1@digilearn.com
REP_PW=Rep1!234

step() { printf '\n— %s —\n' "$*"; }
ok()   { printf '   PASS — %s\n' "$*"; }
fail() { printf '   FAIL — %s\n' "$*"; exit 1; }

j() { python -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',d) if isinstance(d,dict) else d)" 2>/dev/null; }

step "Login admin"
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\"}" | j)
[ -n "$ADMIN_TOKEN" ] || fail "no admin token"; ok "got admin token"

step "Login rep1"
REP_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$REP_EMAIL\",\"password\":\"$REP_PW\"}" | j)
[ -n "$REP_TOKEN" ] || fail "no rep token"; ok "got rep token"

REP_ID="b72e4e04-4667-46de-90e9-76389a893677"
REP2_ID="dbadfe30-b427-4400-a938-475d8216ef4c"

step "A.3 — Admin reads settings/all and confirms compliance keys present"
N=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/settings/all" \
  | python -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(sum(1 for s in d if s.get('category')=='compliance'))")
[ "$N" = "11" ] || fail "expected 11 compliance settings, got $N"
ok "11 compliance settings present"

step "Find a lead owned by rep1 in a non-terminal status (need it for the gate tests)"
LEAD_JSON=$(curl -s -H "Authorization: Bearer $REP_TOKEN" "$BASE/leads?limit=100&assigned_to=$REP_ID")
LEAD_ID=$(echo "$LEAD_JSON" | python -c "import sys,json; d=json.load(sys.stdin); data=d.get('data',[]); items=data if isinstance(data,list) else (data.get('items') or []); m=[x for x in items if x.get('status') not in ('Disqualified','Converted')]; print(m[0]['id'] if m else '')")
[ -n "$LEAD_ID" ] || fail "no eligible lead owned by rep1"
ok "lead $LEAD_ID"

step "A.1 — rep tries to disqualify with TACTICAL reason → expect 403"
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/leads/$LEAD_ID" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Disqualified","disqualify_reason":"No budget"}')
CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "403" ] && echo "$BODY" | grep -q "approval"; then
  ok "blocked with 403: $(echo "$BODY" | python -c 'import sys,json; print(json.load(sys.stdin).get("message",""))')"
else
  fail "expected 403 with approval message, got $CODE: $BODY"
fi

step "A.1 — rep tries to disqualify with ADMIN reason → expect 200"
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/leads/$LEAD_ID" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Disqualified","disqualify_reason":"Duplicate entry"}')
CODE=$(echo "$RESP" | tail -n1)
[ "$CODE" = "200" ] || fail "expected 200 (admin reason bypasses gate), got $CODE: $(echo "$RESP" | sed '$d')"
ok "admin reason bypassed gate (200)"

step "Reset that lead so we can retest"
curl -s -X PUT "$BASE/leads/$LEAD_ID" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"Contacted"}' > /dev/null
ok "lead reset to Contacted"

step "A.1 — rep submits tactical_disqualify reversal request"
REQ=$(curl -s -X POST "$BASE/leads/$LEAD_ID/reversal-requests" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"tactical_disqualify","reason":"prospect went silent for 90 days"}')
REQ_ID=$(echo "$REQ" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id') or d.get('id',''))")
[ -n "$REQ_ID" ] || fail "no request id returned: $REQ"
ok "submitted request $REQ_ID"

step "Admin approves the request"
curl -s -X POST "$BASE/lead-reversal-requests/$REQ_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"approved","review_note":"approved for closeout"}' > /dev/null
ok "request approved"

step "A.1 — rep retries the tactical disqualify → expect 200 now"
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/leads/$LEAD_ID" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Disqualified","disqualify_reason":"No budget"}')
CODE=$(echo "$RESP" | tail -n1)
[ "$CODE" = "200" ] || fail "expected 200 after approval, got $CODE: $(echo "$RESP" | sed '$d')"
ok "tactical disqualify accepted after approval (200)"

step "Find another rep1 lead for the reassign test"
LEAD2=$(curl -s -H "Authorization: Bearer $REP_TOKEN" "$BASE/leads?limit=100&assigned_to=$REP_ID" \
  | python -c "import sys,json; d=json.load(sys.stdin); data=d.get('data',[]); items=data if isinstance(data,list) else (data.get('items') or []); m=[x for x in items if x.get('status') not in ('Disqualified','Converted')]; print(m[0]['id'] if m else '')")
[ -n "$LEAD2" ] || fail "no second eligible lead"
ok "lead $LEAD2"

step "A.2 — rep tries to PATCH assigned_to → expect 403"
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/leads/$LEAD2" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d "{\"assigned_to\":\"$REP2_ID\"}")
CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$CODE" = "403" ] && echo "$BODY" | grep -q "reassignment"; then
  ok "blocked with 403: $(echo "$BODY" | python -c 'import sys,json; print(json.load(sys.stdin).get("message",""))')"
else
  fail "expected 403 with reassignment message, got $CODE: $BODY"
fi

step "A.2 — admin PATCHes assigned_to (manager bypass) → expect 200"
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/leads/$LEAD2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"assigned_to\":\"$REP2_ID\"}")
CODE=$(echo "$RESP" | tail -n1)
[ "$CODE" = "200" ] || fail "expected admin to bypass, got $CODE: $(echo "$RESP" | sed '$d')"
ok "admin bypassed gate (200)"

step "Reset lead2 back to rep1 so the reassign-via-approval test is meaningful"
curl -s -X PUT "$BASE/leads/$LEAD2" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d "{\"assigned_to\":\"$REP_ID\"}" > /dev/null
ok "lead2 reassigned back to rep1"

step "A.2 — rep submits reassignment request"
REQ2=$(curl -s -X POST "$BASE/leads/$LEAD2/reversal-requests" \
  -H "Authorization: Bearer $REP_TOKEN" -H "Content-Type: application/json" \
  -d "{\"kind\":\"reassignment\",\"proposed_assignee_id\":\"$REP2_ID\",\"reason\":\"better match for rep2 territory\"}")
REQ2_ID=$(echo "$REQ2" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id') or d.get('id',''))")
[ -n "$REQ2_ID" ] || fail "no request id returned: $REQ2"
ok "submitted reassignment request $REQ2_ID"

step "A.2 — admin approves; verify lead.assigned_to flips to rep2"
curl -s -X POST "$BASE/lead-reversal-requests/$REQ2_ID/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"approved","review_note":"sounds good"}' > /dev/null
NEW_OWNER=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/leads/$LEAD2" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('assigned_to') or d.get('assigned_to',''))")
[ "$NEW_OWNER" = "$REP2_ID" ] || fail "expected lead now owned by rep2 ($REP2_ID), got $NEW_OWNER"
ok "lead automatically reassigned to rep2 on approval"

printf '\n*** PHASE A SMOKE TEST: ALL GATES PASS ***\n'
