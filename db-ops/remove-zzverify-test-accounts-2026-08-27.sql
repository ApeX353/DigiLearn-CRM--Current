-- ============================================================================
-- Remove the zzverify-* test accounts from production.
-- 27 August 2026.
--
-- WHAT THEY ARE
-- Four verification accounts created on 26 July while testing manager/rep
-- flows, left behind on production:
--     zzverify-mgr@clearhue.co.zw     zzverify-mgr-b@clearhue.co.zw
--     zzverify-rep@clearhue.co.zw     zzverify-rep-b@clearhue.co.zw
-- All four are already is_active = false, so nobody can sign in as them. They
-- still show up in user lists, role counts and anything that enumerates staff.
--
-- ============================================================================
-- READ THIS BEFORE RUNNING -- deleting a user is NOT a safe operation here
-- ============================================================================
-- `users` has no deleted_at: deletion is permanent, there is no soft delete.
--
-- Worse, 43 foreign keys point at users and TWELVE of them are ON DELETE
-- CASCADE, including invoices.owner_id, quotes.owner_id, activities
-- .created_by_id and managed_files.uploaded_by_id. Deleting the wrong user
-- would silently destroy their invoices and quotes -- no error, no warning,
-- just missing revenue records.
--
-- So this script REFUSES to delete anybody who owns anything. The guard is
-- not a formality; it is the only thing standing between a tidy-up and a
-- data loss incident. Checked on the 25 Aug production copy: all four hold
-- zero rows across every one of the 43 referencing columns, and their only
-- trace is auth plumbing (sessions, account_security, user_roles) which
-- cascades correctly.
--
-- Run the -DRYRUN first. -UNDO restores the accounts.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DROP TABLE IF EXISTS db_ops_zzverify_users_undo;
DROP TABLE IF EXISTS db_ops_zzverify_roles_undo;
DROP TABLE IF EXISTS db_ops_zzverify_security_undo;

CREATE TABLE db_ops_zzverify_users_undo AS
SELECT * FROM users WHERE email LIKE 'zzverify-%@%';

CREATE TABLE db_ops_zzverify_roles_undo AS
SELECT ur.* FROM user_roles ur
 WHERE ur.user_id IN (SELECT id FROM db_ops_zzverify_users_undo);

-- Includes the password hash. It already lives in account_security on this
-- same database, so snapshotting it changes no exposure -- and without it an
-- undo would restore accounts nobody could ever sign in to.
CREATE TABLE db_ops_zzverify_security_undo AS
SELECT a.* FROM account_security a
 WHERE a.user_id IN (SELECT id FROM db_ops_zzverify_users_undo);

-- ---------------------------------------------------------------- the guard
DO $guard$
DECLARE
  n_users   int;
  n_active  int;
  offender  text;
  total     bigint := 0;
  col       record;
  cnt       bigint;
BEGIN
  SELECT count(*) INTO n_users FROM db_ops_zzverify_users_undo;
  IF n_users = 0 THEN
    RAISE EXCEPTION 'No zzverify-* accounts found. Already removed? Nothing changed.';
  END IF;
  IF n_users > 10 THEN
    RAISE EXCEPTION 'Matched % accounts -- far more than the 4 expected. Refusing.', n_users;
  END IF;

  SELECT count(*) INTO n_active
    FROM db_ops_zzverify_users_undo WHERE is_active;
  IF n_active > 0 THEN
    RAISE EXCEPTION 'Refusing: % of the matched accounts are ACTIVE. A live account is not a leftover test account.', n_active;
  END IF;

  -- Walk EVERY foreign key that points at users and count what these
  -- accounts own. Anything at all, and we stop: a CASCADE would take it
  -- with them.
  FOR col IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS colname
      FROM pg_constraint c
      JOIN unnest(c.conkey) k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
       -- auth plumbing is expected and cascades correctly
       AND c.conrelid::regclass::text NOT IN
           ('auth_sessions', 'account_security', 'user_roles')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s WHERE %I IN (SELECT id FROM db_ops_zzverify_users_undo)',
      col.tbl, col.colname)
    INTO cnt;
    IF cnt > 0 THEN
      total := total + cnt;
      offender := coalesce(offender || ', ', '') || col.tbl || '.' || col.colname || '=' || cnt;
    END IF;
  END LOOP;

  IF total > 0 THEN
    RAISE EXCEPTION
      'Refusing to delete: these accounts own % row(s) -- %. Twelve of the FKs to users are ON DELETE CASCADE, so deleting them would destroy that data. Reassign or clear it first.',
      total, offender;
  END IF;

  RAISE NOTICE 'Guard passed: % inactive account(s), owning nothing. Safe to remove.', n_users;
END
$guard$;

-- ---------------------------------------------------------------- the delete
-- auth_sessions, account_security and user_roles all cascade from here.
DELETE FROM users WHERE id IN (SELECT id FROM db_ops_zzverify_users_undo);

\echo ''
\echo '=== removed ==='
SELECT email, is_active, created_at::date AS created
  FROM db_ops_zzverify_users_undo ORDER BY email;

\echo ''
\echo '=== any zzverify accounts left? (should be 0) ==='
SELECT count(*) AS remaining FROM users WHERE email LIKE 'zzverify-%@%';

\echo ''
\echo '=== remaining users ==='
SELECT email, is_active FROM users ORDER BY is_active DESC, email;

\echo ''
\echo 'Undo snapshots: db_ops_zzverify_users_undo / _roles_undo / _security_undo'
\echo 'Reverse with db-ops/remove-zzverify-test-accounts-2026-08-27-UNDO.sql'

COMMIT;
