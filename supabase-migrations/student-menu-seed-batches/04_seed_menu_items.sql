-- UniEats canonical menu seed, batch 04 of 05.
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
      'Menu seed batch 04 blocked: public.canteens and public.menu_items must exist.';
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
      'Menu seed batch 04 blocked: required columns are missing or incompatible: %.',
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
      'Menu seed batch 04 blocked: menu_items.image_url exists with an unsupported type.';
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
      'Menu seed batch 04 blocked: canteen slug mapping is missing or ambiguous: %.',
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
      'Menu seed batch 04 blocked: menu_items.canteen_id must reference canteens.id.';
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
      'Menu seed batch 04 blocked: menu_items.id is required but has no database default.';
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
      'Menu seed batch 04 blocked: menu_items has an additional required column without a default.';
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
      'Menu seed batch 04 blocked: duplicate existing catalogue keys must be reconciled: %.',
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
      'Menu seed batch 04 blocked: conflicting catalogue key data: %.',
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
      'Menu seed batch 04 blocked: required unique catalogue-key index is not valid.';
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
      'Menu seed batch 04 postcondition failed for catalogue keys: %.',
      v_missing;
  END IF;
END;
$postcondition$;

COMMIT;
