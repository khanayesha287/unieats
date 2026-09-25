-- ================================================================
-- UniEats: Rename canteen "Tippu Center" -> "Hot Potato"
-- ================================================================
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
--
-- WHY: The frontend catalog (lib/data/canteens.ts) uses name "Hot Potato"
-- (slug "hot-potato"). Checkout resolves canteen_id by matching the DB
-- canteens.name against the order's canteen name/slug. While the row is
-- still named "Tippu Center", every Hot Potato order is saved with a NULL
-- canteen_id and never appears on any canteen portal dashboard.
--
-- IDEMPOTENT: Safe to run multiple times.
-- ================================================================

UPDATE canteens
SET name = 'Hot Potato'
WHERE name = 'Tippu Center';
