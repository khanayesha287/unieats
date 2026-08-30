"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, buildStatusUpdatePayload } from "@/lib/supabase";

type DriverStatus = "ready" | "out_for_delivery" | "delivered";

interface CanteenRecord {
  id: number | string;
  name: string;
}

interface DriverOrderItem {
  id: number | string;
  order_id: number | string;
  item_name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface DriverOrder {
  id: number | string;
  order_number: string;
  student_name: string;
  registration_number: string;
  phone: string;
  order_type: "pickup" | "delivery";
  delivery_location: string | null;
  canteen_id: number | string | null;
  status: DriverStatus | string;
  total_amount: number;
  delivery_charge: number;
  payment_method?: string | null;
  created_at: string | null;
}

const DRIVER_STATUSES: DriverStatus[] = ["ready", "out_for_delivery", "delivered"];

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-800",
  out_for_delivery: "bg-cyan-100 text-cyan-800",
  delivered: "bg-green-100 text-green-800",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Ready for Pickup",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
};

function pickString(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

function isMissingTableError(error: { message?: string } | null): boolean {
  return Boolean(
    error && /Could not find the table 'public\.[^']+' in the schema cache/i.test(error.message ?? ""),
  );
}

function toCurrency(value: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function toDateTime(value?: string | null): string {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toShortTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeDriverStatus(value: unknown): string {
  const normalized = typeof value === "string" ? value : "ready";
  return DRIVER_STATUSES.includes(normalized as DriverStatus)
    ? normalized
    : "ready";
}

function coerceCanteen(input: unknown): CanteenRecord | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const rawId = record.id ?? record.canteen_id ?? null;
  const id: number | string =
    typeof rawId === "number" || typeof rawId === "string"
      ? rawId
      : `canteen-${Math.random().toString(36).slice(2, 9)}`;
  const name =
    pickString(record, ["name", "canteen_name", "title"]) ?? `Canteen ${String(id)}`;
  return { id, name };
}

function coerceOrder(input: unknown): DriverOrder | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = record.id ?? record.order_id ?? null;
  const orderType = pickString(record, ["order_type", "orderType"]);
  if (orderType !== "delivery") return null;
  const statusRaw = pickString(record, ["status"]);
  const canteenId = record.canteen_id ?? record.canteenId ?? null;
  const totalAmount =
    typeof record.total_amount === "number"
      ? record.total_amount
      : Number(record.total_amount ?? 0);
  const deliveryCharge =
    typeof record.delivery_charge === "number"
      ? record.delivery_charge
      : Number(record.delivery_charge ?? 0);

  return {
    id:
      typeof id === "number" || typeof id === "string"
        ? id
        : `order-${Math.random().toString(36).slice(2, 9)}`,
    order_number:
      pickString(record, ["order_number", "orderNumber"]) ?? "\u2014",
    student_name:
      pickString(record, ["student_name", "studentName", "name"]) ?? "Unknown",
    registration_number:
      pickString(record, ["registration_number", "registrationNumber"]) ?? "\u2014",
    phone: pickString(record, ["phone", "mobile"]) ?? "\u2014",
    order_type: "delivery",
    delivery_location:
      pickString(record, ["delivery_location", "deliveryLocation"]) ?? null,
    canteen_id:
      typeof canteenId === "number" || typeof canteenId === "string"
        ? canteenId
        : null,
    status: normalizeDriverStatus(statusRaw),
    total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
    delivery_charge: Number.isFinite(deliveryCharge) ? deliveryCharge : 0,
    payment_method: pickString(record, ["payment_method", "paymentMethod"]) ?? null,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
  };
}

function coerceOrderItem(input: unknown): DriverOrderItem | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = record.id ?? null;
  const orderId = record.order_id ?? null;
  const quantity =
    typeof record.quantity === "number" ? record.quantity : Number(record.quantity ?? 0);
  const price =
    typeof record.price === "number" ? record.price : Number(record.price ?? 0);
  const subtotal =
    typeof record.subtotal === "number"
      ? record.subtotal
      : Number(record.subtotal ?? price * quantity);

  return {
    id:
      typeof id === "number" || typeof id === "string"
        ? id
        : `item-${Math.random().toString(36).slice(2, 9)}`,
    order_id:
      typeof orderId === "number" || typeof orderId === "string"
        ? orderId
        : `order-${Math.random().toString(36).slice(2, 9)}`,
    item_name: pickString(record, ["item_name", "itemName", "name"]) ?? "Unknown item",
    quantity: Number.isFinite(quantity) ? quantity : 0,
    price: Number.isFinite(price) ? price : 0,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
  };
}

export default function DriverPortalContent() {
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [items, setItems] = useState<DriverOrderItem[]>([]);
  const [canteens, setCanteens] = useState<CanteenRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const loadData = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setIsLoading(false);
      return;
    }

    const [ordersResult, canteensResult, itemsResult] = await Promise.all([
      supabase.from("orders").select("*").eq("order_type", "delivery"),
      supabase.from("canteens").select("*"),
      supabase.from("order_items").select("*"),
    ]);

    if (ordersResult.error && !isMissingTableError(ordersResult.error)) {
      console.error("[UniEats Driver] Orders fetch error:", ordersResult.error.message);
    }
    if (canteensResult.error && !isMissingTableError(canteensResult.error)) {
      console.error("[UniEats Driver] Canteens fetch error:", canteensResult.error.message);
    }
    if (itemsResult.error && !isMissingTableError(itemsResult.error)) {
      console.error("[UniEats Driver] Items fetch error:", itemsResult.error.message);
    }

    const newCanteens = Array.isArray(canteensResult.data)
      ? canteensResult.data.map(coerceCanteen).filter((r): r is CanteenRecord => r !== null)
      : [];
    const newOrders = (Array.isArray(ordersResult.data) ? ordersResult.data : [])
      .map(coerceOrder)
      .filter((r): r is DriverOrder => r !== null)
      .filter((o) => DRIVER_STATUSES.includes(o.status as DriverStatus))
      .sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      });
    const newItems = Array.isArray(itemsResult.data)
      ? itemsResult.data.map(coerceOrderItem).filter((r): r is DriverOrderItem => r !== null)
      : [];

    const hasRealError =
      Boolean(ordersResult.error && !isMissingTableError(ordersResult.error)) ||
      Boolean(canteensResult.error && !isMissingTableError(canteensResult.error)) ||
      Boolean(itemsResult.error && !isMissingTableError(itemsResult.error));

    setCanteens(newCanteens);
    setOrders(newOrders);
    setItems(newItems);
    setError(hasRealError ? "Some queries failed. Check console." : null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("driver-orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => { void loadData(); },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => { void loadData(); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        () => { void loadData(); },
      )
      .subscribe();

    return () => {
      if (supabase) void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const canteenMap = useMemo(
    () => Object.fromEntries(canteens.map((c) => [String(c.id), c])) as Record<string, CanteenRecord>,
    [canteens],
  );

  const itemsByOrder = useMemo(() => {
    return items.reduce<Record<string, DriverOrderItem[]>>((acc, item) => {
      const key = String(item.order_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status === "ready" || o.status === "out_for_delivery"),
    [orders],
  );

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered"),
    [orders],
  );

  const selectedOrder = useMemo(
    () => orders.find((o) => String(o.id) === String(selectedOrderId)) ?? null,
    [orders, selectedOrderId],
  );

  const updateStatus = async (orderId: number | string, nextStatus: string) => {
    if (!supabase) return;

    // Build payload with timestamp; fall back to status-only if columns don't exist
    let payload: Record<string, unknown> = { status: nextStatus };
    try {
      const { data: existing } = await supabase
        .from("orders")
        .select("ready_at,out_for_delivery_at,delivered_at")
        .eq("id", orderId)
        .maybeSingle();
      payload = buildStatusUpdatePayload(nextStatus, existing ?? undefined);
    } catch { /* columns may not exist yet */ }

    setIsUpdating(true);
    let { error: updateError } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", orderId);

    // If update failed (e.g. missing timestamp columns), retry with status-only
    if (updateError && Object.keys(payload).length > 1) {
      const { error: retryError } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", orderId);
      updateError = retryError;
    }

    setIsUpdating(false);

    if (updateError) {
      console.error("[UniEats Driver] Status update failed:", updateError.message);
      setError("Failed to update status. Check console.");
      return;
    }

    setOrders((current) =>
      current.map((o) =>
        String(o.id) === String(orderId) ? { ...o, status: nextStatus } : o,
      ),
    );
    setError(null);
  };

  const insertTestDelivery = async () => {
    if (!supabase) return;
    const canteen = canteens[0];
    if (!canteen) {
      setError("No canteen found to create a test delivery.");
      return;
    }

    const orderNumber = String(Math.floor(1000 + Math.random() * 9000));

    const { data: inserted, error: insertError } = await supabase
      .from("orders")
      .insert([{
        order_number: orderNumber,
        student_name: "Test Delivery Student",
        registration_number: "DRV-TEST-001",
        phone: "03001234567",
        delivery_location: "CS Department, Block A",
        order_type: "delivery",
        canteen_id: canteen.id,
        status: "ready",
        total_amount: 450,
        delivery_charge: 55,
        driver_id: null,
      }])
      .select("id")
      .single();

    if (insertError) {
      console.error("[UniEats Driver] Test delivery insert failed:", insertError.message);
      setError("Test delivery insert failed.");
      return;
    }

    const orderId = inserted?.id;
    if (orderId) {
      await supabase.from("order_items").insert([{
        order_id: orderId,
        menu_item_id: null,
        item_name: "Test Delivery Burger",
        quantity: 2,
        price: 175,
        subtotal: 350,
      }, {
        order_id: orderId,
        menu_item_id: null,
        item_name: "Test Delivery Fries",
        quantity: 1,
        price: 100,
        subtotal: 100,
      }]);
    }

    await loadData();
  };

  return (
    <div className="min-h-screen bg-[#f8f5ff] pb-24 text-slate-900">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            Driver Portal
          </p>
          <div className="mt-1 flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Deliveries
            </h1>
            <div className="flex items-center gap-2">
              {process.env.NODE_ENV !== "production" && (
                <button
                  type="button"
                  onClick={() => void insertTestDelivery()}
                  className="rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-200"
                >
                  + Test Delivery
                </button>
              )}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                {activeOrders.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
            Loading deliveries...
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-emerald-600">
                  {activeOrders.filter((o) => o.status === "ready").length}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">Ready</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-cyan-600">
                  {activeOrders.filter((o) => o.status === "out_for_delivery").length}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">En Route</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-green-600">
                  {completedOrders.length}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">Delivered</p>
              </div>
            </div>

            {/* Active Deliveries */}
            <section className="mb-6">
              <h2 className="mb-3 text-lg font-bold text-slate-900">
                Active Deliveries
              </h2>

              {activeOrders.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 px-4 py-12 text-center">
                  <p className="text-3xl" aria-hidden>&#x1F4E6;</p>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    No active deliveries right now.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    New delivery orders will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeOrders.map((order) => {
                    const orderItems = itemsByOrder[String(order.id)] ?? [];
                    const canteenName = order.canteen_id
                      ? canteenMap[String(order.canteen_id)]?.name ?? "Unknown"
                      : "Unknown";
                    const isSelected = String(selectedOrderId) === String(order.id);

                    return (
                      <div
                        key={String(order.id)}
                        className={`overflow-hidden rounded-2xl border shadow-sm transition ${
                          isSelected
                            ? "border-violet-500 bg-violet-50/50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        {/* Card header - tappable to toggle detail */}
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedOrderId(isSelected ? null : order.id)
                          }
                          className="w-full p-4 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-slate-900">
                                  #{order.order_number}
                                </span>
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    STATUS_STYLES[order.status] ?? "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {STATUS_LABELS[order.status] ?? order.status.replace(/_/g, " ")}
                                </span>
                              </div>
                              <p className="mt-1 text-sm font-medium text-slate-800">
                                {order.student_name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {order.registration_number}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-900">
                                {toCurrency(Number(order.total_amount))}
                              </p>
                              {order.created_at && (
                                <p className="text-[11px] text-slate-400">
                                  {toShortTime(order.created_at)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 space-y-1 text-xs text-slate-600">
                            <p className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-500">From:</span>
                              {canteenName}
                            </p>
                            {order.delivery_location && (
                              <p className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-500">To:</span>
                                {order.delivery_location}
                              </p>
                            )}
                            <p className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-500">Items:</span>
                              {orderItems.length} item{orderItems.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </button>

                        {/* Expanded detail panel */}
                        {isSelected && (
                          <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3">
                            <div className="space-y-3 text-sm">
                              {/* Contact info */}
                              <div className="rounded-xl bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  Student Contact
                                </p>
                                <div className="mt-2 space-y-1">
                                  <p className="font-medium text-slate-900">
                                    {order.student_name}
                                  </p>
                                  <a
                                    href={`tel:${order.phone}`}
                                    className="block text-sm font-semibold text-violet-600 underline"
                                  >
                                    {order.phone}
                                  </a>
                                  <p className="text-xs text-slate-500">
                                    {order.registration_number}
                                  </p>
                                </div>
                              </div>

                              {/* Payment method */}
                              {order.payment_method && (
                                <div className="rounded-xl bg-violet-50 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                                    Payment Method
                                  </p>
                                  <p className="mt-1 font-semibold text-slate-900">
                                    {order.payment_method === "cod" ? "Cash on Delivery (COD)" : "Online Payment"}
                                  </p>
                                </div>
                              )}

                              {/* Delivery location */}
                              {order.delivery_location && (
                                <div className="rounded-xl bg-emerald-50 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                                    Delivery Location
                                  </p>
                                  <p className="mt-1 font-semibold text-slate-900">
                                    {order.delivery_location}
                                  </p>
                                </div>
                              )}

                              {/* Items */}
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  Order Items
                                </p>
                                <div className="space-y-1.5">
                                  {orderItems.map((item) => (
                                    <div
                                      key={String(item.id)}
                                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                                    >
                                      <span className="text-sm text-slate-800">
                                        {item.item_name}{" "}
                                        <span className="text-xs text-slate-500">
                                          x{item.quantity}
                                        </span>
                                      </span>
                                      <span className="text-sm font-semibold text-slate-900">
                                        {toCurrency(Number(item.subtotal))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Totals */}
                              <div className="rounded-xl bg-slate-50 p-3">
                                <div className="flex justify-between text-xs text-slate-500">
                                  <span>Subtotal</span>
                                  <span>
                                    {toCurrency(
                                      Number(order.total_amount) - Number(order.delivery_charge),
                                    )}
                                  </span>
                                </div>
                                <div className="mt-1 flex justify-between text-xs text-slate-500">
                                  <span>Delivery charge</span>
                                  <span>{toCurrency(Number(order.delivery_charge))}</span>
                                </div>
                                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                                  <span>Total</span>
                                  <span>{toCurrency(Number(order.total_amount))}</span>
                                </div>
                              </div>

                              <p className="text-xs text-slate-400">
                                Ordered: {toDateTime(order.created_at)}
                              </p>
                            </div>

                            {/* ACTION BUTTON - Large and touch-friendly */}
                            <div className="mt-4">
                              {order.status === "ready" && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    void updateStatus(order.id, "out_for_delivery")
                                  }
                                  className="w-full rounded-2xl bg-violet-600 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                                >
                                  {isUpdating ? "Updating..." : "Start Delivery"}
                                </button>
                              )}
                              {order.status === "out_for_delivery" && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    void updateStatus(order.id, "delivered")
                                  }
                                  className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                                >
                                  {isUpdating ? "Updating..." : "Order Delivered"}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Completed Deliveries toggle */}
            <section>
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50"
              >
                <span className="text-sm font-bold text-slate-900">
                  Completed Deliveries ({completedOrders.length})
                </span>
                <span className="text-xs text-slate-500">
                  {showCompleted ? "Hide" : "Show"}
                </span>
              </button>

              {showCompleted && (
                <div className="mt-3 space-y-2">
                  {completedOrders.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">
                      No completed deliveries yet.
                    </p>
                  ) : (
                    completedOrders.map((order) => {
                      const canteenName = order.canteen_id
                        ? canteenMap[String(order.canteen_id)]?.name ?? "Unknown"
                        : "Unknown";

                      return (
                        <div
                          key={String(order.id)}
                          className="rounded-2xl border border-slate-200 bg-white/80 p-4 opacity-75"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bold text-slate-900">
                                #{order.order_number}
                              </span>
                              <span className="ml-2 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                                Delivered
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-slate-600">
                              {toCurrency(Number(order.total_amount))}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            <p>{order.student_name} &middot; {canteenName}</p>
                            {order.delivery_location && (
                              <p className="mt-0.5">To: {order.delivery_location}</p>
                            )}
                            <p className="mt-0.5">{toDateTime(order.created_at)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
