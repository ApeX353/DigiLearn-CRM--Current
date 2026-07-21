-- =====================================================================
-- Gate-0e — Reconcile CRM Products to the founder-approved price book
-- =====================================================================
-- DECISION (2026-05-29): canonical pricing = DigiLearn AI Office\
-- knowledge\pricing-rules (APPROVED, founder-confirmed 29 Mar 2026),
-- currency = USD. product-info.md is deprecated. The CRM Products
-- table is stale and must be aligned so quotes/automation read correct
-- numbers. Notably it corrects the LMS $9.99 bug and the 85" board.
--
-- Approved prices (USD):
--   100"/98" board $6,000 | 85" board $4,200 | 75" board $3,500
--   65" board $2,900 | Learner Tablet $285 | Teacher Laptop $600
--   LMS $3.00 /user/month | SMS (School Mgmt System) $2,000 /school/year
--   Follow-up training $50 (initial install training free)
--
-- PREVIEW-FIRST: this transaction ROLLS BACK by default. Review the
-- before/after SELECTs, confirm your product names match, then change
-- ROLLBACK to COMMIT to persist.
-- Confirm column names first:  SELECT name, price, category FROM products;
-- =====================================================================

BEGIN;

SELECT name, price, category FROM products ORDER BY name;

UPDATE products SET price = 6000 WHERE name ILIKE '%100%board%' OR name ILIKE '%98%board%';
UPDATE products SET price = 4200 WHERE name ILIKE '%85%board%';
UPDATE products SET price = 3500 WHERE name ILIKE '%75%board%';
UPDATE products SET price = 2900 WHERE name ILIKE '%65%board%';
UPDATE products SET price = 285  WHERE name ILIKE '%tablet%';
UPDATE products SET price = 600  WHERE name ILIKE '%laptop%';
UPDATE products SET price = 3.00 WHERE name ILIKE '%learning management%' OR name ILIKE '%LMS%';
UPDATE products SET price = 2000 WHERE name ILIKE '%school management%' OR name ILIKE '%SMS%';

SELECT name, price, category FROM products ORDER BY name;

-- Change to COMMIT; once product names are confirmed to match.
ROLLBACK;
