import { createClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/types";
import { DELIVERY_FEE_PER_CANTEEN } from "@/lib/constants";

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
function logOrderError(label: string, error: PostgrestErrorShape | null): void {
  if (!error) return;
  console.error(`[UniEats] ${label}:`, {
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
    logOrderError("Canteen lookup for order save failed", error);
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

export interface SaveOrderOptions {
  /**
   * Initial status for the order. Defaults to "pending".
   */
  status?: string;
}

/**
 * Saves a multi-canteen order to Supabase.
 *
 * Creates one `orders` row per canteen group, each with its own canteen_id,
 * subtotal, delivery charge, and associated `order_items` rows.
 *
 * If any group fails after earlier groups succeeded, the already-created
 * orders are rolled back (deleted) to avoid a partial state.
 */
export async function saveOrderToSupabase(
  order: Order,
  options: SaveOrderOptions = {},
): Promise<{ orderId: string | number; orderIds: (string | number)[] }> {
  if (!supabase) {
    throw new Error("Supabase is not configured. Cannot save order.");
  }

  const initialStatus = options.status ?? "pending";
  const createdOrderIds: (string | number)[] = [];

  // Resolve driver once for delivery orders
  const driverId =
    order.orderType === "delivery" ? await resolveDriverId() : null;

  // Delivery charge per canteen order (Rs. 25 per canteen for delivery, 0 for pickup)
  const perCanteenDelivery =
    order.orderType === "delivery" ? DELIVERY_FEE_PER_CANTEEN : 0;

  try {
    for (const group of order.canteenOrders) {
      // Resolve canteen_id for THIS group
      const canteenId = await resolveCanteenId(
        group.canteenSlug,
        group.canteenName,
      );

      // Build order record for this canteen group
      const orderRecord: Record<string, unknown> = {
        order_number: order.orderNumber,
        student_name: order.studentName,
        registration_number: order.registrationNumber?.trim() || null,
        phone: order.phone,
        department: order.department ?? null,
        delivery_location:
          order.orderType === "delivery"
            ? order.deliveryLocation ?? null
            : null,
        order_type: order.orderType,
        canteen_id: canteenId,
        status: initialStatus,
        total_amount: Number(group.subtotal + perCanteenDelivery),
        delivery_charge: Number(perCanteenDelivery),
        discount: Number(perCanteenDelivery > 0 ? 25 : 0),
        driver_id: driverId,
        payment_method: order.paymentMethod ?? null,
        special_instructions: order.specialInstructions ?? null,
      };

      // Insert with column-dropping fallback for missing optional columns
      let insertedOrder: { id: string | number } | null = null;
      let orderError: PostgrestErrorShape | null = null;
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
          logOrderError("Order insert failed", result.error);
          console.error(
            "[UniEats] Order payload that failed to save:",
            attemptRecord,
          );
          break;
        }

        droppedColumns.push(missingColumn);
        delete attemptRecord[missingColumn];
      }

      if (droppedColumns.length > 0) {
        console.warn(
          `[UniEats] The orders table is missing column(s): ${droppedColumns.join(", ")}. ` +
            "The order was saved without them. Run supabase-migrations/ " +
            "add-payment-method.sql in the Supabase SQL editor to persist them.",
        );
      }

      if (orderError) {
        throw new Error(
          `Failed to create order for ${group.canteenName}: ${orderError.message ?? "Unknown error"}`,
        );
      }

      const orderId = insertedOrder?.id;
      if (orderId === undefined || orderId === null) {
        throw new Error("Order insert succeeded but no order id was returned.");
      }

      createdOrderIds.push(orderId);

      // Insert order_items for THIS canteen group only
      const itemsToInsert = group.items.map((item) => ({
        order_id: orderId,
        menu_item_id: normalizeMenuItemId(item.id),
        item_name: item.name,
        quantity: item.quantity,
        price: Number(item.price),
        subtotal: Number(item.price * item.quantity),
      }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from("order_items")
          .insert(itemsToInsert);

        if (itemsError) {
          logOrderError("Order items insert failed", itemsError);
          console.error(
            "[UniEats] Order items payload that failed to save:",
            itemsToInsert,
          );
          throw new Error(
            `Order for ${group.canteenName} was created but items failed to save: ${itemsError.message ?? "Unknown error"}`,
          );
        }
      }
    }
  } catch (error) {
    // Rollback: delete any orders that were already created
    if (createdOrderIds.length > 0) {
      console.warn(
        `[UniEats] Rolling back ${createdOrderIds.length} order(s) due to failure in multi-canteen checkout.`,
      );
      for (const rollbackId of createdOrderIds) {
        try {
          await supabase
            .from("order_items")
            .delete()
            .eq("order_id", rollbackId);
          await supabase.from("orders").delete().eq("id", rollbackId);
        } catch (rollbackError) {
          console.error(
            `[UniEats] Failed to roll back order ${rollbackId}:`,
            rollbackError,
          );
        }
      }
    }
    throw error;
  }

  return { orderId: createdOrderIds[0], orderIds: createdOrderIds };
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