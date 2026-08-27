-- ============================================================================
-- Preview for remove-zzverify-test-accounts-2026-08-27.sql. READ-ONLY.
--
-- The important section is #3: it walks every foreign key that points at
-- users and counts what these accounts own. Twelve of those FKs are ON
-- DELETE CASCADE (invoices, quotes, activities, managed_files and more), so
-- anything listed there would be destroyed along with the account.
-- ============================================================================

\set ON_ERROR_STOP on

\echo ''
\echo '=== 1. accounts matched ==='
SELECT email, is_active, created_at::date AS created
  FROM users WHERE email LIKE 'zzverify-%@%' ORDER BY email;

\echo ''
\echo '=== 2. any of them ACTIVE? (the forward script refuses if so) ==='
SELECT count(*) AS active_matched
  FROM users WHERE email LIKE 'zzverify-%@%' AND is_active;

\echo ''
\echo '=== 3. what they own, across EVERY FK to users ==='
\echo '    Auth plumbing is excluded (it cascades correctly and is expected).'
\echo '    ANY row here blocks the delete.'
DO $preview$
DECLARE
  col record; cnt bigint; total bigint := 0;
BEGIN
  FOR col IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS colname,
           CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END AS on_delete
      FROM pg_constraint c
      JOIN unnest(c.conkey) k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
       AND c.conrelid::regclass::text NOT IN
           ('auth_sessions','account_security','user_roles')
     ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s WHERE %I IN (SELECT id FROM users WHERE email LIKE ''zzverify-%%@%%'')',
      col.tbl, col.colname) INTO cnt;
    IF cnt > 0 THEN
      total := total + cnt;
      RAISE NOTICE '  BLOCKS DELETE: %.% = % row(s)  [on delete %]',
        col.tbl, col.colname, cnt, col.on_delete;
    END IF;
  END LOOP;
  IF total = 0 THEN
    RAISE NOTICE '  Nothing owned across any FK. Safe to remove.';
  ELSE
    RAISE NOTICE '  TOTAL % row(s) would block the delete.', total;
  END IF;
END
$preview$;

\echo ''
\echo '=== 4. auth plumbing that will cascade away with them ==='
SELECT 'auth_sessions' AS tbl, count(*) FROM auth_sessions
 WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'zzverify-%@%')
UNION ALL SELECT 'account_security', count(*) FROM account_security
 WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'zzverify-%@%')
UNION ALL SELECT 'user_roles', count(*) FROM user_roles
 WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'zzverify-%@%');

\echo ''
\echo 'Nothing was written.'
