-- Deliberate fail-closed placeholder. Do not apply.
--
-- Repository inspection found the menu catalog only in lib/data/menus.ts.
-- It contains frontend item IDs/prices, not an authoritative database
-- menu-item table with a verified key, price, availability, and canteen
-- relationship. The live schema and complete production RLS/grant state are
-- also unavailable here. A checkout RPC or RLS migration cannot safely be
-- authored from those assumptions.
--
-- This transaction always aborts before changing data, RLS, policies,
-- grants, functions, triggers, or the existing rider mapping. Replace this
-- file only after the read-only verification results and a canonical
-- server-side price source have been reviewed.
BEGIN;

DO $$
BEGIN
  RAISE EXCEPTION
    'Migration blocked: verify the live menu schema, canonical prices, and complete RLS/grants before applying rider/checkout security changes.';
END;
$$;

COMMIT;
