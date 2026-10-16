-- Link authenticated staff profiles to public.driver records and allow
-- authenticated drivers to atomically claim ready delivery orders.
-- Run after harden-staff-canteen-rls.sql,
-- add-order-tracking-workflow-security.sql,
-- add-order-status-timestamps.sql, and
-- allow-drivers-to-view-incoming-orders.sql.

DO $$
BEGIN
  IF to_regclass('public.driver') IS NULL
    OR to_regclass('public.staff_profiles') IS NULL
    OR to_regclass('public.orders') IS NULL
    OR to_regclass('public.order_items') IS NULL
  THEN
    RAISE EXCEPTION 'Required public.driver, staff_profiles, orders, or order_items table is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'validate_order_workflow_update'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND n.nspname = 'public'
      AND p.proname = 'validate_order_workflow_update'
      AND p.pronargs = 0
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 2) = 2
      AND (t.tgtype & 16) = 16
  ) THEN
    RAISE EXCEPTION 'Expected an enabled BEFORE UPDATE row trigger named validate_order_workflow_update on public.orders.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.driver'::regclass
      AND attname = 'id'
      AND atttypid = 'uuid'::regtype
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Expected public.driver.id to be UUID; inspect the existing driver schema before applying this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid
      AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.driver'::regclass
      AND c.contype IN ('p', 'u')
      AND c.conkey = ARRAY[a.attnum]::SMALLINT[]
      AND a.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'public.driver.id must be a primary key or uniquely constrained before it can be referenced.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.driver'::regclass
      AND attname = 'status'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Expected public.driver.status; inspect the existing driver schema before applying this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute orders_driver
    JOIN pg_attribute driver_id ON driver_id.attrelid = 'public.driver'::regclass
      AND driver_id.attname = 'id'
      AND driver_id.attnum > 0
      AND NOT driver_id.attisdropped
    WHERE orders_driver.attrelid = 'public.orders'::regclass
      AND orders_driver.attname = 'driver_id'
      AND orders_driver.atttypid = driver_id.atttypid
      AND orders_driver.attnum > 0
      AND NOT orders_driver.attisdropped
  ) THEN
    RAISE EXCEPTION 'public.orders.driver_id must have the same type as public.driver.id.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute orders_driver ON orders_driver.attrelid = c.conrelid
      AND orders_driver.attnum = ANY(c.conkey)
    JOIN pg_attribute driver_id ON driver_id.attrelid = c.confrelid
      AND driver_id.attnum = ANY(c.confkey)
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.orders'::regclass
      AND c.confrelid = 'public.driver'::regclass
      AND c.conkey = ARRAY[orders_driver.attnum]::SMALLINT[]
      AND c.confkey = ARRAY[driver_id.attnum]::SMALLINT[]
      AND orders_driver.attname = 'driver_id'
      AND driver_id.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'Expected public.orders.driver_id to reference public.driver.id; inspect the existing order relationship before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT required.column_name
    FROM (VALUES
      ('confirmed_at'),
      ('preparing_at'),
      ('ready_at'),
      ('out_for_delivery_at'),
      ('delivered_at')
    ) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'orders'
        AND c.column_name = required.column_name
    )
  ) THEN
    RAISE EXCEPTION 'Apply add-order-status-timestamps.sql before this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'orders'
      AND c.column_name = 'updated_at'
  ) THEN
    RAISE EXCEPTION 'Expected public.orders.updated_at; inspect the existing order schema before applying this migration.';
  END IF;
END;
$$;

ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS driver_id UUID;

DO $$
DECLARE
  driver_id_attnum SMALLINT;
BEGIN
  SELECT attnum
  INTO driver_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.staff_profiles'::regclass
    AND attname = 'driver_id'
    AND attnum > 0
    AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.staff_profiles'::regclass
      AND c.confrelid = 'public.driver'::regclass
      AND c.conkey = ARRAY[driver_id_attnum]::SMALLINT[]
  ) THEN
    ALTER TABLE public.staff_profiles
      ADD CONSTRAINT staff_profiles_driver_id_fkey
      FOREIGN KEY (driver_id)
      REFERENCES public.driver(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT driver_id
    FROM public.staff_profiles
    WHERE driver_id IS NOT NULL
    GROUP BY driver_id
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM public.staff_profiles
    WHERE driver_id = '2d5db34a-4e2b-4dd2-b001-9edc07c14a57'
      AND id <> 'f057abd4-a7d5-4396-bf75-a14940a755af'
  ) THEN
    RAISE EXCEPTION 'The driver record is already mapped or duplicate staff-to-driver mappings exist; resolve them before applying this migration.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS staff_profiles_driver_id_unique
  ON public.staff_profiles (driver_id)
  WHERE driver_id IS NOT NULL;

DO $$
BEGIN
  PERFORM 1
  FROM public.staff_profiles sp
  JOIN public.driver d
    ON d.id = '2d5db34a-4e2b-4dd2-b001-9edc07c14a57'
  WHERE sp.id = 'f057abd4-a7d5-4396-bf75-a14940a755af'
    AND sp.role = 'driver'
    AND sp.active = true
    AND d.status = 'active'
    AND (
      sp.driver_id IS NULL
      OR sp.driver_id = '2d5db34a-4e2b-4dd2-b001-9edc07c14a57'
    )
  FOR UPDATE OF sp, d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The configured rider profile or active driver record was not found, is inactive, or is already linked differently.';
  END IF;

  UPDATE public.staff_profiles
  SET driver_id = '2d5db34a-4e2b-4dd2-b001-9edc07c14a57'
  WHERE id = 'f057abd4-a7d5-4396-bf75-a14940a755af'
    AND role = 'driver'
    AND active = true
    AND (driver_id IS NULL OR driver_id = '2d5db34a-4e2b-4dd2-b001-9edc07c14a57');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The rider profile mapping changed while the migration was running; no profile mapping was applied.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_staff_driver_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT sp.driver_id
  FROM public.staff_profiles sp
  JOIN public.driver d ON d.id = sp.driver_id
  WHERE sp.id = auth.uid()
    AND sp.role = 'driver'
    AND sp.active = true
    AND d.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_staff_driver_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_driver_id() TO authenticated;

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Keep the existing workflow while permitting only the atomic ready-order
-- claim to set driver_id and move its status to out_for_delivery.
CREATE OR REPLACE FUNCTION public.validate_order_workflow_update()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  staff_role TEXT := public.current_staff_role();
  status_changed BOOLEAN;
BEGIN
  status_changed := NEW.status IS DISTINCT FROM OLD.status;

  IF staff_role = 'canteen_owner' THEN
    IF (to_jsonb(NEW) - ARRAY[
      'status', 'confirmed_at', 'preparing_at', 'ready_at',
      'out_for_delivery_at', 'delivered_at', 'updated_at'
    ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'status', 'confirmed_at', 'preparing_at', 'ready_at',
      'out_for_delivery_at', 'delivered_at', 'updated_at'
    ])
    THEN
      RAISE EXCEPTION 'Canteen staff may only update order status';
    END IF;
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('preparing', 'cancelled'))
      OR (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Invalid canteen order status transition';
    END IF;
  ELSIF staff_role = 'driver' THEN
    IF (to_jsonb(NEW) - ARRAY[
      'status', 'driver_id', 'ready_at', 'out_for_delivery_at', 'delivered_at', 'updated_at'
    ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'status', 'driver_id', 'ready_at', 'out_for_delivery_at', 'delivered_at', 'updated_at'
    ])
    THEN
      RAISE EXCEPTION 'Driver staff may only update delivery status and its timestamp';
    END IF;

    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
      IF NOT (
        OLD.driver_id IS NULL
        AND OLD.status = 'ready'
        AND NEW.status = 'out_for_delivery'
        AND OLD.order_type = 'delivery'
        AND NEW.order_type = 'delivery'
        AND NEW.ready_at IS NOT DISTINCT FROM OLD.ready_at
        AND NEW.delivered_at IS NOT DISTINCT FROM OLD.delivered_at
        AND NEW.driver_id = public.current_staff_driver_id()
      ) THEN
        RAISE EXCEPTION 'Drivers may only claim an unassigned ready delivery through the claim operation';
      END IF;
    ELSE
      IF OLD.driver_id IS DISTINCT FROM public.current_staff_driver_id()
        OR OLD.order_type IS DISTINCT FROM 'delivery'
        OR NEW.order_type IS DISTINCT FROM 'delivery'
        OR NOT (
          (OLD.status = 'ready' AND NEW.status = 'out_for_delivery')
          OR (OLD.status = 'out_for_delivery' AND NEW.status = 'delivered')
        )
      THEN
        RAISE EXCEPTION 'Invalid driver order status transition';
      END IF;

      IF OLD.status = 'ready' AND (
        NEW.ready_at IS DISTINCT FROM OLD.ready_at
        OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      ) THEN
        RAISE EXCEPTION 'Invalid delivery timestamp update';
      END IF;

      IF OLD.status = 'out_for_delivery' AND (
        NEW.ready_at IS DISTINCT FROM OLD.ready_at
        OR NEW.out_for_delivery_at IS DISTINCT FROM OLD.out_for_delivery_at
      ) THEN
        RAISE EXCEPTION 'Invalid delivery timestamp update';
      END IF;
    END IF;
  ELSIF staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only authorized staff may update orders';
  END IF;

  IF staff_role IN ('canteen_owner', 'driver') AND NOT status_changed THEN
    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
      OR NEW.preparing_at IS DISTINCT FROM OLD.preparing_at
      OR NEW.ready_at IS DISTINCT FROM OLD.ready_at
      OR NEW.out_for_delivery_at IS DISTINCT FROM OLD.out_for_delivery_at
      OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
    THEN
      RAISE EXCEPTION 'Order timestamps may only be set by a valid status transition';
    END IF;
  ELSIF status_changed THEN
    NEW.confirmed_at := OLD.confirmed_at;
    NEW.preparing_at := OLD.preparing_at;
    NEW.ready_at := OLD.ready_at;
    NEW.out_for_delivery_at := OLD.out_for_delivery_at;
    NEW.delivered_at := OLD.delivered_at;
    NEW.updated_at := statement_timestamp();

    CASE NEW.status
      WHEN 'confirmed' THEN
        NEW.confirmed_at := COALESCE(OLD.confirmed_at, statement_timestamp());
      WHEN 'preparing' THEN
        NEW.preparing_at := COALESCE(OLD.preparing_at, statement_timestamp());
      WHEN 'ready' THEN
        NEW.ready_at := COALESCE(OLD.ready_at, statement_timestamp());
      WHEN 'out_for_delivery' THEN
        NEW.out_for_delivery_at := COALESCE(OLD.out_for_delivery_at, statement_timestamp());
      WHEN 'delivered' THEN
        NEW.delivered_at := COALESCE(OLD.delivered_at, statement_timestamp());
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_order_workflow_update()
  FROM PUBLIC, anon, authenticated;

-- Add read access only for ready, unassigned deliveries. Existing admin,
-- canteen-owner, and assigned-driver policies remain in place.
DROP POLICY IF EXISTS orders_driver_select_restrictive ON public.orders;
DROP POLICY IF EXISTS orders_driver_assigned_select ON public.orders;
DROP POLICY IF EXISTS orders_driver_unassigned_select ON public.orders;
DROP POLICY IF EXISTS order_items_driver_select_restrictive ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_assigned_select ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_unassigned_select ON public.order_items;
DROP POLICY IF EXISTS orders_driver_assigned_update ON public.orders;
DROP POLICY IF EXISTS orders_driver_update_restrictive ON public.orders;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_driver_select_restrictive'
  ) THEN
    CREATE POLICY orders_driver_select_restrictive ON public.orders
      AS RESTRICTIVE
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
            driver_id = public.current_staff_driver_id()
            OR (
              driver_id IS NULL
              AND status = 'ready'
              AND public.current_staff_driver_id() IS NOT NULL
            )
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_driver_assigned_select'
  ) THEN
    CREATE POLICY orders_driver_assigned_select ON public.orders
      FOR SELECT TO authenticated
      USING (
        order_type = 'delivery'
        AND driver_id = public.current_staff_driver_id()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_driver_unassigned_select'
  ) THEN
    CREATE POLICY orders_driver_unassigned_select ON public.orders
      FOR SELECT TO authenticated
      USING (
        order_type = 'delivery'
        AND status = 'ready'
        AND driver_id IS NULL
        AND public.current_staff_driver_id() IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_driver_select_restrictive'
  ) THEN
    CREATE POLICY order_items_driver_select_restrictive ON public.order_items
      AS RESTRICTIVE
      FOR SELECT TO authenticated
      USING (
        public.current_staff_role() = 'admin'
        OR (
          public.current_staff_role() = 'canteen_owner'
          AND EXISTS (
            SELECT 1
            FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.canteen_id = public.current_staff_canteen_id()
          )
        )
        OR (
          public.current_staff_role() = 'driver'
          AND EXISTS (
            SELECT 1
            FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.order_type = 'delivery'
              AND (
                o.driver_id = public.current_staff_driver_id()
                OR (
                  o.driver_id IS NULL
                  AND o.status = 'ready'
                  AND public.current_staff_driver_id() IS NOT NULL
                )
              )
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_driver_assigned_select'
  ) THEN
    CREATE POLICY order_items_driver_assigned_select ON public.order_items
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_items.order_id
            AND o.order_type = 'delivery'
            AND o.driver_id = public.current_staff_driver_id()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_driver_unassigned_select'
  ) THEN
    CREATE POLICY order_items_driver_unassigned_select ON public.order_items
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_items.order_id
            AND o.order_type = 'delivery'
            AND o.status = 'ready'
            AND o.driver_id IS NULL
            AND public.current_staff_driver_id() IS NOT NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_driver_assigned_update'
  ) THEN
    CREATE POLICY orders_driver_assigned_update ON public.orders
      FOR UPDATE TO authenticated
      USING (
        order_type = 'delivery'
        AND driver_id = public.current_staff_driver_id()
      )
      WITH CHECK (
        order_type = 'delivery'
        AND driver_id = public.current_staff_driver_id()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_driver_update_restrictive'
  ) THEN
    CREATE POLICY orders_driver_update_restrictive ON public.orders
      AS RESTRICTIVE
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
          AND driver_id = public.current_staff_driver_id()
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
          AND driver_id = public.current_staff_driver_id()
        )
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_delivery_order(p_order_id TEXT)
RETURNS BOOLEAN
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  mapped_driver_id UUID;
BEGIN
  mapped_driver_id := public.current_staff_driver_id();

  IF mapped_driver_id IS NULL THEN
    RAISE EXCEPTION 'An active rider account linked to an active driver record is required';
  END IF;

  UPDATE public.orders
  SET driver_id = mapped_driver_id,
      status = 'out_for_delivery'
  WHERE id::TEXT = p_order_id
    AND order_type = 'delivery'
    AND status = 'ready'
    AND driver_id IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_delivery_order(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_delivery_order(TEXT) TO authenticated;
