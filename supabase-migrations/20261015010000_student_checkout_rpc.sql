-- UniEats student checkout RPC.
--
-- Apply after 20261015004000_add_canteen_slugs.sql and
-- 20261015005000_seed_student_menu_catalogue.sql.
-- This migration deliberately does not seed/update menu rows, change RLS or
-- operational-table grants, or replace any existing order/WhatsApp triggers.
-- It therefore does not remediate the already-reported broad operational
-- table grants; review and apply a separate least-privilege RLS migration
-- before production use.
BEGIN;

DO $preflight$
DECLARE
  v_missing_columns TEXT;
  v_bad_names TEXT;
  v_has_order_type_check BOOLEAN;
  v_has_payment_check BOOLEAN;
  v_has_order_number_unique BOOLEAN;
BEGIN
  IF to_regclass('public.canteens') IS NULL
    OR to_regclass('public.menu_items') IS NULL
    OR to_regclass('public.orders') IS NULL
    OR to_regclass('public.order_items') IS NULL
  THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: required canteens/menu_items/orders/order_items tables are missing.';
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO v_missing_columns
  FROM (VALUES
    ('canteens', 'id'),
    ('canteens', 'name'),
    ('canteens', 'slug'),
    ('canteens', 'is_open'),
    ('menu_items', 'id'),
    ('menu_items', 'canteen_id'),
    ('menu_items', 'name'),
    ('menu_items', 'price'),
    ('menu_items', 'available'),
    ('menu_items', 'catalogue_key'),
    ('menu_items', 'sizes'),
    ('menu_items', 'add_ons'),
    ('orders', 'id'),
    ('orders', 'order_number'),
    ('orders', 'student_name'),
    ('orders', 'phone'),
    ('orders', 'delivery_location'),
    ('orders', 'order_type'),
    ('orders', 'canteen_id'),
    ('orders', 'status'),
    ('orders', 'total_amount'),
    ('orders', 'delivery_charge'),
    ('orders', 'special_instructions'),
    ('orders', 'tracking_token_hash'),
    ('orders', 'payment_method'),
    ('orders', 'created_at'),
    ('order_items', 'order_id'),
    ('order_items', 'menu_item_id'),
    ('order_items', 'item_name'),
    ('order_items', 'quantity'),
    ('order_items', 'price'),
    ('order_items', 'subtotal')
  ) AS required(table_name, column_name)
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'public'
   AND actual.table_name = required.table_name
   AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL;

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: required columns are missing: %.',
      v_missing_columns;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name IN ('orders', 'order_items')
      AND c.is_nullable = 'NO'
      AND c.column_name NOT IN (
        'id', 'order_id', 'menu_item_id', 'order_number', 'student_name',
        'phone', 'delivery_location', 'order_type', 'canteen_id', 'status',
        'total_amount', 'delivery_charge', 'special_instructions',
        'tracking_token_hash', 'payment_method', 'created_at', 'item_name',
        'quantity', 'price', 'subtotal'
      )
      AND c.column_default IS NULL
      AND c.is_identity = 'NO'
      AND c.is_generated = 'NEVER'
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: orders/order_items has an additional required column with no default that the checkout contract does not populate.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'orders'
      AND c.column_name IN ('id', 'created_at')
      AND c.column_default IS NULL
      AND c.is_identity = 'NO'
      AND c.is_generated = 'NEVER'
    UNION ALL
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'order_items'
      AND c.column_name = 'id'
      AND c.column_default IS NULL
      AND c.is_identity = 'NO'
      AND c.is_generated = 'NEVER'
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: orders.id/created_at and order_items.id must have database defaults.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND (
        (c.table_name = 'canteens' AND c.column_name = 'id'
          AND c.udt_name <> 'uuid')
        OR (c.table_name = 'canteens' AND c.column_name = 'slug'
          AND c.data_type <> 'text')
        OR (c.table_name = 'canteens' AND c.column_name = 'is_open'
          AND c.data_type <> 'boolean')
        OR (c.table_name = 'orders' AND c.column_name = 'canteen_id'
          AND c.udt_name <> 'uuid')
        OR (c.table_name = 'menu_items' AND c.column_name = 'canteen_id'
          AND c.udt_name <> 'uuid')
        OR (c.table_name = 'orders' AND c.column_name = 'id'
          AND c.udt_name <> 'uuid')
        OR (c.table_name = 'menu_items' AND c.column_name = 'id'
          AND c.udt_name <> 'uuid')
        OR (c.table_name = 'orders' AND c.column_name = 'order_number'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'student_name'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'phone'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'delivery_location'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'order_type'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'status'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'special_instructions'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'tracking_token_hash'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'payment_method'
          AND c.data_type <> 'text')
        OR (c.table_name = 'orders' AND c.column_name = 'created_at'
          AND c.data_type <> 'timestamp with time zone')
        OR (c.table_name = 'menu_items' AND c.column_name = 'name'
          AND c.data_type <> 'text')
        OR (c.table_name = 'menu_items' AND c.column_name = 'catalogue_key'
          AND c.data_type <> 'text')
        OR (c.table_name = 'menu_items' AND c.column_name = 'available'
          AND c.data_type <> 'boolean')
        OR (c.table_name = 'menu_items' AND c.column_name IN ('sizes', 'add_ons')
          AND c.udt_name <> 'jsonb')
        OR (c.table_name = 'order_items' AND c.column_name = 'item_name'
          AND c.data_type <> 'text')
        OR (c.table_name = 'order_items' AND c.column_name = 'quantity'
          AND c.data_type <> 'integer')
        OR (c.table_name IN ('orders', 'order_items', 'menu_items')
          AND c.column_name IN ('total_amount', 'delivery_charge', 'price', 'subtotal')
          AND c.data_type NOT IN ('numeric', 'integer', 'bigint', 'real', 'double precision'))
      )
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: a required column has an unexpected type. Review public table definitions before applying.';
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
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_attribute menu_id
    JOIN pg_attribute item_menu_id
      ON item_menu_id.attrelid = 'public.order_items'::regclass
     AND item_menu_id.attname = 'menu_item_id'
     AND NOT item_menu_id.attisdropped
    WHERE menu_id.attrelid = 'public.menu_items'::regclass
      AND menu_id.attname = 'id'
      AND NOT menu_id.attisdropped
      AND menu_id.atttypid = item_menu_id.atttypid
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_attribute canteen_id
    JOIN pg_attribute order_canteen_id
      ON order_canteen_id.attrelid = 'public.orders'::regclass
     AND order_canteen_id.attname = 'canteen_id'
     AND NOT order_canteen_id.attisdropped
    JOIN pg_attribute menu_canteen_id
      ON menu_canteen_id.attrelid = 'public.menu_items'::regclass
     AND menu_canteen_id.attname = 'canteen_id'
     AND NOT menu_canteen_id.attisdropped
    WHERE canteen_id.attrelid = 'public.canteens'::regclass
      AND canteen_id.attname = 'id'
      AND NOT canteen_id.attisdropped
      AND canteen_id.atttypid = order_canteen_id.atttypid
      AND canteen_id.atttypid = menu_canteen_id.atttypid
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: order/menu/canteen key types do not match.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint fk
    WHERE fk.contype = 'f'
      AND fk.conrelid = 'public.order_items'::regclass
      AND fk.confrelid = 'public.orders'::regclass
      AND fk.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.order_items'::regclass
          AND a.attname = 'order_id' AND NOT a.attisdropped
      )]::smallint[]
      AND fk.confkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.orders'::regclass
          AND a.attname = 'id' AND NOT a.attisdropped
      )]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint fk
    WHERE fk.contype = 'f'
      AND fk.conrelid = 'public.order_items'::regclass
      AND fk.confrelid = 'public.menu_items'::regclass
      AND fk.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.order_items'::regclass
          AND a.attname = 'menu_item_id' AND NOT a.attisdropped
      )]::smallint[]
      AND fk.confkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.menu_items'::regclass
          AND a.attname = 'id' AND NOT a.attisdropped
      )]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint fk
    WHERE fk.contype = 'f'
      AND fk.conrelid = 'public.orders'::regclass
      AND fk.confrelid = 'public.canteens'::regclass
      AND fk.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.orders'::regclass
          AND a.attname = 'canteen_id' AND NOT a.attisdropped
      )]::smallint[]
      AND fk.confkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.canteens'::regclass
          AND a.attname = 'id' AND NOT a.attisdropped
      )]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint fk
    WHERE fk.contype = 'f'
      AND fk.conrelid = 'public.menu_items'::regclass
      AND fk.confrelid = 'public.canteens'::regclass
      AND fk.conkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.menu_items'::regclass
          AND a.attname = 'canteen_id' AND NOT a.attisdropped
      )]::smallint[]
      AND fk.confkey = ARRAY[(
        SELECT a.attnum FROM pg_attribute a
        WHERE a.attrelid = 'public.canteens'::regclass
          AND a.attname = 'id' AND NOT a.attisdropped
      )]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: expected order_items foreign keys to orders(id) and menu_items(id) were not found.';
  END IF;

  SELECT string_agg(issues.message, '; ')
  INTO v_bad_names
  FROM (
    SELECT format(
      '%s resolves to %s canteens',
      expected.slug,
      count(actual.id)
    ) AS message
    FROM (VALUES
      ('annexe'::text),
      ('bhola'::text),
      ('gssc'::text),
      ('hot-potato'::text),
      ('ssc'::text)
    ) AS expected(slug)
    LEFT JOIN public.canteens AS actual ON actual.slug = expected.slug
    GROUP BY expected.slug
    HAVING count(actual.id) <> 1
  ) AS issues;

  IF v_bad_names IS NOT NULL THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: a canonical canteen slug is missing or ambiguous: %.',
      v_bad_names;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.menu_items
    WHERE catalogue_key IS NOT NULL
    GROUP BY catalogue_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: duplicate non-null menu_items.catalogue_key values require manual reconciliation.';
  END IF;

  IF to_regprocedure('public.claim_delivery_order(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: the verified claim_delivery_order(uuid) function is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'orders_enqueue_whatsapp_order_notification_queue'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 2) = 0
      AND (t.tgtype & 4) = 4
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'orders_remove_whatsapp_order_notification_queue'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 2) = 0
      AND (t.tgtype & 8) = 8
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'validate_order_workflow_update'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
      AND (t.tgtype & 1) = 1
      AND (t.tgtype & 2) = 2
      AND (t.tgtype & 16) = 16
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: an expected enabled order/WhatsApp/workflow trigger is missing or has unexpected timing.';
  END IF;

  SELECT count(*) = 1
  INTO v_has_payment_check
  FROM pg_constraint c
  WHERE c.conrelid = 'public.orders'::regclass
    AND c.contype = 'c'
    AND c.convalidated
    AND lower(pg_get_constraintdef(c.oid)) LIKE '%payment_method%'
    AND (
      SELECT count(*)
      FROM pg_constraint other_check
      WHERE other_check.conrelid = 'public.orders'::regclass
        AND other_check.contype = 'c'
        AND lower(pg_get_constraintdef(other_check.oid)) LIKE '%payment_method%'
    ) = 1
    AND translate(
      regexp_replace(
        lower(pg_get_constraintdef(c.oid)),
        '::(character varying|varchar|text)|[[:space:]()]',
        '',
        'g'
      ),
      '[]' || chr(39),
      ''
    ) IN (
      'checkpayment_method=anyarraycod,online',
      'checkpayment_method=anyarrayonline,cod',
      'checkpayment_methodisnullorpayment_method=anyarraycod,online',
      'checkpayment_methodisnullorpayment_method=anyarrayonline,cod',
      'checkpayment_methodincod,online',
      'checkpayment_methodinonline,cod'
    );

  IF NOT v_has_payment_check THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: orders.payment_method must have a validated check constraint that allows exactly cod and online. No existing constraint was changed.';
  END IF;

  SELECT count(*) = 1
  INTO v_has_order_type_check
  FROM pg_constraint c
  WHERE c.conrelid = 'public.orders'::regclass
    AND c.contype = 'c'
    AND c.convalidated
    AND lower(pg_get_constraintdef(c.oid)) LIKE '%order_type%'
    AND (
      SELECT count(*)
      FROM pg_constraint other_check
      WHERE other_check.conrelid = 'public.orders'::regclass
        AND other_check.contype = 'c'
        AND lower(pg_get_constraintdef(other_check.oid)) LIKE '%order_type%'
    ) = 1
    AND translate(
      regexp_replace(
        lower(pg_get_constraintdef(c.oid)),
        '::(character varying|varchar|text)|[[:space:]()]',
        '',
        'g'
      ),
      '[]' || chr(39),
      ''
    ) IN (
      'checkorder_type=anyarraypickup,delivery',
      'checkorder_type=anyarraydelivery,pickup',
      'checkorder_typeinpickup,delivery',
      'checkorder_typeindelivery,pickup'
    );

  IF NOT v_has_order_type_check THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: orders.order_type must have a validated check constraint that allows exactly pickup and delivery. No existing constraint was changed.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = i.indkey[0]
     AND NOT a.attisdropped
    WHERE i.indrelid = 'public.orders'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
      AND a.attname = 'order_number'
  ) INTO v_has_order_number_unique;

  IF NOT v_has_order_number_unique THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: orders.order_number must have a valid, non-partial unique constraint or index. No existing constraint or index was changed.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.orders'::regclass
      AND c.contype = 'c'
      AND lower(pg_get_constraintdef(c.oid)) LIKE '%status%'
      AND lower(pg_get_constraintdef(c.oid)) NOT LIKE '%pending%'
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: an orders status constraint does not visibly accept pending.';
  END IF;
END;
$preflight$;

-- The required catalogue-seed migration creates this unique index. Verify the
-- prerequisite without attempting to create a second catalogue-key index here.
DO $index_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indexrelid = to_regclass('public.menu_items_catalogue_key_unique')
      AND i.indrelid = 'public.menu_items'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
      AND pg_get_indexdef(i.indexrelid) ILIKE '%(catalogue_key)%'
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: menu_items_catalogue_key_unique is not a valid unique catalogue_key index.';
  END IF;
END;
$index_check$;

CREATE TABLE IF NOT EXISTS public.checkout_idempotency (
  checkout_key UUID PRIMARY KEY,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $idempotency_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkout_idempotency'
      AND column_name = 'checkout_key'
      AND udt_name = 'uuid'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkout_idempotency'
      AND column_name = 'request_hash'
      AND data_type = 'text'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'checkout_idempotency'
      AND column_name = 'result'
      AND udt_name = 'jsonb'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.checkout_idempotency'::regclass
      AND i.indisprimary
      AND i.indnkeyatts = 1
      AND pg_get_indexdef(i.indexrelid) ILIKE '%(checkout_key)%'
  ) THEN
    RAISE EXCEPTION
      'Student checkout migration blocked: existing checkout_idempotency schema is incompatible; review it without replacing data.';
  END IF;
END;
$idempotency_check$;

ALTER TABLE public.checkout_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.checkout_idempotency FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.checkout_idempotency FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.checkout_idempotency TO service_role;

CREATE OR REPLACE FUNCTION public.create_student_checkout(
  p_checkout_key UUID,
  p_request_hash TEXT,
  p_student_name TEXT,
  p_phone TEXT,
  p_order_type TEXT,
  p_delivery_location TEXT,
  p_special_instructions TEXT,
  p_payment_method TEXT,
  p_tracking_token_hash TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_existing_hash TEXT;
  v_existing_result JSONB;
  v_canteen_text TEXT;
  v_canteen_id UUID;
  v_canteen_name TEXT;
  v_canteen_is_open BOOLEAN;
  v_canteen_slug TEXT;
  v_entry JSONB;
  v_menu public.menu_items%ROWTYPE;
  v_add_on JSONB;
  v_sizes JSONB;
  v_add_ons JSONB;
  v_base_price NUMERIC;
  v_add_on_total NUMERIC;
  v_add_on_price NUMERIC;
  v_unit_price NUMERIC;
  v_line_subtotal NUMERIC;
  v_group_subtotal NUMERIC;
  v_group_delivery NUMERIC;
  v_total_subtotal NUMERIC := 0;
  v_total_delivery NUMERIC := 0;
  v_quantity INTEGER;
  v_size TEXT;
  v_add_on_name TEXT;
  v_add_on_matches INTEGER;
  v_item_name TEXT;
  v_labels TEXT[];
  v_group_items JSONB;
  v_receipt_items JSONB;
  v_receipt_orders JSONB := '[]'::jsonb;
  v_line JSONB;
  v_order_id public.orders.id%TYPE;
  v_order_number TEXT;
  v_created_at TIMESTAMPTZ;
  v_result JSONB;
  v_canteen_count INTEGER;
  v_item_count INTEGER;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_checkout_key IS NULL
    OR p_request_hash IS NULL
    OR p_request_hash !~ '^[0-9a-f]{64}$'
    OR p_student_name IS NULL
    OR length(btrim(p_student_name)) NOT BETWEEN 1 AND 100
    OR p_phone IS NULL
    OR p_phone !~ '^03[0-9]{9}$'
    OR p_order_type IS NULL
    OR p_order_type NOT IN ('pickup', 'delivery')
    OR p_payment_method IS NULL
    OR p_payment_method NOT IN ('cod', 'online')
    OR p_tracking_token_hash IS NULL
    OR p_tracking_token_hash !~ '^[0-9a-f]{64}$'
    OR (p_special_instructions IS NOT NULL AND length(p_special_instructions) > 500)
    OR (p_order_type = 'delivery' AND (
      p_delivery_location IS NULL
      OR length(btrim(p_delivery_location)) NOT BETWEEN 1 AND 200
    ))
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  SELECT count(*) INTO v_item_count
  FROM jsonb_array_elements(p_items);
  IF v_item_count < 1 OR v_item_count > 50 THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e(item)
    WHERE jsonb_typeof(e.item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(coalesce(e.item->'add_on_names', '[]'::jsonb)) IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e(item)
    WHERE coalesce(e.item->>'client_line_id', '') = ''
      OR length(e.item->>'client_line_id') > 150
      OR coalesce(e.item->>'catalogue_key', '') !~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'
      OR length(e.item->>'catalogue_key') > 100
      OR coalesce(e.item->>'canteen_slug', '') NOT IN (
        'annexe', 'bhola', 'gssc', 'hot-potato', 'ssc'
      )
      OR CASE
        WHEN coalesce(e.item->>'quantity', '') ~ '^[0-9]{1,2}$'
          THEN (e.item->>'quantity')::integer NOT BETWEEN 1 AND 20
        ELSE TRUE
      END
      OR (e.item->'size' IS NOT NULL
        AND jsonb_typeof(e.item->'size') NOT IN ('string', 'null'))
      OR length(coalesce(e.item->>'size', '')) > 80
      OR jsonb_array_length(coalesce(e.item->'add_on_names', '[]'::jsonb)) > 10
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e(item)
    GROUP BY e.item->>'client_line_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e(item)
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce(e.item->'add_on_names', '[]'::jsonb)
    ) AS selected(value)
    WHERE jsonb_typeof(selected.value) IS DISTINCT FROM 'string'
       OR length(selected.value #>> '{}') NOT BETWEEN 1 AND 80
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e(item)
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce(e.item->'add_on_names', '[]'::jsonb)
    ) AS selected(value)
    GROUP BY e.item->>'client_line_id', selected.value
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
  END IF;

  SELECT count(DISTINCT e.item->>'canteen_slug') INTO v_canteen_count
  FROM jsonb_array_elements(p_items) AS e(item);
  IF v_canteen_count < 1 OR v_canteen_count > 5 THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  -- Serialize retries before reading the row. A hash collision only causes
  -- unrelated requests to wait; it cannot combine or lose checkout records.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_checkout_key::text, 0)
  );

  SELECT request_hash, result
  INTO v_existing_hash, v_existing_result
  FROM public.checkout_idempotency
  WHERE checkout_key = p_checkout_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'CHECKOUT_KEY_REUSED';
    END IF;
    IF v_existing_result IS NOT NULL THEN
      RETURN v_existing_result;
    END IF;
    RAISE EXCEPTION 'CHECKOUT_RETRY_STATE_INVALID';
  END IF;

  INSERT INTO public.checkout_idempotency (checkout_key, request_hash)
  VALUES (p_checkout_key, p_request_hash);

  FOR v_canteen_text IN
    SELECT DISTINCT e.item->>'canteen_slug'
    FROM jsonb_array_elements(p_items) AS e(item)
    ORDER BY e.item->>'canteen_slug'
  LOOP
    v_canteen_slug := v_canteen_text;

    SELECT c.id, c.name, c.is_open, c.slug
    INTO v_canteen_id, v_canteen_name, v_canteen_is_open, v_canteen_slug
    FROM public.canteens AS c
    WHERE c.slug = v_canteen_slug
    FOR SHARE;

    IF NOT FOUND
      OR v_canteen_id IS NULL
      OR v_canteen_name IS NULL
      OR v_canteen_slug IS DISTINCT FROM v_canteen_text
    THEN
      RAISE EXCEPTION 'CHECKOUT_CANTEEN_MAPPING_INVALID';
    END IF;

    IF v_canteen_is_open IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'CHECKOUT_CANTEEN_CLOSED';
    END IF;

    v_group_subtotal := 0;
    v_group_items := '[]'::jsonb;

    FOR v_entry IN
      SELECT e.item
      FROM jsonb_array_elements(p_items) AS e(item)
      WHERE e.item->>'canteen_slug' = v_canteen_slug
      ORDER BY e.item->>'client_line_id'
    LOOP
      SELECT m.*
      INTO v_menu
      FROM public.menu_items AS m
      WHERE m.catalogue_key = v_entry->>'catalogue_key'
        AND m.canteen_id = v_canteen_id
        AND m.available IS TRUE
      FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'CHECKOUT_ITEM_UNAVAILABLE';
      END IF;

      v_sizes := coalesce(v_menu.sizes, '{}'::jsonb);
      v_size := nullif(v_entry->>'size', '');
      IF jsonb_typeof(v_sizes) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
      ELSIF v_sizes <> '{}'::jsonb THEN
        IF v_size IS NULL OR NOT (v_sizes ? v_size)
          OR jsonb_typeof(v_sizes->v_size) IS DISTINCT FROM 'number'
        THEN
          RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
        END IF;
        v_base_price := (v_sizes->>v_size)::numeric;
      ELSE
        IF v_size IS NOT NULL THEN
          RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
        END IF;
        v_base_price := v_menu.price;
      END IF;

      IF v_base_price IS NULL OR v_base_price < 0 THEN
        RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
      END IF;

      v_add_on_total := 0;
      v_add_ons := coalesce(v_menu.add_ons, '[]'::jsonb);
      IF jsonb_typeof(v_add_ons) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
      END IF;

      FOR v_add_on IN
        SELECT selected.value
        FROM jsonb_array_elements(
          coalesce(v_entry->'add_on_names', '[]'::jsonb)
        ) AS selected(value)
      LOOP
        v_add_on_name := v_add_on #>> '{}';
        SELECT count(*), max((option.value->>'price')::numeric)
        INTO v_add_on_matches, v_add_on_price
        FROM jsonb_array_elements(v_add_ons) AS option(value)
        WHERE jsonb_typeof(option.value) = 'object'
          AND option.value->>'name' = v_add_on_name
          AND jsonb_typeof(option.value->'price') = 'number';

        IF v_add_on_matches <> 1 OR v_add_on_price IS NULL THEN
          RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
        END IF;

        IF v_add_on_price < 0 THEN
          RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
        END IF;
        v_add_on_total := v_add_on_total + v_add_on_price;
      END LOOP;

      v_unit_price := v_base_price + v_add_on_total;
      v_quantity := (v_entry->>'quantity')::integer;
      v_line_subtotal := v_unit_price * v_quantity;
      v_labels := ARRAY[]::text[];
      IF v_size IS NOT NULL THEN
        v_labels := array_append(v_labels, v_size);
      END IF;
      FOR v_add_on IN
        SELECT selected.value
        FROM jsonb_array_elements(
          coalesce(v_entry->'add_on_names', '[]'::jsonb)
        ) AS selected(value)
      LOOP
        v_labels := array_append(
          v_labels,
          (v_add_on #>> '{}') || ' topping'
        );
      END LOOP;

      v_item_name := v_menu.name;
      IF cardinality(v_labels) > 0 THEN
        v_item_name := v_item_name || ' (' || array_to_string(v_labels, ', ') || ')';
      END IF;

      v_group_subtotal := v_group_subtotal + v_line_subtotal;
      v_group_items := v_group_items || jsonb_build_array(jsonb_build_object(
        'menuItemId', v_menu.id,
        'clientLineId', v_entry->>'client_line_id',
        'itemName', v_item_name,
        'quantity', v_quantity,
        'unitPrice', v_unit_price,
        'subtotal', v_line_subtotal
      ));
    END LOOP;

    v_group_delivery := CASE WHEN p_order_type = 'delivery' THEN 45 ELSE 0 END;
    v_order_number := 'UNI-' || upper(gen_random_uuid()::text);

    INSERT INTO public.orders (
      order_number,
      student_name,
      phone,
      order_type,
      delivery_location,
      canteen_id,
      status,
      total_amount,
      delivery_charge,
      special_instructions,
      tracking_token_hash,
      payment_method
    )
    VALUES (
      v_order_number,
      btrim(p_student_name),
      p_phone,
      p_order_type,
      CASE WHEN p_order_type = 'delivery' THEN btrim(p_delivery_location) ELSE NULL END,
      v_canteen_id,
      'pending',
      v_group_subtotal + v_group_delivery,
      v_group_delivery,
      nullif(btrim(p_special_instructions), ''),
      p_tracking_token_hash,
      p_payment_method
    )
    RETURNING id, order_number, created_at
    INTO v_order_id, v_order_number, v_created_at;

    v_receipt_items := '[]'::jsonb;
    FOR v_line IN
      SELECT value FROM jsonb_array_elements(v_group_items)
    LOOP
      INSERT INTO public.order_items (
        order_id,
        menu_item_id,
        item_name,
        quantity,
        price,
        subtotal
      )
      VALUES (
        v_order_id,
        (v_line->>'menuItemId')::uuid,
        v_line->>'itemName',
        (v_line->>'quantity')::integer,
        (v_line->>'unitPrice')::numeric,
        (v_line->>'subtotal')::numeric
      );

      v_receipt_items := v_receipt_items || jsonb_build_array(
        jsonb_build_object(
          'clientLineId', v_line->>'clientLineId',
          'itemName', v_line->>'itemName',
          'quantity', (v_line->>'quantity')::integer,
          'unitPrice', (v_line->>'unitPrice')::numeric,
          'subtotal', (v_line->>'subtotal')::numeric
        )
      );
    END LOOP;

    v_receipt_orders := v_receipt_orders || jsonb_build_array(
      jsonb_build_object(
        'id', v_order_id,
        'orderNumber', v_order_number,
        'canteenId', v_canteen_id,
        'canteenSlug', v_canteen_slug,
        'canteenName', v_canteen_name,
        'subtotal', v_group_subtotal,
        'deliveryCharge', v_group_delivery,
        'totalAmount', v_group_subtotal + v_group_delivery,
        'createdAt', v_created_at,
        'items', v_receipt_items
      )
    );
    v_total_subtotal := v_total_subtotal + v_group_subtotal;
    v_total_delivery := v_total_delivery + v_group_delivery;
  END LOOP;

  v_result := jsonb_build_object(
    'orders', v_receipt_orders,
    'subtotal', v_total_subtotal,
    'deliveryFee', v_total_delivery,
    'grandTotal', v_total_subtotal + v_total_delivery
  );

  UPDATE public.checkout_idempotency
  SET result = v_result
  WHERE checkout_key = p_checkout_key;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_student_checkout(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_student_checkout(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
