-- Grant sales_rep the "update Lead" CASL permission, scoped to their
-- own leads via the existing template-string condition.
--
-- The hardcoded `createForRoles` factory in casl-ability.factory.ts
-- already grants this rule, but runtime ability is built from the DB
-- via `createForUser`, and the seed only loaded `read` and `create`
-- for sales_rep. That mismatch blocks reps from POSTing reversal
-- requests on their own leads (the controller does
-- @CheckPermission('update', 'Lead') as a generic gate).

INSERT INTO role_permissions (role_id, permission_id, conditions, is_active)
SELECT
  (SELECT id FROM roles WHERE name = 'sales_rep'),
  '02c4e642-80e4-4633-859c-729ca7a1aab8',  -- permissions.id for action=update subject=Lead
  '{"assigned_to": "{{user.id}}"}',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions
  WHERE role_id = (SELECT id FROM roles WHERE name = 'sales_rep')
    AND permission_id = '02c4e642-80e4-4633-859c-729ca7a1aab8'
);

SELECT r.name, p.action, p.subject, rp.conditions
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'sales_rep' AND p.subject = 'Lead'
ORDER BY p.action;
