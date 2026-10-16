# UniEats student checkout repair

Status: **prepared locally; not applied to production**. The confirmed live
finding is zero `menu_items` rows for all five canteens. No production data or
schema has been changed, and no test order has been placed.

## Diagnosis

`app/api/checkout/route.ts` sends checkout requests to
`public.create_student_checkout(...)`. With no menu rows, the RPC has no
trusted database prices or options to validate against and must reject menu
items. The currently supplied findings do not establish whether the live RPC
or idempotency table exists; confirm these read-only before deciding whether
the RPC migration is needed. The frontend's authoritative catalogue is
`lib/data/menus.ts`.

The confirmed menu schema has `id`, `canteen_id`, `name`, `price`, `available`,
`catalogue_key`, `sizes`, and `add_ons`; `image_url` has not been confirmed and
is treated as optional by the seed. The supplied foreign keys connect menu
items to canteens and order items to orders and menu items. The live canteen
slug mapping, complete orders/order_items columns and constraints, RPC
definition/grants, idempotency table, policies/effective grants, and enabled
order/WhatsApp triggers still require read-only verification using
`UNIEATS_CHECKOUT_FIX_DIAGNOSTICS.sql` before deciding whether to apply further
migrations.

The exact error sentence reported by the user is not present in this local
checkout source. The local flow posts to `/api/checkout`, which calls the
database RPC; this is a missing database setup problem, not a client-side price
calculation problem.

## Prepared changes

- `20261015004000_add_canteen_slugs.sql` adds a nullable, unique `canteens.slug`
  and assigns stable slugs only to uniquely matched, verified official canteen
  rows. It is transactional and leaves RLS and grants untouched.
- `20261015005000_seed_student_menu_catalogue.sql` inserts the 203 unique
  canonical records derived from `lib/data/menus.ts`. It includes catalogue
  keys, canteen slugs, names, prices, availability, sizes, and add-ons. Both
  distinct Lemon Soda products retain separate stable keys. If `image_url`
  exists, the seed preserves its source values; otherwise it is omitted.
  Existing conflicting catalogue-key rows abort; existing menu rows are not
  updated or deleted.
- `20261015010000_student_checkout_rpc.sql` installs the service-role-only
  checkout RPC and idempotency table. It resolves canteens by slug, locks and
  validates menu/canteen rows, derives item/option prices from database records,
  groups multi-canteen orders, charges Rs 45 per delivery canteen (Rs 0 pickup),
  and commits all orders atomically. It preflights schema constraints and
  enabled workflow/WhatsApp triggers; it does not replace or disable them or
  change operational-table RLS/grants.
- `app/api/checkout/route.ts` now sends stable canteen slugs rather than
  hardcoded canteen UUIDs. It continues to validate requests and accept success
  only when the RPC returns saved order records.
- `scripts/_verify_seed_vs_menu.cjs` and
  `scripts/checkout-contract.test.mjs` reconcile the seed against the official
  frontend catalogue and cover the route/RPC contract and protections.

Do not apply `20261015000000_create_student_checkout_rpc.sql`; it is a competing
candidate. Do not apply `20261016000000_checkout_rls_and_grants.sql` as part of
this checkout repair unless its prerequisites and the production access
policies have been separately reviewed and approved.

## Apply only after review and approval

In Supabase Dashboard, select the verified production project and inspect the
existing slug mapping, RPC, idempotency table, and diagnostics first. Apply
only migrations whose preconditions are missing and reviewed. If stable slugs
are absent, open **SQL Editor → New query** and apply:

1. `20261015004000_add_canteen_slugs.sql`

Then apply `20261015005000_seed_student_menu_catalogue.sql`. Apply
`20261015010000_student_checkout_rpc.sql` only if the RPC is absent or requires
the reviewed implementation and its fail-closed preflights pass. Do not apply
the slug migration if existing slugs already correctly identify each canteen.

The migrations are transactional. The seed requires each expected stable slug
to resolve to exactly one canteen, aborts on key/data conflicts, inserts only
missing menu keys, and never rewrites existing menu rows. Stop on any SQL
error; do not weaken a preflight or substitute the competing migration.

After the slug mapping and seed, verify five official slugs and 203 unique menu
keys:

```sql
WITH expected(canteen_slug) AS (
  VALUES
    ('annexe'::text),
    ('bhola'::text),
    ('gssc'::text),
    ('hot-potato'::text),
    ('ssc'::text)
)
SELECT
  expected.canteen_slug,
  count(DISTINCT canteen.id) AS mapped_canteens,
  count(menu.id) AS menu_items,
  count(DISTINCT menu.catalogue_key) AS unique_catalogue_keys
FROM expected
LEFT JOIN public.canteens AS canteen
  ON canteen.slug = expected.canteen_slug
LEFT JOIN public.menu_items AS menu
  ON menu.canteen_id = canteen.id
GROUP BY expected.canteen_slug
ORDER BY expected.canteen_slug;
```

Expected: one row per slug, `mapped_canteens = 1` and `menu_items` equals
`unique_catalogue_keys` for each canteen. Total counts should be 203; per-canteen
counts should be Annexe 3, BHOLA 46, GSSC 13, Hot Potato 31, and SSC 110. Then
verify whether the RPC exists:

```sql
SELECT to_regprocedure(
  'public.create_student_checkout(uuid,text,text,text,text,text,text,text,text,jsonb)'
) AS checkout_rpc,
to_regclass('public.checkout_idempotency') AS idempotency_table;
```

## End-to-end checks required before declaring checkout fixed

After SQL is reviewed and applied, place real test orders using the website and
verify each order and its `order_items` in Supabase:

- pickup, one canteen: zero delivery charge;
- delivery, one canteen: Rs 45 charge;
- delivery, at least two canteens: one order per canteen, Rs 45 per canteen;
- retry an identical request with its same idempotency key: same order IDs and
  no duplicate orders;
- confirm order tracking works, workflow updates still pass, and each created
  order reaches the existing WhatsApp notification queue.

Do not claim production checkout is fixed until the database records and
catalogue keys are verified and a test order is successfully created and
verified. Do not run a broad RLS/grant change or modify existing orders as part
of this repair.
