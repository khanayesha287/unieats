"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, buildStatusUpdatePayload } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";
import { useAuth } from "@/components/providers/AuthProvider";

export type CanteenStatus = "pending" | "confirmed" | "preparing" | "ready";

interface CanteenRecord {
  id: number | string;
  name: string;
}

interface PortalOrderItem {
  id: number | string;
  order_id: number | string;
  item_name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface PortalOrder {
  id: number | string;
  order_number: string;
  student_name: string;
  phone: string;
  order_type: "pickup" | "delivery";
  delivery_location?: string | null;
  canteen_id?: number | string | null;
  status: CanteenStatus;
  total_amount: number;
  payment_method?: string | null;
  created_at?: string | null;
}

const STATUS_STYLES: Record<CanteenStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-sky-100 text-sky-800",
  preparing: "bg-violet-100 text-violet-800",
  ready: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABELS: Record<CanteenStatus, string> = {
  pending: "New",
  confirmed: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
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

function normalizeStatus(value: unknown): CanteenStatus {
  const valid: CanteenStatus[] = ["pending", "confirmed", "preparing", "ready"];
  const normalized = typeof value === "string" ? value : "pending";
  return valid.includes(normalized as CanteenStatus) ? (normalized as CanteenStatus) : "pending";
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

function isRecentOrder(value?: string | null): boolean {
  if (!value) return false;
  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt < 10 * 60 * 1000;
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
    pickString(record, ["name", "canteen_name", "title", "label"]) ?? `Canteen ${String(id)}`;
  return { id, name };
}

function coerceOrder(input: unknown): PortalOrder | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = record.id ?? record.order_id ?? null;
  const canteenId = record.canteen_id ?? record.canteenId ?? null;
  const totalAmount =
    typeof record.total_amount === "number"
      ? record.total_amount
      : Number(record.total_amount ?? 0);

  return {
    id:
      typeof id === "number" || typeof id === "string"
        ? id
        : `order-${Math.random().toString(36).slice(2, 9)}`,
    order_number:
      pickString(record, ["order_number", "orderNumber", "order_no"]) ?? "\u2014",
    student_name:
      pickString(record, ["student_name", "studentName", "customer_name", "name"]) ?? "Unknown student",
    phone: pickString(record, ["phone", "student_phone", "mobile", "contact_number"]) ?? "\u2014",
    order_type:
      pickString(record, ["order_type", "orderType"]) === "delivery" ? "delivery" : "pickup",
    delivery_location:
      pickString(record, ["delivery_location", "deliveryLocation", "location"]) ?? null,
    canteen_id:
      typeof canteenId === "number" || typeof canteenId === "string" ? canteenId : null,
    status: normalizeStatus(record.status),
    total_amount: Number.isFinite(totalAmount) ? totalAmount : 0,
    payment_method: pickString(record, ["payment_method", "paymentMethod"]) ?? null,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
  };
}

function coerceOrderItem(input: unknown): PortalOrderItem | null {
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

async function fetchPortalData() {
  if (!supabase) {
    return {
      canteens: [] as CanteenRecord[],
      orders: [] as PortalOrder[],
      items: [] as PortalOrderItem[],
      error: "Supabase is not configured.",
    };
  }

  const [ordersResult, canteensResult, itemsResult] = await Promise.all([
    supabase.from("orders").select("*"),
    supabase.from("canteens").select("*"),
    supabase.from("order_items").select("*"),
  ]);

  if (ordersResult.error && !isMissingTableError(ordersResult.error)) {
    console.error("[UniEats Canteen] Orders fetch error:", ordersResult.error.message);
  }
  if (canteensResult.error && !isMissingTableError(canteensResult.error)) {
    console.error("[UniEats Canteen] Canteens fetch error:", canteensResult.error.message);
  }
  if (itemsResult.error && !isMissingTableError(itemsResult.error)) {
    console.error("[UniEats Canteen] Items fetch error:", itemsResult.error.message);
  }

  const canteens = Array.isArray(canteensResult.data)
    ? canteensResult.data.map(coerceCanteen).filter((r): r is CanteenRecord => r !== null)
    : [];
  const orders = (Array.isArray(ordersResult.data) ? ordersResult.data : [])
    .map(coerceOrder)
    .filter((r): r is PortalOrder => r !== null)
    .sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    });
  const items = Array.isArray(itemsResult.data)
    ? itemsResult.data.map(coerceOrderItem).filter((r): r is PortalOrderItem => r !== null)
    : [];

  const hasRealError =
    Boolean(ordersResult.error && !isMissingTableError(ordersResult.error)) ||
    Boolean(canteensResult.error && !isMissingTableError(canteensResult.error)) ||
    Boolean(itemsResult.error && !isMissingTableError(itemsResult.error));

  return {
    canteens,
    orders,
    items,
    error: hasRealError ? "Some queries failed. Check console." : null,
  };
}

export default function CanteenPortalContent() {
  const { profile } = useAuth();
  const [canteens, setCanteens] = useState<CanteenRecord[]>([]);
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [items, setItems] = useState<PortalOrderItem[]>([]);
  const [selectedCanteenId, setSelectedCanteenId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Lock canteen_owner to their assigned canteen
  useEffect(() => {
    if (profile?.role === "canteen_owner" && profile.canteen_id && canteens.length > 0) {
      const matched = canteens.find(c => String(c.id) === String(profile.canteen_id));
      if (matched) setSelectedCanteenId(matched.id);
    }
  }, [profile, canteens]);

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    const data = await fetchPortalData();
    setCanteens(data.canteens);
    setOrders(data.orders);
    setItems(data.items);
    setError(data.error);
    if (!silent) setIsLoading(false);
    if (!selectedCanteenId && data.canteens.length > 0) {
      setSelectedCanteenId(data.canteens[0].id);
    }
  };

  useEffect(() => { void loadData(); }, []);

  // Polling every 15 s — silent refresh (no loading flash)
  useEffect(() => {
    const interval = setInterval(() => {
      void loadData(true);
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!supabaseAuth) return;
    const channel = supabaseAuth
      .channel("canteen-orders-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => { void loadData(true); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => { void loadData(true); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, () => { void loadData(true); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_items" }, () => { void loadData(true); })
      .subscribe();
    return () => { if (supabaseAuth) void supabaseAuth.removeChannel(channel); };
  }, []);

  const canteenMap = useMemo(
    () => Object.fromEntries(canteens.map((c) => [String(c.id), c])) as Record<string, CanteenRecord>,
    [canteens],
  );

  const filteredOrders = useMemo(() => {
    if (!selectedCanteenId) return [];
    return orders.filter((o) => String(o.canteen_id ?? "") === String(selectedCanteenId));
  }, [orders, selectedCanteenId]);

  const itemsByOrder = useMemo(() => {
    return items.reduce<Record<string, PortalOrderItem[]>>((acc, item) => {
      const key = String(item.order_id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  // Status update with timestamps and fallback
  const updateOrderStatus = async (orderId: number | string, nextStatus: CanteenStatus) => {
    if (!supabase) return;
    setIsUpdating(true);

    let payload: Record<string, unknown> = { status: nextStatus };
    try {
      const { data: existing } = await supabase
        .from("orders")
        .select("confirmed_at,preparing_at,ready_at")
        .eq("id", orderId)
        .maybeSingle();
      payload = buildStatusUpdatePayload(nextStatus, existing ?? undefined);
    } catch { /* timestamp columns may not exist */ }

    let { error: updateError } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", orderId);

    if (updateError && Object.keys(payload).length > 1) {
      const { error: retryError } = await supabase
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", orderId);
      updateError = retryError;
    }

    setIsUpdating(false);
    if (updateError) {
      console.error("[UniEats Canteen] Status update failed:", updateError.message);
      setError("Failed to update order status.");
      return;
    }
    setOrders((current) =>
      current.map((o) =>
        String(o.id) === String(orderId) ? { ...o, status: nextStatus } : o,
      ),
    );
    setError(null);
  };

  // Group orders into 3 workflow buckets
  const newOrders = filteredOrders.filter((o) => o.status === "pending");
  const acceptedOrders = filteredOrders.filter(
    (o) => o.status === "confirmed" || o.status === "preparing",
  );
  const readyOrders = filteredOrders.filter((o) => o.status === "ready");

  const summaryCards = [
    { label: "New Orders", value: newOrders.length, accent: "bg-amber-100 text-amber-700" },
    { label: "Preparing", value: acceptedOrders.length, accent: "bg-sky-100 text-sky-700" },
    { label: "Ready", value: readyOrders.length, accent: "bg-emerald-100 text-emerald-700" },
  ];

  const renderOrderCard = (order: PortalOrder, action: "accept" | "ready" | null) => {
    const orderItems = itemsByOrder[String(order.id)] ?? [];
    const isNew = order.status === "pending" && isRecentOrder(order.created_at);
    const canteenName = order.canteen_id
      ? canteenMap[String(order.canteen_id)]?.name ?? "Unknown"
      : "Unknown";
    const paymentLabel =
      order.payment_method === "cod"
        ? "Cash on Delivery"
        : order.payment_method === "online"
          ? "Online Payment"
          : null;

    return (
      <div
        key={String(order.id)}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900">#{order.order_number}</span>
              {isNew && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                  New
                </span>
              )}
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[order.status]}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>
            <span className="text-xs text-slate-400">{toDateTime(order.created_at)}</span>
          </div>

          {/* Order info grid */}
          <div className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <div>
              <span className="text-xs text-slate-500">Student</span>
              <p className="font-medium text-slate-900">{order.student_name}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Phone</span>
              <p className="font-semibold text-violet-600">{order.phone}</p>
            </div>
            {order.delivery_location && (
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Delivery Location</span>
                <p className="font-medium text-slate-900">{order.delivery_location}</p>
              </div>
            )}
            {paymentLabel && (
              <div>
                <span className="text-xs text-slate-500">Payment</span>
                <p className="font-medium text-slate-900">{paymentLabel}</p>
              </div>
            )}
            <div>
              <span className="text-xs text-slate-500">Type</span>
              <p className="font-medium capitalize text-slate-900">{order.order_type}</p>
            </div>
          </div>

          {/* Items */}
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Items</p>
            <div className="space-y-1">
              {orderItems.map((item) => (
                <div key={String(item.id)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="text-slate-800">
                    {item.item_name} <span className="text-xs text-slate-500">x{item.quantity}</span>
                  </span>
                  <span className="font-medium text-slate-900">{toCurrency(Number(item.subtotal))}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-sm font-semibold text-slate-600">Total</span>
            <span className="text-base font-bold text-slate-900">{toCurrency(Number(order.total_amount))}</span>
          </div>
        </div>

        {/* Action button */}
        {action && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            {action === "accept" && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => void updateOrderStatus(order.id, "confirmed")}
                className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-violet-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isUpdating ? "Updating..." : "Order Accepted"}
              </button>
            )}
            {action === "ready" && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => void updateOrderStatus(order.id, "ready")}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isUpdating ? "Updating..." : "Order Ready"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderBucket = (
    title: string,
    bucketOrders: PortalOrder[],
    action: "accept" | "ready" | null,
    emptyIcon: string,
    emptyText: string,
  ) => (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {bucketOrders.length}
        </span>
      </div>
      {bucketOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center">
          <p className="text-2xl" aria-hidden>{emptyIcon}</p>
          <p className="mt-1 text-sm text-slate-500">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bucketOrders.map((order) => renderOrderCard(order, action))}
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-[#f8f5ff] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">
              Canteen Portal
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Order Queue
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canteens.length > 0 && (
              <select
                value={String(selectedCanteenId ?? "")}
                onChange={(e) => setSelectedCanteenId(e.target.value || null)}
                disabled={profile?.role === "canteen_owner"}
                className={`rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-violet-500 ${
                  profile?.role === "canteen_owner" ? "cursor-not-allowed opacity-70" : ""
                }`}
              >
                {canteens.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${card.accent}`}>
                {card.label}
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
            Loading orders\u2026
          </div>
        ) : (
          <div className="space-y-8">
            {renderBucket("New Orders", newOrders, "accept", "\u{1F4E8}", "No new orders waiting.")}
            {renderBucket("Accepted & Preparing", acceptedOrders, "ready", "\u{1F373}", "No orders being prepared.")}
            {renderBucket("Ready for Pickup", readyOrders, null, "\u2705", "No orders ready yet.")}
          </div>
        )}
      </div>
    </div>
  );
}
