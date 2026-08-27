-- ============================================================================
-- Restart the 90-day password clock on accounts it has already run out on.
-- 27 August 2026.
--
-- WHY
-- Every account was created in late May, so the 90-day timer expired for all
-- of them together on 22 August (one on the 24th). Nobody chose that date and
-- nobody was warned. Until the accompanying code change, an expired password
-- shared a field with "an admin has forced a password change", which the
-- client treats as: hold this person on /change-password. So a clock was
-- locking people out of their own CRM.
--
-- The code fix separates the two, so expiry now only produces a warning. This
-- script deals with the leftover data: without it, everyone still gets an
-- "expired 5 days ago" notice on their next login, for a deadline they were
-- never told about.
--
-- WHAT IT DOES *NOT* DO
-- It does not change, reset or weaken anyone's password, and it does not
-- touch requires_password_change. It moves a date. Everybody keeps the
-- password they already have; they simply get a fresh 90 days and, from the
-- code change, two weeks of warning before the next one.
--
-- SCOPE: accounts whose expiry is ALREADY in the past. An account whose
-- password was changed recently is left alone -- mpofunk@ changed on 25 Aug
-- and correctly sits at 23 Nov, which is the mechanism working. Only the
-- accounts stranded by the original bulk setup are moved.
--
-- Run the -DRYRUN first. -UNDO reverses it.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

DROP TABLE IF EXISTS db_ops_pwd_expiry_20260827_undo;

CREATE TABLE db_ops_pwd_expiry_20260827_undo AS
SELECT a.id,
       a.user_id,
       a.password_expires_at AS old_expires_at,
       a.updated_at          AS old_updated_at
  FROM account_security a
 WHERE a.password_expires_at IS NOT NULL
   AND a.password_expires_at < now();

DO $guard$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM db_ops_pwd_expiry_20260827_undo;
  IF n = 0 THEN
    RAISE EXCEPTION 'No expired accounts found -- nothing to do. (Already run?) Nothing changed.';
  END IF;
  IF n > 50 THEN
    RAISE EXCEPTION 'Found % expired accounts, which is far more than expected. Refusing to bulk-move dates blindly.', n;
  END IF;
  RAISE NOTICE 'Moving % expired account(s) to 90 days from now.', n;
END
$guard$;

-- 90 days matches setPasswordExpiration() in auth.service.ts, which is what
-- registration and every password change use. Keep the two in step: if the
-- policy period ever changes, it changes in both places or neither.
UPDATE account_security a
   SET password_expires_at = now() + interval '90 days',
       updated_at          = now()
  FROM db_ops_pwd_expiry_20260827_undo u
 WHERE a.id = u.id;

\echo ''
\echo '=== moved ==='
SELECT us.email,
       us.is_active,
       u.old_expires_at::date  AS was,
       a.password_expires_at::date AS now_expires
  FROM db_ops_pwd_expiry_20260827_undo u
  JOIN account_security a ON a.id = u.id
  JOIN users us ON us.id = a.user_id
 ORDER BY us.is_active DESC, us.email;

\echo ''
\echo '=== anyone still showing as expired? (should be none) ==='
SELECT count(*) AS still_expired
  FROM account_security
 WHERE password_expires_at IS NOT NULL AND password_expires_at < now();

\echo ''
\echo '=== untouched, for contrast: accounts whose clock is still running ==='
SELECT us.email, a.password_expires_at::date AS expires
  FROM account_security a
  JOIN users us ON us.id = a.user_id
 WHERE a.password_expires_at >= now()
   AND a.id NOT IN (SELECT id FROM db_ops_pwd_expiry_20260827_undo)
 ORDER BY a.password_expires_at;

\echo ''
\echo 'Undo snapshot: db_ops_pwd_expiry_20260827_undo'
\echo 'Reverse with db-ops/password-expiry-reset-2026-08-27-UNDO.sql'

COMMIT;
