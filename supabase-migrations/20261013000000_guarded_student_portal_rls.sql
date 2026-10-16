-- Reviewed RLS baseline for student checkout and staff portals.
--
-- Apply only after the rider identity mapping, claim RPC, and order workflow
-- trigger have been separately reviewed and verified in staging. This
-- migration refuses unexpected policy/helper/schema state instead of guessing.
BEGIN;

DO $$
DECLARE
  v_role_source TEXT;
  v_canteen_source TEXT;
  v_driver_source TEXT;
  v_role_normalized TEXT;
  v_canteen_normalized TEXT;
  v_driver_normalized TEXT;
  v_claim_source TEXT;
  v_claim_normalized TEXT;
  v_workflow_source TEXT;
BEGIN
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
      'Portal RLS migration blocked: anon or authenticated inherits a superuser/BYPASSRLS role. Remove that membership before enabling portal RLS.';
  END IF;

  IF to_regclass('public.orders') IS NULL
    OR to_regclass('public.order_items') IS NULL
    OR to_regclass('public.menu_items') IS NULL
    OR to_regclass('public.staff_profiles') IS NULL
    OR to_regclass('public.driver') IS NULL
  THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: expected orders, order_items, menu_items, staff_profiles, and driver tables.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'driver_id'
      AND udt_name = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name IN ('order_type', 'status', 'canteen_id')
    GROUP BY table_name
    HAVING count(*) = 3
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_profiles'
      AND column_name IN ('id', 'role', 'active', 'canteen_id', 'driver_id')
    GROUP BY table_name
    HAVING count(*) = 5
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name = 'canteen_id'
  )
  THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: required portal columns are missing or have unexpected types.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.orders'::regclass
      AND c.confrelid = 'public.driver'::regclass
      AND cardinality(c.conkey) = 1
      AND c.conkey[1] = (
        SELECT a.attnum
        FROM pg_attribute a
        WHERE a.attrelid = 'public.orders'::regclass
          AND a.attname = 'driver_id'
          AND NOT a.attisdropped
      )
      AND c.confkey[1] = (
        SELECT a.attnum
        FROM pg_attribute a
        WHERE a.attrelid = 'public.driver'::regclass
          AND a.attname = 'id'
          AND NOT a.attisdropped
      )
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.staff_profiles'::regclass
      AND c.confrelid = 'public.driver'::regclass
      AND cardinality(c.conkey) = 1
      AND c.conkey[1] = (
        SELECT a.attnum
        FROM pg_attribute a
        WHERE a.attrelid = 'public.staff_profiles'::regclass
          AND a.attname = 'driver_id'
          AND NOT a.attisdropped
      )
      AND c.confkey[1] = (
        SELECT a.attnum
        FROM pg_attribute a
        WHERE a.attrelid = 'public.driver'::regclass
          AND a.attname = 'id'
          AND NOT a.attisdropped
      )
  )
  THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: orders.driver_id and staff_profiles.driver_id must both reference public.driver(id). Verify deployed rider identity mapping.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff_profiles sp
    LEFT JOIN public.driver d ON d.id = sp.driver_id
    WHERE sp.active IS TRUE
      AND sp.role = 'driver'
      AND (
        sp.driver_id IS NULL
        OR d.id IS NULL
        OR d.status::text <> 'active'
      )
  ) THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: an active rider profile is not linked to an active driver row. Repair and verify the mapping before enabling RLS.';
  END IF;

  SELECT p.prosrc INTO v_role_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_role()')
    AND p.prorettype = 'text'::regtype
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public']::text[];

  SELECT p.prosrc INTO v_canteen_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_canteen_id()')
    AND p.prorettype = 'uuid'::regtype
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public']::text[];

  SELECT p.prosrc INTO v_driver_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.current_staff_driver_id()')
    AND p.prorettype = 'uuid'::regtype
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[];

  v_role_normalized := regexp_replace(
    lower(v_role_source),
    '[[:space:]]+',
    '',
    'g'
  );
  v_canteen_normalized := regexp_replace(
    lower(v_canteen_source),
    '[[:space:]]+',
    '',
    'g'
  );
  v_driver_normalized := regexp_replace(
    lower(v_driver_source),
    '[[:space:]]+',
    '',
    'g'
  );

  IF v_role_source IS NULL
    OR v_role_normalized <> 'selectrolefrompublic.staff_profileswhereid=auth.uid()andactive=truelimit1'
    OR v_canteen_source IS NULL
    OR v_canteen_normalized <> 'selectcanteen_idfrompublic.staff_profileswhereid=auth.uid()andactive=truelimit1'
    OR v_driver_source IS NULL
    OR v_driver_normalized <> 'selectsp.driver_idfrompublic.staff_profilesspjoinpublic.driverdond.id=sp.driver_idwheresp.id=auth.uid()andsp.role=''driver''andsp.active=trueandd.status=''active''limit1'
  THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: staff role/canteen/driver helper definitions differ from the exact reviewed SECURITY DEFINER definitions.';
  END IF;

  SELECT p.prosrc INTO v_claim_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.claim_delivery_order(text)')
    AND p.prorettype = 'boolean'::regtype
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=pg_catalog, public']::text[];

  v_claim_normalized := regexp_replace(
    lower(v_claim_source),
    '[[:space:]]+',
    '',
    'g'
  );

  IF v_claim_source IS NULL
    OR strpos(v_claim_normalized, 'updatepublic.orderssetdriver_id=mapped_driver_id,status=''out_for_delivery''whereid::text=p_order_idandorder_type=''delivery''andstatus=''ready''anddriver_idisnull;returnfound;') = 0
    OR has_function_privilege('anon', 'public.claim_delivery_order(text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.claim_delivery_order(text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: claim_delivery_order(text) is missing or does not enforce the verified atomic ready/unassigned/mapped-driver claim contract.';
  END IF;

  SELECT p.prosrc INTO v_workflow_source
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.orders'::regclass
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D'
    AND t.tgname = 'validate_order_workflow_update'
    AND (t.tgtype & 1) = 1
    AND (t.tgtype & 2) = 2
    AND (t.tgtype & 16) = 16;

  IF v_workflow_source IS NULL
    OR lower(v_workflow_source) NOT LIKE '%current_staff_role%'
    OR lower(v_workflow_source) NOT LIKE '%current_staff_driver_id%'
    OR lower(v_workflow_source) NOT LIKE '%out_for_delivery%'
    OR lower(v_workflow_source) NOT LIKE '%delivered%'
  THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: the enabled BEFORE UPDATE validate_order_workflow_update trigger must be reviewed for mapped-rider authorization and workflow transitions.';
  END IF;

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
      'Portal RLS migration blocked: unexpected policies exist on orders, order_items, or menu_items. Review every policy expression before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('orders', 'order_items', 'menu_items')
      AND (
        'anon' = ANY(roles)
        OR 'public' = ANY(roles)
      )
      AND policyname NOT IN ('orders_checkout_insert', 'order_items_checkout_insert')
  ) THEN
    RAISE EXCEPTION
      'Portal RLS migration blocked: an unreviewed anon/PUBLIC policy exists on a protected table.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS orders_staff_select ON public.orders;
DROP POLICY IF EXISTS orders_staff_update ON public.orders;
DROP POLICY IF EXISTS orders_admin_delete ON public.orders;
DROP POLICY IF EXISTS orders_checkout_insert ON public.orders;
DROP POLICY IF EXISTS orders_driver_select_restrictive ON public.orders;
DROP POLICY IF EXISTS orders_driver_assigned_select ON public.orders;
DROP POLICY IF EXISTS orders_driver_unassigned_select ON public.orders;
DROP POLICY IF EXISTS orders_driver_assigned_update ON public.orders;
DROP POLICY IF EXISTS orders_driver_update_restrictive ON public.orders;

DROP POLICY IF EXISTS order_items_staff_select ON public.order_items;
DROP POLICY IF EXISTS order_items_admin_delete ON public.order_items;
DROP POLICY IF EXISTS order_items_checkout_insert ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_select_restrictive ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_assigned_select ON public.order_items;
DROP POLICY IF EXISTS order_items_driver_unassigned_select ON public.order_items;

DROP POLICY IF EXISTS menu_items_public_read ON public.menu_items;
DROP POLICY IF EXISTS menu_items_staff_manage ON public.menu_items;

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

CREATE POLICY orders_admin_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'admin');

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

CREATE POLICY order_items_admin_delete ON public.order_items
  FOR DELETE TO authenticated
  USING (public.current_staff_role() = 'admin');

CREATE POLICY menu_items_public_read ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (true);

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

DO $$
DECLARE
  v_grant RECORD;
  v_grantee TEXT;
BEGIN
  REVOKE ALL ON TABLE public.orders, public.order_items, public.menu_items
    FROM PUBLIC, anon, authenticated;

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
      v_grant.column_name,
      v_grant.table_name,
      v_grantee
    );
  END LOOP;

  REVOKE ALL ON FUNCTION public.current_staff_role() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.current_staff_canteen_id() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.current_staff_driver_id() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.current_staff_canteen_id() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.current_staff_driver_id() TO authenticated;

  GRANT SELECT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
  GRANT SELECT, DELETE ON TABLE public.order_items TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;
  GRANT SELECT ON TABLE public.menu_items TO anon;

  ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
