-- ============================================================================
-- Reverse password-expiry-reset-2026-08-27.sql -- put the old expiry dates
-- back exactly as they were.
--
-- Note what this means: undoing puts those accounts back into the expired
-- state, so their users will see the "expired N days ago" notice again. It
-- does not lock anyone out (the code change made expiry advisory), but there
-- is rarely a good reason to run this.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.db_ops_pwd_expiry_20260827_undo') IS NULL THEN
    RAISE EXCEPTION 'Snapshot db_ops_pwd_expiry_20260827_undo is gone. Nothing to restore from.';
  END IF;
END
$guard$;

UPDATE account_security a
   SET password_expires_at = u.old_expires_at,
       updated_at          = u.old_updated_at
  FROM db_ops_pwd_expiry_20260827_undo u
 WHERE a.id = u.id;

\echo ''
\echo '=== restored ==='
SELECT us.email, a.password_expires_at::date AS expires
  FROM db_ops_pwd_expiry_20260827_undo u
  JOIN account_security a ON a.id = u.id
  JOIN users us ON us.id = a.user_id
 ORDER BY us.email;

COMMIT;

-- Then, once checked:  DROP TABLE db_ops_pwd_expiry_20260827_undo;
