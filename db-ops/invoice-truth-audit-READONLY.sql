-- Invoice-truth staging reconciliation — READ ONLY (SELECT only).
-- For INVOICES.md investigation invoice-truth-staging-2026-08-14-01.
-- Safe: opens a READ ONLY transaction, asserts the DB name, emits only
-- counts/aggregates/invoice+quote numbers — never customer name/email/phone.
-- Run ONLY against the staging container (srv-captain--pg-staging /
-- digilearn_crm_staging). Never production. Rolls back at the end.

BEGIN;
SET TRANSACTION READ ONLY;
-- Guard: abort unless this is the staging database.
DO $$
BEGIN
  IF current_database() <> 'digilearn_crm_staging' THEN
    RAISE EXCEPTION 'WRONG DB % — expected digilearn_crm_staging', current_database();
  END IF;
END $$;
SELECT current_database() AS db, current_setting('transaction_read_only') AS read_only;

-- 1. Invoice populations
SELECT
  COUNT(*)                                              AS all_rows,
  COUNT(*) FILTER (WHERE parent_invoice_id IS NULL)     AS masters,
  COUNT(*) FILTER (WHERE is_summary_invoice)            AS summary_masters,
  COUNT(*) FILTER (WHERE parent_invoice_id IS NULL AND NOT is_summary_invoice) AS standalone_masters,
  COUNT(*) FILTER (WHERE parent_invoice_id IS NOT NULL) AS children,
  COUNT(*) FILTER (WHERE NOT is_summary_invoice)        AS payable_non_summary
FROM invoices;

-- 2. Raw value sums (currency-blind)
SELECT
  ROUND(SUM(total),2)                                                        AS all_rows_total,
  ROUND(SUM(total) FILTER (WHERE NOT is_summary_invoice),2)                  AS payable_total,
  ROUND(SUM(total) FILTER (WHERE parent_invoice_id IS NULL),2)               AS masters_total,
  ROUND(SUM(total) FILTER (WHERE is_summary_invoice),2)                      AS summary_total
FROM invoices;
SELECT COUNT(*) AS payments, ROUND(SUM(amount),2) AS payments_total FROM payments;

-- 3. Header total vs summed document items (non-summary)
SELECT COUNT(*) AS header_ne_items
FROM invoices i
WHERE NOT i.is_summary_invoice
  AND ROUND(i.total,2) <> ROUND(COALESCE((
    SELECT SUM(di.total) FROM document_items di
    WHERE di.document_type='Invoice' AND di.document_id=i.id),0),2);

-- 4. amount_paid vs summed payments (non-summary)
SELECT COUNT(*) AS amountpaid_ne_payments
FROM invoices i
WHERE NOT i.is_summary_invoice
  AND ROUND(i.amount_paid,2) <> ROUND(COALESCE((
    SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0),2);

-- 5. Duplicate MASTER invoices per quote (exclude children)
SELECT quote_id, COUNT(*) AS master_invoices,
       string_agg(invoice_number, ', ' ORDER BY invoice_number) AS invoice_numbers
FROM invoices
WHERE parent_invoice_id IS NULL AND quote_id IS NOT NULL
GROUP BY quote_id HAVING COUNT(*) > 1
ORDER BY master_invoices DESC;

-- 6. Number sequence: max + missing numbers below max (reuse exposure, F08)
WITH nums AS (
  SELECT (substring(invoice_number from '(\d+)$'))::int AS n
  FROM invoices WHERE invoice_number LIKE 'INV-2026-%')
SELECT MAX(n) AS max_number,
       (SELECT COUNT(*) FROM generate_series(1,(SELECT MAX(n) FROM nums)) g
        WHERE g NOT IN (SELECT n FROM nums)) AS missing_below_max
FROM nums;

-- 7. Allocation reconciliation (F05)
SELECT
  (SELECT COUNT(*) FROM payments)                              AS payments,
  (SELECT ROUND(SUM(amount),2) FROM payments)                 AS sum_amount,
  (SELECT ROUND(SUM(allocated_amount),2) FROM payments)       AS sum_allocated_col,
  (SELECT ROUND(SUM(unallocated_amount),2) FROM payments)     AS sum_unallocated_col,
  (SELECT COUNT(*) FROM payment_allocations)                  AS allocation_rows,
  (SELECT ROUND(COALESCE(SUM(amount),0),2) FROM payment_allocations) AS allocation_rows_total;

-- 8. Currency context: master invoices by linked quote currency
SELECT COALESCE(q.currency,'(null/unresolved)') AS quote_currency,
       COUNT(*) AS master_invoices, ROUND(SUM(i.total),2) AS raw_value
FROM invoices i LEFT JOIN quotes q ON q.id = i.quote_id
WHERE i.parent_invoice_id IS NULL
GROUP BY COALESCE(q.currency,'(null/unresolved)') ORDER BY master_invoices DESC;

-- 9. Overdue predicate divergence (F06)
SELECT
  COUNT(*) FILTER (WHERE COALESCE(grace_due_date,due_date) < NOW()
                     AND payment_status <> 'Paid' AND status <> 'Cancelled') AS overdue_grace_aware,
  COUNT(*) FILTER (WHERE due_date < NOW()
                     AND status IN ('Sent','Partially-Paid','Overdue'))      AS overdue_dashboard_style,
  COUNT(*) FILTER (WHERE status = 'Overdue')                                 AS status_overdue
FROM invoices;

-- 10. F03 case INV-2026-0062 (status label vs payment truth)
SELECT invoice_number, status, payment_status, ROUND(total,2) AS total,
       ROUND(amount_paid,2) AS amount_paid,
       (SELECT COUNT(*) FROM payments p WHERE p.invoice_id = i.id) AS payment_rows
FROM invoices i WHERE invoice_number = 'INV-2026-0062';

-- 11. Herentials family + its installments (Investigation 3)
SELECT invoice_number, status, payment_status, is_summary_invoice,
       ROUND(total,2) AS total, ROUND(amount_paid,2) AS amount_paid,
       (SELECT COUNT(*) FROM payments p WHERE p.invoice_id=i.id) AS payment_rows
FROM invoices i
WHERE invoice_number IN ('INV-2026-0058','INV-2026-0059','INV-2026-0060','INV-2026-0061')
ORDER BY invoice_number;
SELECT inst.status, ROUND(inst.amount,2) AS amount, ROUND(inst.paid_amount,2) AS paid,
       ROUND(inst.balance,2) AS balance, inst.due_date::date AS due_date, i.invoice_number
FROM installments inst JOIN invoices i ON i.id = inst.invoice_id
WHERE i.invoice_number IN ('INV-2026-0059','INV-2026-0060','INV-2026-0061')
ORDER BY inst.due_date;

-- 12. Wanezi family (Investigation 3)
SELECT invoice_number, status, payment_status, deal_id IS NOT NULL AS has_deal,
       ROUND(total,2) AS total, ROUND(amount_paid,2) AS amount_paid,
       (SELECT COUNT(*) FROM payments p WHERE p.invoice_id=i.id) AS payment_rows,
       (SELECT ROUND(COALESCE(SUM(amount),0),2) FROM payments p WHERE p.invoice_id=i.id) AS payments_sum
FROM invoices i
WHERE invoice_number IN ('INV-2026-0062','INV-2026-0075','INV-2026-0076')
ORDER BY invoice_number;

ROLLBACK;
