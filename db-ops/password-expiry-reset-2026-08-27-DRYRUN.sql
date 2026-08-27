-- ============================================================================
-- Preview for password-expiry-reset-2026-08-27.sql. READ-ONLY.
-- Shows exactly which accounts would move, and which are deliberately left.
-- ============================================================================

\set ON_ERROR_STOP on

\echo ''
\echo '=== WOULD MOVE: expiry already in the past ==='
SELECT us.email,
       us.is_active,
       a.password_changed_at::date AS pw_set,
       a.password_expires_at::date AS expired_on,
       (now()::date - a.password_expires_at::date) AS days_ago,
       (now() + interval '90 days')::date AS would_become
  FROM account_security a
  JOIN users us ON us.id = a.user_id
 WHERE a.password_expires_at IS NOT NULL
   AND a.password_expires_at < now()
 ORDER BY us.is_active DESC, us.email;

\echo ''
\echo '=== WOULD NOT MOVE: clock still running, left alone on purpose ==='
SELECT us.email,
       us.is_active,
       a.password_changed_at::date AS pw_set,
       a.password_expires_at::date AS expires,
       (a.password_expires_at::date - now()::date) AS days_left
  FROM account_security a
  JOIN users us ON us.id = a.user_id
 WHERE a.password_expires_at IS NULL
    OR a.password_expires_at >= now()
 ORDER BY a.password_expires_at NULLS FIRST;

\echo ''
\echo '=== totals ==='
SELECT count(*) FILTER (WHERE password_expires_at < now())  AS would_move,
       count(*) FILTER (WHERE password_expires_at >= now()) AS untouched,
       count(*) FILTER (WHERE password_expires_at IS NULL)  AS no_expiry_set
  FROM account_security;

\echo ''
\echo 'Nothing was written.'
