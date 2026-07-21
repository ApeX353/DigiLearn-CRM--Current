-- =====================================================================
-- #13 — Pipeline-stage config cleanup (stages 9–13)
-- =====================================================================
-- Stages 9–13 ship with sla_days = 0 and probability = 0 (legacy /
-- unconfigured), so the deal-stage breach cron and likely-closer
-- scoring misfire on any deal sitting in them (phase-1 BUG-004).
--
-- This script sets sensible defaults. It is DELIBERATELY NOT executed
-- automatically: the values below are RECOMMENDATIONS that an admin
-- must confirm against the real DigiLearn sales process before
-- committing. The script runs inside a transaction that ROLLS BACK by
-- default — it only PREVIEWS the change. To apply, change the final
-- `ROLLBACK;` to `COMMIT;`.
--
-- Matching is by stage name (case-insensitive). Confirm your stage
-- names first with:  SELECT name, sla_days, probability FROM stages;
--
-- RECOMMENDED DEFAULTS (review/adjust before COMMIT):
--   Committee Review      sla 7d  prob 30%
--   Quote Submitted       sla 5d  prob 40%
--   Negotiation           sla 7d  prob 55%
--   PO/Contract Received  sla 3d  prob 85%
--   Finance Approved      sla 5d  prob 90%
-- =====================================================================

BEGIN;

-- Before snapshot
SELECT name, sla_days, probability
FROM stages
WHERE name ILIKE ANY (ARRAY[
  'Committee Review', 'Quote Submitted', 'Negotiation',
  'PO/Contract Received', 'Finance Approved'
])
ORDER BY name;

UPDATE stages SET sla_days = 7,  probability = 30 WHERE name ILIKE 'Committee Review';
UPDATE stages SET sla_days = 5,  probability = 40 WHERE name ILIKE 'Quote Submitted';
UPDATE stages SET sla_days = 7,  probability = 55 WHERE name ILIKE 'Negotiation';
UPDATE stages SET sla_days = 3,  probability = 85 WHERE name ILIKE 'PO/Contract Received';
UPDATE stages SET sla_days = 5,  probability = 90 WHERE name ILIKE 'Finance Approved';

-- After snapshot (preview of what COMMIT would persist)
SELECT name, sla_days, probability
FROM stages
WHERE name ILIKE ANY (ARRAY[
  'Committee Review', 'Quote Submitted', 'Negotiation',
  'PO/Contract Received', 'Finance Approved'
])
ORDER BY name;

-- DECISION (2026-05-29): the recommended values above are committed.
-- This applies them. (Re-add a ROLLBACK above the UPDATEs first if you
-- want to preview without persisting.)
COMMIT;
