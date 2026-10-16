# UniEats Rider Security Implementation Plan

This is a review document, not an executable migration. It contains no schema
changes and is not approval to apply SQL. Do not enable RLS, change grants,
replace triggers, or deploy rider actions until the production-contract checks
and access-compatibility gates below are complete.

## Scope and verified baseline

Production facts in this plan are based on the operator-provided read-only
results:

- `orders.driver_id` and `staff_profiles.driver_id` reference
  `public.driver.id`.
- The active driver staff profile has a valid mapping; the inactive profile
  does not.
- `validate_order_workflow_update()` compares an order's `driver_id` with
  `auth.uid()` and permits `ready -> out_for_delivery -> delivered`.
- The required rider actions are confirmation to persisted `confirmed`, then
  delivery to persisted `delivered`.
- All observed delivery orders are unassigned, including historical delivered
  orders. No migration may backfill or otherwise assign historical orders.
- Production has no matching claim, checkout, or order-creation RPC.
- RLS is disabled on `orders`, `order_items`, `menu_items`, and `driver`.
  `anon` has table-level SELECT, INSERT, UPDATE, and DELETE on those tables.
- Existing `orders` triggers enqueue and remove WhatsApp notification queue
  entries; they must be preserved.
- `saveOrderToSupabase()` deliberately fails closed. There is no verified
  persisted checkout-group key or trusted server-side price source.

Local source is not proof of deployed schema. The existing mapping/claim SQL
contains schema assumptions and implements the old status flow; it is not a
production migration to apply unchanged.

## Current application surfaces and compatibility risks

- Rider Portal reads explicit order fields, canteens, and order items through
  the authenticated browser client. Its incoming status filter currently omits
  the requested incoming and confirmed statuses. It uses a client-side
  unassigned-or-mapped-driver filter, which is not authorization.
- Rider confirmation calls `claim_delivery_order(p_order_id TEXT)`. Delivery
  currently uses a direct browser table update. Production has no matching
  claim RPC, per supplied findings.
- Canteen Portal selects `orders`, `canteens`, and `order_items`, and updates
  orders directly. Admin Dashboard selects these relations, directly edits
  orders/items, and deletes order items and orders. These paths can break if
  broad grants are removed without preserving their verified role-specific
  workflows.
- Staff management reads `staff_profiles` and `canteens` and makes
  administrative changes. Authentication profile loading reads
  `staff_profiles` and the driver's `driver_id`.
- Public menu browsing must be checked before changing anonymous menu SELECT.
  Checkout has no active persistence path through the fail-closed save stub;
  do not replace that safeguard as part of this rider task.
- Student tracking endpoints use a server-side service-role client to query
  persisted orders/items/canteens and stream order status. They therefore
  bypass RLS, and must independently enforce token authorization and return
  only the intended fields. The current tracking route falls back to ID-only
  matching when `tracking_token_hash` is absent; this is not an acceptable
  authorization fallback.
- Realtime is used by the server tracking stream and browser portals. The
  stream also has polling fallback. Verify publication membership and role
  behavior before relying on Realtime after access changes.
- WhatsApp server code uses service-role access and existing database triggers
  enqueue/remove notification work. Preserve trigger definitions and verify
  notification behavior for every new status transition.

## Facts that still block migration authoring

Do not infer any of these from local migrations or TypeScript types:

1. Exact deployed order and order-item columns, types, keys, constraints,
   indexes, foreign keys, and whether order IDs are text, UUID, or numeric.
2. The allowed order status values and the exact deployed meaning of an
   eligible incoming delivery. `pending` is plausible but not verified as the
   rider-claim status.
3. Actual timestamp columns, nullability/defaults, and which trigger or writer
   currently owns timestamp updates.
4. Complete definitions, enabled states, and ordering of every relevant
   trigger, especially the workflow and WhatsApp triggers.
5. Current helper-function definitions, ownership, `SECURITY DEFINER`
   settings, `search_path`, grants, and behavior under `auth.uid()`.
6. Complete RLS state/policies and effective table and column privileges for
   `anon`, `authenticated`, `PUBLIC`, and applicable staff roles on all
   affected relations.
7. The deployed canteen-owner/admin authorization contract: role helpers,
   canteen mapping, which status changes and field edits are required, and how
   admin deletes are intended to work.
8. Minimum order/customer fields riders must see, versus fields that can be
   omitted. Current select lists include private customer information; this
   requires a reviewed least-field design as well as row authorization.
9. Exact public menu relations, public menu read requirements, price ownership
   and edit paths. A trusted checkout price source remains unverified.
10. Whether tracking hashes exist and are populated for all trackable orders,
    how token ownership is enforced in each API/stream path, and the deployed
    service-role configuration (inspect presence/usage only, never secret
    values).
11. `orders` and related relation membership in the Realtime publication, and
    whether any client depends on direct table subscriptions.
12. Whether an existing persisted checkout/group identifier is consistently
    written to every child order. No grouping behavior may be added absent
    that evidence.

## Read-only production checks to return for review

Run only the relevant catalog queries manually against the intended Supabase
project, using
[UNIEATS_READ_ONLY_DIAGNOSTICS.md](./UNIEATS_READ_ONLY_DIAGNOSTICS.md). Do not
run its SQL here. Return catalog metadata and definitions only; redact customer
rows, tokens, credentials, environment values, and identifiers that are not
needed to assess the relationship. Do not redact function authorization,
transition, or trigger logic.

| Decision needed | Existing diagnostic queries |
|---|---|
| Actual columns, types, defaults, relation kinds | Query 1; query 5 for catalog candidates |
| Keys, constraints, foreign-key targets, indexes, status checks | Queries 2, 3, and 4 |
| Canonical menu/price candidate and view definition | Query 5, plus its notes on proving trusted ownership |
| Full trigger definitions and WhatsApp preservation baseline | Query 6 |
| Existing function definitions, signatures, `SECURITY DEFINER`, settings, execute grants | Query 7 |
| RLS-enabled state and force-RLS state | Query 8 |
| Effective policy expressions, roles, commands, and checks | Query 9 |
| Table/column grants and effective `anon`/`authenticated` privileges | Query 10 |
| Realtime publication membership | Query 11 |

The existing `supabase-migrations/20261012000000_rider-checkout-security.verify.sql`
is not the production diagnostics source for this task: it contains
environment-specific assumptions and identifiers. Do not apply it or copy
its assumptions into a migration.

Additionally inspect application source (not production rows) for every
relation access before changing permissions:

- `components/driver/DriverPortalContent.tsx`
- `components/canteen/CanteenPortalContent.tsx`
- `components/admin/AdminDashboardContent.tsx`
- `components/admin/StaffManagement.tsx`
- `components/providers/AuthProvider.tsx`
- `lib/supabase.ts` and `lib/supabase-auth.ts`
- `app/api/orders/track/route.ts` and
  `app/api/orders/track/stream/route.ts`
- `lib/order-tracking-server.ts` and `lib/whatsapp-notifications.ts`

For the rider mapping, use the supplied validated result. Do not request or
publish the rider email, Auth UUID, driver UUID, or order/customer records
again. If the active-driver predicate is not included in the returned
definition/results, request a redacted boolean confirmation of active profile,
driver role, non-null mapping, matching referenced driver, and active driver
state—not the identifiers themselves.

## Proposed migration design (not SQL)

### Gate A — Establish access contracts

First complete the checks above and make an endpoint/role matrix for public
menu reads, student tracking, rider reads/actions, canteen-owner order/item
workflows, admin management, staff management, and WhatsApp processing.
Record exactly which fields each caller needs. Test the matrix in staging with
the same Supabase client roles used by the application.

No production grant revocation or RLS enablement is safe before this gate.
The reported anonymous table-wide CRUD is a serious exposure; however,
blindly enabling RLS or revoking privileges without replacing required
policies can break menus, staff portals, or order management. Do not treat
that risk as a reason to leave the state unreviewed or as authorization to
change it without a compatibility plan.

### Gate B — Implement narrowly scoped rider transitions

After verifying the target status and timestamp schema, add two
authenticated-only database operations:

1. **Claim/confirm:** resolve `auth.uid()` to exactly one active
   `staff_profiles` record with driver role and non-null `driver_id`; validate
   the referenced `public.driver` record is active using its verified
   production state. Atomically change only an eligible, unassigned delivery
   order to `confirmed` and assign the mapped driver.
2. **Mark delivered:** allow only an order already in `confirmed`, of delivery
   type, and assigned to that caller's mapped active driver to change to
   `delivered`.

Neither operation accepts a driver ID, timestamp, status, price, customer
field, or other mutable field from the browser. The database sets applicable
timestamps using the verified timestamp conventions. Both operations return
an explicit success/stale-or-ineligible outcome; unauthenticated or unmapped
callers fail authorization.

Concurrency safety must come from a single conditional database update or a
row-locking transaction whose predicate rechecks unassigned status and
eligibility when writing. Exactly one concurrent claimant may succeed. A
repeat claim or delivery call must not replay a transition or steal
assignment. Historical delivered/unassigned rows are never candidates.

The function execution grants must exclude `PUBLIC` and `anon` and be limited
to the intended authenticated database role. If a `SECURITY DEFINER` function
is necessary to mediate updates under RLS, first verify function ownership and
RLS-bypass behavior; use a fixed safe `search_path`, fully qualified objects,
explicit actor checks, and minimum privileges. Do not rely on `SECURITY
DEFINER` as a substitute for authorization. Decide between invoker and
definer behavior only after the current policy model is known.

Update the workflow validation logic to derive the actor's driver ID from the
active staff mapping, never `auth.uid()` directly. Preserve verified
canteen-owner/admin paths and reject all rider changes to protected fields.
Do not replace the full trigger based on an incomplete local function body.
Keep every existing WhatsApp trigger installed and enabled with unchanged
definitions unless independent review proves a specific adjustment is
required.

### Gate C — Coordinate grants and RLS

After the access matrix is verified, prepare one reviewed least-privilege
policy/grant design per relation:

- `orders`: rider SELECT limited to eligible incoming delivery orders and
  orders assigned to the mapped rider; owner/admin rules preserved exactly;
  riders have no direct table UPDATE rights for status/assignment if all
  changes use the operations above.
- `order_items`: rider SELECT only for an order visible to that mapped rider;
  preserve verified canteen-owner/admin access; no anonymous CRUD.
- `menu_items`: preserve only verified public menu SELECT needed by browsing;
  remove anonymous writes only after the menu edit path and owner/admin
  permissions are confirmed.
- `driver` and `staff_profiles`: riders can resolve only their own authorized
  mapping through a safe helper/operation; preserve verified staff
  administration; no user-controlled mapping changes.
- `canteens` and any discovered catalog relations: retain only confirmed
  public/owner/admin scopes; do not assume relation names or visibility
  columns.

These are policy goals, not final predicates. Exact relation columns and
helpers are blocked pending catalog results. Avoid relying solely on column
grants to protect order PII; pair least-field selection with row-level
authorization and endpoint-specific review. Realtime subscriptions and
service-role APIs require separate authorization checks because ordinary
table RLS does not protect service-role requests.

### Gate D — Update clients only after database behavior is validated

- Change Rider Portal visibility to the verified incoming status and
  `confirmed`; replace direct status updates with the two database operations.
- Disable duplicate clicks while requests are pending and refresh after stale
  or concurrent outcomes. Report success only after database success.
- Continue deriving the rider mapping from the authenticated active staff
  profile; no hard-coded UUID or account mapping.
- Keep one database row/card per order until a persisted checkout-group key
  and safe atomic group operation are verified.
- Preserve student tracking's persisted status reads. Remove ID-only tracking
  fallback before claiming token authorization is secure; verify every REST
  and stream query matches the token hash and returns only intended data.
- Confirm Realtime and polling both show persisted `confirmed` and `delivered`
  states.

## Required staging tests before a production migration

Use disposable staging data and real anon/authenticated sessions, not a
privileged SQL Editor session for behavioral authorization tests:

1. Public menu reads still show only intended menu data; anonymous menu
   writes fail.
2. Unauthenticated users cannot read orders/items, alter any order field, or
   invoke rider operations.
3. Rider sees only eligible incoming delivery rows and their own assigned
   rows/items; another rider's assigned rows are inaccessible.
4. Inactive, non-driver, unmapped, or mismatched staff profiles cannot claim
   or deliver.
5. Two simultaneous claims on one eligible unassigned order yield exactly
   one success; assignment belongs to the successful caller's mapped driver.
6. Claiming sets persisted `confirmed`; only that assigned rider can then set
   persisted `delivered`. Repeated and stale calls fail safely.
7. Attempts to change customer, price, payment, canteen, order-item, driver
   mapping, or unrelated timestamp fields are rejected.
8. An unassigned historical delivered row remains unchanged and cannot be
   claimed.
9. Canteen owners retain their verified transitions and cannot edit outside
   their canteen; admins retain verified administration, including supported
   deletion behavior.
10. Existing WhatsApp trigger definitions remain enabled and notification
    queue behavior is preserved for relevant inserts/updates/deletes.
11. Student tracking with a valid token reflects persisted confirmation and
    delivery through polling and Realtime; invalid tokens and ID-only requests
    reveal no order data.
12. Staff profile lookup/login, menu browsing, admin/canteen/rider portals,
    and tracking all pass with the intended role grants after RLS changes.

## Separate future checkout work

Keep `saveOrderToSupabase()` fail-closed. Do not combine checkout with rider
security. A separate reviewed design requires a verified authoritative
server-side menu-price source and edit permissions, validated quantity and
delivery-fee rules, and a server-side atomic writer that persists a checkout
group identifier consistently across every canteen child order. It must
calculate prices server-side, roll back all child rows on any failure,
support safe retries/idempotency, hash tracking tokens, and enforce token
ownership. Until those are established, do not create checkout orders, invent
a grouping key, or group unrelated orders in either portal.

## Migration and rollback sequence

1. Collect and review the redacted production catalog outputs listed above.
2. Complete a written role/access matrix from live policies plus application
   query inventory; separately resolve menu and tracking requirements.
3. Implement and test the rider function/trigger/policy package in staging
   against a production-like schema. Keep checkout disabled.
4. Review the complete migration diff and rollback in staging. Verify rollback
   never restores anonymous CRUD or reassigns historical orders.
5. Apply only after explicit human review of the exact migration and staged
   results. Run role-matrix smoke tests and inspect WhatsApp/tracking behavior.
6. Deploy the Rider Portal client only when the deployed RPC signatures,
   grants, statuses, and policies match the tested contract.

If a migration must be rolled back, first disable the client actions and
remove/restrict the rider function grants. Do not roll back by restoring
anonymous CRUD or weakening policies. Preserve data assignments and never
automatically rewrite historical delivery rows.

## Immediate next action

Run the read-only diagnostics queries listed in the table above manually in
the correct project, return the redacted outputs for review, and provide the
current staging role-matrix results. Until those facts are reviewed, the safe
deliverable is this non-executable design only; no production migration is
ready to author or apply.
