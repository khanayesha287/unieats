-- UniEats canonical menu seed, batch 05 of 05.
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
      'Menu seed batch 05 blocked: public.canteens and public.menu_items must exist.';
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
      'Menu seed batch 05 blocked: required columns are missing or incompatible: %.',
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
      'Menu seed batch 05 blocked: menu_items.image_url exists with an unsupported type.';
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
      'Menu seed batch 05 blocked: canteen slug mapping is missing or ambiguous: %.',
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
      'Menu seed batch 05 blocked: menu_items.canteen_id must reference canteens.id.';
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
      'Menu seed batch 05 blocked: menu_items.id is required but has no database default.';
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
      'Menu seed batch 05 blocked: menu_items has an additional required column without a default.';
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
      'Menu seed batch 05 blocked: duplicate existing catalogue keys must be reconciled: %.',
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
      'Menu seed batch 05 blocked: conflicting catalogue key data: %.',
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
      'Menu seed batch 05 blocked: required unique catalogue-key index is not valid.';
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
      'Menu seed batch 05 postcondition failed for catalogue keys: %.',
      v_missing;
  END IF;
END;
$postcondition$;

COMMIT;
