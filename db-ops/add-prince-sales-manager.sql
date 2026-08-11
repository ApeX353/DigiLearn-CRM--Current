-- ============================================================================
-- Give prince@me.com the sales_manager role on PROD (matches staging), so the
-- manager-gated controls — incl. the Leads "New" filter "Run auto-assign"
-- button + campaign picker — appear for him. Idempotent + reversible.
-- NOTE: roles are baked into the JWT at login — prince must LOG OUT and back
-- in for the new role to take effect in his session.
-- Run (prod):  psql -U crm -d digilearn_crm -f add-prince-sales-manager.sql
-- ============================================================================
BEGIN;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email = 'prince@me.com' AND r.name = 'sales_manager'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

SELECT u.email, string_agg(r.name, ', ' ORDER BY r.name) AS roles
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.email = 'prince@me.com'
GROUP BY u.email;

COMMIT;

-- UNDO:
--   DELETE FROM user_roles ur USING users u, roles r
--   WHERE ur.user_id=u.id AND ur.role_id=r.id
--     AND u.email='prince@me.com' AND r.name='sales_manager';
