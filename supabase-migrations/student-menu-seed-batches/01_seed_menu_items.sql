-- UniEats canonical menu seed, batch 01 of 05.
-- Run this file once in Supabase SQL Editor, then continue with the next number.
-- Each batch is a separate transaction; the complete sequence is not atomic.
-- This batch inserts missing keys only and aborts on conflicting existing data.
BEGIN;

LOCK TABLE public.canteens IN SHARE MODE;
LOCK TABLE public.menu_items IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
DECLARE
  v_missing_columns TEXT;
  v_bad_canteens TEXT;
  v_duplicate_keys TEXT;
BEGIN
  IF to_regclass('public.canteens') IS NULL
    OR to_regclass('public.menu_items') IS NULL
  THEN
    RAISE EXCEPTION
      'Menu seed batch 01 blocked: public.canteens and public.menu_items must exist.';
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO v_missing_columns
  FROM (VALUES
    ('canteens', 'id', 'uuid'),
    ('canteens', 'name', 'text'),
    ('canteens', 'slug', 'text'),
    ('menu_items', 'id', 'uuid'),
    ('menu_items', 'catalogue_key', 'text'),
    ('menu_items', 'canteen_id', 'uuid'),
    ('menu_items', 'name', 'text'),
    ('menu_items', 'price', NULL),
    ('menu_items', 'available', 'boolean'),
    ('menu_items', 'sizes', 'jsonb'),
    ('menu_items', 'add_ons', 'jsonb')
  ) AS required(table_name, column_name, expected_type)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = required.table_name
   AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL
     OR (required.expected_type IS NOT NULL
       AND actual.data_type <> required.expected_type)
     OR (required.table_name = 'menu_items'
       AND required.column_name = 'price'
       AND actual.data_type NOT IN (
         'numeric', 'integer', 'bigint', 'real', 'double precision'
       ));

  IF v_missing_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu seed batch 01 blocked: required columns are missing or incompatible: %.',
      v_missing_columns;
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
      'Menu seed batch 01 blocked: menu_items.image_url exists with an unsupported type.';
  END IF;

  SELECT string_agg(format(
    '%s (%s): found %s total rows and %s matching rows',
    mappings.slug,
    mappings.name,
    mappings.total_rows,
    mappings.matching_rows
  ), '; ')
  INTO v_bad_canteens
  FROM (
    SELECT
      expected.name,
      expected.slug,
      count(actual.id) AS total_rows,
      count(actual.id) FILTER (
        WHERE lower(btrim(actual.name)) = lower(expected.name)
      ) AS matching_rows
    FROM (VALUES
      ('Annexe'::text, 'annexe'::text),
      ('BHOLA'::text, 'bhola'::text),
      ('GSSC'::text, 'gssc'::text),
      ('Hot Potato'::text, 'hot-potato'::text),
      ('SSC'::text, 'ssc'::text)
    ) AS expected(name, slug)
    LEFT JOIN public.canteens AS actual ON actual.slug = expected.slug
    GROUP BY expected.name, expected.slug
  ) AS mappings
  WHERE mappings.total_rows <> 1 OR mappings.matching_rows <> 1;

  IF v_bad_canteens IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu seed batch 01 blocked: canteen slug mapping is missing or ambiguous: %.',
      v_bad_canteens;
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
      'Menu seed batch 01 blocked: menu_items.canteen_id must reference canteens.id.';
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
      'Menu seed batch 01 blocked: menu_items.id is required but has no database default.';
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
      'Menu seed batch 01 blocked: menu_items has an additional required column without a default.';
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
      'Menu seed batch 01 blocked: duplicate existing catalogue keys must be reconciled: %.',
      v_duplicate_keys;
  END IF;
END;
$preflight$;

CREATE TEMP TABLE unieats_menu_seed_source (
  catalogue_key TEXT PRIMARY KEY,
  canteen_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  available BOOLEAN NOT NULL,
  sizes JSONB NOT NULL,
  add_ons JSONB NOT NULL,
  image_url TEXT
) ON COMMIT DROP;

INSERT INTO unieats_menu_seed_source
SELECT *
FROM jsonb_to_recordset(
$batch_catalogue$
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
  }
]
$batch_catalogue$::jsonb
) AS source(
  catalogue_key TEXT,
  canteen_slug TEXT,
  name TEXT,
  price NUMERIC,
  available BOOLEAN,
  sizes JSONB,
  add_ons JSONB,
  image_url TEXT
);

CREATE TEMP TABLE unieats_menu_seed_resolved (
  catalogue_key TEXT PRIMARY KEY,
  canteen_id UUID NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  available BOOLEAN NOT NULL,
  sizes JSONB NOT NULL,
  add_ons JSONB NOT NULL,
  image_url TEXT
) ON COMMIT DROP;

INSERT INTO unieats_menu_seed_resolved
SELECT
  source.catalogue_key,
  canteen.id,
  source.name,
  source.price,
  source.available,
  source.sizes,
  source.add_ons,
  source.image_url
FROM unieats_menu_seed_source AS source
JOIN public.canteens AS canteen
  ON canteen.slug = source.canteen_slug;

DO $conflict_check$
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
      SELECT string_agg(seed.catalogue_key, ', ')
      FROM unieats_menu_seed_resolved AS seed
      JOIN public.menu_items AS existing
        ON existing.catalogue_key = seed.catalogue_key
      WHERE existing.canteen_id IS DISTINCT FROM seed.canteen_id
         OR existing.name IS DISTINCT FROM seed.name
         OR existing.price IS DISTINCT FROM seed.price
         OR existing.available IS DISTINCT FROM seed.available
         OR existing.sizes IS DISTINCT FROM seed.sizes
         OR existing.add_ons IS DISTINCT FROM seed.add_ons
         OR existing.image_url IS DISTINCT FROM seed.image_url
    $query$ INTO v_conflicts;
  ELSE
    SELECT string_agg(seed.catalogue_key, ', ')
    INTO v_conflicts
    FROM unieats_menu_seed_resolved AS seed
    JOIN public.menu_items AS existing
      ON existing.catalogue_key = seed.catalogue_key
    WHERE existing.canteen_id IS DISTINCT FROM seed.canteen_id
       OR existing.name IS DISTINCT FROM seed.name
       OR existing.price IS DISTINCT FROM seed.price
       OR existing.available IS DISTINCT FROM seed.available
       OR existing.sizes IS DISTINCT FROM seed.sizes
       OR existing.add_ons IS DISTINCT FROM seed.add_ons;
  END IF;

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu seed batch 01 blocked: conflicting catalogue key data: %.',
      v_conflicts;
  END IF;
END;
$conflict_check$;

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
      'Menu seed batch 01 blocked: required unique catalogue-key index is not valid.';
  END IF;
END;
$index_check$;

DO $insert_batch$
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
        catalogue_key, canteen_id, name, price, available, sizes, add_ons, image_url
      )
      SELECT
        seed.catalogue_key, seed.canteen_id, seed.name, seed.price,
        seed.available, seed.sizes, seed.add_ons, seed.image_url
      FROM unieats_menu_seed_resolved AS seed
      WHERE NOT EXISTS (
        SELECT 1 FROM public.menu_items AS existing
        WHERE existing.catalogue_key = seed.catalogue_key
      )
    $query$;
  ELSE
    INSERT INTO public.menu_items (
      catalogue_key, canteen_id, name, price, available, sizes, add_ons
    )
    SELECT
      seed.catalogue_key, seed.canteen_id, seed.name, seed.price,
      seed.available, seed.sizes, seed.add_ons
    FROM unieats_menu_seed_resolved AS seed
    WHERE NOT EXISTS (
      SELECT 1 FROM public.menu_items AS existing
      WHERE existing.catalogue_key = seed.catalogue_key
    );
  END IF;
END;
$insert_batch$;

DO $postcondition$
DECLARE
  v_missing TEXT;
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
      FROM unieats_menu_seed_resolved AS seed
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
    $query$ INTO v_missing;
  ELSE
    SELECT string_agg(seed.catalogue_key, ', ')
    INTO v_missing
    FROM unieats_menu_seed_resolved AS seed
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

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Menu seed batch 01 postcondition failed for catalogue keys: %.',
      v_missing;
  END IF;
END;
$postcondition$;

COMMIT;
