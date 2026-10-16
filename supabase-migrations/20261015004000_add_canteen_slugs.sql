-- Add stable canteen identifiers for catalogue seeding and student checkout.
-- This migration only adds a nullable column, assigns known slugs to uniquely
-- matched existing canteens, and adds a unique index; it leaves RLS and grants
-- unchanged.
BEGIN;

ALTER TABLE public.canteens
  ADD COLUMN IF NOT EXISTS slug TEXT;

DO $preflight$
BEGIN
  IF to_regclass('public.canteens') IS NULL THEN
    RAISE EXCEPTION 'Canteen slug migration blocked: public.canteens is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'canteens'
      AND column_name = 'name'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION
      'Canteen slug migration blocked: public.canteens.name must be text.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'canteens'
      AND column_name = 'slug'
      AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION
      'Canteen slug migration blocked: existing canteens.slug is not text.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('Annexe'::text, 'annexe'::text),
      ('BHOLA'::text, 'bhola'::text),
      ('GSSC'::text, 'gssc'::text),
      ('Hot Potato'::text, 'hot-potato'::text),
      ('SSC'::text, 'ssc'::text)
    ) AS expected(name, slug)
    LEFT JOIN public.canteens AS actual
      ON lower(btrim(actual.name)) = lower(expected.name)
    GROUP BY expected.name, expected.slug
    HAVING count(actual.id) <> 1
       OR count(actual.id) FILTER (
         WHERE actual.slug IS NOT NULL
           AND actual.slug <> expected.slug
       ) > 0
  ) THEN
    RAISE EXCEPTION
      'Canteen slug migration blocked: expected each official canteen name exactly once with no conflicting slug.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('annexe'::text),
      ('bhola'::text),
      ('gssc'::text),
      ('hot-potato'::text),
      ('ssc'::text)
    ) AS expected(slug)
    JOIN public.canteens AS existing
      ON existing.slug = expected.slug
    WHERE lower(btrim(existing.name)) NOT IN (
      'annexe', 'bhola', 'gssc', 'hot potato', 'ssc'
    )
  ) THEN
    RAISE EXCEPTION
      'Canteen slug migration blocked: an official slug is already assigned to another canteen.';
  END IF;
END;
$preflight$;

UPDATE public.canteens AS actual
SET slug = expected.slug
FROM (VALUES
  ('Annexe'::text, 'annexe'::text),
  ('BHOLA'::text, 'bhola'::text),
  ('GSSC'::text, 'gssc'::text),
  ('Hot Potato'::text, 'hot-potato'::text),
  ('SSC'::text, 'ssc'::text)
) AS expected(name, slug)
WHERE lower(btrim(actual.name)) = lower(expected.name)
  AND actual.slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS canteens_slug_unique
  ON public.canteens (slug);

DO $postcondition$
BEGIN
  IF EXISTS (
    SELECT 1
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
  ) THEN
    RAISE EXCEPTION
      'Canteen slug migration failed postcondition: every official slug must resolve to exactly one canteen.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_info
    WHERE index_info.indexrelid = to_regclass('public.canteens_slug_unique')
      AND index_info.indrelid = 'public.canteens'::regclass
      AND index_info.indisunique
      AND index_info.indisvalid
      AND index_info.indisready
      AND index_info.indpred IS NULL
      AND index_info.indexprs IS NULL
      AND index_info.indnkeyatts = 1
      AND pg_get_indexdef(index_info.indexrelid) ILIKE '%(slug)%'
  ) THEN
    RAISE EXCEPTION
      'Canteen slug migration failed postcondition: canteens_slug_unique must be a valid unique slug index.';
  END IF;
END;
$postcondition$;

COMMIT;
