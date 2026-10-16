-- UniEats canonical menu seed, batch 02 of 05.
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
      'Menu seed batch 02 blocked: public.canteens and public.menu_items must exist.';
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
      'Menu seed batch 02 blocked: required columns are missing or incompatible: %.',
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
      'Menu seed batch 02 blocked: menu_items.image_url exists with an unsupported type.';
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
      'Menu seed batch 02 blocked: canteen slug mapping is missing or ambiguous: %.',
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
      'Menu seed batch 02 blocked: menu_items.canteen_id must reference canteens.id.';
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
      'Menu seed batch 02 blocked: menu_items.id is required but has no database default.';
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
      'Menu seed batch 02 blocked: menu_items has an additional required column without a default.';
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
      'Menu seed batch 02 blocked: duplicate existing catalogue keys must be reconciled: %.',
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
      'Menu seed batch 02 blocked: conflicting catalogue key data: %.',
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
      'Menu seed batch 02 blocked: required unique catalogue-key index is not valid.';
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
      'Menu seed batch 02 postcondition failed for catalogue keys: %.',
      v_missing;
  END IF;
END;
$postcondition$;

COMMIT;
