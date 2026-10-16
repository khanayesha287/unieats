# UniEats student checkout staging checklist

Use this checklist only after reviewing the target database. For the verified
production repair order and exact SQL checks, see
`UNIEATS_CHECKOUT_FIX_RUNBOOK.md`. Do not run an unreviewed migration or change
production data without approval.

## Migration order and prerequisites

1. Run the read-only diagnostics against the verified target project. Check
   actual table columns, foreign keys, constraints, RLS policies, grants,
   functions, and enabled order/WhatsApp triggers.
2. Apply `20261015004000_add_canteen_slugs.sql`, then
   `20261015005000_seed_student_menu_catalogue.sql`, then
   `20261015010000_student_checkout_rpc.sql`, only after review and approval.
   Do not apply `20261015000000_create_student_checkout_rpc.sql` or the
   superseded `20261014000000_secure_student_checkout.sql`.
3. Verify all official catalogue keys and the RPC/idempotency table before
   placing test orders.
4. Treat `20261016000000_checkout_rls_and_grants.sql` as a separate access
   control change. Do not apply it until its helpers, rider mapping, existing
   policies, effective grants, claim RPC, and order triggers are inspected and
   the access change is separately approved.

## Checkout and order integrity

- [ ] Submit a valid pickup order with one canteen and confirm exactly one order
  and its `order_items` are created with database-derived prices and zero
  delivery fee.
- [ ] Submit a valid delivery order with one canteen and confirm its delivery
  fee is Rs 45.
- [ ] Submit a valid multi-canteen delivery order and confirm one order per
  canteen, Rs 45 per distinct canteen, correct item ownership, and atomic
  rollback if a later canteen/item fails validation.
- [ ] Change browser-supplied item names, prices, subtotals, delivery fees, and
  totals. Confirm they are ignored and the RPC derives values from
  `menu_items`.
- [ ] Try unavailable items, mismatched canteen slugs, invalid quantities, an
  unknown size, an unknown add-on, and duplicate add-on names. Confirm each is
  rejected without creating any order, item, idempotency result, or
  notification event.
- [ ] Retry the same request concurrently and sequentially with the same
  idempotency key. Confirm the original order IDs are returned and there are
  no extra orders, order items, or notification queue records.
- [ ] Reuse an idempotency key with changed request details. Confirm the RPC
  rejects it and preserves the original order.
- [ ] Confirm a failed request preserves the browser cart and entered details;
  confirm a successful response is required before the success page/cart clear.
- [ ] Confirm `online` is recorded only as a selected payment method and no
  payment is reported as processed without a real gateway.

## Tracking and WhatsApp notifications

- [ ] Confirm the raw tracking token is absent from orders, logs, and RPC
  arguments persisted in the database; only its SHA-256 hash is stored.
- [ ] Track a created multi-canteen order with its original token and confirm
  all returned order IDs resolve; confirm a wrong token is rejected.
- [ ] Inspect enabled order triggers before and after migration. Confirm the
  existing trigger still targets the queue consumed by
  `lib/whatsapp-notifications.ts`, and no second active notification trigger
  was introduced.
- [ ] Confirm one durable queue entry per created order/event and that a
  notification-processing failure does not report checkout as failed or
  create another order on retry.
- [ ] Confirm provider delivery, retry, and dead-letter behavior in staging.
  Exactly-once external delivery is not assumed if provider acceptance occurs
  before queue completion is persisted.

## Public menu and staff portal access

- [ ] Anonymous users can read menu rows but cannot insert, update, or delete
  `menu_items`, `orders`, or `order_items`.
- [ ] A student-authenticated user can read menu rows but cannot directly
  insert, update, or delete orders/order items.
- [ ] Admin can read/update/delete orders and order items and manage menu rows.
- [ ] A canteen owner can read/update only orders and items for their mapped
  canteen and can manage menu rows only for that canteen.
- [ ] Riders can see only ready unassigned deliveries and deliveries assigned
  to their mapped driver record; order items match those visible deliveries.
- [ ] A rider can claim only one ready unassigned delivery via the atomic claim
  function and can update only assigned delivery statuses allowed by the
  workflow trigger.
- [ ] Riders cannot change customer/payment/order totals, canteen ownership,
  assignment, or workflow timestamps directly.
- [ ] Unmapped/inactive staff and riders receive no protected order data.
- [ ] Existing admin, canteen-owner, rider, order-history, and menu-management
  screens still work using the actual staging roles and accounts.
