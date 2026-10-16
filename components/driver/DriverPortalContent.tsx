
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseAuth } from "@/lib/supabase-auth";
import { useAuth } from "@/components/providers/AuthProvider";

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
  department: string | null;
  special_instructions: string | null;
  order_type: "delivery";
  delivery_location: string | null;
  canteen_id: number | string | null;
  status: string;
  total_amount: number;
  delivery_charge: number;
  created_at: string | null;
  ready_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  driver_id: string | number | null;
}

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "ready",
  "out_for_delivery",
];

const RIDER_STATUSES = [
  "pending",
  "confirmed",
  "ready",
  "out_for_delivery",
  "delivered",
  "completed",
];

const ALL_VISIBLE_STATUSES = [
  ...ACTIVE_STATUSES,
  "delivered",
  "completed",
];

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
  pending: "Incoming",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

function asString(
  record: Record<string, unknown>,
  keys: string[],
  fallback: string | null = null,
): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return fallback;
}

function formatCurrency(value: number): string {
  return `Rs ${new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(date);
}

function formatTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(date);
}

function uniqueById<T extends { id: string | number }>(rows: T[]): T[] {
  return [
    ...new Map(rows.map((row) => [String(row.id), row])).values(),
  ];
}

function parseOrder(input: unknown): DriverOrder | null {
  if (!input || typeof input !== "object") return null;

  const row = input as Record<string, unknown>;
  const id = row.id ?? row.order_id;

  if (
    (typeof id !== "string" && typeof id !== "number") ||
    !String(id).trim() ||
    row.order_type !== "delivery"
  ) {
    return null;
  }

  const canteenId = row.canteen_id;
  const numberValue = (value: unknown) => {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  };

  return {
    id,
    order_number: asString(row, ["order_number", "orderNumber"], "—")!,
    student_name: asString(
      row,
      ["student_name", "studentName", "name"],
      "Unknown student",
    )!,
    phone: asString(row, ["phone", "mobile"], "—")!,
    department: asString(row, ["department"]),
    special_instructions: asString(row, ["special_instructions"]),
    order_type: "delivery",
    delivery_location: asString(row, [
      "delivery_location",
      "deliveryLocation",
    ]),
    canteen_id:
      typeof canteenId === "string" || typeof canteenId === "number"
        ? canteenId
        : null,
    status: asString(row, ["status"], "pending")!,
    total_amount: numberValue(row.total_amount),
    delivery_charge: numberValue(row.delivery_charge),
    created_at:
      typeof row.created_at === "string" ? row.created_at : null,
    ready_at: typeof row.ready_at === "string" ? row.ready_at : null,
    out_for_delivery_at:
      typeof row.out_for_delivery_at === "string"
        ? row.out_for_delivery_at
        : null,
    delivered_at:
      typeof row.delivered_at === "string" ? row.delivered_at : null,
    driver_id:
      typeof row.driver_id === "string" ||
      typeof row.driver_id === "number"
        ? row.driver_id
        : null,
  };
}

function parseItem(input: unknown): DriverOrderItem | null {
  if (!input || typeof input !== "object") return null;

  const row = input as Record<string, unknown>;
  const id = row.id;
  const orderId = row.order_id;

  if (
    (typeof id !== "string" && typeof id !== "number") ||
    (typeof orderId !== "string" && typeof orderId !== "number")
  ) {
    return null;
  }

  const quantity = Number(row.quantity ?? 0);
  const price = Number(row.price ?? 0);
  const subtotal = Number(row.subtotal ?? price * quantity);

  return {
    id,
    order_id: orderId,
    item_name: asString(row, ["item_name", "itemName", "name"], "Unknown item")!,
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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const updateInProgress = useRef(false);

  const profileError = !authLoading
    ? !supabaseAuth
      ? "Supabase is not configured."
      : !profile
        ? "An active staff profile is required to view deliveries."
        : profile.role === "driver" && !profile.driver_id
          ? "This rider account is not linked to a driver record. Contact an administrator."
          : null
    : null;

  const loadData = useCallback(
    async (silent = false): Promise<boolean> => {
      if (
        authLoading ||
        !supabaseAuth ||
        !profile ||
        (profile.role === "driver" && !profile.driver_id)
      ) {
        return false;
      }

      try {
        let orderQuery = supabaseAuth
          .from("orders")
          .select(
            "id,order_number,student_name,phone,department,special_instructions,order_type,delivery_location,canteen_id,status,total_amount,delivery_charge,created_at,ready_at,out_for_delivery_at,delivered_at,driver_id",
          )
          .eq("order_type", "delivery");

        if (profile.role === "driver") {
          orderQuery = orderQuery.or(
            `driver_id.is.null,driver_id.eq.${profile.driver_id}`,
          );
        }

        const [ordersResult, canteensResult, itemsResult] =
          await Promise.all([
            orderQuery,
            supabaseAuth.from("canteens").select("id,name"),
            supabaseAuth
              .from("order_items")
              .select("id,order_id,item_name,quantity,price,subtotal"),
          ]);

        if (ordersResult.error) {
          console.error(
            "[UniEats Driver] orders.select failed:",
            ordersResult.error,
          );
        }

        if (canteensResult.error) {
          console.error(
            "[UniEats Driver] canteens.select failed:",
            canteensResult.error,
          );
        }

        if (itemsResult.error) {
          console.error(
            "[UniEats Driver] order_items.select failed:",
            itemsResult.error,
          );
        }

        const visibleStatuses =
          profile.role === "driver"
            ? RIDER_STATUSES
            : ALL_VISIBLE_STATUSES;

        const fetchedOrders = uniqueById(
          (ordersResult.data ?? [])
            .map(parseOrder)
            .filter((row): row is DriverOrder => row !== null)
            .filter((row) => visibleStatuses.includes(row.status)),
        ).sort((a, b) => {
          const timeA = a.created_at
            ? new Date(a.created_at).getTime()
            : 0;
          const timeB = b.created_at
            ? new Date(b.created_at).getTime()
            : 0;
          return timeB - timeA;
        });

        const fetchedCanteens: CanteenRecord[] = (
          canteensResult.data ?? []
        ).map((row) => ({
          id: row.id,
          name: row.name || `Canteen ${row.id}`,
        }));

        const fetchedItems = uniqueById(
          (itemsResult.data ?? [])
            .map(parseItem)
            .filter((row): row is DriverOrderItem => row !== null),
        );

        setOrders(fetchedOrders);
        setCanteens(fetchedCanteens);
        setItems(fetchedItems);

        const failures = [
          ordersResult.error && "orders.select",
          canteensResult.error && "canteens.select",
          itemsResult.error && "order_items.select",
        ].filter(Boolean);

        setError(
          failures.length
            ? `Delivery data could not be fully loaded (${failures.join(", ")}). Check your connection or contact an administrator.`
            : null,
        );

        return !ordersResult.error;
      } catch (loadFailure) {
        console.error("[UniEats Driver] Delivery loading failed:", loadFailure);
        setError("Could not load delivery information. Refresh and try again.");
        return false;
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [authLoading, profile],
  );

  useEffect(() => {
    if (
      authLoading ||
      !profile ||
      !supabaseAuth ||
      (profile.role === "driver" && !profile.driver_id)
    ) {
      return;
    }

    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadData();
    });
    return () => {
      active = false;
    };
  }, [authLoading, profile, loadData]);

  // Refresh incoming orders every 15 seconds.
  useEffect(() => {
    if (
      authLoading ||
      !profile ||
      !supabaseAuth ||
      (profile.role === "driver" && !profile.driver_id)
    ) {
      return;
    }

    const interval = setInterval(() => {
      void loadData(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [authLoading, profile, loadData]);

  // Refresh the portal when an order or order item changes.
  useEffect(() => {
    if (
      authLoading ||
      !profile ||
      !supabaseAuth ||
      (profile.role === "driver" && !profile.driver_id)
    ) {
      return;
    }

    const client = supabaseAuth;

    const channel = client
      .channel("unieats-driver-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void loadData(true),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void loadData(true),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [authLoading, profile, loadData]);

  const canteenMap = useMemo(
    () =>
      Object.fromEntries(
        canteens.map((canteen) => [String(canteen.id), canteen]),
      ) as Record<string, CanteenRecord>,
    [canteens],
  );

  const itemsByOrder = useMemo(() => {
    const result: Record<string, DriverOrderItem[]> = {};

    for (const item of items) {
      const key = String(item.order_id);
      if (!result[key]) result[key] = [];
      result[key].push(item);
    }

    return result;
  }, [items]);

  const activeOrders = useMemo(
    () => orders.filter((order) => ACTIVE_STATUSES.includes(order.status)),
    [orders],
  );

  const completedOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === "delivered" || order.status === "completed",
      ),
    [orders],
  );

  const isAssignedToCurrentDriver = (order: DriverOrder) => {
    if (profile?.role !== "driver") return true;

    return (
      profile.driver_id != null &&
      order.driver_id != null &&
      String(order.driver_id) === String(profile.driver_id)
    );
  };

  const updateStatus = async (
    orderId: string | number,
    nextStatus: "delivered",
  ) => {
    if (updateInProgress.current) return;

    if (!supabaseAuth) {
      setError("Supabase is not configured.");
      return;
    }

    const order = orders.find(
      (entry) => String(entry.id) === String(orderId),
    );

    if (
      profile?.role !== "driver" ||
      !profile.driver_id ||
      !order ||
      !isAssignedToCurrentDriver(order) ||
      !(
        (order.status === "confirmed" && nextStatus === "delivered") ||
        (order.status === "ready" && nextStatus === "delivered") ||
        (order.status === "out_for_delivery" && nextStatus === "delivered")
      )
    ) {
      setError("Only your assigned deliveries at the correct stage can be updated.");
      return;
    }

    updateInProgress.current = true;
    setIsUpdating(true);
    setError(null);
    setUpdateMessage(null);

    try {
      const driverId = String(profile.driver_id);
      const { data: updated, error: updateError } = await supabaseAuth
        .from("orders")
        .update({ status: nextStatus })
        .eq("id", orderId)
        .eq("driver_id", driverId)
        .eq("status", order.status)
        .select("id,status")
        .maybeSingle();

      if (updateError || !updated) {
        console.error(
          "[UniEats Driver] Status update failed:",
          updateError?.message ?? "No matching assigned order was updated.",
        );

        setError(
          "Failed to update delivery status. Check your connection and database permissions, then try again.",
        );
        await loadData(true);
        return;
      }

      await loadData(true);

      setUpdateMessage("Order marked as delivered successfully.");
    } catch (failure) {
      console.error("[UniEats Driver] Status update failed:", failure);
      setError("Failed to update delivery status. Refresh and try again.");
    } finally {
      updateInProgress.current = false;
      setIsUpdating(false);
    }
  };

  const confirmOrder = async (order: DriverOrder) => {
    if (profile?.role !== "driver") {
      setError("Only a rider can confirm a delivery.");
      return;
    }

    if (!supabaseAuth || !profile.driver_id) {
      setError("This rider account is not linked to a driver record.");
      return;
    }

    if (order.status !== "pending" || order.driver_id != null) {
      await loadData(true);
      setError("This order is no longer available to claim.");
      return;
    }

    if (updateInProgress.current) return;

    updateInProgress.current = true;
    setIsUpdating(true);
    setError(null);
    setUpdateMessage(null);

    try {
      const { data: claimed, error: claimError } =
        await supabaseAuth.rpc("claim_delivery_order", {
          p_order_id: String(order.id),
        });

      if (claimError) {
        console.error("[UniEats Driver] Claim failed:", {
          code: claimError.code,
          message: claimError.message,
          details: claimError.details,
          hint: claimError.hint,
          orderId: String(order.id),
        });

        if (
          claimError.code === "PGRST202" ||
          claimError.code === "42883"
        ) {
          setError(
            "The database claim function is missing or has an incompatible signature. Contact an administrator.",
          );
        } else if (claimError.code === "42501") {
          setError(
            "You are not authorized to claim this delivery. Contact an administrator.",
          );
        } else {
          setError(
            "Could not confirm this order. It may already have been claimed; refresh and try again.",
          );
        }

        await loadData(true);
        return;
      }

      // The current SQL function RETURNS TABLE, so its result is an array.
      const claimRow = Array.isArray(claimed)
        ? claimed.find((row: unknown) => {
            if (!row || typeof row !== "object") return false;

            return (
              String(
                (row as Record<string, unknown>).order_id ?? "",
              ) === String(order.id)
            );
          })
        : null;

      if (!claimRow) {
        await loadData(true);
        setError("This order is no longer available to claim.");
        return;
      }

      const refreshed = await loadData(true);

      if (!refreshed) {
        setError(
          "The order was claimed, but the delivery list could not refresh. Please refresh the page.",
        );
        return;
      }

      setUpdateMessage("Order confirmed and assigned to you.");
    } catch (failure) {
      console.error("[UniEats Driver] Claim failed:", failure);
      setError("Could not confirm this order. Refresh and try again.");
    } finally {
      updateInProgress.current = false;
      setIsUpdating(false);
    }
  };

  if (authLoading || (isLoading && !profileError)) {
    return (
      <div className="min-h-screen bg-[#f8f5ff] p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Loading deliveries...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f5ff] pb-16 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            UniEats Rider Portal
          </p>

          <div className="mt-1 flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">
              Deliveries
            </h1>

            <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-violet-600 px-2 text-sm font-bold text-white">
              {activeOrders.length}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        {(error || profileError) && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
            {error ?? profileError}
          </div>
        )}

        {updateMessage && (
          <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs leading-5 text-green-800">
            {updateMessage}
          </div>
        )}

        <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-emerald-600">
              {activeOrders.filter((order) => order.status === "pending").length}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Incoming
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-cyan-600">
              {activeOrders.filter(
                (order) => order.status === "confirmed",
              ).length}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Assigned
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-600">
              {completedOrders.length}
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Delivered
            </p>
          </div>
        </div>

        <section className="mb-6">
          <h2 className="mb-3 text-lg font-bold">
            Incoming & Active Deliveries
          </h2>

          {activeOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-10 text-center">
              <p className="text-3xl" aria-hidden="true">
                📦
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                No incoming or active deliveries right now.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                New eligible deliveries will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.map((order) => {
                const key = String(order.id);
                const orderItems = itemsByOrder[key] ?? [];
                const canteenName = order.canteen_id != null
                  ? canteenMap[String(order.canteen_id)]?.name ?? "Unknown canteen"
                  : "Unknown canteen";
                const selected = selectedOrderId === key;
                const assigned = isAssignedToCurrentDriver(order);

                return (
                  <article
                    key={key}
                    className={`overflow-hidden rounded-xl border shadow-sm ${
                      selected
                        ? "border-violet-400 bg-violet-50/40"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedOrderId(selected ? null : key)
                      }
                      aria-expanded={selected}
                      className="w-full p-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-bold">
                              #{order.order_number}
                            </span>

                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                STATUS_STYLES[order.status] ??
                                "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {STATUS_LABELS[order.status] ??
                                order.status.replace(/_/g, " ")}
                            </span>
                          </div>

                          {profile?.role === "driver" && (
                            <p className="mt-1 text-[11px] font-medium text-slate-500">
                              {assigned
                                ? "Assigned to you"
                                : "Awaiting driver assignment"}
                            </p>
                          )}

                          {order.created_at && (
                            <div className="mt-1 text-[11px] leading-4 text-slate-500">
                              <p>{formatTime(order.created_at)}</p>
                              <p>{formatDate(order.created_at)}</p>
                            </div>
                          )}

                          <p className="mt-1 text-sm font-semibold">
                            {order.student_name}
                          </p>

                          {order.department && (
                            <p className="text-xs text-slate-500">
                              {order.department}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold">
                            {formatCurrency(order.total_amount)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-500">
                            From:
                          </span>{" "}
                          {canteenName}
                        </p>

                        {order.delivery_location && (
                          <p>
                            <span className="font-semibold text-slate-500">
                              To:
                            </span>{" "}
                            {order.delivery_location}
                          </p>
                        )}

                        {order.special_instructions && (
                          <p className="whitespace-pre-wrap">
                            <span className="font-semibold text-slate-500">
                              Instructions:
                            </span>{" "}
                            {order.special_instructions}
                          </p>
                        )}

                        <p>
                          <span className="font-semibold text-slate-500">
                            Items:
                          </span>{" "}
                          {orderItems.length} item
                          {orderItems.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      <p className="mt-2 text-[10px] text-slate-400">
                        {selected ? "Tap to hide details" : "Tap to view full order"}
                      </p>
                    </button>

                    {selected && (
                      <div className="border-t border-slate-200 bg-white px-3 pb-3 pt-3">
                        <div className="space-y-3">
                          <div className="rounded-lg bg-slate-50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Student Contact
                            </p>

                            <p className="mt-1 text-sm font-semibold">
                              {order.student_name}
                            </p>

                            {order.phone !== "—" ? (
                              <a
                                href={`tel:${order.phone}`}
                                className="mt-1 block text-sm font-semibold text-violet-700 underline"
                              >
                                {order.phone}
                              </a>
                            ) : (
                              <p className="mt-1 text-xs text-slate-500">
                                Phone number unavailable
                              </p>
                            )}

                            {order.department && (
                              <p className="mt-1 text-xs text-slate-500">
                                {order.department}
                              </p>
                            )}
                          </div>

                          {order.delivery_location && (
                            <div className="rounded-lg bg-emerald-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                Delivery Location
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {order.delivery_location}
                              </p>
                            </div>
                          )}

                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Complete Order Items
                            </p>

                            {orderItems.length === 0 ? (
                              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                                No order items are available. Check order_items permissions if items should appear here.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {orderItems.map((item) => (
                                  <div
                                    key={String(item.id)}
                                    className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium">
                                        {item.item_name}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        Qty: {item.quantity} × {formatCurrency(item.price)}
                                      </p>
                                    </div>

                                    <p className="shrink-0 text-sm font-semibold">
                                      {formatCurrency(item.subtotal)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="rounded-lg bg-slate-50 p-3">
                            <div className="flex justify-between gap-3 text-xs text-slate-500">
                              <span>Subtotal</span>
                              <span>
                                {formatCurrency(
                                  order.total_amount - order.delivery_charge,
                                )}
                              </span>
                            </div>

                            <div className="mt-1 flex justify-between gap-3 text-xs text-slate-500">
                              <span>Delivery charge</span>
                              <span>
                                {formatCurrency(order.delivery_charge)}
                              </span>
                            </div>

                            <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 text-sm font-bold">
                              <span>Total</span>
                              <span>{formatCurrency(order.total_amount)}</span>
                            </div>
                          </div>

                          <div className="space-y-1 text-xs text-slate-500">
                            <p>Order placed: {formatDateTime(order.created_at)}</p>
                            {order.ready_at && (
                              <p>Ready: {formatDateTime(order.ready_at)}</p>
                            )}
                            {order.out_for_delivery_at && (
                              <p>
                                Out for delivery:{" "}
                                {formatDateTime(order.out_for_delivery_at)}
                              </p>
                            )}
                            {order.delivered_at && (
                              <p>
                                Delivered: {formatDateTime(order.delivered_at)}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {profile?.role === "driver" &&
                            order.status === "pending" &&
                            order.driver_id == null && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => void confirmOrder(order)}
                                className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                {isUpdating ? "Please wait..." : "Confirm Order"}
                              </button>
                            )}

                          {profile?.role === "driver" &&
                            (order.status === "confirmed" ||
                              order.status === "ready" ||
                              order.status === "out_for_delivery") &&
                            assigned && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() =>
                                  void updateStatus(order.id, "delivered")
                                }
                                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                {isUpdating ? "Please wait..." : "Order Delivered"}
                              </button>
                            )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <button
            type="button"
            onClick={() => setShowCompleted((value) => !value)}
            aria-expanded={showCompleted}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm"
          >
            <span className="text-sm font-bold">
              Completed Deliveries ({completedOrders.length})
            </span>

            <span className="text-xs font-medium text-slate-500">
              {showCompleted ? "Hide" : "Show"}
            </span>
          </button>

          {showCompleted && (
            <div className="mt-3 space-y-2">
              {completedOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
                  No completed deliveries yet.
                </div>
              ) : (
                completedOrders.map((order) => {
                  const canteenName =
                    order.canteen_id != null
                      ? canteenMap[String(order.canteen_id)]?.name ??
                        "Unknown canteen"
                      : "Unknown canteen";

                  return (
                    <article
                      key={String(order.id)}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">
                            #{order.order_number}
                          </p>
                          <span className="mt-1 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                            {STATUS_LABELS[order.status] ?? "Delivered"}
                          </span>
                        </div>

                        <p className="text-sm font-bold">
                          {formatCurrency(order.total_amount)}
                        </p>
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <p>
                          {order.student_name} · {canteenName}
                        </p>
                        {order.delivery_location && (
                          <p>To: {order.delivery_location}</p>
                        )}
                        <p>Order date: {formatDateTime(order.created_at)}</p>
                        {order.delivered_at && (
                          <p>Delivered: {formatDateTime(order.delivered_at)}</p>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
