import { createClient } from "@supabase/supabase-js";
import { menuItems } from "@/lib/data/menus";
import { DELIVERY_FEE_PER_CANTEEN } from "@/lib/constants";
import type { CartItem, Order } from "@/lib/types";

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

export interface SavedCheckoutItem {
  clientLineId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SavedCheckoutGroup {
  id: string;
  orderNumber: string;
  canteenId: string;
  canteenSlug: string;
  canteenName: string;
  subtotal: number;
  deliveryCharge: number;
  totalAmount: number;
  createdAt: string;
  items: SavedCheckoutItem[];
}

export interface SavedCheckoutResult {
  orderId: string;
  orderIds: string[];
  orders: SavedCheckoutGroup[];
}

function resolveMenuItemKey(item: CartItem): string {
  if (item.menuItemKey) return item.menuItemKey;

  const candidates = menuItems
    .filter(
      (menuItem) =>
        menuItem.canteenSlug === item.canteenSlug &&
        (item.id === menuItem.id || item.id.startsWith(`${menuItem.id}-`)),
    )
    .sort((left, right) => right.id.length - left.id.length);

  if (candidates.length === 0) {
    throw new Error(
      "One or more cart items are no longer recognized. Remove them and add them again from the menu.",
    );
  }
  return candidates[0].id;
}

function isSavedCheckoutItem(value: unknown): value is SavedCheckoutItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedCheckoutItem>;
  return (
    typeof item.clientLineId === "string" &&
    typeof item.itemName === "string" &&
    typeof item.quantity === "number" &&
    Number.isSafeInteger(item.quantity) &&
    typeof item.unitPrice === "number" &&
    Number.isFinite(item.unitPrice) &&
    typeof item.subtotal === "number" &&
    Number.isFinite(item.subtotal)
  );
}

function isSavedCheckoutGroup(value: unknown): value is SavedCheckoutGroup {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<SavedCheckoutGroup>;
  return (
    typeof order.id === "string" &&
    typeof order.orderNumber === "string" &&
    typeof order.canteenId === "string" &&
    typeof order.canteenSlug === "string" &&
    typeof order.canteenName === "string" &&
    typeof order.subtotal === "number" &&
    Number.isFinite(order.subtotal) &&
    typeof order.deliveryCharge === "number" &&
    Number.isFinite(order.deliveryCharge) &&
    typeof order.totalAmount === "number" &&
    Number.isFinite(order.totalAmount) &&
    typeof order.createdAt === "string" &&
    Array.isArray(order.items) &&
    order.items.every(isSavedCheckoutItem)
  );
}

function isConfirmedCheckout(
  orders: SavedCheckoutGroup[],
  items: Array<{ clientLineId: string; canteenSlug: string }>,
  orderType: Order["orderType"],
): boolean {
  const expectedLineIds = new Set(items.map((item) => item.clientLineId));
  const expectedCanteens = new Set(items.map((item) => item.canteenSlug));
  const orderIds = new Set<string>();
  const orderNumbers = new Set<string>();
  const receivedLineIds = new Set<string>();
  const receivedCanteens = new Set<string>();

  if (orders.length !== expectedCanteens.size) return false;

  return orders.every((order) => {
    const createdAt = Date.parse(order.createdAt);
    const groupSubtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
    const groupLineIds = new Set<string>();
    const itemsValid = order.items.every((item) => {
      if (
        !expectedLineIds.has(item.clientLineId) ||
        receivedLineIds.has(item.clientLineId) ||
        groupLineIds.has(item.clientLineId) ||
        !item.itemName ||
        item.quantity <= 0 ||
        item.unitPrice < 0 ||
        item.subtotal < 0 ||
        Math.abs(item.subtotal - item.unitPrice * item.quantity) >= 0.01
      ) {
        return false;
      }
      groupLineIds.add(item.clientLineId);
      return true;
    });
    const expectedDelivery =
      orderType === "delivery" ? DELIVERY_FEE_PER_CANTEEN : 0;
    const isValid =
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(order.id) &&
      /^UNI-[0-9A-F]{8}-(?:[0-9A-F]{4}-){3}[0-9A-F]{12}$/.test(order.orderNumber) &&
      Number.isFinite(createdAt) &&
      expectedCanteens.has(order.canteenSlug) &&
      !receivedCanteens.has(order.canteenSlug) &&
      !orderIds.has(order.id) &&
      !orderNumbers.has(order.orderNumber) &&
      itemsValid &&
      order.subtotal >= 0 &&
      order.deliveryCharge === expectedDelivery &&
      order.totalAmount >= 0 &&
      Math.abs(order.subtotal - groupSubtotal) < 0.01 &&
      Math.abs(order.totalAmount - order.subtotal - order.deliveryCharge) < 0.01;

    if (!isValid) return false;

    orderIds.add(order.id);
    orderNumbers.add(order.orderNumber);
    receivedCanteens.add(order.canteenSlug);
    groupLineIds.forEach((lineId) => receivedLineIds.add(lineId));
    return true;
  }) && receivedLineIds.size === expectedLineIds.size;
}

export async function saveOrderToSupabase(
  order: Order,
  options: { idempotencyKey: string; trackingToken: string },
): Promise<SavedCheckoutResult> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Checkout is temporarily unavailable. Please try again later.");
  }

  const items = order.canteenOrders.flatMap((group) =>
    group.items.map((item) => ({
      clientLineId: item.id,
      menuItemKey: resolveMenuItemKey(item),
      canteenSlug: item.canteenSlug,
      quantity: item.quantity,
      size: item.size ?? null,
      addOnNames: (item.selectedAddOns ?? []).map((addOn) => addOn.name),
    })),
  );

  let response: Response;
  try {
    response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName: order.studentName,
        phone: order.phone,
        orderType: order.orderType,
        deliveryLocation: order.deliveryLocation ?? "",
        specialInstructions: order.specialInstructions ?? "",
        paymentMethod: order.paymentMethod,
        trackingToken: options.trackingToken,
        idempotencyKey: options.idempotencyKey,
        items,
      }),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "We couldn't confirm your order just yet. Your cart is saved; please retry checkout.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "We couldn't confirm your order just yet. Your cart is saved; please retry checkout.",
    );
  }

  if (!response.ok || !payload || typeof payload !== "object") {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: unknown }).error
        : null;
    throw new Error(
      typeof error === "string"
        ? error
        : "We couldn't place your order. Your cart is saved; please try again.",
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new Error(
      "We couldn't confirm your order just yet. Your cart is saved; please retry checkout.",
    );
  }
  const result = payload as Partial<SavedCheckoutResult>;
  if (
    !Array.isArray(result.orders) ||
    result.orders.length === 0 ||
    !result.orders.every(isSavedCheckoutGroup) ||
    !isConfirmedCheckout(
      result.orders,
      items.map((item) => ({
        clientLineId: item.clientLineId,
        canteenSlug: item.canteenSlug,
      })),
      order.orderType,
    )
  ) {
    throw new Error(
      "We couldn't confirm your order just yet. Your cart is saved; please retry checkout.",
    );
  }

  return {
    orderId: result.orders[0].id,
    orderIds: result.orders.map((savedOrder) => savedOrder.id),
    orders: result.orders,
  };
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