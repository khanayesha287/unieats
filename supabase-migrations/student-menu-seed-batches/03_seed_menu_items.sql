-- UniEats canonical menu seed, batch 03 of 05.
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
      'Menu seed batch 03 blocked: public.canteens and public.menu_items must exist.';
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
      'Menu seed batch 03 blocked: required columns are missing or incompatible: %.',
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
      'Menu seed batch 03 blocked: menu_items.image_url exists with an unsupported type.';
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
      'Menu seed batch 03 blocked: canteen slug mapping is missing or ambiguous: %.',
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
      'Menu seed batch 03 blocked: menu_items.canteen_id must reference canteens.id.';
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
      'Menu seed batch 03 blocked: menu_items.id is required but has no database default.';
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
      'Menu seed batch 03 blocked: menu_items has an additional required column without a default.';
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
      'Menu seed batch 03 blocked: duplicate existing catalogue keys must be reconciled: %.',
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
      'Menu seed batch 03 blocked: conflicting catalogue key data: %.',
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
      'Menu seed batch 03 blocked: required unique catalogue-key index is not valid.';
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
      'Menu seed batch 03 postcondition failed for catalogue keys: %.',
      v_missing;
  END IF;
END;
$postcondition$;

COMMIT;
