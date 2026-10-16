-- Insert-only seed for the official frontend student menu catalogue.
-- Apply after 20261015004000_add_canteen_slugs.sql and before
-- 20261015010000_student_checkout_rpc.sql.
-- Existing menu rows are never updated; a mismatched catalogue key aborts.
BEGIN;

DO $preflight$
DECLARE
  v_bad_canteens TEXT;
  v_duplicate_keys TEXT;
  v_bad_columns TEXT;
BEGIN
  IF to_regclass('public.canteens') IS NULL
    OR to_regclass('public.menu_items') IS NULL
  THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: public.canteens and public.menu_items must exist.';
  END IF;

  LOCK TABLE public.canteens IN SHARE MODE;
  LOCK TABLE public.menu_items IN SHARE ROW EXCLUSIVE MODE;

  SELECT string_agg(issues.message, '; ')
  INTO v_bad_canteens
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

  IF v_bad_canteens IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: missing, mismatched, or ambiguous canteen mapping(s): %',
      v_bad_canteens;
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO v_bad_columns
  FROM (VALUES
    ('canteens', 'id', 'uuid', 'uuid'),
    ('canteens', 'name', 'text', 'text'),
    ('canteens', 'slug', 'text', 'text'),
    ('menu_items', 'id', 'uuid', 'uuid'),
    ('menu_items', 'catalogue_key', 'text', 'text'),
    ('menu_items', 'canteen_id', 'uuid', 'uuid'),
    ('menu_items', 'name', 'text', 'text'),
    ('menu_items', 'price', NULL, NULL),
    ('menu_items', 'available', 'boolean', 'bool'),
    ('menu_items', 'sizes', 'jsonb', 'jsonb'),
    ('menu_items', 'add_ons', 'jsonb', 'jsonb')
  ) AS required(table_name, column_name, data_type, udt_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = required.table_name
   AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL
     OR (required.data_type IS NOT NULL AND actual.data_type <> required.data_type)
     OR (required.udt_name IS NOT NULL AND actual.udt_name <> required.udt_name)
     OR (required.table_name = 'menu_items'
       AND required.column_name = 'price'
       AND actual.data_type NOT IN (
         'numeric', 'integer', 'bigint', 'real', 'double precision'
       ));

  IF v_bad_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: required columns are missing or have incompatible types: %.',
      v_bad_columns;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'menu_items'
      AND column_info.column_name = 'image_url'
      AND column_info.data_type NOT IN ('text', 'character varying', 'character')
  ) THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: menu_items.image_url exists with an unsupported type.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'menu_items'
      AND column_info.column_name = 'id'
      AND column_info.is_nullable = 'NO'
      AND column_info.column_default IS NULL
      AND column_info.is_identity = 'NO'
      AND column_info.is_generated = 'NEVER'
  ) THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: menu_items.id is required but has no database default.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'menu_items'
      AND column_info.is_nullable = 'NO'
      AND column_info.column_name NOT IN (
        'id', 'catalogue_key', 'canteen_id', 'name', 'price',
        'available', 'sizes', 'add_ons', 'image_url'
      )
      AND column_info.column_default IS NULL
      AND column_info.is_identity = 'NO'
      AND column_info.is_generated = 'NEVER'
  ) THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: menu_items has an additional required column not populated by the canonical seed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS fk
    WHERE fk.contype = 'f'
      AND fk.conrelid = 'public.menu_items'::regclass
      AND fk.confrelid = 'public.canteens'::regclass
      AND fk.conkey = ARRAY[(
        SELECT attribute.attnum
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.menu_items'::regclass
          AND attribute.attname = 'canteen_id'
          AND NOT attribute.attisdropped
      )]::smallint[]
      AND fk.confkey = ARRAY[(
        SELECT attribute.attnum
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.canteens'::regclass
          AND attribute.attname = 'id'
          AND NOT attribute.attisdropped
      )]::smallint[]
  ) THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: menu_items.canteen_id must reference canteens.id.';
  END IF;

  SELECT string_agg(format('%s x%s', catalogue_key, item_count), ', ')
  INTO v_duplicate_keys
  FROM (
    SELECT catalogue_key, count(*) AS item_count
    FROM public.menu_items
    WHERE catalogue_key IS NOT NULL
    GROUP BY catalogue_key
    HAVING count(*) > 1
  ) AS duplicates;

  IF v_duplicate_keys IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: duplicate existing catalogue keys must be reconciled before adding the required unique index: %',
      v_duplicate_keys;
  END IF;
END;
$preflight$;

CREATE TEMP TABLE unieats_student_canteen_map (
  canteen_id UUID PRIMARY KEY,
  canteen_slug TEXT NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO unieats_student_canteen_map (canteen_id, canteen_slug)
SELECT actual.id, actual.slug
FROM public.canteens AS actual
WHERE actual.slug IN ('annexe', 'bhola', 'gssc', 'hot-potato', 'ssc');

CREATE TEMP TABLE unieats_student_menu_source (
  catalogue_key TEXT PRIMARY KEY,
  canteen_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  available BOOLEAN NOT NULL,
  sizes JSONB NOT NULL,
  add_ons JSONB NOT NULL,
  image_url TEXT
) ON COMMIT DROP;

INSERT INTO unieats_student_menu_source (
  catalogue_key,
  canteen_slug,
  name,
  price,
  available,
  sizes,
  add_ons,
  image_url
)
SELECT
  seed.catalogue_key,
  seed.canteen_slug,
  seed.name,
  seed.price,
  seed.available,
  seed.sizes,
  seed.add_ons,
  seed.image_url
FROM jsonb_to_recordset(
$catalogue$
[
  {
    "catalogue_key": "annexe-juice-aaro",
    "canteen_slug": "annexe",
    "name": "Aaro Juice",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mango-juice.jpg"
  },
  {
    "catalogue_key": "annexe-juice-falsa",
    "canteen_slug": "annexe",
    "name": "Falsa Juice",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/falsa-juice.jpg"
  },
  {
    "catalogue_key": "annexe-shake-panga",
    "canteen_slug": "annexe",
    "name": "Panga",
    "price": 270,
    "available": true,
    "sizes": {
      "Mango": 270,
      "Banana": 270,
      "Khajoor": 270,
      "Strawberry": 270,
      "Coffee": 270,
      "Chocolate": 270
    },
    "add_ons": [],
    "image_url": "/menu/mango-shake.jpg"
  },
  {
    "catalogue_key": "bhola-desi-chicken-biryani",
    "canteen_slug": "bhola",
    "name": "Chicken Biryani",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-biryani.jpg.png"
  },
  {
    "catalogue_key": "bhola-desi-chicken-daal-chana",
    "canteen_slug": "bhola",
    "name": "Chicken Daal Chana",
    "price": 299,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-desi-chicken-masi",
    "canteen_slug": "bhola",
    "name": "Chicken Masi",
    "price": 299,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-desi-chicken-qorma",
    "canteen_slug": "bhola",
    "name": "Chicken Qorma",
    "price": 199,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-desi-chicken-shami-pulao",
    "canteen_slug": "bhola",
    "name": "Chicken Shami Pulao",
    "price": 320,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-biryani.jpg.png"
  },
  {
    "catalogue_key": "bhola-desi-daal-chana",
    "canteen_slug": "bhola",
    "name": "Daal Chana",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-desi-sabit-masi",
    "canteen_slug": "bhola",
    "name": "Sabit Masi",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-drink-banana-shake",
    "canteen_slug": "bhola",
    "name": "Banana Shake",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/banana-shake.jpg"
  },
  {
    "catalogue_key": "bhola-drink-chocolate-shake",
    "canteen_slug": "bhola",
    "name": "Chocolate Shake",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 180
    },
    "add_ons": [],
    "image_url": "/menu/oreo-shake.jpg"
  },
  {
    "catalogue_key": "bhola-drink-coffee-crunch-shake",
    "canteen_slug": "bhola",
    "name": "Coffee Crunch Shake",
    "price": 200,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/oreo-shake.jpg"
  },
  {
    "catalogue_key": "bhola-drink-coffee-shake",
    "canteen_slug": "bhola",
    "name": "Coffee Shake",
    "price": 170,
    "available": true,
    "sizes": {
      "Small": 170,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/oreo-shake.jpg"
  },
  {
    "catalogue_key": "bhola-drink-lemon-soda",
    "canteen_slug": "bhola",
    "name": "Lemon Soda",
    "price": 110,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/grapes-juice.jpg"
  },
  {
    "catalogue_key": "bhola-drink-lemon-soda-fizzy",
    "canteen_slug": "bhola",
    "name": "Lemon Soda",
    "price": 110,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-drink-mango-juice",
    "canteen_slug": "bhola",
    "name": "Mango Juice",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mango-juice.jpg"
  },
  {
    "catalogue_key": "bhola-drink-mango-shake",
    "canteen_slug": "bhola",
    "name": "Mango Shake",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mango-shake.jpg"
  },
  {
    "catalogue_key": "bhola-drink-mango-tang",
    "canteen_slug": "bhola",
    "name": "Mango Tang",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-drink-orange-tang",
    "canteen_slug": "bhola",
    "name": "Orange Tang",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-drink-oreo-shake",
    "canteen_slug": "bhola",
    "name": "Oreo Shake",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 180
    },
    "add_ons": [],
    "image_url": "/menu/oreo-shake.jpg"
  },
  {
    "catalogue_key": "bhola-drink-peach-juice",
    "canteen_slug": "bhola",
    "name": "Peach Juice",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/peach-juice.jpg"
  },
  {
    "catalogue_key": "bhola-drink-peach-shake",
    "canteen_slug": "bhola",
    "name": "Peach Shake",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/peach-shake.jpg"
  },
  {
    "catalogue_key": "bhola-drink-pineapple-tang",
    "canteen_slug": "bhola",
    "name": "Pineapple Tang",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-banana-shake",
    "canteen_slug": "bhola",
    "name": "Banana Shake",
    "price": 270,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-chocolate-shake",
    "canteen_slug": "bhola",
    "name": "Chocolate Shake",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 180
    },
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-coffee-crunch-shake",
    "canteen_slug": "bhola",
    "name": "Coffee Crunch Shake",
    "price": 200,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-coffee-shake",
    "canteen_slug": "bhola",
    "name": "Coffee Shake",
    "price": 170,
    "available": true,
    "sizes": {
      "Small": 170,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-mango-juice",
    "canteen_slug": "bhola",
    "name": "Mango Juice",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-mango-shake",
    "canteen_slug": "bhola",
    "name": "Mango Shake",
    "price": 270,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-oreo-shake",
    "canteen_slug": "bhola",
    "name": "Oreo Shake",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 180
    },
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-peach-juice",
    "canteen_slug": "bhola",
    "name": "Peach Juice",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-juice-peach-shake",
    "canteen_slug": "bhola",
    "name": "Peach Shake",
    "price": 270,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shakes-juices-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-karahi-fresh-1kg",
    "canteen_slug": "bhola",
    "name": "Chicken Fresh Karahi 1kg with 8 Roti",
    "price": 1349,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-karahi-fresh-3-pao",
    "canteen_slug": "bhola",
    "name": "Chicken Fresh Karahi 3 Pao with 6 Roti",
    "price": 999,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-karahi-half-kg",
    "canteen_slug": "bhola",
    "name": "Chicken Karahi Half kg with 4 Roti",
    "price": 749,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-biryani",
    "canteen_slug": "bhola",
    "name": "Chicken Biryani",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-biryani.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-daal-chana",
    "canteen_slug": "bhola",
    "name": "Chicken Daal Chana",
    "price": 299,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-fresh-karahi-1kg",
    "canteen_slug": "bhola",
    "name": "Chicken Fresh Karahi",
    "price": 1349,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-fresh-karahi-3pao",
    "canteen_slug": "bhola",
    "name": "Chicken Fresh Karahi",
    "price": 999,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-karahi-half",
    "canteen_slug": "bhola",
    "name": "Chicken Karahi",
    "price": 749,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-masser",
    "canteen_slug": "bhola",
    "name": "Chicken Masser",
    "price": 299,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-qorma",
    "canteen_slug": "bhola",
    "name": "Chicken Qorma",
    "price": 199,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-chicken-shami-pulao",
    "canteen_slug": "bhola",
    "name": "Chicken Shami Pulao",
    "price": 320,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-daal-chana",
    "canteen_slug": "bhola",
    "name": "Daal Chana",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-main-sabit-masser",
    "canteen_slug": "bhola",
    "name": "Sabit Masser",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "bhola-tang-mango",
    "canteen_slug": "bhola",
    "name": "Mango Tang",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mango-juice.jpg"
  },
  {
    "catalogue_key": "bhola-tang-orange",
    "canteen_slug": "bhola",
    "name": "Orange Tang",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mango-juice.jpg"
  },
  {
    "catalogue_key": "bhola-tang-pineapple",
    "canteen_slug": "bhola",
    "name": "Pineapple Tang",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/peach-juice.jpg"
  },
  {
    "catalogue_key": "gssc-meals-chicken-qeema",
    "canteen_slug": "gssc",
    "name": "Chicken Qeema",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-meals-nugget",
    "canteen_slug": "gssc",
    "name": "Nugget",
    "price": 30,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-aalo-samosa",
    "canteen_slug": "gssc",
    "name": "Aalo Samosa",
    "price": 30,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-cheez-samosa",
    "canteen_slug": "gssc",
    "name": "Cheez Samosa",
    "price": 70,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-chicken-cheese-roll",
    "canteen_slug": "gssc",
    "name": "Chicken Cheese Roll",
    "price": 80,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-chicken-samosa",
    "canteen_slug": "gssc",
    "name": "Chicken Samosa",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-macaroni-samosa",
    "canteen_slug": "gssc",
    "name": "Macaroni Samosa",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-malai-boti-samosa",
    "canteen_slug": "gssc",
    "name": "Malai Boti Samosa",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-pizza-samosa",
    "canteen_slug": "gssc",
    "name": "Pizza Samosa",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-seekh-kabab-roll",
    "canteen_slug": "gssc",
    "name": "Seekh Kabab Roll",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-shawarma-roll",
    "canteen_slug": "gssc",
    "name": "Shawarma Roll",
    "price": 120,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-vegetable-roll",
    "canteen_slug": "gssc",
    "name": "Vegetable Roll",
    "price": 30,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "gssc-snacks-ziger-samosa",
    "canteen_slug": "gssc",
    "name": "Ziger Samosa",
    "price": 80,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "hp-greentea-cardium",
    "canteen_slug": "hot-potato",
    "name": "Cardamom Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-greentea-honey-ginger",
    "canteen_slug": "hot-potato",
    "name": "Honey Ginger Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-greentea-jasmine",
    "canteen_slug": "hot-potato",
    "name": "Jasmine Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-greentea-lemongrass",
    "canteen_slug": "hot-potato",
    "name": "Lemon Grass Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-greentea-mint",
    "canteen_slug": "hot-potato",
    "name": "Mint Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-greentea-pure",
    "canteen_slug": "hot-potato",
    "name": "Pure Green Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-greentea-strawberry",
    "canteen_slug": "hot-potato",
    "name": "Strawberry Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-greentea-tropical-peach",
    "canteen_slug": "hot-potato",
    "name": "Tropical Peach Tea",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/jasmine-tea.jpg.png"
  },
  {
    "catalogue_key": "hp-loaded-cheese",
    "canteen_slug": "hot-potato",
    "name": "Cheese Fries",
    "price": 300,
    "available": true,
    "sizes": {
      "Small": 300,
      "Large": 400
    },
    "add_ons": [],
    "image_url": "/menu/mayo-fries.jpg"
  },
  {
    "catalogue_key": "hp-loaded-chicken",
    "canteen_slug": "hot-potato",
    "name": "Chicken Fries",
    "price": 300,
    "available": true,
    "sizes": {
      "Small": 300,
      "Large": 400
    },
    "add_ons": [],
    "image_url": "/menu/large-loaded-pasta.jpg"
  },
  {
    "catalogue_key": "hp-loaded-pizza",
    "canteen_slug": "hot-potato",
    "name": "Pizza Fries",
    "price": 450,
    "available": true,
    "sizes": {
      "Small": 450,
      "Large": 550
    },
    "add_ons": [],
    "image_url": "/menu/large-loaded-pasta.jpg"
  },
  {
    "catalogue_key": "hp-malai-boti-samosa",
    "canteen_slug": "hot-potato",
    "name": "Malai Boti Samosa",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/gssc-menu.png"
  },
  {
    "catalogue_key": "hp-masala-black-pepper",
    "canteen_slug": "hot-potato",
    "name": "Black Pepper Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-chicken-achari",
    "canteen_slug": "hot-potato",
    "name": "Chicken Achari Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-fajita",
    "canteen_slug": "hot-potato",
    "name": "Fajita Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-peri-peri",
    "canteen_slug": "hot-potato",
    "name": "Peri Peri Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-smoky-bbq",
    "canteen_slug": "hot-potato",
    "name": "Smoky BBQ Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-tandoori",
    "canteen_slug": "hot-potato",
    "name": "Tandoori Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-tikka",
    "canteen_slug": "hot-potato",
    "name": "Tikka Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-yellow-blaze",
    "canteen_slug": "hot-potato",
    "name": "Yellow Blaze Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-masala-zesty-lemon",
    "canteen_slug": "hot-potato",
    "name": "Zesty Lemon Fries",
    "price": 150,
    "available": true,
    "sizes": {
      "Small": 150,
      "Large": 200
    },
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "hp-nuggets-piece",
    "canteen_slug": "hot-potato",
    "name": "Nuggets (Per Piece)",
    "price": 40,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/6-pcs-nuggets.jpg"
  },
  {
    "catalogue_key": "hp-regular-fries",
    "canteen_slug": "hot-potato",
    "name": "Regular Fries",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/small-fries.jpg"
  },
  {
    "catalogue_key": "hp-sandwich-cheese",
    "canteen_slug": "hot-potato",
    "name": "Cheese Sandwich",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-sandwich.jpg"
  },
  {
    "catalogue_key": "hp-sandwich-chicken",
    "canteen_slug": "hot-potato",
    "name": "Chicken Sandwich",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-sandwich.jpg"
  },
  {
    "catalogue_key": "hp-sandwich-chicken-cheese",
    "canteen_slug": "hot-potato",
    "name": "Chicken Cheese Sandwich",
    "price": 200,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/club-sandwich.jpg"
  },
  {
    "catalogue_key": "hp-sandwich-omelette",
    "canteen_slug": "hot-potato",
    "name": "Omelette Sandwich",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/panini-sandwich.jpg"
  },
  {
    "catalogue_key": "hp-sandwich-omelette-cheese",
    "canteen_slug": "hot-potato",
    "name": "Omelette Cheese Sandwich",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/club-sandwich.jpg"
  },
  {
    "catalogue_key": "hp-tea-cardimum",
    "canteen_slug": "hot-potato",
    "name": "Elaichi Chai",
    "price": 80,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/chai.jpg.png"
  },
  {
    "catalogue_key": "hp-tea-karak",
    "canteen_slug": "hot-potato",
    "name": "Karak Chai",
    "price": 70,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/chai.jpg.png"
  },
  {
    "catalogue_key": "hp-tea-masala",
    "canteen_slug": "hot-potato",
    "name": "Masala Chai",
    "price": 70,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/chai.jpg.png"
  },
  {
    "catalogue_key": "ssc-chai-special",
    "canteen_slug": "ssc",
    "name": "Special Chai",
    "price": 80,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/chai.jpg.png"
  },
  {
    "catalogue_key": "ssc-chapal-kebab",
    "canteen_slug": "ssc",
    "name": "Chapal Kebab",
    "price": 90,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-chapal-sandwich",
    "canteen_slug": "ssc",
    "name": "Chapal Sandwich",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-aloo-keema",
    "canteen_slug": "ssc",
    "name": "Aloo Keema",
    "price": 200,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-aloo-palak",
    "canteen_slug": "ssc",
    "name": "Aloo Palak",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-bhindi-gosht",
    "canteen_slug": "ssc",
    "name": "Bhindi Gosht",
    "price": 190,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-biryani-plate",
    "canteen_slug": "ssc",
    "name": "Chicken Biryani",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-biryani.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-chicken-haleem",
    "canteen_slug": "ssc",
    "name": "Chicken Haleem",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-chicken-kabab",
    "canteen_slug": "ssc",
    "name": "Chicken Kabab",
    "price": 200,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/channay.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-chicken-kaleji",
    "canteen_slug": "ssc",
    "name": "Chicken Kaleji",
    "price": 190,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-chicken-kofta",
    "canteen_slug": "ssc",
    "name": "Chicken Kofta",
    "price": 200,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/channay.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-chicken-palak",
    "canteen_slug": "ssc",
    "name": "Chicken Palak",
    "price": 190,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-chicken-pulao",
    "canteen_slug": "ssc",
    "name": "Chicken Pulao",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/chicken-pulao.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-chicken-sabzi",
    "canteen_slug": "ssc",
    "name": "Chicken Sabzi",
    "price": 190,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-daal-chawal",
    "canteen_slug": "ssc",
    "name": "Daal Chawal",
    "price": 170,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/daal-chawal.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-daal-mash",
    "canteen_slug": "ssc",
    "name": "Special Daal Mash",
    "price": 160,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-haleem-chawal",
    "canteen_slug": "ssc",
    "name": "Haleem Chawal",
    "price": 160,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/daal-chawal.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-karahi",
    "canteen_slug": "ssc",
    "name": "Chicken Karahi",
    "price": 220,
    "available": true,
    "sizes": {
      "One Plate": 220,
      "Half": 650,
      "Full": 1300
    },
    "add_ons": [],
    "image_url": "/menu/chicken-karahi.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-karri-pakora",
    "canteen_slug": "ssc",
    "name": "Karri Pakora",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-kofta-channay",
    "canteen_slug": "ssc",
    "name": "Kofta Channay",
    "price": 190,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/channay.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-murgh-channay",
    "canteen_slug": "ssc",
    "name": "Murgh Channay",
    "price": 190,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/channay.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-sabzi-sada",
    "canteen_slug": "ssc",
    "name": "Sabzi Sada",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-shahi-daal",
    "canteen_slug": "ssc",
    "name": "Shahi Daal",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/desi-food-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-shami-tikki",
    "canteen_slug": "ssc",
    "name": "Shami Tikki",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/aloo-palak.jpg.png"
  },
  {
    "catalogue_key": "ssc-desi-sufaid-channay",
    "canteen_slug": "ssc",
    "name": "Sufaid Channay",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/channay.jpg.png"
  },
  {
    "catalogue_key": "ssc-egg-chapal-sandwich",
    "canteen_slug": "ssc",
    "name": "Egg Chapal Sandwich",
    "price": 220,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-egg-sandwich",
    "canteen_slug": "ssc",
    "name": "Egg Sandwich",
    "price": 100,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-egg-shami-sandwich",
    "canteen_slug": "ssc",
    "name": "Egg Shami Sandwich",
    "price": 200,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-egg-simple",
    "canteen_slug": "ssc",
    "name": "Simple Egg",
    "price": 50,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-boti-burger",
    "canteen_slug": "ssc",
    "name": "Boti Burger",
    "price": 180,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/boti-burger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-chicken-burger",
    "canteen_slug": "ssc",
    "name": "Chicken Burger",
    "price": 180,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-burger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-chicken-piece",
    "canteen_slug": "ssc",
    "name": "1 Chicken Piece",
    "price": 180,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-chicken-piece.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-chicken-sandwich",
    "canteen_slug": "ssc",
    "name": "Chicken Sandwich",
    "price": 180,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chicken-sandwich.jpg"
  },
  {
    "catalogue_key": "ssc-fast-club-sandwich",
    "canteen_slug": "ssc",
    "name": "Club Sandwich",
    "price": 250,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/club-sandwich.jpg"
  },
  {
    "catalogue_key": "ssc-fast-deal-1",
    "canteen_slug": "ssc",
    "name": "Deal 1",
    "price": 320,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-10",
    "canteen_slug": "ssc",
    "name": "Deal 10",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-shawarma-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-11",
    "canteen_slug": "ssc",
    "name": "Deal 11",
    "price": 350,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-shawarma-roll-3-wings-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-12",
    "canteen_slug": "ssc",
    "name": "Deal 12",
    "price": 450,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-13",
    "canteen_slug": "ssc",
    "name": "Deal 13",
    "price": 380,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-14",
    "canteen_slug": "ssc",
    "name": "Deal 14",
    "price": 350,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-15",
    "canteen_slug": "ssc",
    "name": "Deal 15",
    "price": 250,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-sandwich-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-2",
    "canteen_slug": "ssc",
    "name": "Deal 2",
    "price": 430,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-3",
    "canteen_slug": "ssc",
    "name": "Deal 3",
    "price": 470,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-4",
    "canteen_slug": "ssc",
    "name": "Deal 4",
    "price": 250,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-5",
    "canteen_slug": "ssc",
    "name": "Deal 5",
    "price": 430,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-6",
    "canteen_slug": "ssc",
    "name": "Deal 6",
    "price": 380,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-shawarma-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-7",
    "canteen_slug": "ssc",
    "name": "Deal 7",
    "price": 240,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-8",
    "canteen_slug": "ssc",
    "name": "Deal 8",
    "price": 480,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-zinger-burger-1-chicken-piece-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-deal-9",
    "canteen_slug": "ssc",
    "name": "Deal 9",
    "price": 320,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/1-shawarma-1-fries.jpg.png"
  },
  {
    "catalogue_key": "ssc-fast-fajita-burger",
    "canteen_slug": "ssc",
    "name": "Fajita Burger",
    "price": 180,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/fajita-burger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-fries-classic",
    "canteen_slug": "ssc",
    "name": "Large Fries",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "ssc-fast-fries-large",
    "canteen_slug": "ssc",
    "name": "Large Loaded Fries",
    "price": 550,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/large-fries.jpg"
  },
  {
    "catalogue_key": "ssc-fast-fries-small",
    "canteen_slug": "ssc",
    "name": "Small Loaded Fries",
    "price": 400,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/small-fries.jpg"
  },
  {
    "catalogue_key": "ssc-fast-hot-wings-12",
    "canteen_slug": "ssc",
    "name": "12 pcs Crispy Hot Wings",
    "price": 550,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/12-pcs-crispy-hot-wings.jpg"
  },
  {
    "catalogue_key": "ssc-fast-hot-wings-6",
    "canteen_slug": "ssc",
    "name": "6 pcs Crispy Hot Wings",
    "price": 300,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/6-pc-crispy-hot-wings.jpg"
  },
  {
    "catalogue_key": "ssc-fast-kabab-roll",
    "canteen_slug": "ssc",
    "name": "Kabab Paratha Roll",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/kabab-paratha-roll.jpg"
  },
  {
    "catalogue_key": "ssc-fast-large-shawarma",
    "canteen_slug": "ssc",
    "name": "Large Shawarma",
    "price": 220,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/large-shawarma.jpg"
  },
  {
    "catalogue_key": "ssc-fast-mayo-fries",
    "canteen_slug": "ssc",
    "name": "Mayo Fries",
    "price": 220,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mayo-fries.jpg"
  },
  {
    "catalogue_key": "ssc-fast-mighty",
    "canteen_slug": "ssc",
    "name": "Mighty Zinger",
    "price": 420,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mighty-zinger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-nuggets-12",
    "canteen_slug": "ssc",
    "name": "12 pcs Nuggets",
    "price": 550,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/12-pcs-nuggets.jpg"
  },
  {
    "catalogue_key": "ssc-fast-nuggets-6",
    "canteen_slug": "ssc",
    "name": "6 pcs Nuggets",
    "price": 300,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/6-pcs-nuggets.jpg"
  },
  {
    "catalogue_key": "ssc-fast-panini",
    "canteen_slug": "ssc",
    "name": "Panini Sandwich",
    "price": 280,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/panini-sandwich.jpg"
  },
  {
    "catalogue_key": "ssc-fast-paratha-roll",
    "canteen_slug": "ssc",
    "name": "Paratha Roll",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/paratha-roll.jpg"
  },
  {
    "catalogue_key": "ssc-fast-pasta-large",
    "canteen_slug": "ssc",
    "name": "Large Loaded Pasta",
    "price": 550,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/large-loaded-pasta.jpg"
  },
  {
    "catalogue_key": "ssc-fast-pasta-small",
    "canteen_slug": "ssc",
    "name": "Small Loaded Pasta",
    "price": 400,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/small-loaded-pasta.jpg"
  },
  {
    "catalogue_key": "ssc-fast-pizza-burger",
    "canteen_slug": "ssc",
    "name": "Pizza Burger",
    "price": 550,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/pizza-burger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-platter-shawarma",
    "canteen_slug": "ssc",
    "name": "Platter Shawarma",
    "price": 320,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/platter-shawarma.jpg"
  },
  {
    "catalogue_key": "ssc-fast-shami-burger",
    "canteen_slug": "ssc",
    "name": "Shami Burger",
    "price": 170,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shami-burger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-shawarma-roll",
    "canteen_slug": "ssc",
    "name": "Shawarma Roll",
    "price": 160,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/shawarma-roll.jpg"
  },
  {
    "catalogue_key": "ssc-fast-spicy-roll",
    "canteen_slug": "ssc",
    "name": "Spicy Roll",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/spicy-roll.jpg"
  },
  {
    "catalogue_key": "ssc-fast-tikka-burger",
    "canteen_slug": "ssc",
    "name": "Tikka Burger",
    "price": 180,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/tikka-burger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-tower",
    "canteen_slug": "ssc",
    "name": "Tower Zinger",
    "price": 360,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/tower-zinger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-twister",
    "canteen_slug": "ssc",
    "name": "Twister Roll",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/twister-roll.jpg"
  },
  {
    "catalogue_key": "ssc-fast-zinger",
    "canteen_slug": "ssc",
    "name": "Zinger Burger",
    "price": 230,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/zinger-burger.jpg"
  },
  {
    "catalogue_key": "ssc-fast-zinger-extreme",
    "canteen_slug": "ssc",
    "name": "Zinger Extreme",
    "price": 300,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/zinger-extreme.jpg"
  },
  {
    "catalogue_key": "ssc-juice-falsa",
    "canteen_slug": "ssc",
    "name": "Falsa Juice",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/falsa-juice.jpg"
  },
  {
    "catalogue_key": "ssc-juice-grapes",
    "canteen_slug": "ssc",
    "name": "Grapes Juice",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/grapes-juice.jpg"
  },
  {
    "catalogue_key": "ssc-juice-mango",
    "canteen_slug": "ssc",
    "name": "Mango Juice",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mango-juice.jpg"
  },
  {
    "catalogue_key": "ssc-juice-peach",
    "canteen_slug": "ssc",
    "name": "Peach Juice",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/peach-juice.jpg"
  },
  {
    "catalogue_key": "ssc-paratha-aloo",
    "canteen_slug": "ssc",
    "name": "Aloo Wala Paratha",
    "price": 70,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/paratha.jpg.png"
  },
  {
    "catalogue_key": "ssc-paratha-chicken",
    "canteen_slug": "ssc",
    "name": "Chicken Wala Paratha",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/paratha.jpg.png"
  },
  {
    "catalogue_key": "ssc-paratha-chicken-cheese",
    "canteen_slug": "ssc",
    "name": "Chicken Cheese Paratha",
    "price": 300,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/paratha.jpg.png"
  },
  {
    "catalogue_key": "ssc-paratha-sada",
    "canteen_slug": "ssc",
    "name": "Sada Paratha",
    "price": 60,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/images/paratha.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-chapli-kabab",
    "canteen_slug": "ssc",
    "name": "Chicken Chapli Kabab Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-cheese-lover",
    "canteen_slug": "ssc",
    "name": "Cheese Lover Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-crown-crust",
    "canteen_slug": "ssc",
    "name": "Crown Crust Pizza",
    "price": 900,
    "available": true,
    "sizes": {
      "Medium": 900,
      "Large": 1350
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-deal-1",
    "canteen_slug": "ssc",
    "name": "Deal 1",
    "price": 2380,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/pizzas-drink-deal.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-deal-2",
    "canteen_slug": "ssc",
    "name": "Deal 2",
    "price": 1680,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/pizzas-drink-deal.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-deal-3",
    "canteen_slug": "ssc",
    "name": "Deal 3",
    "price": 860,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/pizzas-drink-deal.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-deal-4",
    "canteen_slug": "ssc",
    "name": "Deal 4",
    "price": 599,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/pizza-burger-regular-drink-deal.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-extra-topping",
    "canteen_slug": "ssc",
    "name": "Extra Topping",
    "price": 120,
    "available": true,
    "sizes": {
      "Small": 120,
      "Medium": 250,
      "Large": 300
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-fajita",
    "canteen_slug": "ssc",
    "name": "Chicken Fajita Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-lahore-qalandar",
    "canteen_slug": "ssc",
    "name": "Lahore Qalandar Pizza",
    "price": 1100,
    "available": true,
    "sizes": {
      "Medium": 1100,
      "Large": 1700
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-lasagna",
    "canteen_slug": "ssc",
    "name": "Lasagna Pizza",
    "price": 900,
    "available": true,
    "sizes": {
      "Medium": 900,
      "Large": 1300
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-malai-boti",
    "canteen_slug": "ssc",
    "name": "Malai Boti Pizza",
    "price": 480,
    "available": true,
    "sizes": {
      "Small": 480,
      "Medium": 1000,
      "Large": 1400
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-mexican",
    "canteen_slug": "ssc",
    "name": "Chicken Mexican Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-sausages",
    "canteen_slug": "ssc",
    "name": "Chicken Sausages Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-special",
    "canteen_slug": "ssc",
    "name": "Special Pizza",
    "price": 400,
    "available": true,
    "sizes": {
      "Small": 400,
      "Medium": 900,
      "Large": 1300
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-staff-kabab",
    "canteen_slug": "ssc",
    "name": "Staff Kabab Pizza",
    "price": 900,
    "available": true,
    "sizes": {
      "Medium": 900,
      "Large": 1300
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-stuff-cheese",
    "canteen_slug": "ssc",
    "name": "Stuff Cheese Pizza",
    "price": 900,
    "available": true,
    "sizes": {
      "Medium": 900,
      "Large": 1300
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-supreme",
    "canteen_slug": "ssc",
    "name": "Supreme Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-tikka",
    "canteen_slug": "ssc",
    "name": "Chicken Tikka Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-pizza-vegetarian",
    "canteen_slug": "ssc",
    "name": "Vegetarian Pizza",
    "price": 380,
    "available": true,
    "sizes": {
      "Small": 380,
      "Medium": 750,
      "Large": 1100
    },
    "add_ons": [],
    "image_url": "/menu/pizza.jpg.png"
  },
  {
    "catalogue_key": "ssc-shake-banana",
    "canteen_slug": "ssc",
    "name": "Banana Shake",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/banana-shake.jpg"
  },
  {
    "catalogue_key": "ssc-shake-khajoor",
    "canteen_slug": "ssc",
    "name": "Khajoor Shake",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/khajoor-shake.jpg.png"
  },
  {
    "catalogue_key": "ssc-shake-mango",
    "canteen_slug": "ssc",
    "name": "Mango Shake",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/mango-shake.jpg"
  },
  {
    "catalogue_key": "ssc-shake-oreo",
    "canteen_slug": "ssc",
    "name": "Oreo Shake",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/oreo-shake.jpg"
  },
  {
    "catalogue_key": "ssc-shake-peach",
    "canteen_slug": "ssc",
    "name": "Peach Shake",
    "price": 150,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/peach-shake.jpg"
  },
  {
    "catalogue_key": "ssc-shami-kebab",
    "canteen_slug": "ssc",
    "name": "Shami Kebab",
    "price": 80,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  },
  {
    "catalogue_key": "ssc-shami-sandwich",
    "canteen_slug": "ssc",
    "name": "Shami Sandwich",
    "price": 140,
    "available": true,
    "sizes": {},
    "add_ons": [],
    "image_url": "/menu/chai-paratha-category.jpg.png"
  }
]
$catalogue$::jsonb
) AS seed(
  catalogue_key TEXT,
  canteen_slug TEXT,
  name TEXT,
  price NUMERIC,
  available BOOLEAN,
  sizes JSONB,
  add_ons JSONB,
  image_url TEXT
);

DO $seed_mapping_check$
DECLARE
  v_unmapped_count INTEGER;
  v_source_count INTEGER;
BEGIN
  SELECT count(*) INTO v_source_count FROM unieats_student_menu_source;
  SELECT count(*) INTO v_unmapped_count
  FROM unieats_student_menu_source AS seed
  LEFT JOIN unieats_student_canteen_map AS canteen
    ON canteen.canteen_slug = seed.canteen_slug
  WHERE canteen.canteen_id IS NULL;

  IF v_unmapped_count <> 0 OR v_source_count <> 203 THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: expected 203 canonical records and resolved all canteen slugs, got % records and % unmapped slug(s).',
      v_source_count,
      v_unmapped_count;
  END IF;
END;
$seed_mapping_check$;

CREATE TEMP TABLE unieats_student_menu_seed (
  catalogue_key TEXT PRIMARY KEY,
  canteen_id UUID NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  available BOOLEAN NOT NULL,
  sizes JSONB NOT NULL,
  add_ons JSONB NOT NULL,
  image_url TEXT
) ON COMMIT DROP;

INSERT INTO unieats_student_menu_seed (
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
  seed.catalogue_key,
  canteen.canteen_id,
  seed.name,
  seed.price,
  seed.available,
  seed.sizes,
  seed.add_ons,
  seed.image_url
FROM unieats_student_menu_source AS seed
JOIN unieats_student_canteen_map AS canteen
  ON canteen.canteen_slug = seed.canteen_slug;

DO $catalogue_conflicts$
DECLARE
  v_conflicts TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name = 'image_url'
  ) THEN
    EXECUTE $query$
      SELECT string_agg(
        format(
          '%s (stored canteen=%s name=%s price=%s sizes=%s add_ons=%s image_url=%s available=%s)',
          existing.catalogue_key,
          existing.canteen_id,
          existing.name,
          existing.price,
          existing.sizes,
          existing.add_ons,
          existing.image_url,
          existing.available
        ),
        '; '
      )
      FROM public.menu_items AS existing
      JOIN unieats_student_menu_seed AS seed
        ON seed.catalogue_key = existing.catalogue_key
      WHERE existing.canteen_id IS DISTINCT FROM seed.canteen_id
         OR existing.name IS DISTINCT FROM seed.name
         OR existing.price IS DISTINCT FROM seed.price
         OR existing.available IS DISTINCT FROM seed.available
         OR existing.sizes IS DISTINCT FROM seed.sizes
         OR existing.add_ons IS DISTINCT FROM seed.add_ons
         OR existing.image_url IS DISTINCT FROM seed.image_url
    $query$ INTO v_conflicts;
  ELSE
    SELECT string_agg(
      format(
        '%s (stored canteen=%s name=%s price=%s sizes=%s add_ons=%s available=%s)',
        existing.catalogue_key,
        existing.canteen_id,
        existing.name,
        existing.price,
        existing.sizes,
        existing.add_ons,
        existing.available
      ),
      '; '
    )
    INTO v_conflicts
    FROM public.menu_items AS existing
    JOIN unieats_student_menu_seed AS seed
      ON seed.catalogue_key = existing.catalogue_key
    WHERE existing.canteen_id IS DISTINCT FROM seed.canteen_id
       OR existing.name IS DISTINCT FROM seed.name
       OR existing.price IS DISTINCT FROM seed.price
       OR existing.available IS DISTINCT FROM seed.available
       OR existing.sizes IS DISTINCT FROM seed.sizes
       OR existing.add_ons IS DISTINCT FROM seed.add_ons;
  END IF;

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: existing catalogue key(s) conflict with the official menu; no existing row was changed: %',
      v_conflicts;
  END IF;
END;
$catalogue_conflicts$;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_catalogue_key_unique
  ON public.menu_items (catalogue_key);

DO $index_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    WHERE index_info.indexrelid =
        to_regclass('public.menu_items_catalogue_key_unique')
      AND index_info.indrelid = 'public.menu_items'::regclass
      AND index_info.indisunique
      AND index_info.indisvalid
      AND index_info.indisready
      AND index_info.indpred IS NULL
      AND index_info.indexprs IS NULL
      AND index_info.indnkeyatts = 1
      AND pg_get_indexdef(index_info.indexrelid) ILIKE '%(catalogue_key)%'
  ) THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: menu_items_catalogue_key_unique is not a valid unique catalogue_key index.';
  END IF;
END;
$index_check$;

DO $seed_insert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name = 'image_url'
  ) THEN
    EXECUTE $query$
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
        seed.catalogue_key,
        seed.canteen_id,
        seed.name,
        seed.price,
        seed.available,
        seed.sizes,
        seed.add_ons,
        seed.image_url
      FROM unieats_student_menu_seed AS seed
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.menu_items AS existing
        WHERE existing.catalogue_key = seed.catalogue_key
      )
    $query$;
  ELSE
    INSERT INTO public.menu_items (
      catalogue_key,
      canteen_id,
      name,
      price,
      available,
      sizes,
      add_ons
    )
    SELECT
      seed.catalogue_key,
      seed.canteen_id,
      seed.name,
      seed.price,
      seed.available,
      seed.sizes,
      seed.add_ons
    FROM unieats_student_menu_seed AS seed
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.menu_items AS existing
      WHERE existing.catalogue_key = seed.catalogue_key
    );
  END IF;
END;
$seed_insert$;

DO $postcondition$
DECLARE
  v_unseeded TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name = 'image_url'
  ) THEN
    EXECUTE $query$
      SELECT string_agg(seed.catalogue_key, ', ')
      FROM unieats_student_menu_seed AS seed
      LEFT JOIN public.menu_items AS actual
        ON actual.catalogue_key = seed.catalogue_key
       AND actual.canteen_id = seed.canteen_id
       AND actual.name = seed.name
       AND actual.price = seed.price
       AND actual.available = seed.available
       AND actual.sizes = seed.sizes
       AND actual.add_ons = seed.add_ons
       AND actual.image_url IS NOT DISTINCT FROM seed.image_url
      WHERE actual.catalogue_key IS NULL
    $query$ INTO v_unseeded;
  ELSE
    SELECT string_agg(seed.catalogue_key, ', ')
    INTO v_unseeded
    FROM unieats_student_menu_seed AS seed
    LEFT JOIN public.menu_items AS actual
      ON actual.catalogue_key = seed.catalogue_key
     AND actual.canteen_id = seed.canteen_id
     AND actual.name = seed.name
     AND actual.price = seed.price
     AND actual.available = seed.available
     AND actual.sizes = seed.sizes
     AND actual.add_ons = seed.add_ons
    WHERE actual.catalogue_key IS NULL;
  END IF;

  IF v_unseeded IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu catalogue seed blocked: post-insert verification found missing or changed catalogue rows: %',
      v_unseeded;
  END IF;
END;
$postcondition$;

COMMIT;
