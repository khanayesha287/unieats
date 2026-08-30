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

function normalizeMenuItemId(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const uuidLike = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (uuidLike.test(trimmed)) {
      return trimmed;
    }

    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
  }

  return null;
}

async function resolveCanteenId(
  canteenSlug: string,
  canteenName: string,
): Promise<string | number | null> {
  if (!supabase) {
    return null;
  }

  const bySlug = await supabase
    .from("canteens")
    .select("id")
    .eq("slug", canteenSlug)
    .limit(1)
    .maybeSingle();

  if (bySlug.data?.id !== undefined && bySlug.data !== null) {
    return bySlug.data.id;
  }

  const byName = await supabase
    .from("canteens")
    .select("id")
    .eq("name", canteenName)
    .limit(1)
    .maybeSingle();

  if (byName.data?.id !== undefined && byName.data !== null) {
    return byName.data.id;
  }

  if (bySlug.error) {
    console.warn(
      "[UniEats] Failed to resolve canteen by slug for order save:",
      bySlug.error.message,
    );
  }

  if (byName.error) {
    console.warn(
      "[UniEats] Failed to resolve canteen by name for order save:",
      byName.error.message,
    );
  }

  return null;
}

async function resolveDriverId(): Promise<string | number | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("driver")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      "[UniEats] Unable to find an active driver record for delivery order:",
      error.message,
    );
    return null;
  }

  return data?.id ?? null;
}

export async function saveOrderToSupabase(
  order: Order,
): Promise<boolean> {
  if (!supabase) {
    console.warn(
      "[UniEats] Supabase is not configured. Skipping order save.",
    );
    return false;
  }

  try {
    const canteenId =
      order.canteenOrders.length > 0
        ? await resolveCanteenId(
            order.canteenOrders[0].canteenSlug,
            order.canteenOrders[0].canteenName,
          )
        : null;

    const driverId =
      order.orderType === "delivery" ? await resolveDriverId() : null;

    const { data: insertedOrder, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          order_number: order.orderNumber,
          student_name: order.studentName,
          phone: order.phone,
          delivery_location:
            order.orderType === "delivery" ? order.deliveryLocation ?? null : null,
          order_type: order.orderType,
          canteen_id: canteenId,
          status: "pending",
          total_amount: Number(order.grandTotal),
          delivery_charge: Number(order.deliveryFee),
          driver_id: driverId,
          payment_method: order.paymentMethod ?? null,
        },
      ])
      .select("id")
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderId = insertedOrder?.id;
    if (orderId === undefined || orderId === null) {
      throw new Error("Supabase order insert succeeded without returning an order id.");
    }

    const itemsToInsert = order.canteenOrders.flatMap((group) =>
      group.items.map((item) => ({
        order_id: orderId,
        menu_item_id: normalizeMenuItemId(item.id),
        item_name: item.name,
        quantity: item.quantity,
        price: Number(item.price),
        subtotal: Number(item.price * item.quantity),
      })),
    );

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (itemsError) {
        throw itemsError;
      }
    }

    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Supabase error";
    console.error("[UniEats] Failed to save order to Supabase:", message, error);
    return false;
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