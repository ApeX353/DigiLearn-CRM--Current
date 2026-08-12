\set ON_ERROR_STOP on
\pset pager off

-- READ-ONLY production audit requested after the 2026-08-12 scrum.
-- This script contains SELECT statements only. It does not repair, classify,
-- restore, delete, or otherwise change a lead or approval record.

SELECT
  COUNT(*) AS current_disqualified_leads,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(l.reason), '') IS NOT NULL) AS with_reason,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(l.reason), '') IS NULL) AS missing_reason,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(l.notes), '') IS NOT NULL) AS with_notes,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(l.notes), '') IS NULL) AS missing_notes,
  COUNT(*) FILTER (
    WHERE NULLIF(BTRIM(l.reason), '') IS NOT NULL
      AND NULLIF(BTRIM(l.notes), '') IS NOT NULL
  ) AS with_reason_and_notes
FROM leads l
WHERE l.status = 'Disqualified'
  AND l.deleted_at IS NULL;

SELECT
  COALESCE(NULLIF(BTRIM(l.reason), ''), '[MISSING]') AS disqualification_reason,
  COUNT(*) AS leads,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(l.notes), '') IS NOT NULL) AS with_notes,
  COUNT(*) FILTER (WHERE NULLIF(BTRIM(l.notes), '') IS NULL) AS missing_notes
FROM leads l
WHERE l.status = 'Disqualified'
  AND l.deleted_at IS NULL
GROUP BY COALESCE(NULLIF(BTRIM(l.reason), ''), '[MISSING]')
ORDER BY leads DESC, disqualification_reason;

WITH disqualified AS (
  SELECT
    l.id,
    l.reason,
    l.notes,
    event.created_at AS disqualified_at,
    event.actioned_by,
    event.summary
  FROM leads l
  LEFT JOIN LATERAL (
    SELECT al.created_at, al.actioned_by, al.summary
    FROM activity_logs al
    WHERE LOWER(al.entity) = 'lead'
      AND al.entity_id = l.id
      AND (
        al.new_values ->> 'status' = 'Disqualified'
        OR al.summary ILIKE '%to Disqualified%'
      )
    ORDER BY al.created_at DESC
    LIMIT 1
  ) event ON TRUE
  WHERE l.status = 'Disqualified'
    AND l.deleted_at IS NULL
)
SELECT
  COUNT(*) AS current_disqualified_leads,
  COUNT(*) FILTER (WHERE disqualified_at IS NOT NULL) AS with_transition_audit,
  COUNT(*) FILTER (WHERE disqualified_at IS NULL) AS missing_transition_audit,
  COUNT(*) FILTER (WHERE actioned_by IS NOT NULL) AS with_known_actor,
  MIN(disqualified_at) AS earliest_recoverable_disqualification,
  MAX(disqualified_at) AS latest_recoverable_disqualification
FROM disqualified;

-- Compact manager-facing list of records whose reason or supporting notes are
-- incomplete. This is intentionally not an UPDATE/backfill candidate list:
-- missing facts must be investigated, not invented.
SELECT
  l.id,
  l.lead_name,
  s.name AS school_name,
  COALESCE(NULLIF(BTRIM(l.reason), ''), '[MISSING]') AS reason,
  CASE
    WHEN NULLIF(BTRIM(l.notes), '') IS NULL THEN '[MISSING]'
    ELSE LEFT(REGEXP_REPLACE(l.notes, E'[\n\r]+', ' ', 'g'), 240)
  END AS notes_excerpt,
  event.created_at AS disqualified_at,
  NULLIF(BTRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), '') AS disqualified_by
FROM leads l
LEFT JOIN schools s ON s.id = l.school_id
LEFT JOIN LATERAL (
  SELECT al.created_at, al.actioned_by
  FROM activity_logs al
  WHERE LOWER(al.entity) = 'lead'
    AND al.entity_id = l.id
    AND (
      al.new_values ->> 'status' = 'Disqualified'
      OR al.summary ILIKE '%to Disqualified%'
    )
  ORDER BY al.created_at DESC
  LIMIT 1
) event ON TRUE
LEFT JOIN users actor ON actor.id = event.actioned_by
WHERE l.status = 'Disqualified'
  AND l.deleted_at IS NULL
  AND (
    NULLIF(BTRIM(l.reason), '') IS NULL
    OR NULLIF(BTRIM(l.notes), '') IS NULL
  )
ORDER BY event.created_at DESC NULLS LAST, l.lead_name, l.id;

-- Complete manager-facing report (all current disqualified leads). New
-- decisions use the dedicated request fields; legacy rows fall back to the
-- lead reason/general notes and transition log without inventing evidence.
SELECT
  l.id,
  l.lead_name,
  s.name AS school_name,
  NULLIF(BTRIM(CONCAT_WS(' ', owner.first_name, owner.last_name)), '') AS owner,
  COALESCE(NULLIF(BTRIM(decision.reason), ''), NULLIF(BTRIM(l.reason), ''), '[MISSING]') AS reason,
  COALESCE(NULLIF(BTRIM(decision.notes), ''), NULLIF(BTRIM(l.notes), ''), '[MISSING]') AS explanation,
  event.created_at AS disqualified_at,
  NULLIF(BTRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), '') AS disqualified_by,
  decision.status AS approval_status,
  decision.created_at AS requested_at,
  NULLIF(BTRIM(CONCAT_WS(' ', requester.first_name, requester.last_name)), '') AS requested_by,
  decision.reviewed_at,
  NULLIF(BTRIM(CONCAT_WS(' ', reviewer.first_name, reviewer.last_name)), '') AS reviewed_by,
  decision.review_note
FROM leads l
LEFT JOIN schools s ON s.id = l.school_id
LEFT JOIN users owner ON owner.id = l.assigned_to
LEFT JOIN LATERAL (
  SELECT al.created_at, al.actioned_by
  FROM activity_logs al
  WHERE LOWER(al.entity) = 'lead'
    AND al.entity_id = l.id
    AND (
      al.new_values ->> 'status' = 'Disqualified'
      OR al.summary ILIKE '%to Disqualified%'
    )
  ORDER BY al.created_at DESC
  LIMIT 1
) event ON TRUE
LEFT JOIN users actor ON actor.id = event.actioned_by
LEFT JOIN LATERAL (
  SELECT r.*
  FROM lead_reversal_requests r
  WHERE r.lead_id = l.id
    AND r.kind = 'tactical_disqualify'
    AND r.status = 'approved'
  ORDER BY r.reviewed_at DESC NULLS LAST, r.created_at DESC
  LIMIT 1
) decision ON TRUE
LEFT JOIN users requester ON requester.id = decision.requested_by_id
LEFT JOIN users reviewer ON reviewer.id = decision.reviewed_by_id
WHERE l.status = 'Disqualified'
  AND l.deleted_at IS NULL
ORDER BY event.created_at DESC NULLS LAST, l.lead_name, l.id;
