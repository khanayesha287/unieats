-- ================================================================
-- UniEats: Harden staff and canteen-scoped RLS
-- ================================================================
-- Run after create-staff-profiles.sql and
-- enable-realtime-and-rls-policies.sql.
-- Idempotent: safe to run more than once.
--
-- The browser must use the authenticated Supabase client for staff
-- operations. The service-role key remains server-only.
-- ================================================================

-- SECURITY DEFINER avoids recursive RLS evaluation when policies inspect
-- the current user's staff_profiles row.
CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.staff_profiles
  WHERE id = auth.uid() AND active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_staff_canteen_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT canteen_id
  FROM public.staff_profiles
  WHERE id = auth.uid() AND active = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_staff_canteen_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_canteen_id() TO authenticated;

ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- Staff profiles: admins manage staff; each user can read only self.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS staff_select_all ON staff_profiles;
DROP POLICY IF EXISTS staff_select_self_or_admin ON staff_profiles;
CREATE POLICY staff_select_self_or_admin ON staff_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_staff_role() = 'admin');

DROP POLICY IF EXISTS staff_insert ON staff_profiles;
CREATE POLICY staff_insert ON staff_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.current_staff_role() = 'admin');

DROP POLICY IF EXISTS staff_update ON staff_profiles;
CREATE POLICY staff_update ON staff_profiles
  FOR UPDATE TO authenticated
  USING (public.current_staff_role() = 'admin')
  WITH CHECK (public.current_staff_role() = 'admin');

DROP POLICY IF EXISTS staff_delete ON staff_profiles;
CREATE POLICY staff_delete ON staff_profiles
  FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'admin');

-- ----------------------------------------------------------------
-- Orders: scope reads and writes by trusted database profile values.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS orders_staff_select ON orders;
CREATE POLICY orders_staff_select ON orders
  FOR SELECT TO authenticated
  USING (
    public.current_staff_role() = 'admin'
    OR (
      public.current_staff_role() = 'canteen_owner'
      AND canteen_id = public.current_staff_canteen_id()
    )
    OR (
      public.current_staff_role() = 'driver'
      AND order_type = 'delivery'
      AND driver_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS orders_staff_update ON orders;
CREATE POLICY orders_staff_update ON orders
  FOR UPDATE TO authenticated
  USING (
    public.current_staff_role() = 'admin'
    OR (
      public.current_staff_role() = 'canteen_owner'
      AND canteen_id = public.current_staff_canteen_id()
    )
    OR (
      public.current_staff_role() = 'driver'
      AND order_type = 'delivery'
      AND driver_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_staff_role() = 'admin'
    OR (
      public.current_staff_role() = 'canteen_owner'
      AND canteen_id = public.current_staff_canteen_id()
    )
    OR (
      public.current_staff_role() = 'driver'
      AND order_type = 'delivery'
      AND driver_id = auth.uid()
    )
  );

-- Checkout is intentionally available to guests. It does not grant read
-- access, and staff reads remain protected by orders_staff_select.
-- ----------------------------------------------------------------
-- Order items: scope through their parent order.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS order_items_staff_select ON order_items;
CREATE POLICY order_items_staff_select ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          public.current_staff_role() = 'admin'
          OR (
            public.current_staff_role() = 'canteen_owner'
            AND o.canteen_id = public.current_staff_canteen_id()
          )
          OR (
            public.current_staff_role() = 'driver'
            AND o.order_type = 'delivery'
            AND o.driver_id = auth.uid()
          )
        )
    )
  );

-- Only admins can delete orders and their child items.
DROP POLICY IF EXISTS orders_admin_delete ON orders;
CREATE POLICY orders_admin_delete ON orders
  FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'admin');

DROP POLICY IF EXISTS order_items_admin_delete ON order_items;
CREATE POLICY order_items_admin_delete ON order_items
  FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'admin');
