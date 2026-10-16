-- Read-only diagnostics only. Run against staging before designing/applying a
-- migration. No statement here changes data or privileges. Do not paste
-- customer PII or secrets when returning results.

-- 1. Confirm known application table columns and types.
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_items', 'driver', 'staff_profiles', 'canteens')
ORDER BY table_name, ordinal_position;

-- 2. Discover candidate catalog relations without assuming their names.
-- Return the complete rows for any relation that could be the source of
-- checkout item identity, price, availability, or canteen ownership.
SELECT
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  a.attnum AS column_position,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS column_type,
  a.attnotnull AS not_null
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND (
    c.relname ~* '(menu|item|product|catalog)'
    OR a.attname ~* '(menu|item|product|price|canteen|available|active)'
  )
ORDER BY c.relname, a.attnum;

-- 3. Show definitions for candidate public views/materialized views. They
-- may reveal whether a view is backed by a trusted price source.
SELECT
  c.relname AS view_name,
  pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
  AND c.relname ~* '(menu|item|product|catalog)'
ORDER BY c.relname;

-- 4. Confirm foreign-key targets for rider mapping and order-item ownership.
SELECT
  c.conrelid::regclass AS source_table,
  c.conname AS constraint_name,
  c.confrelid::regclass AS target_table,
  pg_get_constraintdef(c.oid, true) AS definition
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.conrelid IN (
    'public.orders'::regclass,
    'public.order_items'::regclass,
    'public.staff_profiles'::regclass
  )
ORDER BY source_table::text, c.conname;

-- 5. Show complete policy expressions and roles for the protected tables.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'staff_profiles', 'canteens')
ORDER BY tablename, policyname;

-- 6. Show every orders trigger, its enabled state, timing/definition, and
-- function body. Compare WhatsApp trigger names and definitions with the
-- pre-migration output to ensure they remain unchanged.
SELECT
  t.tgname AS trigger_name,
  CASE t.tgenabled
    WHEN 'O' THEN 'enabled'
    WHEN 'D' THEN 'disabled'
    WHEN 'R' THEN 'replica'
    WHEN 'A' THEN 'always'
  END AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS trigger_definition,
  p.oid::regprocedure AS function_signature,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.orders'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 7. Confirm the existing rider maps to the existing active driver and
-- summarize pre-existing assigned orders without changing any assignments.
SELECT
  sp.id AS staff_auth_id,
  sp.email,
  sp.role,
  sp.active AS staff_active,
  sp.driver_id,
  d.status::text AS driver_status,
  d.id = '2d5db34a-4e2b-4dd2-b001-9edc07c14a57'::uuid AS expected_driver_id,
  sp.driver_id = d.id AS mapping_matches
FROM public.staff_profiles sp
LEFT JOIN public.driver d ON d.id = sp.driver_id
WHERE sp.id = 'f057abd4-a7d5-4396-bf75-a14940a755af'::uuid;

SELECT driver_id, order_type, status, count(*) AS existing_order_count
FROM public.orders
WHERE driver_id IS NOT NULL
GROUP BY driver_id, order_type, status
ORDER BY driver_id, order_type, status;

-- 8. Inspect existing effective privileges. Do not infer full table access
-- from has_table_privilege alone; inspect column privileges below too.
SELECT
  has_table_privilege('anon', 'public.orders', 'SELECT') AS anon_orders_select,
  has_table_privilege('anon', 'public.order_items', 'SELECT') AS anon_items_select,
  has_table_privilege('anon', 'public.orders', 'INSERT') AS anon_orders_insert,
  has_table_privilege('anon', 'public.order_items', 'INSERT') AS anon_items_insert,
  COALESCE((
    SELECT has_function_privilege('anon', p.oid, 'EXECUTE')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_public_checkout_orders'
      AND pg_get_function_identity_arguments(p.oid) = 'p_customer jsonb, p_groups jsonb'
    LIMIT 1
  ), false) AS anon_checkout_rpc_execute,
  COALESCE((
    SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'claim_delivery_order'
      AND p.pronargs = 1
      AND p.proargtypes[0] = 'text'::regtype
    LIMIT 1
  ), false) AS authenticated_claim_rpc_execute;

SELECT
  has_column_privilege('anon', 'public.canteens', 'id', 'SELECT') AS anon_canteen_id_select,
  has_column_privilege('anon', 'public.canteens', 'name', 'SELECT') AS anon_canteen_name_select,
  has_table_privilege('anon', 'public.canteens', 'SELECT') AS anon_canteens_table_select;

SELECT
  grantee,
  table_name,
  privilege_type,
  column_name
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name IN ('canteens', 'orders', 'order_items', 'staff_profiles')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY table_name, grantee, column_name, privilege_type;

-- 9. Staging-only behavioral test plan. Use the actual Supabase clients and
-- disposable staging records, not a privileged SQL Editor connection.
--
-- Successful checkout:
--   A. Select one currently available catalog item and known canteen in
--      staging. Submit a normal single-canteen and then multi-canteen cart.
--   B. Confirm one order per canteen group, server-derived unit price and
--      totals, matching order_items, a pending status, and a usable tracking
--      reference. Confirm generated order IDs are returned only to caller.
--
-- Manipulated checkout:
--   C. Change browser-supplied price, subtotal, total, delivery fee, discount,
--      canteen ID, item name, availability, item ID, and quantity. The
--      server must ignore/reject derived fields, reload catalog values using
--      verified IDs, enforce item/canteen association and availability, and
--      reject invalid, fractional, zero, or excessive quantities. Verify no
--      order/item row is created for rejected payloads.
--
-- Failed partial checkout:
--   D. Submit a multi-canteen payload with a valid first group and an invalid
--      or deliberately failing later group. Confirm the entire database
--      transaction rolls back: no order, item, or order-created notification
--      remains for any group.
--
-- Concurrent rider claims:
--   E. Prepare one ready, unassigned delivery. Call claim concurrently from
--      two different mapped rider sessions. Exactly one call may return true;
--      the other must return false, and the row must reference only the
--      winner's mapped public.driver.id.
--
-- Status transitions:
--   F. Assigned rider: ready -> out_for_delivery -> delivered succeeds and
--      first-transition timestamps are set server-side.
--   G. Reject ready -> delivered, unassigned direct update, pickup update,
--      another rider's order, arbitrary driver_id assignment, order detail
--      or payment edits, and timestamp edits. Verify status/timestamps stay
--      unchanged after each rejected operation.
--
-- WhatsApp:
--   H. Complete checkout and valid status transitions. Confirm the existing
--      order-created/status triggers remain installed and enabled, each
--      expected notification is queued once, and the staging dispatcher
--      delivers it. Do not change trigger definitions to make this test pass.
--
-- RLS and role matrix:
--   I. Anonymous can read only approved public canteen/menu fields and cannot
--      read orders/items or directly insert either table.
--   J. Admin can retain intended order/item management; a canteen owner is
--      restricted to their canteen; a rider sees only ready unassigned
--      delivery orders and their mapped driver's delivery orders/items.
--
-- Do not execute write tests against production.
