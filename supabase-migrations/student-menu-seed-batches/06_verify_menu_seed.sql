-- UniEats canonical menu seed verification (read-only).
-- Run after seed batches 01 through 05 have all completed successfully.
WITH expected(canteen_slug, expected_count) AS (
  VALUES
    ('annexe'::text, 3),
    ('bhola'::text, 46),
    ('gssc'::text, 13),
    ('hot-potato'::text, 31),
    ('ssc'::text, 110)
),
global_counts AS (
  SELECT
    count(id) AS total_menu_items,
    count(DISTINCT catalogue_key) AS unique_catalogue_keys
  FROM public.menu_items
)
SELECT
  expected.canteen_slug,
  expected.expected_count,
  global_counts.total_menu_items,
  global_counts.unique_catalogue_keys AS global_unique_catalogue_keys,
  count(DISTINCT canteen.id) AS mapped_canteens,
  count(menu.id) AS menu_items,
  count(DISTINCT menu.catalogue_key) AS unique_catalogue_keys,
  (
    count(DISTINCT canteen.id) = 1
    AND count(menu.id) = expected.expected_count
    AND count(DISTINCT menu.catalogue_key) = expected.expected_count
    AND global_counts.total_menu_items = 203
    AND global_counts.unique_catalogue_keys = 203
  ) AS verified
FROM expected
CROSS JOIN global_counts
LEFT JOIN public.canteens AS canteen
  ON canteen.slug = expected.canteen_slug
LEFT JOIN public.menu_items AS menu
  ON menu.canteen_id = canteen.id
GROUP BY
  expected.canteen_slug,
  expected.expected_count,
  global_counts.total_menu_items,
  global_counts.unique_catalogue_keys
ORDER BY expected.canteen_slug;
