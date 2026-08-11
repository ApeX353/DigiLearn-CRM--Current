-- ============================================================================
-- Set rep territories on PROD to match staging, so manual "Run auto-assign"
-- has eligible recipients (territory is a HARD filter). Keyed by email.
-- No flag change — auto_assign_enabled stays OFF (only the cron is gated;
-- the manual button ignores it). Reversible: set territory_provinces = NULL.
-- Run (prod):  psql -U crm -d digilearn_crm -f set-prod-territories.sql
-- ============================================================================
BEGIN;

-- Tanya (rep) + Busi (manager): Mashonaland x3 + Manicaland + Harare
UPDATE users SET territory_provinces =
  '["Mashonaland East","Mashonaland West","Mashonaland Central","Manicaland","Harare"]'
WHERE email IN ('tanyag@clearhue.co.zw', 'busid@clearhue.co.zw');

-- Kim (manager) + Manake (rep): Midlands + Mat South/North + Bulawayo + Masvingo
UPDATE users SET territory_provinces =
  '["Midlands","Matebeleland South","Bulawayo","Masvingo","Matebeleland North"]'
WHERE email IN ('mpofunk@clearhue.co.zw', 'manakedube@clearhue.co.zw');

-- verify
SELECT first_name||' '||last_name AS rep, email, territory_provinces
FROM users
WHERE email IN ('tanyag@clearhue.co.zw','busid@clearhue.co.zw',
                'mpofunk@clearhue.co.zw','manakedube@clearhue.co.zw')
ORDER BY 1;

COMMIT;
