# UniEats Supabase Read-Only Diagnostics

Run these queries manually, one at a time, in the Supabase SQL Editor for the
project used by the deployed UniEats application. These statements inspect
PostgreSQL catalogs and metadata; they do not create, change, or delete data,
schema, policies, or privileges, and they do not invoke application functions.

Do not include customer/order rows, credentials, tokens, cookies, or environment
variable values when sharing results. Function and view definitions are source
text; redact any sensitive literal if one appears, while preserving identifiers
and authorization/status logic needed for review.

## 1. Public relations and columns relevant to checkout and delivery

This discovers candidate tables/views rather than assuming menu or checkout
relation names. `relkind` identifies ordinary/partitioned tables, views,
materialized views, and foreign tables.

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  a.attnum AS column_position,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS column_type,
  a.attnotnull AS not_null,
  pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
  a.attidentity AS identity_kind,
  a.attgenerated AS generated_kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef ad
  ON ad.adrelid = c.oid
 AND ad.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND (
    c.relname ~* '(menu|item|product|catalog|canteen|order|checkout|cart|transaction|payment|driver|staff)'
    OR a.attname ~* '(menu|item|product|catalog|canteen|order|checkout|cart|transaction|payment|price|cost|available|active|quantity|group|parent|tracking|driver|status)'
  )
ORDER BY n.nspname, c.relname, a.attnum;
```

## 2. Primary keys, foreign keys, unique/check constraints

```sql
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS relation_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition,
  refns.nspname AS referenced_schema,
  ref.relname AS referenced_relation,
  con.convalidated AS validated
FROM pg_constraint con
JOIN pg_class tbl ON tbl.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
LEFT JOIN pg_class ref ON ref.oid = con.confrelid
LEFT JOIN pg_namespace refns ON refns.oid = ref.relnamespace
WHERE ns.nspname = 'public'
  AND (
    tbl.relname ~* '(menu|item|product|catalog|canteen|order|checkout|cart|transaction|payment|driver|staff)'
    OR EXISTS (
      SELECT 1
      FROM unnest(con.conkey) AS key_column(attnum)
      JOIN pg_attribute a
        ON a.attrelid = con.conrelid
       AND a.attnum = key_column.attnum
      WHERE a.attname ~* '(menu|item|product|catalog|canteen|order|checkout|cart|transaction|payment|price|available|quantity|group|parent|tracking|driver|status)'
    )
  )
ORDER BY tbl.relname, con.contype, con.conname;
```

## 3. Enum labels used by candidate relations

This reports allowed labels for enum types directly used by relevant columns.
If a status is represented by a text column plus a `CHECK` constraint, inspect
the constraint definitions from query 2 instead.

```sql
SELECT
  table_ns.nspname AS schema_name,
  tbl.relname AS relation_name,
  a.attname AS column_name,
  type_ns.nspname AS enum_schema,
  typ.typname AS enum_type,
  enum.enumlabel AS enum_label,
  enum.enumsortorder AS label_order
FROM pg_class tbl
JOIN pg_namespace table_ns ON table_ns.oid = tbl.relnamespace
JOIN pg_attribute a ON a.attrelid = tbl.oid
JOIN pg_type typ ON typ.oid = a.atttypid
JOIN pg_namespace type_ns ON type_ns.oid = typ.typnamespace
JOIN pg_enum enum ON enum.enumtypid = typ.oid
WHERE table_ns.nspname = 'public'
  AND tbl.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND (
    tbl.relname ~* '(menu|item|product|catalog|canteen|order|checkout|cart|transaction|payment|driver|staff)'
    OR a.attname ~* '(menu|item|product|catalog|canteen|order|checkout|cart|transaction|payment|price|available|quantity|group|parent|tracking|driver|status)'
  )
ORDER BY tbl.relname, a.attname, type_ns.nspname, typ.typname, enum.enumsortorder;
```

## 4. Indexes on candidate relations

Indexes may reveal uniqueness/idempotency and lookup keys; an index alone does
not prove that a key is reliably populated by checkout.

```sql
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS relation_name,
  idx.relname AS index_name,
  i.indisprimary AS is_primary,
  i.indisunique AS is_unique,
  i.indisvalid AS is_valid,
  pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
JOIN pg_class tbl ON tbl.oid = i.indrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
JOIN pg_class idx ON idx.oid = i.indexrelid
WHERE ns.nspname = 'public'
  AND tbl.relname ~* '(menu|item|product|catalog|canteen|order|checkout|cart|transaction|payment|driver|staff)'
ORDER BY tbl.relname, idx.relname;
```

## 5. Candidate menu/price source relations and view definitions

These queries identify schema objects that may store trusted prices and reveal
view definitions. They cannot establish by themselves whether data is canonical,
maintained by a trusted process, current, or safe for checkout. Confirm that
with application ownership/edit flows and database privileges/policies.

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  a.attnum AS column_position,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS column_type,
  a.attnotnull AS not_null,
  pg_get_expr(ad.adbin, ad.adrelid) AS column_default
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef ad
  ON ad.adrelid = c.oid
 AND ad.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND (
    c.relname ~* '(menu|item|product|catalog|price)'
    OR a.attname ~* '(menu_item|product_id|item_id|price|unit_price|cost|available|availability|active|canteen_id)'
  )
ORDER BY c.relname, a.attnum;
```

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  c.relkind AS relation_kind,
  pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
  AND c.relname ~* '(menu|item|product|catalog|price)'
ORDER BY c.relname;
```

## 6. Order-related triggers and their full function definitions

Includes triggers attached to candidate menu/catalog relations as well as
orders, order items, staff, drivers, and canteens. Compare the WhatsApp trigger
definitions before proposing any status-trigger changes.

```sql
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS relation_name,
  trg.tgname AS trigger_name,
  CASE trg.tgenabled
    WHEN 'O' THEN 'enabled'
    WHEN 'D' THEN 'disabled'
    WHEN 'R' THEN 'replica'
    WHEN 'A' THEN 'always'
  END AS enabled_state,
  pg_get_triggerdef(trg.oid, true) AS trigger_definition,
  fn.oid::regprocedure AS function_signature,
  fn.prosecdef AS function_security_definer,
  fn.proconfig AS function_settings,
  pg_get_functiondef(fn.oid) AS function_definition
FROM pg_trigger trg
JOIN pg_class tbl ON tbl.oid = trg.tgrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
JOIN pg_proc fn ON fn.oid = trg.tgfoid
WHERE ns.nspname = 'public'
  AND NOT trg.tgisinternal
  AND tbl.relname ~* '(menu|item|product|catalog|price|canteen|order|checkout|cart|transaction|payment|driver|staff|whatsapp)'
ORDER BY tbl.relname, trg.tgname;
```

## 7. Relevant public functions and their definitions/grants

This lists functions whose names suggest order, checkout, menu/price, tracking,
driver/staff authorization, or WhatsApp behavior. Trigger functions are included
in query 5 even when their names do not match.

```sql
SELECT
  p.oid::regprocedure AS function_signature,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  l.lanname AS language,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proconfig AS function_settings,
  pg_get_functiondef(p.oid) AS function_definition,
  acl.grantee_name,
  acl.privilege_type,
  acl.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
LEFT JOIN LATERAL (
  SELECT
    CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END AS grantee_name,
    x.privilege_type,
    x.is_grantable
  FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
  LEFT JOIN pg_roles r ON r.oid = x.grantee
) acl ON true
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND p.proname ~* '(order|checkout|menu|item|product|price|tracking|driver|staff|whatsapp|claim|workflow|status)'
ORDER BY p.proname, p.oid::regprocedure::text, acl.grantee_name;
```

## 8. RLS status for relevant tables/views

```sql
SELECT
  ns.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname ~* '(menu|item|product|catalog|price|canteen|order|checkout|cart|transaction|payment|driver|staff)'
ORDER BY c.relname;
```

## 9. RLS policy expressions on relevant tables

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename ~* '(menu|item|product|catalog|price|canteen|order|checkout|cart|transaction|payment|driver|staff)'
ORDER BY tablename, policyname;
```

## 10. Table-level and column-level grants

The catalog ACL output shows explicit grantees (including `PUBLIC`). The
effective-privilege query includes inherited privileges for the standard
Supabase `anon` and `authenticated` roles. Neither query alone replaces review
of RLS policies.

```sql
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS relation_name,
  pg_get_userbyid(tbl.relowner) AS owner,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE role_name.rolname END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class tbl
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(tbl.relacl, acldefault('r', tbl.relowner))
) acl
LEFT JOIN pg_roles role_name ON role_name.oid = acl.grantee
WHERE ns.nspname = 'public'
  AND tbl.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND tbl.relname ~* '(menu|item|product|catalog|price|canteen|order|checkout|cart|transaction|payment|driver|staff)'
ORDER BY tbl.relname, grantee, acl.privilege_type;
```

```sql
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS relation_name,
  a.attname AS column_name,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE role_name.rolname END AS grantee,
  acl.privilege_type,
  acl.is_grantable
FROM pg_class tbl
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
JOIN pg_attribute a ON a.attrelid = tbl.oid
CROSS JOIN LATERAL aclexplode(a.attacl) acl
LEFT JOIN pg_roles role_name ON role_name.oid = acl.grantee
WHERE ns.nspname = 'public'
  AND tbl.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND tbl.relname ~* '(menu|item|product|catalog|price|canteen|order|checkout|cart|transaction|payment|driver|staff)'
ORDER BY tbl.relname, a.attname, grantee, acl.privilege_type;
```

```sql
SELECT
  ns.nspname AS schema_name,
  c.relname AS relation_name,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete
FROM pg_class c
JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND c.relname ~* '(menu|item|product|catalog|price|canteen|order|checkout|cart|transaction|payment|driver|staff)'
ORDER BY c.relname;
```

## 11. Realtime publication membership

```sql
SELECT
  pubname,
  schemaname,
  tablename
FROM pg_publication_tables
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items')
ORDER BY pubname, tablename;
```

## Interpreting results

- A candidate menu table or view is not automatically a trusted price source.
  Confirm its authoritative ownership, price-edit permissions, item/canteen
  relationship, availability semantics, and server-side use before enabling
  checkout.
- A candidate checkout/group column is not proof that checkout writes a shared
  value to every child order. Verify its constraints and the deployed writer.
- Review function definitions, grants, trigger definitions, RLS state/policies,
  and table/column grants together. RLS being enabled does not by itself prove
  that policies or grants are suitably restrictive.
- `pg_publication_tables` returning no `orders` row means the table is not
  listed in the inspected publication; it does not establish the health of any
  separate streaming fallback.
