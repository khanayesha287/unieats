import { createClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

/**
 * Checkout remains disabled until the database has a verified canonical menu
 * price source and matching item/canteen relationships.
 */
export async function saveOrderToSupabase(
  _order: Order,
): Promise<{ orderId: string | number; orderIds: (string | number)[] }> {
  void _order;
  throw new Error(
    "Secure checkout is temporarily unavailable: a verified server-side menu price source and matching database schema are required before orders can be accepted.",
  );
}

// ---------------------------------------------------------------------------
// Delete order (admin-only)
// ---------------------------------------------------------------------------

/**
 * Deletes an order and its associated order_items from Supabase.
 * Should only be called for admin-authorized delete operations.
 */
export async function deleteOrderFromSupabase(
  orderId: string | number,
): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Cannot delete order.");
  }

  // Delete order_items first (child rows)
  const { error: itemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (itemsError) {
    console.error("[UniEats] Failed to delete order items:", itemsError);
    throw new Error(
      `Failed to delete order items: ${itemsError.message ?? "Unknown error"}`,
    );
  }

  // Delete the order itself
  const { error: orderError } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId);

  if (orderError) {
    console.error("[UniEats] Failed to delete order:", orderError);
    throw new Error(
      `Failed to delete order: ${orderError.message ?? "Unknown error"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Status timestamp helper
// ---------------------------------------------------------------------------

/**
 * Maps an order status to its corresponding timestamp column name.
 * Returns the column name to set, or null if no timestamp applies.
 */
export function getStatusTimestampColumn(status: string): string | null {
  const map: Record<string, string> = {
    confirmed: "confirmed_at",
    preparing: "preparing_at",
    ready: "ready_at",
    out_for_delivery: "out_for_delivery_at",
    delivered: "delivered_at",
  };
  return map[status] ?? null;
}

/**
 * Builds an update payload that sets the appropriate status timestamp column.
 * Only sets the timestamp if the column value is currently null (first entry into status).
 */
export function buildStatusUpdatePayload(
  nextStatus: string,
  existingTimestamps?: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { status: nextStatus };
  const col = getStatusTimestampColumn(nextStatus);
  if (col) {
    // Only set timestamp if it hasn't been set before (don't overwrite)
    if (!existingTimestamps || !existingTimestamps[col]) {
      payload[col] = new Date().toISOString();
    }
  }
  return payload;
}