-- UniEats: insert-only menu catalogue seed and atomic student checkout
-- Apply manually after reviewing. This migration does not delete menu items,
-- orders, order items, or notification records.
BEGIN;

DO $$
DECLARE
  v_bad_canteens TEXT;
  v_notification_source TEXT;
BEGIN
  IF EXISTS (
    SELECT catalogue_key
    FROM public.menu_items
    WHERE catalogue_key IS NOT NULL
    GROUP BY catalogue_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: duplicate public.menu_items.catalogue_key values require manual review.';
  END IF;

  -- These names are the verified production labels; do not rename canteens
  -- to match frontend display copy.
  SELECT string_agg(
    format(
      '%s expected "%s" but found %s',
      expected.id,
      expected.name,
      coalesce('"' || actual.name || '"', 'no canteen row')
    ),
    '; '
  )
  INTO v_bad_canteens
  FROM (VALUES
    ('888c85d8-84a8-4da5-88f7-f63bfa8ba60f'::uuid, 'Annexe'::text),
    ('e53aab5b-6700-4ba3-888f-01913f5d1d5b'::uuid, 'BHOLA'::text),
    ('1d2bef63-f1bc-4ba7-980e-547c93153716'::uuid, 'GSSC'::text),
    ('9404c1b0-00ba-4545-9728-9f2cd6eb10f8'::uuid, 'Hot Potato'::text),
    ('6aae1e41-cf24-421b-bf97-34e40001da63'::uuid, 'SSC'::text)
  ) AS expected(id, name)
  LEFT JOIN public.canteens actual ON actual.id = expected.id
  WHERE actual.id IS NULL
     OR lower(btrim(actual.name)) <> lower(expected.name);

  IF v_bad_canteens IS NOT NULL THEN
    RAISE EXCEPTION
      'Checkout migration blocked: canteen UUID/name mapping mismatch: %',
      v_bad_canteens;
  END IF;

  SELECT p.prosrc INTO v_notification_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure(
      'public.enqueue_whatsapp_order_notification_queue()'
    )
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public']::text[];

  IF to_regclass('public.whatsapp_order_notification_queue') IS NULL
    OR v_notification_source IS NULL
    OR lower(v_notification_source) NOT LIKE '%whatsapp_order_notification_queue%'
    OR lower(v_notification_source) NOT LIKE '%on conflict (order_id, event_type) do nothing%'
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = 'public.orders'::regclass
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
        AND t.tgname = 'orders_enqueue_whatsapp_order_notification_queue'
        AND (t.tgtype & 1) = 1
        AND (t.tgtype & 2) = 0
        AND (t.tgtype & 4) = 4
        AND p.oid = to_regprocedure(
          'public.enqueue_whatsapp_order_notification_queue()'
        )
    )
    OR (
      SELECT count(*)
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = 'public.orders'::regclass
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
        AND (t.tgtype & 4) = 4
        AND (
          lower(p.prosrc) LIKE '%whatsapp_order_notification_queue%'
          OR lower(p.prosrc) LIKE '%whatsapp_order_notifications%'
        )
    ) <> 1
  THEN
    RAISE EXCEPTION
      'Checkout migration blocked: expected exactly one enabled AFTER INSERT WhatsApp enqueue trigger targeting the idempotent whatsapp_order_notification_queue. Inspect existing order triggers/queues before retrying.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.orders')
      AND relrowsecurity IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.order_items')
      AND relrowsecurity IS TRUE
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: RLS must already be enabled on orders and order_items. Review and apply the portal RLS baseline in staging first; this checkout migration will not enable unreviewed policies.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.menu_items')
      AND relrowsecurity IS TRUE
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: RLS must be enabled on menu_items by the reviewed portal RLS migration before checkout setup.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('orders', 'order_items')
      AND (
        'anon' = ANY(roles)
        OR 'public' = ANY(roles)
      )
      AND NOT (
        (tablename = 'orders'
          AND policyname = 'orders_checkout_insert'
          AND cmd = 'INSERT')
        OR
        (tablename = 'order_items'
          AND policyname = 'order_items_checkout_insert'
          AND cmd = 'INSERT')
      )
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: orders/order_items have anon or PUBLIC RLS policies. Review and remove broad client policies before checkout setup.';
  END IF;

  -- This checks policy structure and rejects extra policies; still compare
  -- deployed pg_policies expressions and helper-function definitions in
  -- staging before applying because textual checks cannot prove SQL semantics.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'orders_staff_select'
      AND cmd = 'SELECT' AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%driver_id%'
      AND qual ILIKE '%canteen_owner%'
      AND qual ILIKE '%driver%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'orders_staff_update'
      AND cmd = 'UPDATE' AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%driver_id%'
      AND with_check ILIKE '%current_staff_role%'
      AND with_check ILIKE '%current_staff_canteen_id%'
      AND with_check ILIKE '%driver_id%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'orders_admin_delete'
      AND cmd = 'DELETE' AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%admin%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_items'
      AND policyname = 'order_items_staff_select'
      AND cmd = 'SELECT' AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%orders%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%driver_id%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_items'
      AND policyname = 'order_items_admin_delete'
      AND cmd = 'DELETE' AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%admin%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
      AND policyname = 'menu_items_public_read'
      AND cmd = 'SELECT'
      AND 'anon' = ANY(roles)
      AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND lower(btrim(coalesce(qual, ''))) IN ('true', '(true)')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
      AND policyname = 'menu_items_staff_manage'
      AND cmd = 'ALL'
      AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND qual ILIKE '%current_staff_role%'
      AND qual ILIKE '%current_staff_canteen_id%'
      AND qual ILIKE '%canteen_owner%'
      AND qual ILIKE '%admin%'
      AND with_check ILIKE '%current_staff_role%'
      AND with_check ILIKE '%current_staff_canteen_id%'
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: required staff/menu RLS policy definitions do not match the reviewed admin/canteen-owner/rider contract. Inspect pg_policies and the deployed driver identity mapping; do not rely on policy names alone.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('orders', 'order_items', 'menu_items')
      AND 'authenticated' = ANY(roles)
      AND permissive = 'PERMISSIVE'
      AND NOT (
        tablename = 'menu_items'
        AND policyname = 'menu_items_public_read'
        AND cmd = 'SELECT'
      )
      AND (
        lower(btrim(coalesce(qual, ''))) IN ('true', '(true)')
        OR lower(btrim(coalesce(with_check, ''))) IN ('true', '(true)')
      )
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: an authenticated orders/order_items/menu_items policy is unconditionally permissive. Review all policies before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('orders', 'order_items')
      AND 'authenticated' = ANY(roles)
      AND policyname NOT IN (
        'orders_staff_select',
        'orders_staff_update',
        'orders_admin_delete',
        'order_items_staff_select',
        'order_items_admin_delete',
        'orders_checkout_insert',
        'order_items_checkout_insert'
      )
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: additional authenticated orders/order_items policies are present and have not been reviewed. Inspect pg_policies before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'menu_items'
      AND (
        (
          'authenticated' = ANY(roles)
          AND policyname NOT IN (
            'menu_items_public_read',
            'menu_items_staff_manage'
          )
        )
        OR (
          ('anon' = ANY(roles) OR 'public' = ANY(roles))
          AND policyname <> 'menu_items_public_read'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: additional menu_items policies are present and may grant unreviewed access. Inspect pg_policies before retrying.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_catalogue_key_unique
  ON public.menu_items (catalogue_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indexrelid = to_regclass('public.menu_items_catalogue_key_unique')
      AND i.indrelid = 'public.menu_items'::regclass
      AND i.indisunique IS TRUE
      AND i.indisvalid IS TRUE
      AND i.indisready IS TRUE
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnatts = 1
      AND i.indnkeyatts = 1
      AND pg_get_indexdef(i.indexrelid) ILIKE '%USING btree (catalogue_key)'
  ) THEN
    RAISE EXCEPTION
      'Checkout migration blocked: menu_items_catalogue_key_unique is not a valid unique index on catalogue_key. Review the existing index before retrying.';
  END IF;
END;
$$;

CREATE TEMP TABLE unieats_checkout_menu_seed (
  catalogue_key TEXT PRIMARY KEY,
  canteen_id UUID NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  available BOOLEAN NOT NULL,
  sizes JSONB NOT NULL,
  add_ons JSONB NOT NULL,
  image_url TEXT
) ON COMMIT DROP;

INSERT INTO unieats_checkout_menu_seed (
  catalogue_key, canteen_id, name, price, available, sizes, add_ons, image_url
)
VALUES
  ('ssc-fast-panini', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Panini Sandwich', 280, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/panini-sandwich.jpg' ),
  ('ssc-fast-zinger', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Zinger Burger', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/zinger-burger.jpg' ),
  ('ssc-fast-zinger-extreme', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Zinger Extreme', 300, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/zinger-extreme.jpg' ),
  ('ssc-fast-tower', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Tower Zinger', 360, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/tower-zinger.jpg' ),
  ('ssc-fast-mighty', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Mighty Zinger', 420, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mighty-zinger.jpg' ),
  ('ssc-fast-pizza-burger', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Pizza Burger', 550, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/pizza-burger.jpg' ),
  ('ssc-fast-chicken-burger', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Burger', 180, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-burger.jpg' ),
  ('ssc-fast-boti-burger', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Boti Burger', 180, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/boti-burger.jpg' ),
  ('ssc-fast-tikka-burger', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Tikka Burger', 180, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/tikka-burger.jpg' ),
  ('ssc-fast-fajita-burger', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Fajita Burger', 180, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/fajita-burger.jpg' ),
  ('ssc-fast-shami-burger', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Shami Burger', 170, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shami-burger.jpg' ),
  ('ssc-fast-twister', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Twister Roll', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/twister-roll.jpg' ),
  ('ssc-fast-kabab-roll', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Kabab Paratha Roll', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/kabab-paratha-roll.jpg' ),
  ('ssc-fast-spicy-roll', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Spicy Roll', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/spicy-roll.jpg' ),
  ('ssc-fast-paratha-roll', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Paratha Roll', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/paratha-roll.jpg' ),
  ('ssc-fast-large-shawarma', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Large Shawarma', 220, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/large-shawarma.jpg' ),
  ('ssc-fast-shawarma-roll', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Shawarma Roll', 160, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shawarma-roll.jpg' ),
  ('ssc-fast-platter-shawarma', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Platter Shawarma', 320, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/platter-shawarma.jpg' ),
  ('ssc-fast-hot-wings-6', '6aae1e41-cf24-421b-bf97-34e40001da63', '6 pcs Crispy Hot Wings', 300, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/6-pc-crispy-hot-wings.jpg' ),
  ('ssc-fast-hot-wings-12', '6aae1e41-cf24-421b-bf97-34e40001da63', '12 pcs Crispy Hot Wings', 550, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/12-pcs-crispy-hot-wings.jpg' ),
  ('ssc-fast-nuggets-6', '6aae1e41-cf24-421b-bf97-34e40001da63', '6 pcs Nuggets', 300, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/6-pcs-nuggets.jpg' ),
  ('ssc-fast-nuggets-12', '6aae1e41-cf24-421b-bf97-34e40001da63', '12 pcs Nuggets', 550, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/12-pcs-nuggets.jpg' ),
  ('ssc-fast-fries-small', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Small Loaded Fries', 400, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/small-fries.jpg' ),
  ('ssc-fast-fries-large', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Large Loaded Fries', 550, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('ssc-fast-chicken-piece', '6aae1e41-cf24-421b-bf97-34e40001da63', '1 Chicken Piece', 180, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-chicken-piece.jpg.png' ),
  ('ssc-fast-pasta-small', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Small Loaded Pasta', 400, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/small-loaded-pasta.jpg' ),
  ('ssc-fast-pasta-large', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Large Loaded Pasta', 550, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/large-loaded-pasta.jpg' ),
  ('ssc-fast-fries-classic', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Large Fries', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('ssc-fast-mayo-fries', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Mayo Fries', 220, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mayo-fries.jpg' ),
  ('ssc-fast-club-sandwich', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Club Sandwich', 250, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/club-sandwich.jpg' ),
  ('ssc-fast-chicken-sandwich', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Sandwich', 180, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-sandwich.jpg' ),
  ('ssc-shake-mango', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Mango Shake', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mango-shake.jpg' ),
  ('ssc-juice-mango', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Mango Juice', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mango-juice.jpg' ),
  ('ssc-shake-oreo', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Oreo Shake', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/oreo-shake.jpg' ),
  ('ssc-shake-peach', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Peach Shake', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/peach-shake.jpg' ),
  ('ssc-juice-peach', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Peach Juice', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/peach-juice.jpg' ),
  ('ssc-shake-banana', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Banana Shake', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/banana-shake.jpg' ),
  ('ssc-shake-khajoor', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Khajoor Shake', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/khajoor-shake.jpg.png' ),
  ('ssc-juice-grapes', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Grapes Juice', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/grapes-juice.jpg' ),
  ('ssc-juice-falsa', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Falsa Juice', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/falsa-juice.jpg' ),
  ('ssc-fast-deal-1', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 1', 320, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-2', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 2', 430, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-3', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 3', 470, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-4', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 4', 250, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-5', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 5', 430, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-6', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 6', 380, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-shawarma-1-fries.jpg.png' ),
  ('ssc-fast-deal-7', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 7', 240, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-8', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 8', 480, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-9', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 9', 320, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-shawarma-1-fries.jpg.png' ),
  ('ssc-fast-deal-10', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 10', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-shawarma-1-fries.jpg.png' ),
  ('ssc-fast-deal-11', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 11', 350, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-shawarma-roll-3-wings-1-fries.jpg.png' ),
  ('ssc-fast-deal-12', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 12', 450, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-13', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 13', 380, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-14', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 14', 350, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png' ),
  ('ssc-fast-deal-15', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 15', 250, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/1-sandwich-1-fries.jpg.png' ),
  ('ssc-pizza-tikka', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Tikka Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-fajita', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Fajita Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-mexican', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Mexican Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-supreme', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Supreme Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-stuff-cheese', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Stuff Cheese Pizza', 900, TRUE, '{"Medium":900,"Large":1300}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-lasagna', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Lasagna Pizza', 900, TRUE, '{"Medium":900,"Large":1300}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-chapli-kabab', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Chapli Kabab Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-staff-kabab', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Staff Kabab Pizza', 900, TRUE, '{"Medium":900,"Large":1300}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-cheese-lover', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Cheese Lover Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-vegetarian', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Vegetarian Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-sausages', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Sausages Pizza', 380, TRUE, '{"Small":380,"Medium":750,"Large":1100}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-special', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Special Pizza', 400, TRUE, '{"Small":400,"Medium":900,"Large":1300}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-malai-boti', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Malai Boti Pizza', 480, TRUE, '{"Small":480,"Medium":1000,"Large":1400}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-lahore-qalandar', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Lahore Qalandar Pizza', 1100, TRUE, '{"Medium":1100,"Large":1700}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-crown-crust', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Crown Crust Pizza', 900, TRUE, '{"Medium":900,"Large":1350}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-extra-topping', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Extra Topping', 120, TRUE, '{"Small":120,"Medium":250,"Large":300}'::jsonb, '[]'::jsonb, '/menu/pizza.jpg.png' ),
  ('ssc-pizza-deal-1', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 1', 2380, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/pizzas-drink-deal.jpg.png' ),
  ('ssc-pizza-deal-2', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 2', 1680, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/pizzas-drink-deal.jpg.png' ),
  ('ssc-pizza-deal-3', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 3', 860, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/pizzas-drink-deal.jpg.png' ),
  ('ssc-pizza-deal-4', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Deal 4', 599, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/pizza-burger-regular-drink-deal.jpg.png' ),
  ('ssc-desi-karahi', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Karahi', 220, TRUE, '{"One Plate":220,"Half":650,"Full":1300}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('ssc-desi-biryani-plate', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Biryani', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-biryani.jpg.png' ),
  ('ssc-desi-haleem-chawal', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Haleem Chawal', 160, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/daal-chawal.jpg.png' ),
  ('ssc-desi-bhindi-gosht', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Bhindi Gosht', 190, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-karri-pakora', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Karri Pakora', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-daal-mash', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Special Daal Mash', 160, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('ssc-desi-sufaid-channay', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Sufaid Channay', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/channay.jpg.png' ),
  ('ssc-desi-murgh-channay', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Murgh Channay', 190, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/channay.jpg.png' ),
  ('ssc-desi-kofta-channay', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Kofta Channay', 190, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/channay.jpg.png' ),
  ('ssc-desi-chicken-kofta', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Kofta', 200, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/channay.jpg.png' ),
  ('ssc-desi-chicken-kabab', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Kabab', 200, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/channay.jpg.png' ),
  ('ssc-desi-shahi-daal', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Shahi Daal', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('ssc-desi-chicken-haleem', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Haleem', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-aloo-keema', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Aloo Keema', 200, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-chicken-kaleji', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Kaleji', 190, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-aloo-palak', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Aloo Palak', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-chicken-palak', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Palak', 190, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-sabzi-sada', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Sabzi Sada', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-chicken-sabzi', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Sabzi', 190, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-desi-chicken-pulao', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Pulao', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/chicken-pulao.jpg.png' ),
  ('ssc-desi-daal-chawal', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Daal Chawal', 170, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/daal-chawal.jpg.png' ),
  ('ssc-desi-shami-tikki', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Shami Tikki', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/aloo-palak.jpg.png' ),
  ('ssc-chai-special', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Special Chai', 80, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/chai.jpg.png' ),
  ('ssc-paratha-sada', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Sada Paratha', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/paratha.jpg.png' ),
  ('ssc-paratha-aloo', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Aloo Wala Paratha', 70, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/paratha.jpg.png' ),
  ('ssc-paratha-chicken', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Wala Paratha', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/paratha.jpg.png' ),
  ('ssc-paratha-chicken-cheese', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chicken Cheese Paratha', 300, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/paratha.jpg.png' ),
  ('ssc-egg-simple', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Simple Egg', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('ssc-egg-sandwich', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Egg Sandwich', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('ssc-chapal-sandwich', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chapal Sandwich', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('ssc-shami-sandwich', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Shami Sandwich', 140, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('ssc-egg-shami-sandwich', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Egg Shami Sandwich', 200, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('ssc-egg-chapal-sandwich', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Egg Chapal Sandwich', 220, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('ssc-chapal-kebab', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Chapal Kebab', 90, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('ssc-shami-kebab', '6aae1e41-cf24-421b-bf97-34e40001da63', 'Shami Kebab', 80, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chai-paratha-category.jpg.png' ),
  ('gssc-snacks-chicken-cheese-roll', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Chicken Cheese Roll', 80, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-malai-boti-samosa', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Malai Boti Samosa', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-aalo-samosa', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Aalo Samosa', 30, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-chicken-samosa', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Chicken Samosa', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-vegetable-roll', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Vegetable Roll', 30, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-ziger-samosa', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Ziger Samosa', 80, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-pizza-samosa', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Pizza Samosa', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-shawarma-roll', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Shawarma Roll', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-macaroni-samosa', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Macaroni Samosa', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-cheez-samosa', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Cheez Samosa', 70, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-snacks-seekh-kabab-roll', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Seekh Kabab Roll', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-meals-nugget', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Nugget', 30, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('gssc-meals-chicken-qeema', '1d2bef63-f1bc-4ba7-980e-547c93153716', 'Chicken Qeema', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('bhola-karahi-fresh-1kg', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Fresh Karahi 1kg with 8 Roti', 1349, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-karahi-half-kg', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Karahi Half kg with 4 Roti', 749, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-karahi-fresh-3-pao', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Fresh Karahi 3 Pao with 6 Roti', 999, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-desi-chicken-qorma', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Qorma', 199, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-desi-chicken-biryani', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Biryani', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-biryani.jpg.png' ),
  ('bhola-desi-chicken-shami-pulao', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Shami Pulao', 320, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-biryani.jpg.png' ),
  ('bhola-desi-sabit-masi', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Sabit Masi', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-desi-chicken-masi', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Masi', 299, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-desi-daal-chana', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Daal Chana', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('bhola-desi-chicken-daal-chana', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Daal Chana', 299, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-drink-banana-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Banana Shake', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/banana-shake.jpg' ),
  ('bhola-drink-mango-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Mango Shake', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mango-shake.jpg' ),
  ('bhola-drink-mango-juice', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Mango Juice', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mango-juice.jpg' ),
  ('bhola-drink-oreo-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Oreo Shake', 150, TRUE, '{"Small":150,"Large":180}'::jsonb, '[]'::jsonb, '/menu/oreo-shake.jpg' ),
  ('bhola-drink-coffee-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Coffee Shake', 170, TRUE, '{"Small":170,"Large":200}'::jsonb, '[]'::jsonb, '/menu/oreo-shake.jpg' ),
  ('bhola-drink-chocolate-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chocolate Shake', 150, TRUE, '{"Small":150,"Large":180}'::jsonb, '[]'::jsonb, '/menu/oreo-shake.jpg' ),
  ('bhola-drink-coffee-crunch-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Coffee Crunch Shake', 200, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/oreo-shake.jpg' ),
  ('bhola-drink-peach-juice', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Peach Juice', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/peach-juice.jpg' ),
  ('bhola-drink-peach-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Peach Shake', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/peach-shake.jpg' ),
  ('bhola-tang-orange', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Orange Tang', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mango-juice.jpg' ),
  ('bhola-tang-mango', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Mango Tang', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mango-juice.jpg' ),
  ('bhola-tang-pineapple', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Pineapple Tang', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/peach-juice.jpg' ),
  ('bhola-drink-lemon-soda', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Lemon Soda', 110, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-main-chicken-fresh-karahi-1kg', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Fresh Karahi', 1349, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-main-chicken-karahi-half', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Karahi', 749, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-main-chicken-fresh-karahi-3pao', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Fresh Karahi', 999, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-karahi.jpg.png' ),
  ('bhola-main-chicken-qorma', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Qorma', 199, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('bhola-main-chicken-biryani', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Biryani', 230, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-biryani.jpg.png' ),
  ('bhola-main-chicken-shami-pulao', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Shami Pulao', 320, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('bhola-main-sabit-masser', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Sabit Masser', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('bhola-main-chicken-masser', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Masser', 299, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('bhola-main-daal-chana', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Daal Chana', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('bhola-main-chicken-daal-chana', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chicken Daal Chana', 299, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/desi-food-category.jpg.png' ),
  ('bhola-juice-banana-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Banana Shake', 270, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-mango-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Mango Shake', 270, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-mango-juice', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Mango Juice', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-oreo-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Oreo Shake', 150, TRUE, '{"Small":150,"Large":180}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-coffee-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Coffee Shake', 170, TRUE, '{"Small":170,"Large":200}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-chocolate-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Chocolate Shake', 150, TRUE, '{"Small":150,"Large":180}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-coffee-crunch-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Coffee Crunch Shake', 200, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-peach-juice', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Peach Juice', 120, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-juice-peach-shake', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Peach Shake', 270, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-drink-orange-tang', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Orange Tang', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-drink-mango-tang', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Mango Tang', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('bhola-drink-pineapple-tang', 'e53aab5b-6700-4ba3-888f-01913f5d1d5b', 'Pineapple Tang', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/shakes-juices-category.jpg.png' ),
  ('annexe-shake-panga', '888c85d8-84a8-4da5-88f7-f63bfa8ba60f', 'Panga', 270, TRUE, '{"Mango":270,"Banana":270,"Khajoor":270,"Strawberry":270,"Coffee":270,"Chocolate":270}'::jsonb, '[]'::jsonb, '/menu/mango-shake.jpg' ),
  ('annexe-juice-falsa', '888c85d8-84a8-4da5-88f7-f63bfa8ba60f', 'Falsa Juice', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/falsa-juice.jpg' ),
  ('annexe-juice-aaro', '888c85d8-84a8-4da5-88f7-f63bfa8ba60f', 'Aaro Juice', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/mango-juice.jpg' ),
  ('hp-sandwich-omelette', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Omelette Sandwich', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/panini-sandwich.jpg' ),
  ('hp-sandwich-cheese', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Cheese Sandwich', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-sandwich.jpg' ),
  ('hp-sandwich-omelette-cheese', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Omelette Cheese Sandwich', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/club-sandwich.jpg' ),
  ('hp-sandwich-chicken', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Chicken Sandwich', 150, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/chicken-sandwich.jpg' ),
  ('hp-sandwich-chicken-cheese', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Chicken Cheese Sandwich', 200, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/club-sandwich.jpg' ),
  ('hp-tea-karak', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Karak Chai', 70, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/chai.jpg.png' ),
  ('hp-tea-masala', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Masala Chai', 70, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/chai.jpg.png' ),
  ('hp-tea-cardimum', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Elaichi Chai', 80, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/chai.jpg.png' ),
  ('hp-greentea-pure', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Pure Green Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-greentea-strawberry', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Strawberry Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-greentea-jasmine', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Jasmine Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-greentea-tropical-peach', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Tropical Peach Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-greentea-lemongrass', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Lemon Grass Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-greentea-honey-ginger', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Honey Ginger Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-greentea-cardium', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Cardamom Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-greentea-mint', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Mint Tea', 60, TRUE, '{}'::jsonb, '[]'::jsonb, '/images/jasmine-tea.jpg.png' ),
  ('hp-regular-fries', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Regular Fries', 100, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/small-fries.jpg' ),
  ('hp-malai-boti-samosa', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Malai Boti Samosa', 50, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/gssc-menu.png' ),
  ('hp-nuggets-piece', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Nuggets (Per Piece)', 40, TRUE, '{}'::jsonb, '[]'::jsonb, '/menu/6-pcs-nuggets.jpg' ),
  ('hp-masala-smoky-bbq', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Smoky BBQ Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-peri-peri', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Peri Peri Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-chicken-achari', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Chicken Achari Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-tikka', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Tikka Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-zesty-lemon', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Zesty Lemon Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-black-pepper', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Black Pepper Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-fajita', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Fajita Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-tandoori', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Tandoori Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-masala-yellow-blaze', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Yellow Blaze Fries', 150, TRUE, '{"Small":150,"Large":200}'::jsonb, '[]'::jsonb, '/menu/large-fries.jpg' ),
  ('hp-loaded-pizza', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Pizza Fries', 450, TRUE, '{"Small":450,"Large":550}'::jsonb, '[]'::jsonb, '/menu/large-loaded-pasta.jpg' ),
  ('hp-loaded-chicken', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Chicken Fries', 300, TRUE, '{"Small":300,"Large":400}'::jsonb, '[]'::jsonb, '/menu/large-loaded-pasta.jpg' ),
  ('hp-loaded-cheese', '9404c1b0-00ba-4545-9728-9f2cd6eb10f8', 'Cheese Fries', 300, TRUE, '{"Small":300,"Large":400}'::jsonb, '[]'::jsonb, '/menu/mayo-fries.jpg' );

DO $$
DECLARE
  v_wrong_canteens TEXT;
  v_preserved_differences TEXT;
  v_legacy_matches TEXT;
BEGIN
  SELECT string_agg(
    format(
      '%s has canteen_id=%s; expected %s',
      existing.catalogue_key,
      existing.canteen_id,
      seed.canteen_id
    ),
    E'\n'
  )
  INTO v_wrong_canteens
  FROM public.menu_items existing
  JOIN unieats_checkout_menu_seed seed
    ON seed.catalogue_key = existing.catalogue_key
  WHERE existing.canteen_id IS DISTINCT FROM seed.canteen_id;

  IF v_wrong_canteens IS NOT NULL THEN
    RAISE EXCEPTION
      'Checkout menu seed blocked: existing catalogue keys are assigned to a different canteen. No rows were changed; review these mappings:% %',
      E'\n',
      v_wrong_canteens;
  END IF;

  SELECT string_agg(
    format(
      '%s: stored name=%s, price=%s, available=%s, sizes=%s, add_ons=%s, image_url=%s; official seed values will not overwrite them',
      existing.catalogue_key,
      existing.name,
      existing.price,
      existing.available,
      existing.sizes,
      existing.add_ons,
      existing.image_url
    ),
    E'\n'
  )
  INTO v_preserved_differences
  FROM public.menu_items existing
  JOIN unieats_checkout_menu_seed seed
    ON seed.catalogue_key = existing.catalogue_key
  WHERE existing.name IS DISTINCT FROM seed.name
     OR existing.price IS DISTINCT FROM seed.price
     OR existing.available IS DISTINCT FROM seed.available
     OR existing.sizes IS DISTINCT FROM seed.sizes
     OR existing.add_ons IS DISTINCT FROM seed.add_ons
     OR existing.image_url IS DISTINCT FROM seed.image_url;

  IF v_preserved_differences IS NOT NULL THEN
    RAISE NOTICE
      'Existing owner-managed menu values differ from the official seed and will be preserved:% %',
      E'\n',
      v_preserved_differences;
  END IF;

  SELECT string_agg(
    format(
      '%s / %s (menu_items.id=%s; candidate catalogue keys: %s)',
      canteen.name,
      legacy.name,
      legacy.id,
      coalesce(legacy.catalogue_key, '<NULL>') || ' vs ' || candidates.catalogue_keys
    ),
    E'\n'
  )
  INTO v_legacy_matches
  FROM public.menu_items legacy
  JOIN public.canteens canteen ON canteen.id = legacy.canteen_id
  JOIN LATERAL (
    SELECT
      string_agg(seed.catalogue_key, ', ' ORDER BY seed.catalogue_key) AS catalogue_keys,
      bool_or(seed.catalogue_key = legacy.catalogue_key) AS key_matches
    FROM unieats_checkout_menu_seed seed
    WHERE seed.canteen_id = legacy.canteen_id
      AND lower(btrim(seed.name)) = lower(btrim(legacy.name))
  ) candidates ON candidates.catalogue_keys IS NOT NULL
  WHERE legacy.catalogue_key IS NULL
     OR candidates.key_matches IS NOT TRUE;

  IF v_legacy_matches IS NOT NULL THEN
    RAISE EXCEPTION
      'Checkout menu seed blocked by possible legacy menu rows with a NULL or different catalogue_key. No rows were merged. Review these rows and explicitly map or retain them before retrying:% %',
      E'\n',
      v_legacy_matches;
  END IF;
END;
$$;

-- Insert missing canonical rows only. Existing catalogue rows retain every
-- owner-managed field; an official price change must be reviewed and applied
-- separately rather than being silently reset by this rerunnable seed.
INSERT INTO public.menu_items (
  catalogue_key,
  canteen_id,
  name,
  price,
  available,
  sizes,
  add_ons,
  image_url
)
SELECT
  catalogue_key,
  canteen_id,
  name,
  price,
  available,
  sizes,
  add_ons,
  image_url
FROM unieats_checkout_menu_seed
ON CONFLICT (catalogue_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.checkout_idempotency (
  checkout_key UUID PRIMARY KEY,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.checkout_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.checkout_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.checkout_idempotency TO service_role;

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
  v_canteen_slug TEXT;
  v_entry JSONB;
  v_menu public.menu_items%ROWTYPE;
  v_option JSONB;
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
  v_item_name TEXT;
  v_labels TEXT[];
  v_insert_items JSONB;
  v_receipt_items JSONB;
  v_receipt_orders JSONB := '[]'::jsonb;
  v_line JSONB;
  v_order_id UUID;
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
      p_delivery_location IS NULL OR length(btrim(p_delivery_location)) NOT BETWEEN 1 AND 200
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
      OR coalesce(e.item->>'canteen_id', '') NOT IN (
        '888c85d8-84a8-4da5-88f7-f63bfa8ba60f',
        'e53aab5b-6700-4ba3-888f-01913f5d1d5b',
        '1d2bef63-f1bc-4ba7-980e-547c93153716',
        '9404c1b0-00ba-4545-9728-9f2cd6eb10f8',
        '6aae1e41-cf24-421b-bf97-34e40001da63'
      )
      OR CASE
        WHEN coalesce(e.item->>'quantity', '') ~ '^[0-9]{1,2}$'
          THEN (e.item->>'quantity')::integer NOT BETWEEN 1 AND 20
        ELSE TRUE
      END
      OR (e.item->'size' IS NOT NULL AND jsonb_typeof(e.item->'size') NOT IN ('string', 'null'))
      OR length(coalesce(e.item->>'size', '')) > 80
      OR jsonb_array_length(coalesce(e.item->'add_on_names', '[]'::jsonb)) > 10
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  IF EXISTS (
    SELECT e.item->>'client_line_id'
    FROM jsonb_array_elements(p_items) AS e(item)
    GROUP BY e.item->>'client_line_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  SELECT count(DISTINCT e.item->>'canteen_id') INTO v_canteen_count
  FROM jsonb_array_elements(p_items) AS e(item);
  IF v_canteen_count < 1 OR v_canteen_count > 5 THEN
    RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';
  END IF;

  INSERT INTO public.checkout_idempotency (checkout_key, request_hash)
  VALUES (p_checkout_key, p_request_hash)
  ON CONFLICT (checkout_key) DO NOTHING;

  SELECT request_hash, result
  INTO v_existing_hash, v_existing_result
  FROM public.checkout_idempotency
  WHERE checkout_key = p_checkout_key
  FOR UPDATE;

  IF v_existing_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION 'CHECKOUT_KEY_REUSED';
  END IF;
  IF v_existing_result IS NOT NULL THEN
    RETURN v_existing_result;
  END IF;

  FOR v_canteen_text IN
    SELECT DISTINCT e.item->>'canteen_id'
    FROM jsonb_array_elements(p_items) AS e(item)
    ORDER BY e.item->>'canteen_id'
  LOOP
    v_canteen_id := v_canteen_text::uuid;

    SELECT c.name
    INTO v_canteen_name
    FROM public.canteens AS c
    WHERE c.id = v_canteen_id
      AND c.is_open IS TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CHECKOUT_CANTEEN_CLOSED';
    END IF;

    v_canteen_slug := CASE v_canteen_id
      WHEN '888c85d8-84a8-4da5-88f7-f63bfa8ba60f'::uuid THEN 'annexe'
      WHEN 'e53aab5b-6700-4ba3-888f-01913f5d1d5b'::uuid THEN 'bhola'
      WHEN '1d2bef63-f1bc-4ba7-980e-547c93153716'::uuid THEN 'gssc'
      WHEN '9404c1b0-00ba-4545-9728-9f2cd6eb10f8'::uuid THEN 'hot-potato'
      WHEN '6aae1e41-cf24-421b-bf97-34e40001da63'::uuid THEN 'ssc'
    END;

    v_group_subtotal := 0;
    v_insert_items := '[]'::jsonb;

    FOR v_entry IN
      SELECT e.item
      FROM jsonb_array_elements(p_items) AS e(item)
      WHERE e.item->>'canteen_id' = v_canteen_id::text
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

      v_add_on_total := 0;
      v_add_ons := coalesce(v_menu.add_ons, '[]'::jsonb);
      IF jsonb_typeof(v_add_ons) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
      END IF;

      FOR v_add_on IN
        SELECT selected.value
        FROM jsonb_array_elements(coalesce(v_entry->'add_on_names', '[]'::jsonb))
          AS selected(value)
      LOOP
        IF jsonb_typeof(v_add_on) IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
        END IF;
        v_add_on_name := v_add_on #>> '{}';
        SELECT option.value
        INTO v_option
        FROM jsonb_array_elements(v_add_ons) AS option(value)
        WHERE option.value->>'name' = v_add_on_name
          AND jsonb_typeof(option.value->'price') = 'number'
        LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
        END IF;
        v_add_on_price := (v_option->>'price')::numeric;
        IF v_add_on_price < 0 THEN
          RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
        END IF;
        v_add_on_total := v_add_on_total + v_add_on_price;
      END LOOP;

      v_unit_price := v_base_price + v_add_on_total;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';
      END IF;
      v_quantity := (v_entry->>'quantity')::integer;
      v_line_subtotal := v_unit_price * v_quantity;
      v_labels := ARRAY[]::text[];
      IF v_size IS NOT NULL THEN
        v_labels := array_append(v_labels, v_size);
      END IF;
      FOR v_add_on IN
        SELECT selected.value
        FROM jsonb_array_elements(coalesce(v_entry->'add_on_names', '[]'::jsonb))
          AS selected(value)
      LOOP
        v_labels := array_append(v_labels, (v_add_on #>> '{}') || ' topping');
      END LOOP;
      v_item_name := v_menu.name;
      IF cardinality(v_labels) > 0 THEN
        v_item_name := v_item_name || ' (' || array_to_string(v_labels, ', ') || ')';
      END IF;

      v_group_subtotal := v_group_subtotal + v_line_subtotal;
      v_insert_items := v_insert_items || jsonb_build_array(jsonb_build_object(
        'menu_item_id', v_menu.id,
        'client_line_id', v_entry->>'client_line_id',
        'item_name', v_item_name,
        'quantity', v_quantity,
        'unit_price', v_unit_price,
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
    RETURNING id, created_at INTO v_order_id, v_created_at;

    v_receipt_items := '[]'::jsonb;
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_insert_items)
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
        (v_line->>'menu_item_id')::uuid,
        v_line->>'item_name',
        (v_line->>'quantity')::integer,
        (v_line->>'unit_price')::numeric,
        (v_line->>'subtotal')::numeric
      );

      v_receipt_items := v_receipt_items || jsonb_build_array(jsonb_build_object(
        'clientLineId', v_line->>'client_line_id',
        'itemName', v_line->>'item_name',
        'quantity', (v_line->>'quantity')::integer,
        'unitPrice', (v_line->>'unit_price')::numeric,
        'subtotal', (v_line->>'subtotal')::numeric
      ));
    END LOOP;

    v_receipt_orders := v_receipt_orders || jsonb_build_array(jsonb_build_object(
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
    ));
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

-- RLS and policy structure were validated before any data changes. This
-- migration intentionally does not enable RLS or rewrite staff policies.

REVOKE ALL ON TABLE public.orders, public.order_items FROM PUBLIC, anon;
REVOKE INSERT ON TABLE public.orders, public.order_items FROM authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT SELECT, DELETE ON TABLE public.order_items TO authenticated;

DROP POLICY IF EXISTS orders_checkout_insert ON public.orders;
DROP POLICY IF EXISTS order_items_checkout_insert ON public.order_items;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.menu_items
  FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.menu_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;

-- Table-level REVOKE does not remove column-level ACLs. Clear any such public
-- or anon grants, and clear authenticated column-level INSERT grants so the
-- only student order-write path is the service-role RPC.
DO $$
DECLARE
  v_grant RECORD;
  v_grantee TEXT;
BEGIN
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

END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
