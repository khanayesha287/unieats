-- ================================================================
-- UniEats: Enable Supabase Realtime + RLS SELECT/UPDATE policies
-- ================================================================
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
--
-- WHAT THIS DOES:
-- 1. Enables Realtime publication on orders and order_items tables
--    so that INSERT/UPDATE/DELETE events are pushed to connected clients.
-- 2. Sets REPLICA IDENTITY FULL so the full row is included in
--    UPDATE events (needed for Realtime to send complete payloads).
-- 3. Adds RLS SELECT/UPDATE policies so authenticated staff
--    (admin, canteen_owner, driver) can read and update orders.
--
-- IDEMPOTENT: Safe to run multiple times.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Enable RLS (idempotent — already done in previous migration)
-- ----------------------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 2. Enable Realtime publication
-- ----------------------------------------------------------------
-- DO block ensures we don't error if the table is already published.
DO $$
BEGIN
  -- Add orders to the supabase_realtime publication (if not already)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;

  -- Add order_items to the supabase_realtime publication (if not already)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  END IF;
END $$;

-- Set REPLICA IDENTITY FULL so UPDATE events include the complete
-- before/after row (required for the realtime client to deliver the
-- full updated record, not just the changed columns).
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------
-- 3. RLS: SELECT policy on orders for authenticated staff
-- ----------------------------------------------------------------
-- Allows any authenticated user with an active staff_profiles row to
-- read all orders (admin, canteen_owner, driver all need this).
DROP POLICY IF EXISTS orders_staff_select ON orders;
CREATE POLICY orders_staff_select ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.active = true
    )
  );

-- ----------------------------------------------------------------
-- 4. RLS: UPDATE policy on orders for authenticated staff
-- ----------------------------------------------------------------
-- Role-scoped updates:
--   admin         → can update any order
--   canteen_owner → can update only orders for their canteen
--   driver        → can update delivery orders (status changes)
DROP POLICY IF EXISTS orders_staff_update ON orders;
CREATE POLICY orders_staff_update ON orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.active = true
        AND (
          sp.role = 'admin'
          OR (sp.role = 'canteen_owner' AND sp.canteen_id = orders.canteen_id)
          OR (sp.role = 'driver' AND orders.order_type = 'delivery')
        )
    )
  );

-- ----------------------------------------------------------------
-- 5. RLS: SELECT policy on order_items for authenticated staff
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS order_items_staff_select ON order_items;
CREATE POLICY order_items_staff_select ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.active = true
    )
  );

-- Checkout INSERT policies are defined by
-- add-order-tracking-workflow-security.sql after tracking_token_hash exists.
-- Keeping them out of this foundational migration prevents a later rerun from
-- weakening checkout validation.
