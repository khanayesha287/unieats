/* Supabase rows are intentionally schema-agnostic because this project supports deployed legacy schemas. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { TrackingStatus } from "@/lib/order-tracking";

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.warn("[TRACKING DEBUG] Server Supabase configuration is incomplete.", {
      hasUrl: Boolean(url),
      hasServiceRoleKey: Boolean(key),
    });
    return null;
  }
  return createClient<any>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function parseRequest(body: unknown): { token: string; orderIds: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const input = body as { token?: unknown; orderIds?: unknown };
  if (typeof input.token !== "string" || input.token.length < 32 || input.token.length > 160) return null;
  if (!Array.isArray(input.orderIds) || input.orderIds.length < 1 || input.orderIds.length > 25) return null;
  const orderIds = Array.from(new Set(input.orderIds.map((id) => {
    if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
    if (typeof id === "string" && id.trim().length <= 100) return id.trim();
    return null;
  }).filter((id): id is string => Boolean(id))));
  return orderIds.length === input.orderIds.length ? { token: input.token, orderIds } : null;
}

export function safeStatus(value: unknown): TrackingStatus {
  const statuses: TrackingStatus[] = ["pending", "confirmed", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"];
  return statuses.includes(value as TrackingStatus) ? value as TrackingStatus : "pending";
}

/** Detects PostgREST/Postgres "column does not exist" errors (PGRST204 / 42703). */
export function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /could not find the '[^']+' column/i.test(error.message ?? "");
}

/** Detects invalid-id-value errors (22P02), e.g. a non-UUID string against a uuid primary key. */
export function isInvalidIdTypeError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "22P02") return true;
  return /invalid input syntax/i.test(error.message ?? "");
}

export const ORDERS_COLUMNS = "id,order_number,student_name,order_type,delivery_location,canteen_id,status,total_amount,delivery_charge,created_at,tracking_token_hash";

/**
 * Fetches orders by id, optionally requiring a token-hash match.
 *
 * PostgREST rejects the entire `.in("id", [...])` query when even one id is
 * malformed for the column type (Postgres 22P02, e.g. a non-UUID string
 * against a uuid primary key). Without recovery, one bad id in a batch would
 * 500 the whole poll and freeze every tracking box at its last status. When
 * that happens, remaining ids are queried individually and malformed ones
 * are skipped so the valid orders still track.
 */
export async function queryOrdersByIds(
  client: ReturnType<typeof createClient<any>>,
  ids: string[],
  tokenHash: string | null,
): Promise<{ data: any[]; error: { message?: string; code?: string } | null }> {
  const runQuery = (scope: { in: string[] } | { eq: string }) => {
    let query = client.from("orders").select(ORDERS_COLUMNS);
    query = "in" in scope ? query.in("id", scope.in) : query.eq("id", scope.eq);
    if (tokenHash) query = query.eq("tracking_token_hash", tokenHash);
    return query;
  };

  const batch = await runQuery({ in: ids });
  if (!batch.error) return { data: (batch.data ?? []) as any[], error: null };
  if (!isInvalidIdTypeError(batch.error)) return { data: [], error: batch.error };

  console.warn(
    "[UniEats Tracking] One or more orderIds are invalid for this schema's id column type. " +
      "Querying the remaining ids individually and skipping malformed ones.",
  );
  const collected: any[] = [];
  for (const id of ids) {
    const single = await runQuery({ eq: id });
    if (single.error) {
      if (isInvalidIdTypeError(single.error)) continue;
      return { data: [], error: single.error };
    }
    collected.push(...((single.data ?? []) as any[]));
  }
  return { data: collected, error: null };
}

/**
 * Resolves which of the requested order ids belong to the given tracking
 * token. Mirrors the exact verification rules of the tracking REST endpoint,
 * including the legacy-schema fallback when tracking_token_hash is absent.
 * Returns null when Supabase is unconfigured; empty array means the token
 * matched nothing (invalid token).
 */
export async function resolveTokenOrderIds(
  client: NonNullable<ReturnType<typeof getServerSupabase>>,
  token: string,
  orderIds: string[],
): Promise<{ verifiedIds: string[]; error: { message?: string; code?: string } | null }> {
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  const primary = await queryOrdersByIds(client, orderIds, tokenHash);
  let orders: any[];
  let error: { message?: string; code?: string } | null = null;

  if (primary.error && isMissingColumnError(primary.error)) {
    // Legacy schema without tracking_token_hash: id-only matching (see REST route).
    const fallback = await queryOrdersByIds(client, orderIds, null);
    orders = fallback.data;
    error = fallback.error;
  } else {
    orders = primary.data;
    error = primary.error;
  }

  if (error) return { verifiedIds: [], error };
  return { verifiedIds: orders.map((order: any) => String(order.id)), error: null };
}
