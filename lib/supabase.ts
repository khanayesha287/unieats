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

interface PostgrestErrorShape {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Logs a Supabase error with every detail available (message, code, details,
 * hint) so the exact failure cause is visible during development.
 * Never logs credentials, keys, or auth tokens — only the error object.
 */
function logOrderError(context: string, error: PostgrestErrorShape | null): void {
  if (!error) return;
  console.error(`[UniEats] ORDER ERROR — ${context}:`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
}

/**
 * Returns the offending column name when the error is a PostgREST/PostgreSQL
 * "column does not exist" error (PGRST204 / 42703), otherwise null.
 * Example message: "Could not find the 'payment_method' column of 'orders'
 * in the schema cache".
 */
function findMissingColumn(error: PostgrestErrorShape | null): string | null {
  if (!error) return null;
  const message = error.message ?? "";
  const quoted =
    message.match(/Could not find the '([^']+)' column/i) ??
    message.match(/column "([^"]+)" of relation/i);
  if (quoted) return quoted[1];
  if (error.code === "PGRST204" || error.code === "42703") {
    return message.match(/'([^']+)'/)?.[1] ?? message.match(/"([^"]+)"/)?.[1] ?? null;
  }
  return null;
}

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

/**
 * Normalizes a canteen name or slug for matching: "SSC Canteen" → "ssc",
 * "Tippu Center" → "tippucenter".
 */
function normalizeCanteenKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/canteen/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function resolveCanteenId(
  canteenSlug: string,
  canteenName: string,
): Promise<string | number | null> {
  if (!supabase) {
    return null;
  }

  // The canteens table has no slug column, so match on name: exact first,
  // then normalized (frontend names are e.g. "SSC Canteen", DB has "SSC").
  const { data, error } = await supabase.from("canteens").select("id, name");

  if (error) {
    logOrderError("canteen lookup for order save", error);
    return null;
  }

  const rows = (
    Array.isArray(data) ? data : []
  ) as Array<{ id?: unknown; name?: unknown }>;
  if (rows.length === 0) return null;

  const exact = rows.find(
    (row) => typeof row.name === "string" && row.name === canteenName,
  );
  if (exact && exact.id !== undefined && exact.id !== null) {
    return exact.id as string | number;
  }

  const slugKey = normalizeCanteenKey(canteenSlug);
  const nameKey = normalizeCanteenKey(canteenName);
  const normalized = rows.find((row) => {
    if (typeof row.name !== "string") return false;
    const key = normalizeCanteenKey(row.name);
    return (key !== "" && key === slugKey) || (key !== "" && key === nameKey);
  });

  return normalized?.id !== undefined && normalized?.id !== null
    ? (normalized.id as string | number)
    : null;
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
      {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      },
    );
    return null;
  }

  return data?.id ?? null;
}

export async function saveOrderToSupabase(
  order: Order,
): Promise<{ orderId: string | number }> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Cannot save order.");
  }

  const canteenId =
    order.canteenOrders.length > 0
      ? await resolveCanteenId(
          order.canteenOrders[0].canteenSlug,
          order.canteenOrders[0].canteenName,
        )
      : null;

  const driverId =
    order.orderType === "delivery" ? await resolveDriverId() : null;

  // Build order record — include department if the column exists
  const orderRecord: Record<string, unknown> = {
    order_number: order.orderNumber,
    student_name: order.studentName,
    phone: order.phone,
    department: order.department ?? null,
    delivery_location:
      order.orderType === "delivery" ? order.deliveryLocation ?? null : null,
    order_type: order.orderType,
    canteen_id: canteenId,
    status: "pending",
    total_amount: Number(order.grandTotal),
    delivery_charge: Number(order.deliveryFee),
    discount: Number(order.deliveryFee > 0 ? 25 : 0),
    driver_id: driverId,
    payment_method: order.paymentMethod ?? null,
    special_instructions: order.specialInstructions ?? null,
  };

  let insertedOrder: { id: string | number } | null = null;
  let orderError: PostgrestErrorShape | null = null;

  // Insert with all columns. If the orders table is missing an optional
  // column (e.g. payment_method before its migration has been run), drop
  // that column and retry so the order still saves instead of failing.
  const attemptRecord: Record<string, unknown> = { ...orderRecord };
  const droppedColumns: string[] = [];

  for (;;) {
    const result = await supabase
      .from("orders")
      .insert([attemptRecord])
      .select("id")
      .single();

    if (!result.error) {
      insertedOrder = result.data as { id: string | number } | null;
      orderError = null;
      break;
    }

    const missingColumn = findMissingColumn(result.error);
    if (!missingColumn || !(missingColumn in attemptRecord)) {
      orderError = result.error;
      logOrderError("orders insert", result.error);
      console.error("[UniEats] Order payload that failed to save:", attemptRecord);
      break;
    }

    droppedColumns.push(missingColumn);
    delete attemptRecord[missingColumn];
  }

  if (droppedColumns.length > 0) {
    console.warn(
      `[UniEats] The orders table is missing column(s): ${droppedColumns.join(", ")}. ` +
        "The order was saved without them. Run supabase-migrations/" +
        "add-payment-method-column.sql in the Supabase SQL editor to persist them.",
    );
  }

  if (orderError) {
    throw new Error(
      `Failed to create order in database: ${orderError.message ?? "Unknown error"}`,
    );
  }

  const orderId = insertedOrder?.id;
  if (orderId === undefined || orderId === null) {
    throw new Error("Order insert succeeded but no order id was returned.");
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
      logOrderError("order_items insert", itemsError);
      console.error("[UniEats] Order items payload that failed to save:", itemsToInsert);
      throw new Error(
        `Order was created but items failed to save: ${itemsError.message ?? "Unknown error"}`,
      );
    }
  }

  return { orderId };
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