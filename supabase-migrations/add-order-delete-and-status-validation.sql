-- ================================================================
-- UniEats: Admin-Only Order Delete + Status Validation
-- ================================================================
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
--
-- WHAT THIS DOES:
-- 1. Enables RLS on the orders and order_items tables (if not already).
-- 2. Creates admin-only DELETE policies so only staff with role='admin'
--    in staff_profiles can delete orders and order_items.
-- 3. Adds a CHECK constraint on orders.status to enforce valid values.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Enable RLS (idempotent)
-- ----------------------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 2. Admin-only DELETE policy on orders
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS orders_admin_delete ON orders;
CREATE POLICY orders_admin_delete ON orders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.role = 'admin'
        AND sp.active = true
    )
  );

-- ----------------------------------------------------------------
-- 3. Admin-only DELETE policy on order_items
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS order_items_admin_delete ON order_items;
CREATE POLICY order_items_admin_delete ON order_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.role = 'admin'
        AND sp.active = true
    )
  );

-- ----------------------------------------------------------------
-- 4. Status validation CHECK constraint (idempotent)
-- ----------------------------------------------------------------
-- Drop existing constraint if present, then re-add with full set
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled'
  ));
