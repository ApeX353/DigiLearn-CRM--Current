-- ============================================================================
-- Preview for bug-tracker-truth-2026-08-27.sql. READ-ONLY -- writes nothing.
--
-- Run this first. It answers three questions:
--   1. do all 14 target tickets still exist on this database?
--   2. is any of them already in a state the forward script does not expect
--      (someone closed or reworked it since 25 August)?
--   3. what exactly will change?
-- ============================================================================

\set ON_ERROR_STOP on

-- The 14 targets and what the forward script intends to do to each.
WITH plan(id, intent) AS (VALUES
  ('95702d58-928e-48ea-9b42-76b2487ae9aa'::uuid, 'open -> verification  (+note)'),
  ('bfdc8c44-8971-4960-92a4-fb9e831e1a59'::uuid, 'open -> verification  (+note)'),
  ('7fbc2f5b-935e-4a85-9f3c-23d5b7c318bc'::uuid, 'in_progress -> verification  (+note)'),
  ('51d8efb7-cadb-45cf-91da-1da5d1b41520'::uuid, 'open -> verification  (+note)'),
  ('20d9d3bc-02b2-44a3-b407-1eb131b04279'::uuid, 'description += stale-figure correction'),
  ('b6ba09af-a3f4-4d4f-99c1-bf3c21e79a80'::uuid, 'description += blocker + migration renumbering'),
  ('d821f946-5706-4261-b7fc-ff8f02b768a9'::uuid, 'description += partial progress'),
  ('8a1b1569-b7b0-4f9f-8d45-43662ac82de7'::uuid, 'description += partial progress'),
  ('a23a05d7-c505-47e1-80e6-ceff1ab3ea51'::uuid, 'description += partial progress'),
  ('564dd615-058c-4081-8e22-8d51b109def1'::uuid, 'description += retest note'),
  ('15c671de-34c3-4384-9470-5f6412c71953'::uuid, 'description += retest note'),
  ('b53e7979-eb29-4513-9e16-6c0bd4180f1f'::uuid, 'severity medium -> high  (+note)'),
  ('5a34bc4e-09a7-49b3-94ba-3c8f875a8896'::uuid, 'description += confirmation + wider context'),
  ('5048516d-c1af-4802-b9ea-1a7599a4d67b'::uuid, 'description += confirmation')
)

\echo ''
\echo '=== 1. every target, its state now, and what will happen ==='
SELECT COALESCE(b.status::text, 'MISSING') AS status_now,
       COALESCE(b.severity::text, '-')     AS severity_now,
       p.intent,
       left(COALESCE(b.title, '(ticket not found on this database)'), 62) AS title
  FROM plan p
  LEFT JOIN bug_reports b ON b.id = p.id
 ORDER BY p.intent, title;

\echo ''
\echo '=== 2. sanity: 14 expected, how many actually resolve? ==='
SELECT count(*) FILTER (WHERE b.id IS NOT NULL) AS found,
       count(*) FILTER (WHERE b.id IS NULL)     AS missing
  FROM (VALUES
    ('95702d58-928e-48ea-9b42-76b2487ae9aa'::uuid),('bfdc8c44-8971-4960-92a4-fb9e831e1a59'),
    ('7fbc2f5b-935e-4a85-9f3c-23d5b7c318bc'),('51d8efb7-cadb-45cf-91da-1da5d1b41520'),
    ('20d9d3bc-02b2-44a3-b407-1eb131b04279'),('b6ba09af-a3f4-4d4f-99c1-bf3c21e79a80'),
    ('d821f946-5706-4261-b7fc-ff8f02b768a9'),('8a1b1569-b7b0-4f9f-8d45-43662ac82de7'),
    ('a23a05d7-c505-47e1-80e6-ceff1ab3ea51'),('564dd615-058c-4081-8e22-8d51b109def1'),
    ('15c671de-34c3-4384-9470-5f6412c71953'),('b53e7979-eb29-4513-9e16-6c0bd4180f1f'),
    ('5a34bc4e-09a7-49b3-94ba-3c8f875a8896'),('5048516d-c1af-4802-b9ea-1a7599a4d67b')
  ) AS t(id)
  LEFT JOIN bug_reports b ON b.id = t.id;

\echo ''
\echo '=== 3. WARNING: any target already moved on (someone worked it since 25 Aug)? ==='
\echo '    Anything listed here means the forward script would append a correction to a'
\echo '    ticket that is no longer open. Read it before running the forward script.'
SELECT b.status, left(b.title, 66) AS title, b.updated_at
  FROM bug_reports b
 WHERE b.id IN ('95702d58-928e-48ea-9b42-76b2487ae9aa','bfdc8c44-8971-4960-92a4-fb9e831e1a59',
                '7fbc2f5b-935e-4a85-9f3c-23d5b7c318bc','51d8efb7-cadb-45cf-91da-1da5d1b41520',
                '20d9d3bc-02b2-44a3-b407-1eb131b04279','b6ba09af-a3f4-4d4f-99c1-bf3c21e79a80',
                'd821f946-5706-4261-b7fc-ff8f02b768a9','8a1b1569-b7b0-4f9f-8d45-43662ac82de7',
                'a23a05d7-c505-47e1-80e6-ceff1ab3ea51','564dd615-058c-4081-8e22-8d51b109def1',
                '15c671de-34c3-4384-9470-5f6412c71953','b53e7979-eb29-4513-9e16-6c0bd4180f1f',
                '5a34bc4e-09a7-49b3-94ba-3c8f875a8896','5048516d-c1af-4802-b9ea-1a7599a4d67b')
   AND b.status::text NOT IN ('open','in_progress')
 ORDER BY b.updated_at DESC;

\echo ''
\echo '=== 4. tracker totals as they stand ==='
SELECT status, count(*) FROM bug_reports GROUP BY status ORDER BY count(*) DESC;

\echo ''
\echo 'Nothing was written. Forward script: db-ops/bug-tracker-truth-2026-08-27.sql'
