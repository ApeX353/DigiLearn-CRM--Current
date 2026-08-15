-- Invoice-truth staging reconciliation — READ ONLY — PART 2 (queries 7-12).
-- Continuation of invoice-truth-audit-READONLY.sql after the
-- payment_allocations column-name fix (allocated_amount, not amount).
-- SELECT only; rolls back. Staging only.

BEGIN;
SET TRANSACTION READ ONLY;
DO $$
BEGIN
  IF current_database() <> 'digilearn_crm_staging' THEN
    RAISE EXCEPTION 'WRONG DB % — expected digilearn_crm_staging', current_database();
  END IF;
END $$;
SELECT current_database() AS db, current_setting('transaction_read_only') AS read_only;

-- 7. Allocation reconciliation (F05)
SELECT
  (SELECT COUNT(*) FROM payments)                                     AS payments,
  (SELECT ROUND(SUM(amount),2) FROM payments)                        AS sum_amount,
  (SELECT ROUND(SUM(allocated_amount),2) FROM payments)              AS sum_allocated_col,
  (SELECT ROUND(SUM(unallocated_amount),2) FROM payments)            AS sum_unallocated_col,
  (SELECT COUNT(*) FROM payment_allocations)                         AS allocation_rows,
  (SELECT ROUND(COALESCE(SUM(allocated_amount),0),2) FROM payment_allocations) AS allocation_rows_total;

-- 8. Currency context: master invoices by linked quote currency (F01)
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

-- 10. F03 case INV-2026-0062
SELECT invoice_number, status, payment_status, ROUND(total,2) AS total,
       ROUND(amount_paid,2) AS amount_paid,
       (SELECT COUNT(*) FROM payments p WHERE p.invoice_id = i.id) AS payment_rows
FROM invoices i WHERE invoice_number = 'INV-2026-0062';

-- 11. Herentials family + installments (Investigation 3)
SELECT invoice_number, status, payment_status, is_summary_invoice,
       ROUND(total,2) AS total, ROUND(amount_paid,2) AS amount_paid,
       (SELECT COUNT(*) FROM payments p WHERE p.invoice_id=i.id) AS payment_rows
FROM invoices i
WHERE invoice_number IN ('INV-2026-0058','INV-2026-0059','INV-2026-0060','INV-2026-0061')
ORDER BY invoice_number;
SELECT i.invoice_number, inst.status, ROUND(inst.amount,2) AS amount,
       ROUND(inst.paid_amount,2) AS paid, ROUND(inst.balance,2) AS balance,
       inst.due_date::date AS due_date
FROM installments inst JOIN invoices i ON i.id = inst.invoice_id
WHERE i.invoice_number IN ('INV-2026-0059','INV-2026-0060','INV-2026-0061')
ORDER BY inst.due_date;

-- 12. Wanezi family (Investigation 3)
SELECT invoice_number, status, payment_status, (deal_id IS NOT NULL) AS has_deal,
       ROUND(total,2) AS total, ROUND(amount_paid,2) AS amount_paid,
       (SELECT COUNT(*) FROM payments p WHERE p.invoice_id=i.id) AS payment_rows,
       (SELECT ROUND(COALESCE(SUM(amount),0),2) FROM payments p WHERE p.invoice_id=i.id) AS payments_sum
FROM invoices i
WHERE invoice_number IN ('INV-2026-0062','INV-2026-0075','INV-2026-0076')
ORDER BY invoice_number;

ROLLBACK;
