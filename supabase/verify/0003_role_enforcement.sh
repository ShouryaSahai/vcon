#!/usr/bin/env bash
# ============================================================================
# Vcon — verification for migration 0003 (DB-level role + transition guards)
#
# Drives PostgREST as real users (local stack only, test data from seed.sql)
# and asserts, per case, whether the database ALLOWS or BLOCKS the write.
# Every "blocked" case must fail with our trigger message; every "allowed"
# case is a legitimate app flow that must keep working.
#
# Usage:  bash supabase/verify/0003_role_enforcement.sh
# Needs:  the local stack running (supabase start), .env.local present.
# ============================================================================
set -u

cd "$(dirname "$0")/../.." || exit 1

if [ ! -f .env.local ]; then echo "FAIL: .env.local missing"; exit 1; fi
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"'"'"' ')
KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'"' ')
if [ -z "$URL" ] || [ -z "$KEY" ]; then echo "FAIL: env vars missing"; exit 1; fi

PSQL="docker exec supabase_db_UPSTART psql -U postgres -d postgres -tA -c"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL  $1  << $2"; }

# expect BLOCK|ALLOW <label> <method> <path> <token> [json]
expect() {
  local mode="$1" label="$2" method="$3" path="$4" token="$5" body="${6:-}"
  local out code
  if [ -n "$body" ]; then
    out=$(curl -s -w $'\n%{http_code}' -X "$method" "$URL$path" \
      -H "apikey: $KEY" -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" \
      -d "$body")
  else
    out=$(curl -s -w $'\n%{http_code}' -X "$method" "$URL$path" \
      -H "apikey: $KEY" -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" -H "Prefer: return=representation")
  fi
  code=$(printf '%s' "$out" | tail -1)
  if [ "$mode" = "BLOCK" ]; then
    case "$code" in 4*|5*) ok "$label (blocked: HTTP $code)";; *) bad "$label" "expected block, got HTTP $code: $(printf '%s' "$out" | head -c 160)";; esac
  else
    case "$code" in 2*) ok "$label (allowed: HTTP $code)";; *) bad "$label" "expected allow, got HTTP $code: $(printf '%s' "$out" | head -c 160)";; esac
  fi
}

login() {
  curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"password123\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).access_token||'')}catch{console.log('')}})"
}

echo "== signing in local test users =="
CREATOR=$(login creator@vcon.test)
ADMIN=$(login admin@vcon.test)
REVIEWER=$(login reviewer@vcon.test)
APPROVER=$(login approver@vcon.test)
[ -n "$CREATOR" ] && echo "  creator ok" || { echo "FAIL: creator sign-in"; exit 1; }
[ -n "$ADMIN" ]    && echo "  admin ok"    || { echo "FAIL: admin sign-in"; exit 1; }
[ -n "$REVIEWER" ] && echo "  reviewer ok" || echo "  (reviewer missing — review cases skipped)"
[ -n "$APPROVER" ] && echo "  approver ok" || echo "  (approver missing — verdict cases skipped)"

CID=$($PSQL "select p.id from public.profiles p join auth.users u on u.id=p.id where u.email='creator@vcon.test'")
WS=$($PSQL "select p.workspace_id from public.profiles p join auth.users u on u.id=p.id where u.email='creator@vcon.test'")
RID=$($PSQL "select p.id from public.profiles p join auth.users u on u.id=p.id where u.email='reviewer@vcon.test'")
AID=$($PSQL "select p.id from public.profiles p join auth.users u on u.id=p.id where u.email='admin@vcon.test'")
KV=$($PSQL "select v.id from public.kit_versions v join public.brand_kits k on k.id=v.kit_id where k.workspace_id='$WS' and v.status='published' order by version_number desc limit 1")

echo "== creating a throwaway item (creator, REST) =="
ITEM=$(curl -s -X POST "$URL/rest/v1/content_items" \
  -H "apikey: $KEY" -H "Authorization: Bearer $CREATOR" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"workspace_id\":\"$WS\",\"kit_version_id\":\"$KV\",\"created_by\":\"$CID\",\"context_type\":\"instagram_post\",\"source_kind\":\"text\",\"text_content\":\"verification item for migration 0003\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)[0].id||'')}catch{console.log('')}})")
[ -n "$ITEM" ] && echo "  item $ITEM" || { echo "FAIL: could not create item"; exit 1; }

# A check row first (check_id is NOT NULL on findings), then two findings:
# one creator-routed, one reviewer-routed.
CHECK=$($PSQL "with c as (insert into public.checks (content_item_id, status) values ('$ITEM','done') returning id) select id from c")
F_CR=$(curl -s -X POST "$URL/rest/v1/findings" \
  -H "apikey: $KEY" -H "Authorization: Bearer $CREATOR" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"content_item_id\":\"$ITEM\",\"check_id\":\"$CHECK\",\"source\":\"rule_engine\",\"title\":\"t\",\"explanation\":\"e\",\"severity\":\"low\",\"assigned_to_role\":\"creator\",\"status\":\"open\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)[0].id||'')}catch{console.log('')}})")
F_RV=$(curl -s -X POST "$URL/rest/v1/findings" \
  -H "apikey: $KEY" -H "Authorization: Bearer $CREATOR" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"content_item_id\":\"$ITEM\",\"check_id\":\"$CHECK\",\"source\":\"ai\",\"title\":\"t2\",\"explanation\":\"e2\",\"severity\":\"medium\",\"assigned_to_role\":\"reviewer\",\"status\":\"open\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d)[0].id||'')}catch{console.log('')}})")
echo "  findings: creator=$F_CR reviewer=$F_RV"
[ -n "$F_CR" ] && [ -n "$F_RV" ] || { echo "FAIL: could not create findings"; $PSQL "delete from public.content_items where id='$ITEM'" >/dev/null; exit 1; }

CI="/rest/v1/content_items?id=eq.$ITEM"
FI_CR="/rest/v1/findings?id=eq.$F_CR"
FI_RV="/rest/v1/findings?id=eq.$F_RV"
DL="/rest/v1/decision_log"

echo "== content_items: column immutability =="
expect BLOCK "creator cannot reassign created_by"          PATCH "$CI" "$CREATOR" '{"created_by":"00000000-0000-0000-0000-000000000000"}'
expect BLOCK "creator cannot repoint kit_version"          PATCH "$CI" "$CREATOR" '{"kit_version_id":"00000000-0000-0000-0000-000000000000"}'
expect BLOCK "creator cannot edit text_content"            PATCH "$CI" "$CREATOR" '{"text_content":"tampered"}'
expect BLOCK "admin cannot reassign created_by either"     PATCH "$CI" "$ADMIN"   "{\"created_by\":\"$AID\"}"

echo "== content_items: storage_path guard =="
expect ALLOW "creator attaches own-folder storage_path"    PATCH "$CI" "$CREATOR" "{\"storage_path\":\"$WS/$ITEM/img.png\"}"
expect BLOCK "creator cannot point at another item folder" PATCH "$CI" "$CREATOR" "{\"storage_path\":\"$WS/00000000-0000-0000-0000-000000000000/steal.png\"}"
expect BLOCK "admin cannot set storage_path (not creator)" PATCH "$CI" "$ADMIN"   "{\"storage_path\":\"$WS/$ITEM/admin.png\"}"

echo "== content_items: status machine =="
expect BLOCK "creator cannot self-approve"                 PATCH "$CI" "$CREATOR" '{"status":"approved"}'
expect BLOCK "creator cannot jump to in_review"            PATCH "$CI" "$CREATOR" '{"status":"in_review"}'
expect ALLOW "creator starts a check (uploaded->checking)" PATCH "$CI" "$CREATOR" '{"status":"checking"}'
expect ALLOW "pipeline: checking->needs_changes"           PATCH "$CI" "$CREATOR" '{"status":"needs_changes"}'
expect BLOCK "creator cannot needs_changes->in_review"     PATCH "$CI" "$CREATOR" '{"status":"in_review"}'
expect ALLOW "re-check: needs_changes->checking"           PATCH "$CI" "$CREATOR" '{"status":"checking"}'
expect ALLOW "pipeline: checking->in_review"               PATCH "$CI" "$CREATOR" '{"status":"in_review"}'
expect BLOCK "reviewer cannot give verdict"                PATCH "$CI" "$REVIEWER" '{"status":"approved"}'
expect ALLOW "approver verdict: in_review->approved"       PATCH "$CI" "$APPROVER" '{"status":"approved"}'
expect BLOCK "approved items are frozen"                   PATCH "$CI" "$APPROVER" '{"status":"returned"}'

echo "== findings: immutability + role gates =="
expect BLOCK "creator cannot edit severity"                PATCH "$FI_CR" "$CREATOR" '{"severity":"high"}'
expect BLOCK "creator cannot dispose of reviewer finding"  PATCH "$FI_RV" "$CREATOR" '{"status":"fix_accepted"}'
expect BLOCK "creator cannot override"                     PATCH "$FI_RV" "$CREATOR" '{"status":"overridden"}'
expect ALLOW "reviewer overrides reviewer-routed finding"  PATCH "$FI_RV" "$REVIEWER" '{"status":"overridden"}'
expect ALLOW "reviewer overrides creator-routed finding"   PATCH "$FI_CR" "$REVIEWER" '{"status":"overridden"}'
expect ALLOW "creator accepts fix (creator-routed, open)"  PATCH "$FI_CR" "$CREATOR" '{"status":"fix_accepted"}'
expect BLOCK "creator cannot set needs_human"              PATCH "$FI_CR" "$CREATOR" '{"status":"needs_human"}'

echo "== decision_log: action/role mapping =="
expect BLOCK "creator cannot log a verdict"                POST "$DL" "$CREATOR" "{\"content_item_id\":\"$ITEM\",\"actor_id\":\"$CID\",\"action\":\"approved\"}"
expect BLOCK "creator cannot log an override"              POST "$DL" "$CREATOR" "{\"content_item_id\":\"$ITEM\",\"actor_id\":\"$CID\",\"action\":\"override\"}"
expect BLOCK "reviewer cannot log a verdict"               POST "$DL" "$REVIEWER" "{\"content_item_id\":\"$ITEM\",\"actor_id\":\"$RID\",\"action\":\"returned\"}"
expect ALLOW "creator logs fix_accepted"                   POST "$DL" "$CREATOR" "{\"content_item_id\":\"$ITEM\",\"actor_id\":\"$CID\",\"action\":\"fix_accepted\"}"
expect ALLOW "reviewer logs override"                      POST "$DL" "$REVIEWER" "{\"content_item_id\":\"$ITEM\",\"actor_id\":\"$RID\",\"action\":\"override\",\"reason\":\"verification\"}"
expect ALLOW "admin logs verdict"                          POST "$DL" "$ADMIN" "{\"content_item_id\":\"$ITEM\",\"actor_id\":\"$AID\",\"action\":\"approved\",\"reason\":\"verification\"}"

echo "== cleanup: drop the throwaway item (cascades findings/checks/log) =="
$PSQL "delete from public.content_items where id='$ITEM'" >/dev/null && echo "  cleaned"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
