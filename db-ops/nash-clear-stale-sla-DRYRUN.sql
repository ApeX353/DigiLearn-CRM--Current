-- NASH stale-SLA clear — DRY RUN (read-only, no writes)
-- Context: NASH 2026 leads were created ~05-06 Aug with a first-touch SLA
-- clock that ran while they sat UNASSIGNED in the auto-assign queue. When
-- Ms Mpofu reassigned 135 of them to Tanya/Manake on 11 Aug, the assign
-- path leaves an existing clock in place — so the reps inherited clocks
-- that were already days past due and instantly "breached". Those breaches
-- do not reflect the reps' real performance.
--
-- Scope: NASH 2026 only (source_campaign_id), only clocks that are STALE
-- (past due). A legitimately future-dated clock, if any, is left alone.
-- This file only COUNTS — it changes nothing.

\set nash '''c1cb66ff-cebc-4104-83cb-fd561ef91adf'''

SELECT
  COUNT(*)                                            AS nash_leads_total,
  COUNT(*) FILTER (WHERE current_sla_due_date IS NOT NULL)              AS with_clock,
  COUNT(*) FILTER (WHERE current_sla_due_date IS NOT NULL
                     AND current_sla_due_date < NOW())                  AS stale_clock_to_clear,
  COUNT(*) FILTER (WHERE sla_breached)                                  AS breached,
  COUNT(*) FILTER (WHERE assigned_to IS NOT NULL)                       AS assigned,
  COUNT(*) FILTER (WHERE assigned_to IS NULL
                     AND current_sla_due_date IS NOT NULL)              AS unassigned_but_clocked
FROM leads
WHERE source_campaign_id = :nash
  AND deleted_at IS NULL;

-- Per-owner breakdown of what would be cleared.
SELECT assigned_to, COUNT(*) AS stale_clocks
FROM leads
WHERE source_campaign_id = :nash
  AND deleted_at IS NULL
  AND current_sla_due_date IS NOT NULL
  AND current_sla_due_date < NOW()
GROUP BY assigned_to
ORDER BY stale_clocks DESC;
