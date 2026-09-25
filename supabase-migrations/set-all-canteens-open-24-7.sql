-- ================================================================
-- UniEats: Set all canteens to open 24/7
-- ================================================================
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
--
-- WHY: Ordering is available around the clock on every platform.
-- The canteens rows previously stored a 07:00:00 - 00:00:00 window;
-- the frontend no longer gates ordering on hours, and the stored
-- schedule now matches the 24/7 policy (00:00:00 through 23:59:59,
-- is_open always TRUE) so any future consumer of these columns
-- reads a 24/7 schedule.
--
-- IDEMPOTENT: Safe to run multiple times.
-- ================================================================

UPDATE canteens
SET opening_time = '00:00:00',
    closing_time = '23:59:59',
    is_open = TRUE;
