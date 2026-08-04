# DB Ops — 2026-08-03 (prod + staging maintenance)

All three operations below were **applied** and are **reversible**. Each captured an
undo table *before* writing. Run an undo `!` command exactly as shown to revert.

The password is pulled from the container env at run time — nothing secret is stored here.

---

## 1. Activity assignees — PROD (applied: 4,988 rows)
Set `assigned_to_id` from the lead/deal owner where it was null.

**UNDO** (sets those rows back to null):
```
cat db-ops/assignee-undo.sql | ssh -i ~/.ssh/id_ed25519 root@169.58.55.55 'CID=$(docker ps -q -f name=srv-captain--pg-prod | head -1); PW=$(docker exec "$CID" printenv POSTGRES_PASSWORD); docker exec -i -e PGPASSWORD="$PW" "$CID" psql -U crm -d digilearn_crm -v ON_ERROR_STOP=1'
```
undo table: `activity_assignee_backfill_undo`

---

## 2. Nash test schools + leads — STAGING (applied: 366 schools + 367 leads soft-deleted)
Cleaned the auto-assign test bed (`created_at 2026-07-31`).

**UNDO** (clears `deleted_at`, restoring them):
```
cat db-ops/nash-undo.sql | ssh -i ~/.ssh/id_ed25519 root@169.58.55.55 'CID=$(docker ps -q -f name=srv-captain--pg-staging | head -1); PW=$(docker exec "$CID" printenv POSTGRES_PASSWORD); docker exec -i -e PGPASSWORD="$PW" "$CID" psql -U crm -d digilearn_crm_staging -v ON_ERROR_STOP=1'
```
undo tables: `nash_cleanup_undo_schools`, `nash_cleanup_undo_leads`

---

## 3. ACT5 activity dates — PROD (applied: 2,254 rows)
Restored `due_at`/`status`/`completed_at` from real `created_at` / `meeting.start_time`.

**UNDO** (restores each row's pre-apply state):
```
cat db-ops/act5-date-undo.sql | ssh -i ~/.ssh/id_ed25519 root@169.58.55.55 'CID=$(docker ps -q -f name=srv-captain--pg-prod | head -1); PW=$(docker exec "$CID" printenv POSTGRES_PASSWORD); docker exec -i -e PGPASSWORD="$PW" "$CID" psql -U crm -d digilearn_crm -v ON_ERROR_STOP=1'
```
undo table: `act5_date_undo`

---

### Notes
- Undo tables persist in each DB until dropped — a revert is always available.
- All commands are safe to inspect: the `.sql` files in this folder are the exact statements run.
- prod DB = `digilearn_crm` (container `srv-captain--pg-prod`); staging = `digilearn_crm_staging` (`srv-captain--pg-staging`).
