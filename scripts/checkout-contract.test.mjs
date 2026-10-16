// UniEats checkout fix — automated contract + reconciliation tests.
//
// This test locks the route<->RPC contract, server-authoritative pricing,
// idempotency behavior, existing trigger/claim-RPC guarantees, and the
// frontend<->seed catalogue reconciliation. It does not assert the live
// database deployment state or replace end-to-end database checks.
//
// Runs with the built-in Node test runner — no new dependencies:
//   node --test scripts/checkout-contract.test.mjs
//
// It does NOT touch the database. End-to-end order persistence and the
// rider/canteen/WhatsApp workflows still require a staging database (see
// UNIEATS_CHECKOUT_FIX_RUNBOOK.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const require = createRequire(import.meta.url);
const ts = require("typescript");

const route = read("app/api/checkout/route.ts");
const checkoutMigration = read(
  "supabase-migrations/20261015010000_student_checkout_rpc.sql",
);
const canteenSlugMigration = read(
  "supabase-migrations/20261015004000_add_canteen_slugs.sql",
);
const catalogueSeedMigration = read(
  "supabase-migrations/20261015005000_seed_student_menu_catalogue.sql",
);
const menuSeedBatchDirectory = "supabase-migrations/student-menu-seed-batches";
const menuSeedBatchFiles = readdirSync(join(root, menuSeedBatchDirectory))
  .filter((filename) => /^\d{2}_seed_menu_items\.sql$/.test(filename))
  .sort();
const menuSeedBatches = menuSeedBatchFiles.map((filename) =>
  read(`${menuSeedBatchDirectory}/${filename}`),
);
const menuSeedVerification = read(
  `${menuSeedBatchDirectory}/06_verify_menu_seed.sql`,
);
const securityMigration = read(
  "supabase-migrations/20261016000000_checkout_rls_and_grants.sql",
);
const riderWorkflowMigration = read(
  "supabase-migrations/20261016110000_rider_pending_delivery_workflow.sql",
);
const riderPortal = read("components/driver/DriverPortalContent.tsx");
const canteenPortal = read("components/canteen/CanteenPortalContent.tsx");
const menus = read("lib/data/menus.ts");

// ---------------------------------------------------------------------------
// Route -> RPC argument contract
// ---------------------------------------------------------------------------
test("route calls create_student_checkout with the exact named argument contract", () => {
  const expectedArgs = [
    "p_checkout_key",
    "p_request_hash",
    "p_student_name",
    "p_phone",
    "p_order_type",
    "p_delivery_location",
    "p_special_instructions",
    "p_payment_method",
    "p_tracking_token_hash",
    "p_items",
  ];
  const callStart = route.indexOf('client.rpc("create_student_checkout"');
  assert.notEqual(callStart, -1, "route must call the create_student_checkout RPC");
  const callBlock = route.slice(callStart, callStart + 1200);
  for (const arg of expectedArgs) {
    assert.ok(
      callBlock.includes(`${arg}:`),
      `route RPC call is missing named argument ${arg}`,
    );
  }
});

test("security migration ordering refers to the canonical preferred RPC", () => {
  assert.ok(
    securityMigration.includes("AFTER 20261015010000_student_checkout_rpc.sql"),
  );
  assert.ok(
    !securityMigration.includes("AFTER 20261015000000_create_student_checkout_rpc.sql"),
  );
});

test("route sends per-item catalogue_key, canteen_slug, quantity, size, add_on_names", () => {
  const mapStart = route.indexOf("p_items: input.items.map");
  const itemMap = route.slice(mapStart, mapStart + 500);
  for (const field of [
    "client_line_id",
    "catalogue_key",
    "canteen_slug",
    "quantity",
    "size",
    "add_on_names",
  ]) {
    assert.ok(itemMap.includes(field), `p_items mapping missing ${field}`);
  }
});

test("route rejects non-string size values instead of silently dropping them", () => {
  assert.ok(
    /value\.size !== undefined[\s\S]*?typeof value\.size !== "string"[\s\S]*?throw new Error\("A selected item size is invalid\."\)/.test(
      route,
    ),
  );
});

test("route expects a JSONB result containing a non-empty per-canteen orders array", () => {
  assert.ok(
    route.includes('Array.isArray((data as { orders?: unknown }).orders)'),
    "route must validate the returned orders array",
  );
  assert.ok(
    route.includes('(data as { orders: unknown[] }).orders.length === 0'),
    "route must reject an empty orders array",
  );
});

test("route maps every RPC failure code the migration can raise", () => {
  const expectedCodes = [
    "CHECKOUT_FORBIDDEN",
    "CHECKOUT_INVALID_REQUEST",
    "CHECKOUT_INVALID_SELECTION",
    "CHECKOUT_KEY_REUSED",
    "CHECKOUT_RETRY_STATE_INVALID",
    "CHECKOUT_CANTEEN_MAPPING_INVALID",
    "CHECKOUT_CANTEEN_CLOSED",
    "CHECKOUT_ITEM_UNAVAILABLE",
  ];
  const functionStart = checkoutMigration.indexOf(
    "CREATE OR REPLACE FUNCTION public.create_student_checkout(",
  );
  const functionEnd = checkoutMigration.indexOf("$function$;", functionStart);
  assert.notEqual(functionStart, -1, "checkout RPC definition must exist");
  assert.ok(functionEnd > functionStart, "checkout RPC body must be delimited");
  const rpcSource = checkoutMigration.slice(functionStart, functionEnd);
  const actualCodes = [
    ...new Set(
      [...rpcSource.matchAll(/RAISE EXCEPTION '([A-Z][A-Z0-9_]+)'/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
  assert.deepEqual(actualCodes, [...expectedCodes].sort());
  for (const code of expectedCodes) {
    assert.ok(route.includes(code), `route is missing handling for ${code}`);
  }
  assert.ok(!route.includes("CHECKOUT_INVALID_QUANTITY"));
  const quantityValidationStart = rpcSource.indexOf("OR CASE");
  const quantityValidationEnd = rpcSource.indexOf("END IF;", quantityValidationStart);
  assert.ok(quantityValidationStart !== -1 && quantityValidationEnd > quantityValidationStart);
  assert.ok(
    rpcSource.slice(quantityValidationStart, quantityValidationEnd).includes(
      "CHECKOUT_INVALID_REQUEST",
    ),
    "invalid quantities currently raise CHECKOUT_INVALID_REQUEST",
  );
});

test("route uses the service-role key as the only checkout DB client (narrow write path)", () => {
  assert.ok(route.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(
    !route.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    "checkout must not fall back to a browser key for writes",
  );
});

// ---------------------------------------------------------------------------
// Migration -> RPC signature + server-authoritative pricing
// ---------------------------------------------------------------------------
test("checkout migration defines create_student_checkout with the matching 10-arg signature", () => {
  assert.ok(
    checkoutMigration.includes("CREATE OR REPLACE FUNCTION public.create_student_checkout("),
  );
  const sig = checkoutMigration.slice(
    checkoutMigration.indexOf("CREATE OR REPLACE FUNCTION public.create_student_checkout("),
    checkoutMigration.indexOf(") RETURNS JSONB"),
  );
  for (const arg of [
    "p_checkout_key UUID",
    "p_request_hash TEXT",
    "p_student_name TEXT",
    "p_phone TEXT",
    "p_order_type TEXT",
    "p_delivery_location TEXT",
    "p_special_instructions TEXT",
    "p_payment_method TEXT",
    "p_tracking_token_hash TEXT",
    "p_items JSONB",
  ]) {
    assert.ok(sig.includes(arg), `RPC signature missing ${arg}`);
  }
  assert.ok(checkoutMigration.includes("RETURNS JSONB"));
});

test("checkout migration restricts the RPC to service_role only", () => {
  assert.ok(
    checkoutMigration.includes("GRANT EXECUTE ON FUNCTION public.create_student_checkout("),
  );
  assert.ok(
    checkoutMigration.includes(") TO service_role;"),
    "RPC must be granted to service_role",
  );
  assert.ok(
    checkoutMigration.includes("IF coalesce(auth.role(), '') <> 'service_role' THEN"),
    "RPC must reject non-service_role callers",
  );
});

test("delivery charge is Rs 45 per canteen for delivery and 0 for pickup (server-side)", () => {
  assert.ok(
    checkoutMigration.includes(
      "CASE WHEN p_order_type = 'delivery' THEN 45 ELSE 0 END",
    ),
    "delivery charge must be computed server-side as 45 per canteen for delivery, 0 for pickup",
  );
});

test("RPC derives prices from menu_items and never trusts browser prices", () => {
  assert.ok(
    checkoutMigration.includes("FROM public.menu_items AS m"),
    "RPC must read authoritative prices from menu_items",
  );
  assert.ok(
    checkoutMigration.includes("AND m.available IS TRUE"),
    "RPC must enforce availability",
  );
  assert.ok(
    checkoutMigration.includes("v_unit_price := v_base_price + v_add_on_total;"),
    "unit price must be base + add-ons from the DB row",
  );
});

test("RPC returns one order group per canteen with receipt fields the client validates", () => {
  const receiptStart = checkoutMigration.indexOf(
    "v_receipt_items := v_receipt_items ||",
  );
  const receiptEnd = checkoutMigration.indexOf(
    "v_total_subtotal := v_total_subtotal + v_group_subtotal;",
  );
  assert.ok(receiptStart !== -1 && receiptEnd > receiptStart, "receipt build not found");
  const receipt = checkoutMigration.slice(receiptStart, receiptEnd);
  for (const field of [
    "'id'",
    "'orderNumber'",
    "'canteenId'",
    "'canteenSlug'",
    "'canteenName'",
    "'subtotal'",
    "'deliveryCharge'",
    "'totalAmount'",
    "'createdAt'",
    "'items'",
  ]) {
    assert.ok(receipt.includes(field), `receipt group missing ${field}`);
  }
  for (const field of ["'clientLineId'", "'itemName'", "'unitPrice'", "'subtotal'"]) {
    assert.ok(receipt.includes(field), `receipt item missing ${field}`);
  }
});

// ---------------------------------------------------------------------------
// Idempotency behavior
// ---------------------------------------------------------------------------
test("idempotency table enforces a unique key and stores the request hash + result", () => {
  assert.ok(
    checkoutMigration.includes("CREATE TABLE IF NOT EXISTS public.checkout_idempotency ("),
  );
  assert.ok(checkoutMigration.includes("checkout_key UUID PRIMARY KEY"));
  assert.ok(checkoutMigration.includes("request_hash TEXT NOT NULL"));
  assert.ok(checkoutMigration.includes("result JSONB"));
});

test("idempotency serializes retries, returns cached results, and rejects changed reuse", () => {
  assert.ok(
    checkoutMigration.includes("pg_advisory_xact_lock("),
    "must serialize calls sharing a checkout key before reading idempotency state",
  );
  assert.ok(
    /WHERE checkout_key = p_checkout_key\s+FOR UPDATE;/.test(checkoutMigration),
    "must lock the idempotency row to serialize concurrent retries",
  );
  assert.ok(
    checkoutMigration.includes("RAISE EXCEPTION 'CHECKOUT_KEY_REUSED';"),
    "must reject reuse of a key with a different request hash",
  );
  assert.ok(
    /IF v_existing_result IS NOT NULL THEN\s+RETURN v_existing_result;/.test(
      checkoutMigration,
    ),
    "must return the original successful result for an identical repeat",
  );
});

test("checkout migration is a single atomic transaction", () => {
  assert.ok(/^BEGIN;/m.test(checkoutMigration));
  assert.ok(/^COMMIT;/m.test(checkoutMigration));
});

test("RPC validates items (availability/selection/quantity) before creating any order", () => {
  assert.ok(checkoutMigration.includes("RAISE EXCEPTION 'CHECKOUT_ITEM_UNAVAILABLE';"));
  assert.ok(checkoutMigration.includes("RAISE EXCEPTION 'CHECKOUT_INVALID_SELECTION';"));
  assert.ok(checkoutMigration.includes("RAISE EXCEPTION 'CHECKOUT_CANTEEN_CLOSED';"));
  assert.ok(
    /NOT BETWEEN 1\s*\n?\s*AND 20/.test(checkoutMigration),
    "RPC must reject out-of-range quantities server-side",
  );
  assert.ok(checkoutMigration.includes("RAISE EXCEPTION 'CHECKOUT_INVALID_REQUEST';"));
});

test("RPC rejects closed or null-open canteens without confusing invalid mappings", () => {
  const lookup = checkoutMigration.slice(
    checkoutMigration.indexOf("SELECT c.id, c.name, c.is_open, c.slug"),
    checkoutMigration.indexOf("v_group_subtotal := 0"),
  );
  assert.ok(lookup.includes("IF NOT FOUND"));
  assert.ok(lookup.includes("v_canteen_id IS NULL"));
  assert.ok(lookup.includes("v_canteen_slug IS DISTINCT FROM v_canteen_text"));
  assert.ok(lookup.includes("RAISE EXCEPTION 'CHECKOUT_CANTEEN_MAPPING_INVALID';"));
  assert.ok(lookup.includes("v_canteen_is_open IS DISTINCT FROM TRUE"));
  assert.ok(lookup.includes("RAISE EXCEPTION 'CHECKOUT_CANTEEN_CLOSED';"));
  assert.ok(checkoutMigration.includes("('canteens', 'is_open')"));
  assert.ok(checkoutMigration.includes("('canteens', 'slug')"));
  assert.ok(route.includes("CHECKOUT_CANTEEN_MAPPING_INVALID"));
});

test("RPC preflights exact validated order type/payment checks and unique order numbers", () => {
  assert.ok(checkoutMigration.includes("v_has_order_type_check BOOLEAN"));
  assert.ok(checkoutMigration.includes("v_has_payment_check BOOLEAN"));
  assert.ok(checkoutMigration.includes("c.convalidated"));
  assert.ok(checkoutMigration.includes("'checkorder_typeinpickup,delivery'"));
  assert.ok(checkoutMigration.includes("'checkpayment_methodincod,online'"));

  for (const [checkName, variableName, allowed] of [
    [
      "payment",
      "payment",
      [
        "checkpayment_method=anyarraycod,online",
        "checkpayment_method=anyarrayonline,cod",
        "checkpayment_methodisnullorpayment_method=anyarraycod,online",
        "checkpayment_methodisnullorpayment_method=anyarrayonline,cod",
        "checkpayment_methodincod,online",
        "checkpayment_methodinonline,cod",
      ],
    ],
    [
      "order type",
      "order_type",
      [
        "checkorder_type=anyarraypickup,delivery",
        "checkorder_type=anyarraydelivery,pickup",
        "checkorder_typeinpickup,delivery",
        "checkorder_typeindelivery,pickup",
      ],
    ],
  ]) {
    const intoPosition = checkoutMigration.indexOf(
      `INTO v_has_${variableName}_check`,
    );
    const blockStart = checkoutMigration.lastIndexOf(
      "SELECT count(*) = 1",
      intoPosition,
    );
    const blockEnd = checkoutMigration.indexOf(
      `IF NOT v_has_${variableName}_check`,
      blockStart,
    );
    const constraintBlock =
      intoPosition >= 0 && blockStart >= 0 && blockEnd > blockStart
        ? checkoutMigration.slice(blockStart, blockEnd)
        : "";
    assert.ok(constraintBlock, `missing ${checkName} constraint validation`);
    assert.ok(
      constraintBlock.includes(
        "'::(character varying|varchar|text)|[[:space:]()]'",
      ),
      `${checkName} normalization must strip PostgreSQL text casts and formatting`,
    );
    assert.ok(
      constraintBlock.includes("'[]' || chr(39)"),
      `${checkName} normalization must strip array brackets and quote marks`,
    );
    assert.ok(constraintBlock.includes("c.convalidated"));
    assert.ok(constraintBlock.includes(") = 1"));
    for (const expectedConstraint of allowed) {
      assert.ok(
        constraintBlock.includes(`'${expectedConstraint}'`),
        `${checkName} preflight must retain exact allowed values`,
      );
    }
  }
  assert.ok(checkoutMigration.includes("orders.order_type must have a validated check constraint"));
  assert.ok(checkoutMigration.includes("orders.payment_method must have a validated check constraint"));
  assert.ok(checkoutMigration.includes("a.attname = 'order_number'"));
  assert.ok(checkoutMigration.includes("i.indisunique"));
  assert.ok(checkoutMigration.includes("i.indpred IS NULL"));
  assert.ok(checkoutMigration.includes("orders.order_number must have a valid, non-partial unique constraint or index"));
  assert.ok(!/ALTER TABLE public\.orders\s+(ADD|DROP|ALTER)\s+CONSTRAINT/i.test(checkoutMigration));
  assert.ok(!/CREATE UNIQUE INDEX[^;]*ON public\.orders/i.test(checkoutMigration));
});

test("checkout migration preserves enabled WhatsApp and workflow triggers", () => {
  for (const name of [
    "orders_enqueue_whatsapp_order_notification_queue",
    "orders_remove_whatsapp_order_notification_queue",
    "validate_order_workflow_update",
  ]) {
    assert.ok(checkoutMigration.includes(`t.tgname = '${name}'`), `${name} must be preflighted`);
  }
  assert.ok(checkoutMigration.includes("t.tgenabled IN ('O', 'A')"));
  assert.ok(checkoutMigration.includes("(t.tgtype & 4) = 4"));
  assert.ok(checkoutMigration.includes("(t.tgtype & 8) = 8"));
  assert.ok(checkoutMigration.includes("(t.tgtype & 16) = 16"));
  assert.ok(!/DROP\s+TRIGGER/i.test(checkoutMigration));
  assert.ok(!/CREATE\s+(?:OR REPLACE\s+)?TRIGGER/i.test(checkoutMigration));
  assert.ok(!/CREATE\s+OR REPLACE\s+FUNCTION\s+public\.(?:enqueue_whatsapp_order_notification_queue|remove_whatsapp_order_notification_queue|validate_order_workflow_update)/i.test(checkoutMigration));
});


// ---------------------------------------------------------------------------
// The checkout migration must NOT change RLS, triggers, or grants
// ---------------------------------------------------------------------------
test("checkout migration does not enable RLS, drop triggers, or revoke table grants", () => {
  assert.ok(
    !/ALTER TABLE public\.orders ENABLE ROW LEVEL SECURITY/i.test(checkoutMigration),
    "checkout migration must not enable RLS on orders (separate security migration)",
  );
  assert.ok(
    !/DROP TRIGGER/i.test(checkoutMigration),
    "checkout migration must not drop any trigger",
  );
  assert.ok(
    !/REVOKE ALL ON TABLE public\.(orders|order_items|menu_items)/i.test(checkoutMigration),
    "checkout migration must not revoke table grants",
  );
});

// ---------------------------------------------------------------------------
// Security migration: preserve the claim RPC, workflow trigger, WhatsApp triggers
// ---------------------------------------------------------------------------
test("security migration preserves the live claim_delivery_order(uuid) (no drop/redefine)", () => {
  assert.ok(
    !/DROP FUNCTION[^\n]*claim_delivery_order/i.test(securityMigration),
    "must not drop claim_delivery_order",
  );
  assert.ok(
    !/CREATE (OR REPLACE )?FUNCTION public\.claim_delivery_order/i.test(securityMigration),
    "must not redefine claim_delivery_order (signature must stay uuid)",
  );
  assert.ok(
    securityMigration.includes("claim_delivery_order(uuid)"),
    "must reference the live uuid signature when re-checking grants",
  );
});

test("security migration validates the exact live rider claim identity and properties", () => {
  const claimPreflight = securityMigration.match(
    /-- \(d\) The LIVE rider claim RPC[\s\S]*?(?=-- \(e\) The order workflow)/,
  )?.[0];
  assert.ok(claimPreflight, "claim preflight block must be present");
  assert.ok(
    claimPreflight.includes(
      "p.oid = to_regprocedure('public.claim_delivery_order(uuid)')",
    ),
    "preflight must select the exact UUID overload",
  );
  assert.ok(
    claimPreflight.includes("p.prosecdef") &&
      claimPreflight.includes("pg_get_userbyid(p.proowner) AS owner_name") &&
      claimPreflight.includes("owner_name IS DISTINCT FROM 'postgres'"),
    "preflight must validate SECURITY DEFINER and the postgres owner",
  );
  assert.ok(
    claimPreflight.includes(
      "TABLE(order_id uuid, order_status text, accepted_at timestamp with time zone)",
    ) &&
      claimPreflight.includes("result_definition IS DISTINCT FROM"),
    "preflight must validate every result column and type",
  );
  assert.ok(
    /regexp_replace\(\s*split_part\(config\.setting, '=', 2\),\s*'\[\[:space:\]\]'\s*,\s*''\s*,\s*'g'/s.test(
      claimPreflight,
    ) &&
      claimPreflight.includes("= 'public,pg_temp'"),
    "search_path comparison must tolerate whitespace but require the exact safe path",
  );
  assert.ok(
    !/CREATE (OR REPLACE )?FUNCTION public\.claim_delivery_order/i.test(
      securityMigration,
    ),
    "migration must validate the existing claim function, not redefine it",
  );
});

test("claim RPC preflight checks the verified ready-to-driver-acceptance contract", () => {
  const claimPreflight = securityMigration.match(
    /-- \(d\) The LIVE rider claim RPC[\s\S]*?(?=-- \(e\) The order workflow)/,
  )?.[0];
  assert.ok(claimPreflight);
  for (const expected of [
    "position('status' IN v_claim.function_source)",
    "position('ready' IN v_claim.function_source)",
    "position('driver_id' IN v_claim.function_source)",
    "position('driver_accepted_at' IN v_claim.function_source)",
  ]) {
    assert.ok(claimPreflight.includes(expected), `missing check: ${expected}`);
  }
  assert.ok(
    !claimPreflight.includes("out_for_delivery"),
    "claim RPC must not be required to change status to out_for_delivery",
  );
  for (const diagnostic of [
    "SECURITY DEFINER is not enabled",
    "owner is not postgres",
    "return columns or types do not match",
    "search_path is not exactly public, pg_temp",
    "claim body does not contain the verified ready-status check",
    "claim body does not assign/check driver_id",
    "claim body does not set driver_accepted_at",
  ]) {
    assert.ok(claimPreflight.includes(diagnostic), `missing diagnostic: ${diagnostic}`);
  }
});

test("claim RPC preflight cannot raise with an empty diagnostic", () => {
  const claimPreflight = securityMigration.match(
    /-- \(d\) The LIVE rider claim RPC[\s\S]*?(?=-- \(e\) The order workflow)/,
  )?.[0];
  assert.ok(claimPreflight);
  assert.ok(
    securityMigration.includes(
      "v_claim_problems TEXT[] := ARRAY[]::TEXT[]",
    ),
    "diagnostics must begin as a non-null empty array",
  );
  assert.ok(
    !claimPreflight.includes("concat_ws("),
    "avoid concat_ws returning an empty string when every check passes",
  );
  assert.ok(
    claimPreflight.includes("IF cardinality(v_claim_problems) > 0 THEN") &&
      claimPreflight.includes("array_to_string(v_claim_problems, '; ')"),
    "raise only when explicit failed checks exist and report the collected failures",
  );
  assert.equal(
    ["SECURITY DEFINER is not enabled", "owner is not postgres",
      "return columns or types do not match the required TABLE result",
      "search_path is not exactly public, pg_temp",
      "claim body does not contain the verified ready-status check",
      "claim body does not assign/check driver_id",
      "claim body does not set driver_accepted_at"]
      .filter((diagnostic) => claimPreflight.includes(diagnostic)).length,
    7,
    "every failed condition must have a non-empty diagnostic",
  );
});

test("security migration preserves authenticated-only rider claim execution", () => {
  assert.ok(
    securityMigration.includes(
      "REVOKE ALL ON FUNCTION public.claim_delivery_order(uuid) FROM PUBLIC, anon",
    ),
  );
  assert.ok(
    securityMigration.includes(
      "GRANT EXECUTE ON FUNCTION public.claim_delivery_order(uuid) TO authenticated",
    ),
  );
  assert.ok(
    securityMigration.includes(
      "rider claim RPC must remain executable by authenticated and unavailable to anon",
    ),
  );
});

test("security migration preserves the order workflow + WhatsApp triggers", () => {
  assert.ok(
    !/DROP TRIGGER[^\n]*validate_order_workflow_update/i.test(securityMigration),
    "must not drop the order workflow validation trigger",
  );
  assert.ok(
    !/DROP TRIGGER[^\n]*whatsapp/i.test(securityMigration),
    "must not drop the WhatsApp notification triggers",
  );
  assert.ok(securityMigration.includes("validate_order_workflow_update"));
  assert.ok(securityMigration.includes("whatsapp_order_notification_queue"));
});

test("security migration replaces redundant legacy rider policies with reviewed staff policies", () => {
  for (const [table, policies] of [
    [
      "orders",
      [
        "orders_driver_select_restrictive",
        "orders_driver_assigned_select",
        "orders_driver_unassigned_select",
        "orders_driver_assigned_update",
        "orders_driver_update_restrictive",
      ],
    ],
    [
      "order_items",
      [
        "order_items_driver_select_restrictive",
        "order_items_driver_assigned_select",
        "order_items_driver_unassigned_select",
      ],
    ],
  ]) {
    for (const policy of policies) {
      assert.ok(
        securityMigration.includes(
          `DROP POLICY IF EXISTS ${policy} ON public.${table};`,
        ),
        `${policy} must be replaced rather than survive as an unverified rule`,
      );
    }
  }
});

test("security migration is fail-closed and least-privilege", () => {
  assert.ok(/^BEGIN;/m.test(securityMigration));
  assert.ok(/^COMMIT;/m.test(securityMigration));
  assert.ok(
    securityMigration.includes("RAISE EXCEPTION"),
    "security migration must abort on unexpected live state",
  );
  assert.ok(
    !/GRANT[^\n]*INSERT[^\n]*ON TABLE public\.orders TO authenticated/i.test(
      securityMigration,
    ),
    "authenticated must not be granted INSERT on orders",
  );
  assert.ok(
    !/GRANT[^\n]*INSERT[^\n]*ON TABLE public\.order_items TO authenticated/i.test(
      securityMigration,
    ),
    "authenticated must not be granted INSERT on order_items",
  );
  assert.match(
    securityMigration,
    /REVOKE ALL ON TABLE public\.orders, public\.order_items, public\.menu_items\s+FROM PUBLIC, anon, authenticated;/i,
    "security migration must clear inherited table-level privileges, including TRUNCATE, before re-granting scoped staff access",
  );
  assert.ok(securityMigration.includes("menu_items_public_read"));
  assert.ok(
    securityMigration.includes(
      "unexpected policies exist on orders, order_items, or menu_items",
    ),
    "security migration must abort rather than leave unknown permissive policies in place",
  );
  assert.ok(
    securityMigration.includes(
      "GRANT SELECT ON TABLE public.menu_items TO anon, authenticated;",
    ),
  );
});

// ---------------------------------------------------------------------------
// Student delivery checkout -> Rider Portal lifecycle
// ---------------------------------------------------------------------------
test("student delivery checkout creates pending orders and order items", () => {
  assert.match(
    checkoutMigration,
    /INSERT INTO public\.orders\s*\([\s\S]*?order_type,[\s\S]*?status,[\s\S]*?\)\s*VALUES\s*\([\s\S]*?p_order_type,[\s\S]*?'pending'/,
  );
  assert.match(
    checkoutMigration,
    /INSERT INTO public\.order_items\s*\([\s\S]*?order_id,[\s\S]*?menu_item_id,[\s\S]*?item_name,[\s\S]*?quantity,[\s\S]*?price,[\s\S]*?subtotal/,
  );
});

test("Rider Portal includes unassigned pending deliveries but excludes pickup", () => {
  assert.ok(riderPortal.includes('.eq("order_type", "delivery")'));
  assert.ok(riderPortal.includes("driver_id.is.null,driver_id.eq.${profile.driver_id}"));
  assert.match(riderPortal, /const RIDER_STATUSES = \[[\s\S]*?"pending"[\s\S]*?"confirmed"/);
  assert.ok(
    riderWorkflowMigration.includes("AND status = 'pending'"),
    "RLS must expose unassigned pending deliveries to mapped riders",
  );
  assert.ok(
    riderWorkflowMigration.includes("o.status = 'pending'"),
    "order-item RLS must expose items for unassigned pending deliveries",
  );
});

test("rider migration preserves assigned-rider updates and admin delete policies", () => {
  assert.ok(
    riderWorkflowMigration.includes("policyname = 'orders_staff_update'"),
    "preflight must require the existing orders update policy",
  );
  assert.ok(
    riderWorkflowMigration.includes("qual ILIKE '%current_staff_driver_id%'")
      && riderWorkflowMigration.includes("with_check ILIKE '%current_staff_driver_id%'"),
    "preflight must require mapped-rider scope for both update checks",
  );
  assert.ok(
    riderWorkflowMigration.includes("qual ILIKE '%canteen_owner%'")
      && riderWorkflowMigration.includes("with_check ILIKE '%canteen_owner%'"),
    "preflight must require canteen-owner scope for both update checks",
  );
  assert.ok(
    riderWorkflowMigration.includes("policyname = 'orders_admin_delete'")
      && riderWorkflowMigration.includes("policyname = 'order_items_admin_delete'"),
    "preflight must require existing admin-only delete policies",
  );
  assert.doesNotMatch(
    riderWorkflowMigration,
    /(?:DROP|CREATE)\s+POLICY\s+(?:IF\s+EXISTS\s+)?orders_staff_update/i,
    "the rider migration must not replace the assigned-rider update policy",
  );
  assert.doesNotMatch(
    riderWorkflowMigration,
    /(?:DROP|CREATE)\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:orders_admin_delete|order_items_admin_delete)/i,
    "the rider migration must not replace admin delete policies",
  );
});

test("Rider Portal polls and subscribes to order changes", () => {
  assert.ok(riderPortal.includes("setInterval("));
  assert.ok(riderPortal.includes("}, 15000)"));
  assert.ok(riderPortal.includes('"postgres_changes"'));
  assert.ok(riderPortal.includes('table: "orders"'));
  assert.ok(riderPortal.includes('table: "order_items"'));
});

test("rider claim atomically confirms a pending delivery for an active mapped rider", () => {
  const claimStart = riderWorkflowMigration.indexOf(
    "CREATE OR REPLACE FUNCTION public.claim_delivery_order(p_order_id UUID)",
  );
  const claimEnd = riderWorkflowMigration.indexOf("$function$;", claimStart);
  assert.ok(claimStart !== -1 && claimEnd > claimStart);
  const claim = riderWorkflowMigration.slice(claimStart, claimEnd);
  assert.ok(claim.includes("RETURNS TABLE(order_id UUID, order_status TEXT, accepted_at TIMESTAMPTZ)"));
  assert.ok(claim.includes("SECURITY DEFINER"));
  assert.ok(claim.includes("SET search_path = pg_catalog, public, pg_temp"));
  assert.ok(claim.includes("auth.role(), '') <> 'authenticated'"));
  assert.ok(claim.includes("public.current_staff_role() IS DISTINCT FROM 'driver'"));
  assert.ok(claim.includes("public.current_staff_driver_id()"));
  assert.ok(claim.includes("SET driver_id = v_driver_id"));
  assert.ok(claim.includes("status = 'confirmed'"));
  assert.ok(claim.includes("driver_accepted_at = statement_timestamp()"));
  assert.ok(claim.includes("o.order_type = 'delivery'"));
  assert.ok(claim.includes("o.status = 'pending'"));
  assert.ok(claim.includes("o.driver_id IS NULL"));
  assert.ok(claim.includes("o.driver_accepted_at IS NULL"));
  assert.ok(
    riderWorkflowMigration.replace(/\s+/g, " ").includes(
      "GRANT EXECUTE ON FUNCTION public.claim_delivery_order(UUID) TO authenticated;",
    ),
  );
  assert.ok(
    riderWorkflowMigration.replace(/\s+/g, " ").includes(
      "REVOKE ALL ON FUNCTION public.claim_delivery_order(UUID) FROM PUBLIC, anon;",
    ),
  );
});

test("rider workflow protects order details and allows confirmed-to-delivered", () => {
  const validatorStart = riderWorkflowMigration.indexOf(
    "CREATE OR REPLACE FUNCTION public.validate_order_workflow_update()",
  );
  const validatorEnd = riderWorkflowMigration.indexOf("$function$;", validatorStart);
  assert.ok(validatorStart !== -1 && validatorEnd > validatorStart);
  const validator = riderWorkflowMigration.slice(validatorStart, validatorEnd);
  assert.ok(validator.includes("SECURITY INVOKER"));
  assert.ok(validator.includes("SET search_path = pg_catalog, public, pg_temp"));
  assert.ok(!validator.includes("SECURITY DEFINER"));
  assert.match(
    validator,
    /v_staff_role := public\.current_staff_role\(\);\s+IF v_staff_role IS NULL AND auth\.uid\(\) IS NULL THEN\s+RETURN NEW;\s+END IF;\s+v_driver_id := public\.current_staff_driver_id\(\);/,
    "server-side updates with no staff role and no auth UID must bypass staff validation before rider lookup",
  );
  assert.ok(
    validator.includes("ELSIF v_staff_role IS DISTINCT FROM 'admin' THEN"),
    "admin updates must retain the validator bypass",
  );
  assert.ok(validator.includes("OLD.status = 'pending'"));
  assert.ok(validator.includes("NEW.status = 'confirmed'"));
  assert.ok(validator.includes("NEW.driver_id = v_driver_id"));
  assert.ok(validator.includes("OLD.driver_id IS NULL"));
  assert.ok(validator.includes("NEW.driver_accepted_at IS NOT NULL"));
  assert.match(
    validator,
    /WHEN 'confirmed' THEN\s+NEW\.confirmed_at := COALESCE\(OLD\.confirmed_at, statement_timestamp\(\)\)/,
  );
  assert.match(
    validator,
    /WHEN 'delivered' THEN\s+NEW\.delivered_at := COALESCE\(OLD\.delivered_at, statement_timestamp\(\)\)/,
  );
  assert.match(
    validator,
    /OLD\.status = 'confirmed'\s+AND NEW\.status = 'delivered'/,
  );
  assert.ok(validator.includes("NEW.driver_id IS DISTINCT FROM OLD.driver_id"));
  assert.ok(validator.includes("public.current_staff_driver_id()"));
  assert.match(
    validator,
    /to_jsonb\(NEW\)\s*-\s*ARRAY\[[\s\S]*?\]\)\s*IS DISTINCT FROM\s*\(to_jsonb\(OLD\)\s*-\s*ARRAY\[/,
  );
  for (const protectedField of [
    "total_amount",
    "student_name",
    "phone",
    "canteen_id",
    "order_type",
  ]) {
    assert.ok(
      !validator.includes(`'${protectedField}'`),
      `${protectedField} must not be in the rider/canteen mutable-field allow lists`,
    );
  }
  assert.ok(validator.includes("NEW.delivered_at := COALESCE(OLD.delivered_at, statement_timestamp())"));
  assert.ok(validator.includes("OLD.order_type = 'delivery' OR NEW.order_type = 'delivery'"));
  assert.ok(validator.includes("Delivery orders are handled by the assigned rider"));
});

test("Rider Portal renders only Confirm Order and Order Delivered as order actions", () => {
  assert.ok(riderPortal.includes('"Confirm Order"'));
  assert.ok(riderPortal.includes('"Order Delivered"'));
  assert.ok(!riderPortal.includes('"Start Delivery"'));
  assert.ok(!riderPortal.includes('"Start Preparing"'));
  assert.ok(!riderPortal.includes('"Mark Ready"'));
  assert.ok(riderPortal.includes('order.status !== "pending" || order.driver_id != null'));
  assert.ok(riderPortal.includes('supabaseAuth.rpc("claim_delivery_order"'));
  assert.match(
    riderPortal,
    /\.update\(\{ status: nextStatus \}\)[\s\S]*?\.eq\("driver_id", driverId\)[\s\S]*?\.eq\("status", order\.status\)/,
  );
  assert.ok(riderPortal.includes('nextStatus: "delivered"'));
});

test("Canteen Portal keeps canonical orders visible but routes delivery actions to riders", () => {
  assert.ok(canteenPortal.includes('supabaseAuth.from("orders").select("*")'));
  assert.ok(canteenPortal.includes('o.status === "pending"'));
  assert.ok(canteenPortal.includes('o.status === "confirmed"'));
  assert.ok(canteenPortal.includes('order.order_type !== "delivery" && action === "accept"'));
  assert.ok(canteenPortal.includes('Delivery orders are handled by the Rider Portal.'));
  assert.ok(
    riderWorkflowMigration.includes("public.current_staff_role() = 'canteen_owner'"),
    "the updated order policies must retain canteen-owner visibility",
  );
});

test("rider workflow migration preserves checkout and WhatsApp triggers", () => {
  for (const trigger of [
    "validate_order_workflow_update",
    "orders_enqueue_whatsapp_order_notification_queue",
    "orders_remove_whatsapp_order_notification_queue",
  ]) {
    assert.ok(riderWorkflowMigration.includes(trigger), `missing preflight for ${trigger}`);
  }
  assert.ok(!/DROP\s+TRIGGER/i.test(riderWorkflowMigration));
  assert.ok(!/CREATE\s+(?:OR REPLACE\s+)?TRIGGER/i.test(riderWorkflowMigration));
  assert.ok(!/INSERT\s+INTO\s+public\.orders/i.test(riderWorkflowMigration));
  assert.ok(!/INSERT\s+INTO\s+public\.order_items/i.test(riderWorkflowMigration));
  assert.ok(riderWorkflowMigration.includes("BEGIN;"));
  assert.ok(riderWorkflowMigration.includes("COMMIT;"));
});

test("rider migration preflights all referenced schema columns and compatible types", () => {
  for (const requiredColumn of [
    "('orders', 'canteen_id')",
    "('orders', 'preparing_at')",
    "('orders', 'ready_at')",
    "('orders', 'out_for_delivery_at')",
    "('orders', 'delivered_at')",
    "('orders', 'updated_at')",
    "('order_items', 'order_id')",
    "('canteens', 'id')",
    "('staff_profiles', 'id')",
    "('staff_profiles', 'role')",
    "('staff_profiles', 'active')",
    "('staff_profiles', 'canteen_id')",
    "('staff_profiles', 'driver_id')",
    "('driver', 'id')",
    "('driver', 'status')",
  ]) {
    assert.ok(
      riderWorkflowMigration.includes(requiredColumn),
      `preflight must require ${requiredColumn}`,
    );
  }

  for (const expectedType of [
    "column_name = 'order_id'",
    "column_name IN ('id', 'canteen_id', 'driver_id')",
    "column_name IN ('order_type', 'status', 'role')",
    "column_name = 'active'",
    "'confirmed_at'",
    "'preparing_at'",
    "'ready_at'",
    "'out_for_delivery_at'",
    "'delivered_at'",
    "'updated_at'",
    "udt_name <> 'uuid'",
    "udt_name <> 'text'",
    "udt_name <> 'bool'",
    "udt_name <> 'timestamptz'",
  ]) {
    assert.ok(
      riderWorkflowMigration.includes(expectedType),
      `preflight must verify compatible type: ${expectedType}`,
    );
  }

  assert.match(
    riderWorkflowMigration,
    /table_name = 'staff_profiles'\s+AND column_name = 'canteen_id'\s+AND udt_name <> 'uuid'/,
    "preflight must require staff_profiles.canteen_id to be UUID-typed",
  );

  assert.ok(
    riderWorkflowMigration.includes(
      "order_items.order_id must have the same type as orders.id.",
    ),
    "the parent and child order keys must have compatible types",
  );
});

test("rider migration postflight verifies visibility, scoped updates, and live triggers", () => {
  for (const assertion of [
    "Rider workflow migration failed postflight: staff SELECT policies must preserve admin/canteen scope and expose only mapped pending delivery orders to riders.",
    "Rider workflow migration failed postflight: the existing RLS-scoped orders UPDATE policy must remain intact.",
    "Rider workflow migration failed postflight: the workflow and WhatsApp triggers must remain enabled and attached.",
    "Rider workflow migration failed postflight: staff helper ownership, SECURITY DEFINER settings, search_path, or grants changed unexpectedly.",
  ]) {
    assert.ok(
      riderWorkflowMigration.includes(assertion),
      `missing fail-closed postflight assertion: ${assertion}`,
    );
  }
  assert.ok(riderWorkflowMigration.includes("AND qual ILIKE '%driver_id IS NULL%'"));
  assert.ok(riderWorkflowMigration.includes("AND qual ILIKE '%status = ''pending''%'"));
  assert.ok(riderWorkflowMigration.includes("AND qual ILIKE '%current_staff_driver_id() IS NOT NULL%'"));
  assert.ok(riderWorkflowMigration.includes("AND NOT ('anon' = ANY(roles))"));
});

test("rider migration preflight fails closed on missing or untrusted definer functions", () => {
  assert.match(
    riderWorkflowMigration,
    /IF NOT FOUND THEN\s+RAISE EXCEPTION\s+'Rider workflow migration blocked: claim_delivery_order\(uuid\) is missing\.';\s+END IF;\s+IF NOT v_claim\.prosecdef/,
  );
  assert.match(
    riderWorkflowMigration,
    /IF NOT FOUND THEN\s+RAISE EXCEPTION\s+'Rider workflow migration blocked: the order workflow trigger function is missing\.';\s+END IF;\s+IF v_workflow\.prosecdef IS DISTINCT FROM FALSE/,
  );
  assert.ok(riderWorkflowMigration.includes("pg_get_userbyid(p.proowner) = 'postgres'"));
  assert.ok(
    riderWorkflowMigration.includes(
      "v_workflow.owner_name IS DISTINCT FROM 'postgres'",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "the order workflow trigger function must remain SECURITY INVOKER and postgres-owned",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "the live order workflow trigger search_path differs from the verified public, pg_temp configuration.",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "validate_order_workflow_update() must remain postgres-owned SECURITY INVOKER with the hardened search_path.",
    ),
  );
  assert.ok(riderWorkflowMigration.includes("AND (t.tgtype & 1) = 1"));
  assert.ok(
    riderWorkflowMigration.includes(
      "to_regprocedure('public.current_staff_canteen_id()')",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "p.proconfig @> ARRAY['search_path=public']::text[]",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes("current_staff_canteen_id() must be executable by authenticated and unavailable to anon."),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "public must not be writable by anon or authenticated",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "OR v_canteen_function_ok IS DISTINCT FROM TRUE",
    ),
  );
  for (const verifiedDriverMappingPredicate of [
    "sp.id = auth.uid()",
    "sp.role = ''driver''",
    "sp.active = true",
    "sp.active is true",
    "d.id = sp.driver_id",
    "d.status = ''active''",
  ]) {
    assert.ok(
      riderWorkflowMigration.includes(verifiedDriverMappingPredicate),
      `preflight must verify mapped active rider predicate: ${verifiedDriverMappingPredicate}`,
    );
  }
  assert.match(
    riderWorkflowMigration,
    /lower\(p\.prosrc\) LIKE '%sp\.active = true%'\s+OR lower\(p\.prosrc\) LIKE '%sp\.active is true%'/,
    "driver helper preflight must accept the verified IS TRUE expression without dropping mapping checks",
  );
  assert.match(
    riderWorkflowMigration,
    /has_table_privilege\(\s+v_claim\.owner_oid,\s+'public\.orders',\s+'UPDATE'\s+\)/,
    "claim definer owner must have effective UPDATE privilege",
  );
  assert.match(
    riderWorkflowMigration,
    /r\.rolbypassrls\s+OR \(c\.relowner = v_claim\.owner_oid AND NOT c\.relforcerowsecurity\)/,
    "claim definer must bypass forced RLS or own a table without FORCE RLS",
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "claim_delivery_order() owner must have effective UPDATE privilege and bypass orders RLS",
    ),
    "unsafe claim execution context must fail before replacement DDL",
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "search_path=pg_catalog, public, pg_temp",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "claim_delivery_order(uuid) must remain postgres-owned SECURITY DEFINER with the hardened search_path.",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "validate_order_workflow_update() must remain postgres-owned SECURITY INVOKER with the hardened search_path.",
    ),
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "current_staff_role() and current_staff_driver_id() must be executable by authenticated and unavailable to anon.",
    ),
    "invoker workflow must retain authenticated access to the helpers it calls",
  );
  assert.ok(
    riderWorkflowMigration.includes(
      "authenticated must retain the existing RLS-scoped orders UPDATE privilege, unavailable to anon.",
    ),
    "rider status updates require the existing authenticated UPDATE privilege",
  );
  assert.doesNotMatch(
    riderWorkflowMigration,
    /GRANT\s+[^;]*\bON\s+TABLE\s+public\.orders\b/i,
    "rider migration must not broaden orders table privileges",
  );
});


// ---------------------------------------------------------------------------
// Frontend <-> seed catalogue-key reconciliation
// ---------------------------------------------------------------------------
function frontendMenuRecords(source) {
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("exports", "require", "module", javascript)(
    loadedModule.exports,
    () => ({}),
    loadedModule,
  );
  assert.ok(Array.isArray(loadedModule.exports.menuItems));
  return loadedModule.exports.menuItems.map((item) => ({
    catalogue_key: item.id,
    canteen_slug: item.canteenSlug,
    name: item.name,
    price: item.price,
    available: item.available,
    sizes: item.sizes ?? {},
    add_ons: item.addOns ?? [],
    image_url: item.image,
  }));
}

function canonicalMenuRecords(records) {
  return [...records].sort((left, right) =>
    left.catalogue_key.localeCompare(right.catalogue_key, "en"),
  );
}

function seedRecords(migration) {
  const match = migration.match(
    /\$catalogue\$\s*([\s\S]*?)\s*\$catalogue\$::jsonb/,
  );
  assert.ok(match, "static catalogue JSON payload was not found");
  return JSON.parse(match[1]);
}

test("seed matches every frontend catalogue record with a unique stable key", () => {
  const frontendRecords = frontendMenuRecords(menus);
  const canonicalRecords = canonicalMenuRecords(frontendRecords);
  const seeded = seedRecords(catalogueSeedMigration);
  assert.equal(new Set(frontendRecords.map((record) => record.catalogue_key)).size, 203);
  assert.equal(frontendRecords.length, 203);
  assert.equal(canonicalRecords.length, 203);
  assert.equal(seeded.length, 203);
  assert.deepEqual(seeded, canonicalRecords);
});

test("ordered menu seed batches preserve all 203 frontend records without overwrites", () => {
  const expected = canonicalMenuRecords(frontendMenuRecords(menus));
  assert.deepEqual(menuSeedBatchFiles, [
    "01_seed_menu_items.sql",
    "02_seed_menu_items.sql",
    "03_seed_menu_items.sql",
    "04_seed_menu_items.sql",
    "05_seed_menu_items.sql",
  ]);
  const sizes = [];
  const actual = menuSeedBatches.flatMap((batch, index) => {
    assert.ok(batch.startsWith(
      `-- UniEats canonical menu seed, batch ${String(index + 1).padStart(2, "0")} of 05.`,
    ));
    assert.ok(/^BEGIN;/m.test(batch));
    assert.ok(/^COMMIT;/m.test(batch));
    assert.ok(batch.includes("LOCK TABLE public.menu_items IN SHARE ROW EXCLUSIVE MODE"));
    assert.ok(batch.includes("CREATE UNIQUE INDEX IF NOT EXISTS menu_items_catalogue_key_unique"));
    assert.ok(batch.includes("mappings.total_rows <> 1 OR mappings.matching_rows <> 1"));
    assert.ok(batch.includes("count(actual.id) AS total_rows"));
    assert.ok(batch.includes(") AS matching_rows"));
    assert.ok(batch.includes("lower(btrim(actual.name)) = lower(expected.name)"));
    assert.ok(batch.includes("menu_items.id is required but has no database default"));
    assert.ok(batch.includes("existing.price IS DISTINCT FROM seed.price"));
    assert.ok(batch.includes("existing.sizes IS DISTINCT FROM seed.sizes"));
    assert.ok(batch.includes("existing.add_ons IS DISTINCT FROM seed.add_ons"));
    assert.ok(batch.includes("WHERE NOT EXISTS ("));
    assert.ok(batch.includes("column_name = 'image_url'"));
    assert.ok(!/UPDATE\s+public\.menu_items|DELETE\s+FROM\s+public\.menu_items|TRUNCATE|DISABLE\s+ROW\s+LEVEL\s+SECURITY|GRANT\s/i.test(batch));
    const payload = batch.match(
      /\$batch_catalogue\$\s*([\s\S]*?)\s*\$batch_catalogue\$::jsonb/,
    );
    assert.ok(payload, `batch ${index + 1} is missing its JSON payload`);
    const records = JSON.parse(payload[1]);
    sizes.push(records.length);
    return records;
  });
  assert.deepEqual(sizes, [41, 41, 41, 40, 40]);
  assert.equal(actual.length, 203);
  assert.equal(new Set(actual.map((record) => record.catalogue_key)).size, 203);
  assert.deepEqual(actual, expected);
});

test("final menu seed verification is read-only and checks the expected canteen counts", () => {
  assert.ok(menuSeedVerification.includes("WITH expected(canteen_slug, expected_count)"));
  for (const [slug, count] of [
    ["annexe", 3],
    ["bhola", 46],
    ["gssc", 13],
    ["hot-potato", 31],
    ["ssc", 110],
  ]) {
    assert.ok(menuSeedVerification.includes(`('${slug}'::text, ${count})`));
  }
  assert.ok(menuSeedVerification.includes("count(DISTINCT menu.catalogue_key)"));
  assert.ok(menuSeedVerification.includes("global_counts.unique_catalogue_keys = 203"));
  assert.ok(menuSeedVerification.includes("global_counts.total_menu_items = 203"));
  assert.ok(
    menuSeedVerification.includes(
      "global_counts.total_menu_items,\n  global_counts.unique_catalogue_keys",
    ),
    "global count columns must be grouped with the per-canteen aggregates",
  );
  assert.ok(menuSeedVerification.includes("AS verified"));
  assert.ok(!/INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT/i.test(menuSeedVerification));
});

test("stable canteen slug migration maps verified rows and seed resolves by slug", () => {
  assert.ok(/^BEGIN;/m.test(canteenSlugMigration));
  assert.ok(/^COMMIT;/m.test(canteenSlugMigration));
  assert.ok(canteenSlugMigration.includes("ADD COLUMN IF NOT EXISTS slug TEXT"));
  assert.ok(canteenSlugMigration.includes("CREATE UNIQUE INDEX IF NOT EXISTS canteens_slug_unique"));
  assert.ok(canteenSlugMigration.includes("index_info.indisunique"));
  assert.ok(canteenSlugMigration.includes("count(actual.id) <> 1"));
  assert.ok(canteenSlugMigration.includes("actual.slug <> expected.slug"));
  assert.ok(!/DROP\s+|TRUNCATE\s+|DELETE\s+FROM/i.test(canteenSlugMigration));
  assert.ok(
    /JOIN public\.canteens AS actual ON actual\.slug = expected\.slug/.test(
      catalogueSeedMigration,
    ),
  );
  assert.ok(catalogueSeedMigration.includes("CREATE TEMP TABLE unieats_student_canteen_map"));
  assert.ok(catalogueSeedMigration.includes("JOIN unieats_student_canteen_map AS canteen"));
  assert.ok(catalogueSeedMigration.includes("canteen_id UUID PRIMARY KEY"));
  assert.ok(catalogueSeedMigration.includes("canteen_slug TEXT NOT NULL UNIQUE"));
  assert.ok(catalogueSeedMigration.includes("v_unmapped_count <> 0 OR v_source_count <> 203"));
  assert.ok(catalogueSeedMigration.includes("expected 203 canonical records"));
  const rawRecords = JSON.parse(
    catalogueSeedMigration.match(
      /\$catalogue\$\s*([\s\S]*?)\s*\$catalogue\$::jsonb/,
    )[1],
  );
  assert.ok(rawRecords.every((record) => typeof record.canteen_slug === "string"));
  assert.ok(rawRecords.every((record) => !("canteen_id" in record)));
  assert.ok(!/888c85d8|e53aab5b|1d2bef63|9404c1b0|6aae1e41/.test(catalogueSeedMigration));
  assert.ok(!/888c85d8|e53aab5b|1d2bef63|9404c1b0|6aae1e41/.test(canteenSlugMigration));
  assert.ok(!/888c85d8|e53aab5b|1d2bef63|9404c1b0|6aae1e41/.test(route));
});

test("seed inserts the full catalogue into an empty table and is repeat-safe without overwrites", () => {
  assert.equal(seedRecords(catalogueSeedMigration).length, 203);
  assert.ok(catalogueSeedMigration.includes("WHERE NOT EXISTS ("));
  assert.ok(catalogueSeedMigration.includes("post-insert verification"));
  assert.ok(!/UPDATE\s+public\.menu_items/i.test(catalogueSeedMigration));
  assert.ok(!/DELETE\s+FROM\s+public\.menu_items/i.test(catalogueSeedMigration));
  assert.ok(!/ON CONFLICT\s*\([^)]*\)\s*DO UPDATE/i.test(catalogueSeedMigration));
});

test("seed supports schemas both with and without optional image_url", () => {
  assert.ok(
    !/\('menu_items',\s*'image_url'/.test(catalogueSeedMigration),
    "image_url must not be a required seed column",
  );
  assert.ok(
    catalogueSeedMigration.includes("column_name = 'image_url'"),
    "seed must inspect whether image_url exists",
  );
  assert.ok(catalogueSeedMigration.includes("INSERT INTO public.menu_items"));
});

test("the preferred checkout RPC migration defines the canonical function", () => {
  assert.ok(
    checkoutMigration.includes("CREATE OR REPLACE FUNCTION public.create_student_checkout("),
  );
  assert.ok(
    !checkoutMigration.includes("20261015000000_create_student_checkout_rpc.sql"),
    "canonical RPC migration must not redirect to a competing migration",
  );
});

test("both Lemon Soda catalogue entries retain distinct stable keys and details", () => {
  const sodas = frontendMenuRecords(menus).filter(
    (record) => record.canteen_slug === "bhola" && record.name === "Lemon Soda",
  );
  assert.equal(sodas.length, 2);
  assert.notEqual(sodas[0].catalogue_key, sodas[1].catalogue_key);
  assert.deepEqual(
    seedRecords(catalogueSeedMigration).filter(
      (record) => record.name === "Lemon Soda" && record.canteen_slug === "bhola",
    ),
    sodas,
  );
  assert.equal(sodas[0].image_url, "/menu/grapes-juice.jpg");
  assert.equal(sodas[1].image_url, "/menu/shakes-juices-category.jpg.png");
});

test("seed fails closed on ambiguous canteen slugs and conflicting catalogue rows", () => {
  for (const slug of ["annexe", "bhola", "gssc", "hot-potato", "ssc"]) {
    assert.ok(catalogueSeedMigration.includes(`'${slug}'::text`));
  }
  assert.ok(catalogueSeedMigration.includes("count(actual.id) <> 1"));
  assert.ok(
    catalogueSeedMigration.includes(
      "existing.price IS DISTINCT FROM seed.price",
    ),
  );
  assert.ok(
    catalogueSeedMigration.includes(
      "existing.canteen_id IS DISTINCT FROM seed.canteen_id",
    ),
  );
  assert.ok(catalogueSeedMigration.includes("WHERE NOT EXISTS ("));
  assert.ok(!/UPDATE\s+public\.menu_items/i.test(catalogueSeedMigration));
  assert.ok(!/DELETE\s+FROM\s+public\.menu_items/i.test(catalogueSeedMigration));
  assert.ok(!/888c85d8|e53aab5b|1d2bef63|9404c1b0|6aae1e41/.test(route));
  assert.ok(!/888c85d8|e53aab5b|1d2bef63|9404c1b0|6aae1e41/.test(checkoutMigration));
});

test("checkout RPC verifies, but does not recreate, the catalogue seed's unique index", () => {
  assert.ok(
    !/CREATE UNIQUE INDEX[^;]*ON public\.menu_items\s*\(catalogue_key\)/i.test(
      checkoutMigration,
    ),
    "RPC must not recreate the index already installed by the required seed migration",
  );
  assert.ok(
    checkoutMigration.includes(
      "to_regclass('public.menu_items_catalogue_key_unique')",
    ),
    "RPC must verify that the catalogue seed's unique index exists",
  );
  assert.ok(
    catalogueSeedMigration.includes(
      "CREATE UNIQUE INDEX IF NOT EXISTS menu_items_catalogue_key_unique",
    ),
  );
  assert.ok(catalogueSeedMigration.includes("GROUP BY catalogue_key"));
  assert.ok(catalogueSeedMigration.includes("HAVING count(*) > 1"));
  assert.ok(
    catalogueSeedMigration.includes(
      "CREATE UNIQUE INDEX IF NOT EXISTS menu_items_catalogue_key_unique",
    ),
  );
  assert.ok(catalogueSeedMigration.includes("index_info.indisunique"));
  assert.ok(
    catalogueSeedMigration.includes(
      "fk.confrelid = 'public.canteens'::regclass",
    ),
  );
});

test("preferred RPC preflights order and order-item columns, types, constraints, and foreign keys", () => {
  for (const column of [
    "orders.order_number",
    "orders.student_name",
    "orders.phone",
    "orders.delivery_location",
    "orders.order_type",
    "orders.canteen_id",
    "orders.status",
    "orders.total_amount",
    "orders.delivery_charge",
    "orders.tracking_token_hash",
    "orders.payment_method",
    "order_items.order_id",
    "order_items.menu_item_id",
    "order_items.item_name",
    "order_items.quantity",
    "order_items.price",
    "order_items.subtotal",
  ]) {
    const [table, name] = column.split(".");
    assert.ok(
      checkoutMigration.includes(`('${table}', '${name}')`),
      `preferred RPC preflight is missing ${column}`,
    );
  }
  assert.ok(checkoutMigration.includes("unexpected type"));
  assert.ok(checkoutMigration.includes("additional required column"));
  assert.ok(checkoutMigration.includes("orders.payment_method"));
  assert.ok(checkoutMigration.includes("pickup"));
  assert.ok(checkoutMigration.includes("pending"));
  assert.ok(
    checkoutMigration.includes("fk.confrelid = 'public.orders'::regclass"),
  );
  assert.ok(
    checkoutMigration.includes("fk.confrelid = 'public.menu_items'::regclass"),
  );
  assert.ok(
    checkoutMigration.includes("fk.confrelid = 'public.canteens'::regclass"),
  );
});

// ---------------------------------------------------------------------------
// Pure delivery-fee math (mirrors lib/cart-utils.ts + lib/constants.ts)
// ---------------------------------------------------------------------------
const DELIVERY_FEE_PER_CANTEEN = 45;
function calculateDeliveryFee(canteenCount, orderType) {
  if (orderType !== "delivery" || canteenCount === 0) return 0;
  return DELIVERY_FEE_PER_CANTEEN * canteenCount;
}

test("delivery fee math: Rs 45 per distinct canteen for delivery, 0 for pickup", () => {
  assert.equal(calculateDeliveryFee(0, "delivery"), 0);
  assert.equal(calculateDeliveryFee(1, "delivery"), 45);
  assert.equal(calculateDeliveryFee(3, "delivery"), 135);
  assert.equal(calculateDeliveryFee(3, "pickup"), 0);
});
