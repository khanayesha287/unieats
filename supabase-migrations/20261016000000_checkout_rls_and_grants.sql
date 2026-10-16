-- ============================================================================
-- UniEats: Reviewed least-privilege RLS + grants for checkout-sensitive tables
-- ============================================================================
-- SCOPE (deliberately separate from the checkout RPC migration)
-- This is the SECURITY half of the checkout fix. It must be applied and
-- verified AFTER 20261015010000_student_checkout_rpc.sql so that the
-- student checkout RPC already exists as the narrowly controlled write path.
--
-- DESIGN PRINCIPLES
--   * FAIL-CLOSED. Every statement is guarded by a preflight that inspects the
--     live catalog. If any required helper function, foreign key, trigger,
--     claim RPC, or expected object is missing or unexpected, the whole
--     transaction aborts and NOTHING changes. We never guess.
--   * LEAST PRIVILEGE. Anonymous users keep ONLY the public menu read they need
--     to browse. Students have NO direct INSERT/UPDATE/DELETE on orders or
--     order_items — the service-role create_student_checkout RPC is the single
--     student order-write path. Admin, canteen-owner, and rider access are
--     preserved and scoped exactly as the reviewed portal policies define them.
--   * PRESERVE. This migration does NOT create, drop, disable, or duplicate:
--       - public.claim_delivery_order(uuid)   (live rider claim RPC — signature
--         is uuid per production findings; we only verify it, never redefine it)
--       - validate_order_workflow_update()    (order workflow trigger)
--       - the WhatsApp order notification enqueue triggers and their queue
--     and it does not touch the WhatsApp retry flow.
--
-- PREREQUISITES (verified by preflight; do not weaken these checks)
--   * orders, order_items, menu_items, canteens, staff_profiles, driver exist
--     with the columns the policies reference.
--   * public.current_staff_role(), public.current_staff_canteen_id() exist and
--     are SECURITY DEFINER (installed by harden-staff-canteen-rls.sql).
--   * A public.claim_delivery_order(uuid) SECURITY DEFINER function exists and
--     is executable by authenticated but NOT anon.
--   * An enabled BEFORE UPDATE row trigger validate_order_workflow_update exists
--     on public.orders.
--   * The WhatsApp AFTER INSERT enqueue trigger and its queue table exist.
--   * Neither anon nor authenticated inherits a superuser/BYPASSRLS role.
--
-- If any prerequisite is unmet, run UNIEATS_CHECKOUT_FIX_DIAGNOSTICS.sql and the
-- existing UNIEATS_READ_ONLY_DIAGNOSTICS.md against staging to reconcile state
-- BEFORE retrying. Do not bypass the guards.
-- ============================================================================
BEGIN;
-- ---------------------------------------------------------------------------
-- PREFLIGHT (fail-closed). Abort the entire transaction if the live state does
-- not match the reviewed contract. No data, policy, or grant is changed unless
-- every check below passes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_problem TEXT;
  v_role_source TEXT;
  v_canteen_source TEXT;
  v_driver_source TEXT;
  v_claim RECORD;
  v_claim_problems TEXT[] := ARRAY[]::TEXT[];
  v_claim_search_path_ok BOOLEAN;
BEGIN
  -- (a) No privileged-role inheritance for anon/authenticated.
  IF EXISTS (
    SELECT 1
    FROM pg_roles privileged_role
    WHERE (privileged_role.rolsuper OR privileged_role.rolbypassrls)
      AND (
        pg_has_role('anon', privileged_role.oid, 'MEMBER')
        OR pg_has_role('authenticated', privileged_role.oid, 'MEMBER')
      )
  ) THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: anon or authenticated inherits a superuser/BYPASSRLS role. Remove that membership before applying.';
  END IF;

  -- (b) Required tables and the exact columns the policies reference.
  IF to_regclass('public.orders') IS NULL
    OR to_regclass('public.order_items') IS NULL
    OR to_regclass('public.menu_items') IS NULL
    OR to_regclass('public.canteens') IS NULL
    OR to_regclass('public.staff_profiles') IS NULL
    OR to_regclass('public.driver') IS NULL
  THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: expected orders, order_items, menu_items, canteens, staff_profiles, and driver tables.';
  END IF;

  SELECT string_agg(tbl || '.' || col, E'\n') INTO v_problem
  FROM (
    SELECT 'orders' AS tbl, unnest(ARRAY[
      'id','order_type','status','canteen_id','driver_id','tracking_token_hash'
    ]) AS col
    UNION ALL
    SELECT 'staff_profiles', unnest(ARRAY['id','role','active','canteen_id'])
    UNION ALL
    SELECT 'menu_items', unnest(ARRAY['id','canteen_id','available'])
    UNION ALL
    SELECT 'driver', unnest(ARRAY['id','status'])
  ) req
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name=req.tbl AND c.column_name=req.col
  );
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: required columns are missing:% %', E'\n', v_problem;
  END IF;

  -- (c) Helper functions must exist and be SECURITY DEFINER. The rider policies
  --     below rely on the reviewed staff->driver mapping, so current_staff_driver_id()
  --     is REQUIRED here (fail-closed). If it is absent, the driver mapping has
  --     not been established/verified on this database yet — run the read-only
  --     diagnostics and establish the mapping BEFORE retrying. Do not guess it.
  SELECT p.prosrc INTO v_role_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_role()')
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public']::text[];
  SELECT p.prosrc INTO v_canteen_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_canteen_id()')
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public']::text[];
  SELECT p.prosrc INTO v_driver_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_driver_id()')
    AND p.prorettype = 'uuid'::regtype
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[];
  IF v_role_source IS NULL
    OR v_canteen_source IS NULL
    OR v_driver_source IS NULL
    OR lower(v_role_source) NOT LIKE '%staff_profiles%'
    OR lower(v_canteen_source) NOT LIKE '%staff_profiles%'
    OR lower(v_driver_source) NOT LIKE '%staff_profiles%'
    OR lower(v_driver_source) NOT LIKE '%driver%'
  THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: current_staff_role()/current_staff_canteen_id()/current_staff_driver_id() are missing, not SECURITY DEFINER, or do not resolve the reviewed staff->driver mapping. Establish and verify the mapping on staging first (see UNIEATS_CHECKOUT_FIX_DIAGNOSTICS.sql).';
  END IF;

  -- (d) The LIVE rider claim RPC is claim_delivery_order(uuid). We only VERIFY
  --     it; we never redefine or change its signature.
  SELECT
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    pg_get_function_result(p.oid) AS result_definition,
    p.proconfig AS function_config,
    lower(p.prosrc) AS function_source
  INTO v_claim
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.claim_delivery_order(uuid)');

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: public.claim_delivery_order(uuid) is missing.';
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

  IF NOT v_claim.prosecdef THEN
    v_claim_problems := array_append(v_claim_problems, 'SECURITY DEFINER is not enabled');
  END IF;
  IF v_claim.owner_name IS DISTINCT FROM 'postgres' THEN
    v_claim_problems := array_append(v_claim_problems, 'owner is not postgres');
  END IF;
  IF v_claim.result_definition IS DISTINCT FROM
    'TABLE(order_id uuid, order_status text, accepted_at timestamp with time zone)'
  THEN
    v_claim_problems := array_append(
      v_claim_problems,
      'return columns or types do not match the required TABLE result'
    );
  END IF;
  IF NOT v_claim_search_path_ok THEN
    v_claim_problems := array_append(
      v_claim_problems,
      'search_path is not exactly public, pg_temp'
    );
  END IF;
  IF position('status' IN v_claim.function_source) = 0
    OR position('ready' IN v_claim.function_source) = 0
  THEN
    v_claim_problems := array_append(
      v_claim_problems,
      'claim body does not contain the verified ready-status check'
    );
  END IF;
  IF position('driver_id' IN v_claim.function_source) = 0 THEN
    v_claim_problems := array_append(
      v_claim_problems,
      'claim body does not assign/check driver_id'
    );
  END IF;
  IF position('driver_accepted_at' IN v_claim.function_source) = 0 THEN
    v_claim_problems := array_append(
      v_claim_problems,
      'claim body does not set driver_accepted_at'
    );
  END IF;

  IF cardinality(v_claim_problems) > 0 THEN
    RAISE EXCEPTION 'Checkout RLS migration blocked: claim_delivery_order(uuid) preflight failed: %',
      array_to_string(v_claim_problems, '; ');
  END IF;

  -- (e) The order workflow validation trigger must be present and enabled.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'validate_order_workflow_update'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O','A')
      AND p.proname = 'validate_order_workflow_update'
      AND (t.tgtype & 2) = 2   -- BEFORE
      AND (t.tgtype & 16) = 16 -- UPDATE
  ) THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: expected an enabled BEFORE UPDATE validate_order_workflow_update trigger on public.orders.';
  END IF;

  -- (f) The WhatsApp AFTER INSERT enqueue trigger + queue table must exist.
  IF to_regclass('public.whatsapp_order_notification_queue') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = 'public.orders'::regclass
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
        AND (t.tgtype & 4) = 4      -- AFTER
        AND (t.tgtype & 1) = 1      -- INSERT
        AND lower(p.prosrc) LIKE '%whatsapp_order_notification_queue%'
    )
  THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: expected the enabled AFTER INSERT WhatsApp enqueue trigger and its whatsapp_order_notification_queue table.';
  END IF;

  -- Enabling RLS while leaving an unknown permissive policy in place could
  -- broaden access because permissive policies are ORed together.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname NOT IN (
        'orders_staff_select',
        'orders_staff_update',
        'orders_admin_delete',
        'orders_checkout_insert',
        'orders_driver_select_restrictive',
        'orders_driver_assigned_select',
        'orders_driver_unassigned_select',
        'orders_driver_assigned_update',
        'orders_driver_update_restrictive'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname NOT IN (
        'order_items_staff_select',
        'order_items_admin_delete',
        'order_items_checkout_insert',
        'order_items_driver_select_restrictive',
        'order_items_driver_assigned_select',
        'order_items_driver_unassigned_select'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'menu_items'
      AND policyname NOT IN (
        'menu_items_public_read',
        'menu_items_staff_manage'
      )
  ) THEN
    RAISE EXCEPTION
      'Checkout RLS migration blocked: unexpected policies exist on orders, order_items, or menu_items. Review every policy before retrying.';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- APPLY least-privilege policies. Idempotent (DROP IF EXISTS + CREATE). These
-- mirror the reviewed portal policies: admin full, canteen-owner scoped to
-- their canteen, rider scoped to ready/unassigned or their mapped driver. The
-- student checkout RPC is the ONLY student order-write path, so there is
-- intentionally NO anon/authenticated INSERT policy on orders or order_items.
-- ---------------------------------------------------------------------------

-- menu_items: public read for browsing; staff (admin/owner) manage their scope.
DROP POLICY IF EXISTS menu_items_public_read ON public.menu_items;
CREATE POLICY menu_items_public_read ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS menu_items_staff_manage ON public.menu_items;
CREATE POLICY menu_items_staff_manage ON public.menu_items
  FOR ALL TO authenticated
  USING (
    public.current_staff_role() = 'admin'
    OR (
      public.current_staff_role() = 'canteen_owner'
      AND canteen_id = public.current_staff_canteen_id()
    )
  )
  WITH CHECK (
    public.current_staff_role() = 'admin'
    OR (
      public.current_staff_role() = 'canteen_owner'
      AND canteen_id = public.current_staff_canteen_id()
    )
  );

-- orders: staff SELECT scoped by role; rider sees ready/unassigned or assigned.
DROP POLICY IF EXISTS orders_staff_select ON public.orders;
DROP POLICY IF EXISTS orders_driver_select_restrictive ON public.orders;
DROP POLICY IF EXISTS orders_driver_assigned_select ON public.orders;
DROP POLICY IF EXISTS orders_driver_unassigned_select ON public.orders;
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
          AND status = 'ready'
          AND public.current_staff_driver_id() IS NOT NULL
        )
      )
    )
  );

-- orders: staff UPDATE scoped by role (workflow trigger still enforces the
-- allowed status transitions server-side).
DROP POLICY IF EXISTS orders_staff_update ON public.orders;
DROP POLICY IF EXISTS orders_driver_assigned_update ON public.orders;
DROP POLICY IF EXISTS orders_driver_update_restrictive ON public.orders;
CREATE POLICY orders_staff_update ON public.orders
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

-- orders: admin-only DELETE.
DROP POLICY IF EXISTS orders_admin_delete ON public.orders;
CREATE POLICY orders_admin_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'admin');

-- order_items: staff SELECT scoped through the parent order.
DROP POLICY IF EXISTS order_items_staff_select ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_select_restrictive ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_assigned_select ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_unassigned_select ON public.order_items;
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
                AND o.status = 'ready'
                AND public.current_staff_driver_id() IS NOT NULL
              )
            )
          )
        )
    )
  );

-- order_items: admin-only DELETE.
DROP POLICY IF EXISTS order_items_admin_delete ON public.order_items;
CREATE POLICY order_items_admin_delete ON public.order_items
  FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'admin');


-- ---------------------------------------------------------------------------
-- GRANTS + RLS. Remove public/anon direct writes to the sensitive tables and
-- give each role only what its reviewed policies require. The student checkout
-- RPC (service_role, SECURITY DEFINER) remains the only student write path.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_grant RECORD;
  v_grantee TEXT;
BEGIN
  -- Table-level: clear all existing grants for API roles, then re-grant only
  -- the reviewed least privilege. This also removes non-RLS privileges such
  -- as TRUNCATE from authenticated.
  REVOKE ALL ON TABLE public.orders, public.order_items, public.menu_items
    FROM PUBLIC, anon, authenticated;

  -- Clear any lingering column-level ACLs (REVOKE at table level does not remove
  -- them), including authenticated column-level INSERT on orders/order_items.
  FOR v_grant IN
    SELECT table_name, column_name, grantee
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('orders', 'order_items', 'menu_items')
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  LOOP
    v_grantee := CASE
      WHEN v_grant.grantee = 'PUBLIC' THEN 'PUBLIC'
      ELSE quote_ident(v_grant.grantee)
    END;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %s',
      v_grant.column_name, v_grant.table_name, v_grantee
    );
  END LOOP;

  -- Helper functions: execute for authenticated only.
  REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.current_staff_canteen_id() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.current_staff_driver_id() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.current_staff_canteen_id() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.current_staff_driver_id() TO authenticated;

  -- Re-grant exactly the least-privilege table access the portals need.
  -- NOTE: no INSERT on orders/order_items for anon or authenticated — the RPC
  -- is the only student write path.
  GRANT SELECT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
  GRANT SELECT, DELETE ON TABLE public.order_items TO authenticated;
  GRANT SELECT ON TABLE public.menu_items TO anon, authenticated;
  GRANT INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;

  -- Remove the legacy anonymous checkout-insert policies so a browser client
  -- can no longer insert orders/order_items directly (bypassing server pricing).
  DROP POLICY IF EXISTS orders_checkout_insert ON public.orders;
  DROP POLICY IF EXISTS order_items_checkout_insert ON public.order_items;

  -- Enable RLS last, after policies exist, so the tables are never left with
  -- RLS on and no matching policy.
  ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
END;
$$;

-- The rider claim RPC keeps its live (uuid) signature; we only ensure it is not
-- callable by anon and remains callable by authenticated. We do NOT redefine it.
DO $$
BEGIN
  IF to_regprocedure('public.claim_delivery_order(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.claim_delivery_order(uuid) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.claim_delivery_order(uuid) TO authenticated';

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
        'Checkout RLS migration blocked: rider claim RPC must remain executable by authenticated and unavailable to anon.';
    END IF;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
