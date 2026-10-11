-- Allow authenticated drivers to see unassigned delivery orders while keeping
-- status updates restricted to orders assigned to their own staff profile.
-- Apply after add-order-tracking-workflow-security.sql.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS special_instructions TEXT;

DROP POLICY IF EXISTS orders_staff_select ON public.orders;
CREATE POLICY orders_staff_select ON public.orders
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
      AND (
        driver_id = auth.uid()
        OR (
          driver_id IS NULL
          AND status IN ('pending', 'confirmed', 'preparing', 'ready')
        )
      )
    )
  );

DROP POLICY IF EXISTS order_items_staff_select ON public.order_items;
CREATE POLICY order_items_staff_select ON public.order_items
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
            AND (
              o.driver_id = auth.uid()
              OR (
                o.driver_id IS NULL
                AND o.status IN ('pending', 'confirmed', 'preparing', 'ready')
              )
            )
          )
        )
    )
  );
