-- ============================================================================
-- UniEats: Direct rider workflow for student delivery orders
-- ============================================================================
-- Apply only after reviewing the live schema and the already-applied checkout
-- RLS migration. This migration changes no order data and leaves all existing
-- order, WhatsApp, and workflow trigger objects installed.
--
-- Delivery lifecycle: pending (unassigned) -> confirmed (claimed) -> delivered.
-- Pickup orders and canteen-owner pickup workflow are unchanged.
-- ============================================================================
BEGIN;

DO $preflight$
DECLARE
  v_missing_columns TEXT;
  v_claim RECORD;
  v_workflow RECORD;
  v_claim_search_path_ok BOOLEAN;
  v_claim_owner_access_ok BOOLEAN;
  v_workflow_search_path_ok BOOLEAN;
  v_role_function_ok BOOLEAN;
  v_driver_function_ok BOOLEAN;
  v_canteen_function_ok BOOLEAN;
BEGIN
  IF to_regclass('public.orders') IS NULL
    OR to_regclass('public.order_items') IS NULL
    OR to_regclass('public.canteens') IS NULL
    OR to_regclass('public.staff_profiles') IS NULL
    OR to_regclass('public.driver') IS NULL
    OR to_regclass('public.whatsapp_order_notification_queue') IS NULL
  THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: a required orders, portal, driver, or WhatsApp queue table is missing.';
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO v_missing_columns
  FROM (VALUES
    ('orders', 'id'),
    ('orders', 'order_type'),
    ('orders', 'status'),
    ('orders', 'canteen_id'),
    ('orders', 'driver_id'),
    ('orders', 'driver_accepted_at'),
    ('orders', 'confirmed_at'),
    ('orders', 'preparing_at'),
    ('orders', 'ready_at'),
    ('orders', 'out_for_delivery_at'),
    ('orders', 'delivered_at'),
    ('orders', 'updated_at'),
    ('order_items', 'order_id'),
    ('canteens', 'id'),
    ('staff_profiles', 'id'),
    ('staff_profiles', 'role'),
    ('staff_profiles', 'active'),
    ('staff_profiles', 'canteen_id'),
    ('staff_profiles', 'driver_id'),
    ('driver', 'id'),
    ('driver', 'status')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = required.table_name
      AND actual.column_name = required.column_name
  );

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: required columns are missing: %.',
      v_missing_columns;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name IN ('orders', 'canteens', 'staff_profiles', 'driver')
          AND column_name IN ('id', 'canteen_id', 'driver_id')
          AND udt_name <> 'uuid')
        OR (table_name = 'staff_profiles'
          AND column_name = 'canteen_id'
          AND udt_name <> 'uuid')
        OR (table_name = 'order_items'
          AND column_name = 'order_id'
          AND udt_name <> 'uuid')
        OR (table_name IN ('orders', 'staff_profiles', 'driver')
          AND column_name IN ('order_type', 'status', 'role')
          AND udt_name <> 'text')
        OR (table_name = 'staff_profiles'
          AND column_name = 'active'
          AND udt_name <> 'bool')
        OR (table_name = 'orders'
          AND column_name IN (
            'driver_accepted_at',
            'confirmed_at',
            'preparing_at',
            'ready_at',
            'out_for_delivery_at',
            'delivered_at',
            'updated_at'
          )
          AND udt_name <> 'timestamptz')
      )
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: a policy, rider mapping, or workflow column has an incompatible type.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute order_id
    JOIN pg_attribute item_order_id
      ON item_order_id.attrelid = 'public.order_items'::regclass
     AND item_order_id.attname = 'order_id'
     AND NOT item_order_id.attisdropped
    WHERE order_id.attrelid = 'public.orders'::regclass
      AND order_id.attname = 'id'
      AND NOT order_id.attisdropped
      AND order_id.atttypid = item_order_id.atttypid
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: order_items.order_id must have the same type as orders.id.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.orders'::regclass
      AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.order_items'::regclass
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: orders and order_items must retain enabled RLS.';
  END IF;

  IF to_regprocedure('public.current_staff_role()') IS NULL
    OR to_regprocedure('public.current_staff_driver_id()') IS NULL
    OR to_regprocedure('public.current_staff_canteen_id()') IS NULL
  THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: verified staff-role, active-driver, and staff-canteen helpers are required.';
  END IF;

  SELECT p.prosecdef
    AND p.prorettype = 'text'::regtype
    AND p.proconfig @> ARRAY['search_path=public']::text[]
    AND pg_get_userbyid(p.proowner) = 'postgres'
    AND lower(p.prosrc) LIKE '%id = auth.uid()%'
    AND lower(p.prosrc) LIKE '%active = true%'
  INTO v_role_function_ok
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_role()');

  SELECT p.prosecdef
    AND p.prorettype = 'uuid'::regtype
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
    AND pg_get_userbyid(p.proowner) = 'postgres'
    AND lower(p.prosrc) LIKE '%staff_profiles%'
    AND lower(p.prosrc) LIKE '%driver%'
    AND lower(p.prosrc) LIKE '%sp.id = auth.uid()%'
    AND lower(p.prosrc) LIKE '%sp.role = ''driver''%'
    AND (
      lower(p.prosrc) LIKE '%sp.active = true%'
      OR lower(p.prosrc) LIKE '%sp.active is true%'
    )
    AND lower(p.prosrc) LIKE '%d.id = sp.driver_id%'
    AND lower(p.prosrc) LIKE '%d.status = ''active''%'
  INTO v_driver_function_ok
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_driver_id()');

  SELECT p.prosecdef
    AND p.prorettype = 'uuid'::regtype
    AND p.proconfig @> ARRAY['search_path=public']::text[]
    AND pg_get_userbyid(p.proowner) = 'postgres'
    AND lower(p.prosrc) LIKE '%select canteen_id%'
    AND lower(p.prosrc) LIKE '%staff_profiles%'
    AND lower(p.prosrc) LIKE '%id = auth.uid()%'
    AND lower(p.prosrc) LIKE '%active = true%'
  INTO v_canteen_function_ok
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_canteen_id()');

  IF v_role_function_ok IS DISTINCT FROM TRUE
    OR v_driver_function_ok IS DISTINCT FROM TRUE
    OR v_canteen_function_ok IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: staff helpers do not match the verified SECURITY DEFINER role, active driver mapping, or active canteen mapping contract.';
  END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE')
    OR has_schema_privilege('authenticated', 'public', 'CREATE')
  THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: public must not be writable by anon or authenticated for SECURITY DEFINER helpers using search_path=public.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.current_staff_canteen_id()',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.current_staff_canteen_id()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: current_staff_canteen_id() must be executable by authenticated and unavailable to anon.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.current_staff_role()',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.current_staff_role()',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.current_staff_driver_id()',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.current_staff_driver_id()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: current_staff_role() and current_staff_driver_id() must be executable by authenticated and unavailable to anon.';
  END IF;

  IF NOT has_table_privilege(
    'authenticated',
    'public.orders',
    'UPDATE'
  ) OR has_table_privilege(
    'anon',
    'public.orders',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: authenticated must retain the existing RLS-scoped orders UPDATE privilege, unavailable to anon.';
  END IF;

  SELECT
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proowner AS owner_oid,
    pg_get_function_result(p.oid) AS result_definition,
    p.proconfig AS function_config
  INTO v_claim
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.claim_delivery_order(uuid)');

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: claim_delivery_order(uuid) is missing.';
  END IF;

  IF NOT v_claim.prosecdef
    OR v_claim.owner_name IS DISTINCT FROM 'postgres'
    OR v_claim.result_definition IS DISTINCT FROM
      'TABLE(order_id uuid, order_status text, accepted_at timestamp with time zone)'
  THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: claim_delivery_order(uuid) must remain SECURITY DEFINER, postgres-owned, and preserve its TABLE result signature.';
  END IF;

  SELECT
    has_table_privilege(
      v_claim.owner_oid,
      'public.orders',
      'UPDATE'
    ) AND (
      r.rolbypassrls
      OR (c.relowner = v_claim.owner_oid AND NOT c.relforcerowsecurity)
    )
  INTO v_claim_owner_access_ok
  FROM pg_class c
  JOIN pg_roles r ON r.oid = v_claim.owner_oid
  WHERE c.oid = 'public.orders'::regclass;

  IF v_claim_owner_access_ok IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: claim_delivery_order() owner must have effective UPDATE privilege and bypass orders RLS as owner without FORCE ROW LEVEL SECURITY, or have BYPASSRLS.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM unnest(coalesce(v_claim.function_config, ARRAY[]::text[])) AS config(setting)
    WHERE split_part(config.setting, '=', 1) = 'search_path'
      AND regexp_replace(
        split_part(config.setting, '=', 2),
        '[[:space:]]',
        '',
        'g'
      ) = 'public,pg_temp'
  )
  INTO v_claim_search_path_ok;

  IF NOT v_claim_search_path_ok THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: the live claim function search_path differs from the verified public, pg_temp configuration.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.claim_delivery_order(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.claim_delivery_order(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: claim_delivery_order(uuid) must be executable by authenticated and unavailable to anon.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'validate_order_workflow_update'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 2) = 2
      AND (t.tgtype & 16) = 16
      AND (t.tgtype & 1) = 1
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: enabled BEFORE UPDATE validate_order_workflow_update trigger is required.';
  END IF;

  SELECT
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig AS function_config
  INTO v_workflow
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.orders'::regclass
    AND t.tgname = 'validate_order_workflow_update'
    AND NOT t.tgisinternal;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: the order workflow trigger function is missing.';
  END IF;

  IF v_workflow.prosecdef IS DISTINCT FROM FALSE
    OR v_workflow.owner_name IS DISTINCT FROM 'postgres'
  THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: the order workflow trigger function must remain SECURITY INVOKER and postgres-owned before replacement.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM unnest(coalesce(v_workflow.function_config, ARRAY[]::text[])) AS config(setting)
    WHERE split_part(config.setting, '=', 1) = 'search_path'
      AND regexp_replace(
        split_part(config.setting, '=', 2),
        '[[:space:]]',
        '',
        'g'
      ) = 'public,pg_temp'
  )
  INTO v_workflow_search_path_ok;

  IF NOT v_workflow_search_path_ok THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: the live order workflow trigger search_path differs from the verified public, pg_temp configuration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'orders_enqueue_whatsapp_order_notification_queue'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 4) = 4
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'orders_remove_whatsapp_order_notification_queue'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 8) = 8
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: enabled WhatsApp order enqueue/remove triggers are required.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname NOT IN (
        'orders_staff_select',
        'orders_staff_update',
        'orders_admin_delete'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname NOT IN (
        'order_items_staff_select',
        'order_items_admin_delete'
      )
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: unexpected orders/order_items policies require review before changing rider visibility.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_staff_update'
      AND cmd = 'UPDATE'
      AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%admin%'
      AND qual ILIKE '%canteen_owner%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%order_type%'
      AND qual ILIKE '%delivery%'
      AND qual ILIKE '%driver_id%'
      AND qual ILIKE '%current_staff_driver_id%'
      AND with_check ILIKE '%current_staff_role%'
      AND with_check ILIKE '%admin%'
      AND with_check ILIKE '%canteen_owner%'
      AND with_check ILIKE '%current_staff_canteen_id%'
      AND with_check ILIKE '%order_type%'
      AND with_check ILIKE '%delivery%'
      AND with_check ILIKE '%driver_id%'
      AND with_check ILIKE '%current_staff_driver_id%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_admin_delete'
      AND cmd = 'DELETE'
      AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%admin%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_admin_delete'
      AND cmd = 'DELETE'
      AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%admin%'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration blocked: verified assigned-rider UPDATE and admin DELETE policy scopes must remain present.';
  END IF;
END;
$preflight$;

-- A rider can read unassigned pending deliveries and their own assigned
-- deliveries. Admin and canteen-owner visibility remains scoped as before.
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
        driver_id = public.current_staff_driver_id()
        OR (
          driver_id IS NULL
          AND status = 'pending'
          AND public.current_staff_driver_id() IS NOT NULL
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
              o.driver_id = public.current_staff_driver_id()
              OR (
                o.driver_id IS NULL
                AND o.status = 'pending'
                AND public.current_staff_driver_id() IS NOT NULL
              )
            )
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.validate_order_workflow_update()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_staff_role TEXT;
  v_driver_id UUID;
  v_status_changed BOOLEAN;
BEGIN
  v_staff_role := public.current_staff_role();
  IF v_staff_role IS NULL AND auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_driver_id := public.current_staff_driver_id();
  v_status_changed := NEW.status IS DISTINCT FROM OLD.status;

  IF v_staff_role = 'canteen_owner' THEN
    IF OLD.order_type = 'delivery' OR NEW.order_type = 'delivery' THEN
      RAISE EXCEPTION 'Delivery orders are handled by the assigned rider';
    END IF;

    IF (to_jsonb(NEW) - ARRAY[
      'status', 'confirmed_at', 'preparing_at', 'ready_at',
      'out_for_delivery_at', 'delivered_at', 'updated_at'
    ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'status', 'confirmed_at', 'preparing_at', 'ready_at',
      'out_for_delivery_at', 'delivered_at', 'updated_at'
    ]) THEN
      RAISE EXCEPTION 'Canteen staff may only update order status';
    END IF;

    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('preparing', 'cancelled'))
      OR (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Invalid canteen order status transition';
    END IF;
  ELSIF v_staff_role = 'driver' THEN
    IF v_driver_id IS NULL
      OR OLD.order_type IS DISTINCT FROM 'delivery'
      OR NEW.order_type IS DISTINCT FROM 'delivery'
    THEN
      RAISE EXCEPTION 'An active mapped rider may update delivery orders only';
    END IF;

    IF (to_jsonb(NEW) - ARRAY[
      'status', 'driver_id', 'driver_accepted_at', 'confirmed_at',
      'delivered_at', 'updated_at'
    ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
      'status', 'driver_id', 'driver_accepted_at', 'confirmed_at',
      'delivered_at', 'updated_at'
    ]) THEN
      RAISE EXCEPTION 'Riders may only claim or update delivery status';
    END IF;

    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
      IF NOT (
        OLD.status = 'pending'
        AND NEW.status = 'confirmed'
        AND OLD.driver_id IS NULL
        AND NEW.driver_id = v_driver_id
        AND OLD.driver_accepted_at IS NULL
        AND NEW.driver_accepted_at IS NOT NULL
        AND NEW.confirmed_at IS NOT DISTINCT FROM OLD.confirmed_at
        AND NEW.preparing_at IS NOT DISTINCT FROM OLD.preparing_at
        AND NEW.ready_at IS NOT DISTINCT FROM OLD.ready_at
        AND NEW.out_for_delivery_at IS NOT DISTINCT FROM OLD.out_for_delivery_at
        AND NEW.delivered_at IS NOT DISTINCT FROM OLD.delivered_at
        AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
      ) THEN
        RAISE EXCEPTION 'Riders may only atomically claim an unassigned pending delivery';
      END IF;
    ELSE
      IF OLD.driver_id IS DISTINCT FROM v_driver_id
        OR NOT (
          (OLD.status = 'confirmed' AND NEW.status = 'delivered')
          OR (OLD.status = 'ready' AND NEW.status = 'delivered')
          OR (OLD.status = 'out_for_delivery' AND NEW.status = 'delivered')
        )
      THEN
        RAISE EXCEPTION 'Only the assigned rider may complete a confirmed delivery';
      END IF;

      IF NEW.driver_accepted_at IS DISTINCT FROM OLD.driver_accepted_at
        OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
        OR NEW.preparing_at IS DISTINCT FROM OLD.preparing_at
        OR NEW.ready_at IS DISTINCT FROM OLD.ready_at
        OR NEW.out_for_delivery_at IS DISTINCT FROM OLD.out_for_delivery_at
        OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
        OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
      THEN
        RAISE EXCEPTION 'Rider timestamps are managed by the database workflow';
      END IF;
    END IF;
  ELSIF v_staff_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only authorized staff may update orders';
  END IF;

  IF v_staff_role IN ('canteen_owner', 'driver') AND NOT v_status_changed THEN
    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
      OR NEW.preparing_at IS DISTINCT FROM OLD.preparing_at
      OR NEW.ready_at IS DISTINCT FROM OLD.ready_at
      OR NEW.out_for_delivery_at IS DISTINCT FROM OLD.out_for_delivery_at
      OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
    THEN
      RAISE EXCEPTION 'Order timestamps may only be set by a valid status transition';
    END IF;
  ELSIF v_status_changed THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_delivery_order(p_order_id UUID)
RETURNS TABLE(order_id UUID, order_status TEXT, accepted_at TIMESTAMPTZ)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_driver_id UUID;
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated'
    OR public.current_staff_role() IS DISTINCT FROM 'driver'
  THEN
    RAISE EXCEPTION 'An authenticated active rider is required'
      USING ERRCODE = '42501';
  END IF;

  v_driver_id := public.current_staff_driver_id();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'An active rider account linked to an active driver record is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.orders AS o
  SET driver_id = v_driver_id,
      status = 'confirmed',
      driver_accepted_at = statement_timestamp()
  WHERE o.id = p_order_id
    AND o.order_type = 'delivery'
    AND o.status = 'pending'
    AND o.driver_id IS NULL
    AND o.driver_accepted_at IS NULL
  RETURNING o.id, o.status, o.driver_accepted_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_delivery_order(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_delivery_order(UUID)
  TO authenticated;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.claim_delivery_order(uuid)')
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.proconfig @> ARRAY[
        'search_path=pg_catalog, public, pg_temp'
      ]::text[]
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration failed postflight: claim_delivery_order(uuid) must remain postgres-owned SECURITY DEFINER with the hardened search_path.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.validate_order_workflow_update()')
      AND NOT p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND p.proconfig @> ARRAY[
        'search_path=pg_catalog, public, pg_temp'
      ]::text[]
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration failed postflight: validate_order_workflow_update() must remain postgres-owned SECURITY INVOKER with the hardened search_path.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.claim_delivery_order(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.claim_delivery_order(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration failed postflight: claim RPC must be authenticated-only.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_staff_select'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles)
      AND NOT ('anon' = ANY(roles))
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%admin%'
      AND qual ILIKE '%canteen_owner%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%order_type%'
      AND qual ILIKE '%delivery%'
      AND qual ILIKE '%driver_id IS NULL%'
      AND qual ILIKE '%status = ''pending''%'
      AND qual ILIKE '%current_staff_driver_id() IS NOT NULL%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_staff_select'
      AND cmd = 'SELECT'
      AND 'authenticated' = ANY(roles)
      AND NOT ('anon' = ANY(roles))
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%admin%'
      AND qual ILIKE '%canteen_owner%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%order_type%'
      AND qual ILIKE '%delivery%'
      AND qual ILIKE '%o.driver_id IS NULL%'
      AND qual ILIKE '%o.status = ''pending''%'
      AND qual ILIKE '%current_staff_driver_id() IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration failed postflight: staff SELECT policies must preserve admin/canteen scope and expose only mapped pending delivery orders to riders.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_staff_update'
      AND cmd = 'UPDATE'
      AND 'authenticated' = ANY(roles)
      AND qual ILIKE '%admin%'
      AND qual ILIKE '%canteen_owner%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%current_staff_driver_id%'
      AND with_check ILIKE '%current_staff_driver_id%'
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration failed postflight: the existing RLS-scoped orders UPDATE policy must remain intact.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'validate_order_workflow_update'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 2) = 2
      AND (t.tgtype & 16) = 16
      AND (t.tgtype & 1) = 1
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'orders_enqueue_whatsapp_order_notification_queue'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 4) = 4
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'orders_remove_whatsapp_order_notification_queue'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 8) = 8
  ) THEN
    RAISE EXCEPTION
      'Rider workflow migration failed postflight: the workflow and WhatsApp triggers must remain enabled and attached.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc p
    WHERE p.oid IN (
      to_regprocedure('public.current_staff_role()'),
      to_regprocedure('public.current_staff_driver_id()'),
      to_regprocedure('public.current_staff_canteen_id()')
    )
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND (
        (p.proname = 'current_staff_role'
          AND p.proconfig @> ARRAY['search_path=public']::text[])
        OR (p.proname = 'current_staff_driver_id'
          AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[])
        OR (p.proname = 'current_staff_canteen_id'
          AND p.proconfig @> ARRAY['search_path=public']::text[])
      )
  ) <> 3
    OR NOT has_function_privilege(
      'authenticated', 'public.current_staff_role()', 'EXECUTE'
    )
    OR has_function_privilege(
      'anon', 'public.current_staff_role()', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated', 'public.current_staff_driver_id()', 'EXECUTE'
    )
    OR has_function_privilege(
      'anon', 'public.current_staff_driver_id()', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated', 'public.current_staff_canteen_id()', 'EXECUTE'
    )
    OR has_function_privilege(
      'anon', 'public.current_staff_canteen_id()', 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION
      'Rider workflow migration failed postflight: staff helper ownership, SECURITY DEFINER settings, search_path, or grants changed unexpectedly.';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;
