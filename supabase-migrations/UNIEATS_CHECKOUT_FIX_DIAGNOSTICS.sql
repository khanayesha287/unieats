-- ============================================================================
-- UniEats checkout fix — READ-ONLY diagnostics
-- ============================================================================
-- Run these ONE AT A TIME in the Supabase SQL Editor for the verified target
-- project, BEFORE applying 20261015004000_add_canteen_slugs.sql,
-- 20261015005000_seed_student_menu_catalogue.sql, and
-- 20261015010000_student_checkout_rpc.sql. Do NOT apply the competing
-- 20261015000000_create_student_checkout_rpc.sql. Every statement here is read-only:
-- it inspects catalogs/metadata and does not create, change, or delete data,
-- schema, policies, privileges, functions, or triggers, and does not call any
-- application function.
--
-- Do NOT paste customer PII, order contents, tokens, or credential/env values
-- when sharing results. Redact sensitive literals in any function source you
-- return, while preserving identifiers and authorization/status logic.
-- ============================================================================

-- D1. Does the checkout RPC / idempotency table already exist?
--    Use the result to decide whether the reviewed RPC migration is needed;
--    do not infer its deployment state from the application error alone.
SELECT
  to_regprocedure('public.create_student_checkout(uuid,text,text,text,text,text,text,text,text,jsonb)') AS rpc_signature,
  to_regclass('public.checkout_idempotency') AS idempotency_table;

-- D2. Confirm the exact columns the RPC + seed require. Before migration
--    20261015004000, canteens.slug may be the only missing column; that
--    migration adds it. Any other missing column blocks the later migrations.
WITH required(table_name, column_name) AS (
  VALUES
    ('menu_items','id'),('menu_items','catalogue_key'),('menu_items','canteen_id'),
    ('menu_items','name'),('menu_items','price'),('menu_items','available'),
    ('menu_items','sizes'),('menu_items','add_ons'),
    ('orders','id'),('orders','order_number'),('orders','student_name'),('orders','phone'),
    ('orders','order_type'),('orders','delivery_location'),('orders','canteen_id'),
    ('orders','status'),('orders','total_amount'),('orders','delivery_charge'),
    ('orders','special_instructions'),('orders','tracking_token_hash'),
    ('orders','payment_method'),('orders','created_at'),
    ('order_items','id'),('order_items','order_id'),('order_items','menu_item_id'),
    ('order_items','item_name'),('order_items','quantity'),('order_items','price'),
    ('order_items','subtotal'),
    ('canteens','id'),('canteens','name'),('canteens','is_open'),('canteens','slug')
)
SELECT r.table_name, r.column_name
FROM required r
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
)
ORDER BY r.table_name, r.column_name;

-- image_url is presentation-only and optional for the canonical menu seed.
-- If it exists, the seed preserves it; if absent, the seed omits that column.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'menu_items'
  AND column_name = 'image_url';

-- D3. Inspect existing canteen identities and open states before establishing
--    stable slugs. The slug migration fails closed unless each official canteen
--    name resolves to exactly one row.
SELECT id, name, is_open
FROM public.canteens
ORDER BY name, id;

-- D3b. Run only when D2 confirms canteens.slug already exists. Verify the
--    established stable slug-to-database-ID mapping before using the seed.
SELECT id, name, slug, is_open
FROM public.canteens
ORDER BY slug, name, id;

-- D4. catalogue_key integrity: duplicates (must be ZERO before the unique index)
--    and NULL count (NULLs are allowed and simply not orderable via the RPC).
SELECT
  (SELECT count(*) FROM (
     SELECT catalogue_key FROM public.menu_items
     WHERE catalogue_key IS NOT NULL GROUP BY catalogue_key HAVING count(*) > 1
   ) d) AS duplicate_catalogue_keys,
  (SELECT count(*) FROM public.menu_items WHERE catalogue_key IS NULL) AS null_catalogue_keys,
  (SELECT count(*) FROM public.menu_items) AS total_menu_rows;

-- D4b. Verify every expected canteen mapping and its menu/key counts after
--    applying the slug and catalogue seed migrations. Missing slug mappings
--    remain visible as zero mapped canteens rather than disappearing.
WITH expected(canteen_slug) AS (
  VALUES
    ('annexe'::text),
    ('bhola'::text),
    ('gssc'::text),
    ('hot-potato'::text),
    ('ssc'::text)
)
SELECT
  expected.canteen_slug,
  count(DISTINCT canteen.id) AS mapped_canteens,
  count(menu.id) AS menu_items,
  count(DISTINCT menu.catalogue_key) AS unique_catalogue_keys
FROM expected
LEFT JOIN public.canteens AS canteen
  ON canteen.slug = expected.canteen_slug
LEFT JOIN public.menu_items AS menu
  ON menu.canteen_id = canteen.id
GROUP BY expected.canteen_slug
ORDER BY expected.canteen_slug;

-- D5. Legacy rows the seed will NOT merge (NULL catalogue_key). The checkout
--    migration now NOTICEs these instead of blocking; review them to decide
--    whether to map them to a canonical key.
SELECT
  c.name AS canteen_name,
  legacy.id AS menu_items_id,
  legacy.name AS legacy_name,
  legacy.catalogue_key AS legacy_catalogue_key,
  legacy.price AS legacy_price
FROM public.menu_items legacy
JOIN public.canteens c ON c.id = legacy.canteen_id
WHERE legacy.catalogue_key IS NULL
ORDER BY c.name, legacy.name;

-- D6. Live rider claim RPC — signature + grant state. Confirm it is
--    claim_delivery_order(uuid), SECURITY DEFINER, executable by authenticated
--    and NOT by anon. We do NOT change it.
SELECT
  p.oid::regprocedure AS signature,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'claim_delivery_order'
ORDER BY p.oid;

-- D7. Staff RBAC helpers required by the security migration preflight.
--    current_staff_role / current_staff_canteen_id / current_staff_driver_id
--    must all be present and SECURITY DEFINER. A missing driver helper means the
--    staff->driver mapping is not established yet; establish it before applying
--    the RLS migration.
SELECT
  p.oid::regprocedure AS signature,
  p.prosecdef AS security_definer,
  p.proconfig AS config
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('current_staff_role','current_staff_canteen_id','current_staff_driver_id')
ORDER BY p.proname;

-- D8. Order triggers to PRESERVE (workflow + WhatsApp enqueue). Confirm they are
--    enabled before and after both migrations; none may be dropped/duplicated.
SELECT
  t.tgname AS trigger_name,
  CASE t.tgenabled WHEN 'O' THEN 'enabled' WHEN 'D' THEN 'disabled'
                   WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' END AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS trigger_definition,
  p.oid::regprocedure AS function_signature
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.orders'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- D9. Current RLS state + policies on the sensitive tables. Review existing
--    policies before proposing any access-control changes.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  coalesce(p.policyname, '(no policy)') AS policy_name,
  p.cmd,
  p.roles,
  p.permissive
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname IN ('orders','order_items','menu_items','canteens','driver','staff_profiles')
ORDER BY c.relname, p.policyname;

-- D10. Current effective table grants to review. This checkout repair does not
--     change operational-table grants; do not apply a broad grant/RLS migration
--     without a separate review and approval.
SELECT
  table_name,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
  acl.privilege_type
FROM pg_class tbl
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(tbl.relacl, acldefault('r', tbl.relowner))) acl
LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
WHERE ns.nspname = 'public'
  AND tbl.relname IN ('orders','order_items','menu_items','canteens','driver')
ORDER BY tbl.relname, grantee, acl.privilege_type;
