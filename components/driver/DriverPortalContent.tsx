"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildStatusUpdatePayload, supabase } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { DELIVERY_FEE_PER_CANTEEN } from "@/lib/constants";

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
  phone: string;
  department?: string | null;
  special_instructions?: string | null;
  order_type: "pickup" | "delivery";
  delivery_location: string | null;
  canteen_id: number | string | null;
  status: DriverStatus | string;
  total_amount: number;
  delivery_charge: number;
  created_at: string | null;
  ready_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  driver_id?: string | number | null;
}

const DRIVER_ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
];
const DRIVER_VISIBLE_STATUSES = [...DRIVER_ACTIVE_STATUSES, "delivered", "completed"];
const DRIVER_DELIVERY_STATUSES = ["ready", "out_for_delivery", "delivered", "completed"];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-emerald-100 text-emerald-800",
  out_for_delivery: "bg-cyan-100 text-cyan-800",
  delivered: "bg-green-100 text-green-800",
  completed: "bg-slate-100 text-slate-800",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
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

function uniqueById<T extends { id: number | string }>(records: T[]): T[] {
  const recordsById = new Map(records.map((record) => [String(record.id), record]));
  return [...recordsById.values()];
}

function getQueryErrorMetadata(
  error: unknown,
  response: { status: number; statusText: string },
) {
  const readField = (value: unknown, field: string): unknown => {
    if (typeof value !== "object" || value === null) return undefined;
    try {
      return (value as Record<string, unknown>)[field];
    } catch {
      return undefined;
    }
  };
  if (typeof error !== "object" || error === null) {
    return {
      name: null,
      message:
        typeof error === "string"
          ? error
          : "Unexpected non-object error value returned by Supabase.",
      code: null,
      details: null,
      hint: null,
      status: response.status,
      statusText: response.statusText,
      responseBody: null,
    };
  }

  const stringField = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;
  const bodyFields = ["code", "message", "details", "hint"] as const;
  const responseBody = Object.fromEntries(
    bodyFields
      .map((field) => [field, stringField(readField(error, field))] as const)
      .filter((entry): entry is readonly [typeof bodyFields[number], string] => entry[1] !== null),
  );
  const metadata = {
    name: stringField(readField(error, "name")),
    message: stringField(readField(error, "message")),
    code: stringField(readField(error, "code")),
    details: stringField(readField(error, "details")),
    hint: stringField(readField(error, "hint")),
    status: response.status,
    statusText: response.statusText,
    responseBody:
      Object.keys(responseBody).length > 0 ? responseBody : null,
  };

  if (
    metadata.name === null &&
    metadata.message === null &&
    metadata.code === null &&
    metadata.details === null &&
    metadata.hint === null
  ) {
    metadata.message = "Empty error object returned by Supabase.";
  }
  return metadata;
}

function normalizeDriverStatus(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  return "pending";
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
  if (
    (typeof id !== "number" && typeof id !== "string") ||
    !String(id).trim()
  ) {
    return null;
  }
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
    id,
    order_number:
      pickString(record, ["order_number", "orderNumber"]) ?? "\u2014",
    student_name:
      pickString(record, ["student_name", "studentName", "name"]) ?? "Unknown",
    phone: pickString(record, ["phone", "mobile"]) ?? "\u2014",
    department: pickString(record, ["department"]) ?? null,
    special_instructions:
      typeof record.special_instructions === "string" &&
      record.special_instructions.trim()
        ? record.special_instructions
        : null,
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
    created_at: typeof record.created_at === "string" ? record.created_at : null,
    ready_at: typeof record.ready_at === "string" ? record.ready_at : null,
    out_for_delivery_at:
      typeof record.out_for_delivery_at === "string" ? record.out_for_delivery_at : null,
    delivered_at: typeof record.delivered_at === "string" ? record.delivered_at : null,
    driver_id:
      typeof record.driver_id === "number" || typeof record.driver_id === "string"
        ? record.driver_id
        : null,
  };
}

function coerceOrderItem(input: unknown): DriverOrderItem | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = record.id ?? null;
  const orderId = record.order_id ?? null;
  if (
    (typeof id !== "number" && typeof id !== "string") ||
    !String(id).trim() ||
    (typeof orderId !== "number" && typeof orderId !== "string") ||
    !String(orderId).trim()
  ) {
    return null;
  }
  const quantity =
    typeof record.quantity === "number" ? record.quantity : Number(record.quantity ?? 0);
  const price =
    typeof record.price === "number" ? record.price : Number(record.price ?? 0);
  const subtotal =
    typeof record.subtotal === "number"
      ? record.subtotal
      : Number(record.subtotal ?? price * quantity);

  return {
    id,
    order_id: orderId,
    item_name: pickString(record, ["item_name", "itemName", "name"]) ?? "Unknown item",
    quantity: Number.isFinite(quantity) ? quantity : 0,
    price: Number.isFinite(price) ? price : 0,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
  };
}

export default function DriverPortalContent() {
  const { profile, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [items, setItems] = useState<DriverOrderItem[]>([]);
  const [canteens, setCanteens] = useState<CanteenRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const updateInProgress = useRef(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const profileError = !authLoading
    ? !supabaseAuth
      ? "Supabase is not configured."
      : !profile
        ? "An active staff profile is required to view deliveries."
        : profile.role === "driver" && !profile.driver_id
          ? "This rider account is not linked to a driver record. Contact an administrator."
          : null
    : null;

  const loadData = useCallback(async (silent = false) => {
    if (
      authLoading ||
      !supabaseAuth ||
      !profile ||
      (profile.role === "driver" && !profile.driver_id)
    ) return false;

    let ordersQuery = supabaseAuth
      .from("orders")
      .select(
        "id,order_number,student_name,phone,department,special_instructions,order_type,delivery_location,canteen_id,status,total_amount,delivery_charge,created_at,ready_at,out_for_delivery_at,delivered_at,driver_id",
      )
      .eq("order_type", "delivery");
    if (profile.role === "driver") {
      ordersQuery = ordersQuery.or(
        `driver_id.is.null,driver_id.eq.${profile.driver_id}`,
      );
    }

    const [ordersResult, canteensResult, itemsResult] = await Promise.all([
      ordersQuery,
      supabaseAuth.from("canteens").select("id,name"),
      supabaseAuth
        .from("order_items")
        .select("id,order_id,item_name,quantity,price,subtotal"),
    ]);

    const queryFailures = [
      {
        operation: "orders.select",
        error: ordersResult.error,
        status: ordersResult.status,
        statusText: ordersResult.statusText,
      },
      {
        operation: "canteens.select",
        error: canteensResult.error,
        status: canteensResult.status,
        statusText: canteensResult.statusText,
      },
      {
        operation: "order_items.select",
        error: itemsResult.error,
        status: itemsResult.status,
        statusText: itemsResult.statusText,
      },
    ].filter(
      (failure): failure is typeof failure & { error: NonNullable<typeof failure.error> } =>
        Boolean(failure.error),
    );
    for (const { operation, error, status, statusText } of queryFailures) {
      const metadata = getQueryErrorMetadata(error, { status, statusText });
      console.error(
        `[UniEats Driver] ${operation} failed: ${JSON.stringify(metadata)}`,
      );
    }

    const newCanteens = Array.isArray(canteensResult.data)
      ? canteensResult.data.map(coerceCanteen).filter((r): r is CanteenRecord => r !== null)
      : [];
    const fetchedOrders = (Array.isArray(ordersResult.data) ? ordersResult.data : [])
      .map(coerceOrder)
      .filter((r): r is DriverOrder => r !== null)
      .filter((o) =>
        profile.role === "driver"
          ? DRIVER_DELIVERY_STATUSES.includes(o.status)
          : DRIVER_VISIBLE_STATUSES.includes(o.status),
      );
    const newOrders = uniqueById(fetchedOrders)
      .sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      });
    const newItems = Array.isArray(itemsResult.data)
      ? uniqueById(
          itemsResult.data
            .map(coerceOrderItem)
            .filter((r): r is DriverOrderItem => r !== null),
        )
      : [];

    setCanteens(newCanteens);
    setOrders(newOrders);
    setItems(newItems);
    setError(
      queryFailures.length > 0
        ? `Delivery data could not be fully loaded (${queryFailures.map((failure) => failure.operation).join(", ")}). Check your connection or contact an administrator.`
        : null,
    );
    if (!silent) setIsLoading(false);
    return !ordersResult.error;
  }, [authLoading, profile]);

  useEffect(() => {
    if (
      authLoading ||
      !supabaseAuth ||
      !profile ||
      (profile.role === "driver" && !profile.driver_id)
    ) return;
    void Promise.resolve().then(() => loadData());
  }, [authLoading, loadData, profile]);

  // Polling every 15 s — silent refresh (no loading flash)
  useEffect(() => {
    if (authLoading || !profile) return;
    const interval = setInterval(() => {
      void loadData(true);
    }, 15_000);
    return () => clearInterval(interval);
  }, [authLoading, loadData, profile]);

  useEffect(() => {
    if (authLoading || !profile || !supabaseAuth) return;

    const channel = supabaseAuth
      .channel("driver-orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => { void loadData(true); },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => { void loadData(true); },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        () => { void loadData(true); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        () => { void loadData(true); },
      )
      .subscribe();

    return () => {
      if (supabaseAuth) void supabaseAuth.removeChannel(channel);
    };
  }, [authLoading, loadData, profile]);

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
    () => orders.filter((o) => DRIVER_ACTIVE_STATUSES.includes(o.status)),
    [orders],
  );

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered" || o.status === "completed"),
    [orders],
  );

  const selectedOrder = useMemo(
    () => orders.find((o) => String(o.id) === String(selectedOrderId)) ?? null,
    [orders, selectedOrderId],
  );

  const updateStatus = async (
    orderId: number | string,
    nextStatus: "out_for_delivery" | "delivered",
  ) => {
    if (updateInProgress.current) return;
    if (!supabaseAuth) {
      setError("Supabase is not configured.");
      return;
    }

    const currentOrder = orders.find((order) => String(order.id) === String(orderId));
    const driverId = profile?.role === "driver" ? profile.driver_id : null;
    if (
      profile?.role === "driver" &&
      (!driverId ||
        !currentOrder ||
        String(currentOrder.driver_id ?? "") !== driverId ||
        !(
          (currentOrder.status === "ready" && nextStatus === "out_for_delivery") ||
          (currentOrder.status === "out_for_delivery" && nextStatus === "delivered")
        ))
    ) {
      setError("Only assigned deliveries at the correct stage can be updated.");
      return;
    }

    updateInProgress.current = true;
    setIsUpdating(true);
    setError(null);
    setUpdateMessage(null);

    try {
      // Build payload with timestamp; fall back to status-only if columns don't exist.
      let payload: Record<string, unknown> = { status: nextStatus };
      const timestampQuery = supabaseAuth
        .from("orders")
        .select("ready_at,out_for_delivery_at,delivered_at")
        .eq("id", orderId);
      const scopedTimestampQuery =
        driverId
          ? timestampQuery.eq("driver_id", driverId)
          : timestampQuery;
      const { data: existing, error: timestampError } =
        await scopedTimestampQuery.maybeSingle();
      if (timestampError) {
        console.error("[UniEats Driver] order_timestamps.select failed:", {
          code: timestampError.code,
          message: timestampError.message,
        });
      }
      payload = buildStatusUpdatePayload(nextStatus, existing ?? undefined);

      let updateQuery = supabaseAuth
        .from("orders")
        .update(payload)
        .eq("id", orderId);
      if (driverId) {
        updateQuery = updateQuery.eq("driver_id", driverId);
      }
      let { data: updatedOrder, error: updateError } = await updateQuery
        .select("id,status")
        .maybeSingle();

      // If update failed (e.g. missing timestamp columns), retry with status-only.
      if (updateError && Object.keys(payload).length > 1) {
        let retryQuery = supabaseAuth
          .from("orders")
          .update({ status: nextStatus })
          .eq("id", orderId);
        if (driverId) {
          retryQuery = retryQuery.eq("driver_id", driverId);
        }
        const retryResult = await retryQuery.select("id,status").maybeSingle();
        updatedOrder = retryResult.data;
        updateError = retryResult.error;
      }

      if (updateError || !updatedOrder) {
        console.error(
          "[UniEats Driver] Status update failed:",
          updateError?.message ?? "No assigned order matched the update filters.",
        );
        setError("Failed to update delivery status. Refresh and try again.");
        return;
      }

      setOrders((current) =>
        current.map((order) =>
          String(order.id) === String(orderId)
            ? { ...order, status: nextStatus }
            : order,
        ),
      );
      const refreshed = await loadData(true);
      if (!refreshed) {
        setError("Delivery status was updated, but the order list could not refresh.");
        return;
      }
      setUpdateMessage("Delivery status updated.");
    } catch (updateFailure) {
      console.error("[UniEats Driver] Status update failed:", updateFailure);
      setError("Failed to update delivery status. Refresh and try again.");
    } finally {
      updateInProgress.current = false;
      setIsUpdating(false);
    }
  };

  const confirmOrder = async (order: DriverOrder) => {
    if (
      profile?.role === "driver" &&
      order.driver_id == null
    ) {
      if (!supabaseAuth || !profile.driver_id) {
        setError("This rider account is not linked to a driver record.");
        return;
      }
      if (updateInProgress.current) return;

      updateInProgress.current = true;
      setIsUpdating(true);
      setError(null);
      setUpdateMessage(null);
      try {
        const { data: claimed, error: claimError } = await supabaseAuth.rpc(
          "claim_delivery_order",
          { p_order_id: String(order.id) },
        );
        if (claimError) {
          console.error("[UniEats Driver] claim_delivery_order failed:", {
            code: claimError.code,
            message: claimError.message,
            orderId: String(order.id),
          });
          setError("Could not confirm this order. It may already have been claimed; refresh and try again.");
          return;
        }
        if (claimed !== true) {
          await loadData(true);
          setError("This order is no longer available to claim.");
          return;
        }

        const refreshed = await loadData(true);
        if (!refreshed) {
          setError("The order was claimed, but the delivery list could not refresh.");
          return;
        }
        setUpdateMessage("Order confirmed and assigned to you.");
      } catch (claimFailure) {
        console.error("[UniEats Driver] claim_delivery_order failed:", claimFailure);
        setError("Could not confirm this order. Refresh and try again.");
      } finally {
        updateInProgress.current = false;
        setIsUpdating(false);
      }
      return;
    }

    await updateStatus(order.id, "out_for_delivery");
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
        phone: "03001234567",
        delivery_location: "CS Department, Block A",
        order_type: "delivery",
        canteen_id: canteen.id,
        status: "ready",
        total_amount: 450 + DELIVERY_FEE_PER_CANTEEN,
        delivery_charge: DELIVERY_FEE_PER_CANTEEN,
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
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                {activeOrders.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        {(error || profileError) && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error ?? profileError}
          </div>
        )}
        {updateMessage && (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {updateMessage}
          </div>
        )}

        {authLoading || (isLoading && !profileError) ? (
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
                Incoming & Active Deliveries
              </h2>

              {activeOrders.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 px-4 py-12 text-center">
                  <p className="text-3xl" aria-hidden>&#x1F4E6;</p>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    No incoming or active deliveries right now.
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
                    const isAssignedToCurrentDriver =
                      profile?.role !== "driver" ||
                      Boolean(
                        profile.driver_id &&
                          order.driver_id != null &&
                          String(order.driver_id) === String(profile.driver_id),
                      );

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
                              {profile?.role === "driver" && (
                                <p className="mt-1 text-xs font-medium text-slate-500">
                                  {isAssignedToCurrentDriver
                                    ? "Assigned to you"
                                    : "Awaiting driver assignment"}
                                </p>
                              )}
                              <p className="mt-1 text-sm font-medium text-slate-800">
                                {order.student_name}
                              </p>
                              {order.department && (
                                <p className="text-xs text-slate-500">
                                  {order.department}
                                </p>
                              )}
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
                            {order.special_instructions && (
                              <p className="whitespace-pre-wrap">
                                <span className="font-medium text-slate-500">Special Instructions:</span>{" "}
                                {order.special_instructions}
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
                              <div className="rounded-xl bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  Order Reference
                                </p>
                                <p className="mt-2 font-medium text-slate-900">
                                  Order #{order.order_number}
                                </p>
                                <p className="break-all text-xs text-slate-500">
                                  ID: {String(order.id)}
                                </p>
                              </div>

                              {/* Contact info */}
                              <div className="rounded-xl bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  Student Contact
                                </p>
                                <div className="mt-2 space-y-1">
                                  <p className="font-medium text-slate-900">
                                    {order.student_name}
                                  </p>
                                  {order.phone !== "\u2014" ? (
                                    <a
                                      href={`tel:${order.phone}`}
                                      className="block text-sm font-semibold text-violet-600 underline"
                                    >
                                      {order.phone}
                                    </a>
                                  ) : (
                                    <p className="text-sm text-slate-500">
                                      Phone number unavailable
                                    </p>
                                  )}
                                  {order.department && (
                                    <p className="text-xs text-slate-500">
                                      {order.department}
                                    </p>
                                  )}
                                </div>
                              </div>

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

                              <div className="space-y-1 text-xs text-slate-500">
                                <p>Ordered: {toDateTime(order.created_at)}</p>
                                {order.ready_at && (
                                  <p>Ready: {toDateTime(order.ready_at)}</p>
                                )}
                                {order.out_for_delivery_at && (
                                  <p>Out for delivery: {toDateTime(order.out_for_delivery_at)}</p>
                                )}
                                {order.delivered_at && (
                                  <p>Delivered: {toDateTime(order.delivered_at)}</p>
                                )}
                              </div>
                            </div>

                            {/* ACTION BUTTON - Large and touch-friendly */}
                            <div className="mt-4">
                              {order.status === "ready" &&
                                (isAssignedToCurrentDriver || order.driver_id == null) && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => void confirmOrder(order)}
                                  className="w-full rounded-2xl bg-violet-600 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                                >
                                  {isUpdating ? "Updating..." : "Order Confirmed"}
                                </button>
                              )}
                              {order.status === "out_for_delivery" && isAssignedToCurrentDriver && (
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
