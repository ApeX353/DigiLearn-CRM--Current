-- ============================================================================
-- Restore the zzverify-* test accounts deleted by
-- remove-zzverify-test-accounts-2026-08-27.sql.
--
-- Restores the user rows, their role assignments and their account_security
-- (including the original password hash, so the accounts work as before).
--
-- NOT restored: auth_sessions. Those were live login sessions and are
-- meaningless to resurrect -- signing in again creates fresh ones.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.db_ops_zzverify_users_undo') IS NULL THEN
    RAISE EXCEPTION 'Snapshot db_ops_zzverify_users_undo is gone. Nothing to restore from.';
  END IF;
END
$guard$;

INSERT INTO users SELECT * FROM db_ops_zzverify_users_undo
ON CONFLICT (id) DO NOTHING;

INSERT INTO account_security SELECT * FROM db_ops_zzverify_security_undo
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles SELECT * FROM db_ops_zzverify_roles_undo
ON CONFLICT DO NOTHING;

\echo ''
\echo '=== restored ==='
SELECT u.email, u.is_active,
       (SELECT count(*) FROM user_roles ur WHERE ur.user_id = u.id) AS roles
  FROM users u WHERE u.email LIKE 'zzverify-%@%' ORDER BY u.email;

COMMIT;

-- Once checked:
--   DROP TABLE db_ops_zzverify_users_undo, db_ops_zzverify_roles_undo,
--              db_ops_zzverify_security_undo;
