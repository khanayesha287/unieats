"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, buildStatusUpdatePayload, deleteOrderFromSupabase } from "@/lib/supabase";
import { supabaseAuth } from "@/lib/supabase-auth";
import type { OrderStatus } from "@/lib/types";
import { Trash2, MoreVertical, X } from "lucide-react";
import AIOperationsPanel from "./AIOperationsPanel";
import StaffManagement from "./StaffManagement";

interface AdminCanteen {
  id: number | string;
  name: string;
}

interface AdminDriver {
  id: number | string;
  name: string;
}

interface AdminOrderItem {
  id: number | string;
  order_id: number | string;
  menu_item_id?: number | string | null;
  item_name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface AdminOrder {
  id: number | string;
  order_number: string;
  student_name: string;
  phone: string;
  department?: string | null;
  registration_number?: string | null;
  order_type: "pickup" | "delivery";
  delivery_location?: string | null;
  canteen_id?: number | string | null;
  driver_id?: number | string | null;
  status: OrderStatus;
  total_amount: number;
  delivery_charge: number;
  discount?: number | null;
  payment_method?: string | null;
  special_instructions?: string | null;
  created_at?: string | null;
}

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
];

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-sky-100 text-sky-800",
  preparing: "bg-violet-100 text-violet-800",
  ready: "bg-emerald-100 text-emerald-800",
  out_for_delivery: "bg-cyan-100 text-cyan-800",
  delivered: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeStatus(value: string | null | undefined): OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : "pending";
}

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

function coerceCanteen(input: unknown): AdminCanteen | null {
  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const rawId =
    record.id ?? record.canteen_id ?? record.canteenId ?? record.uuid ?? record._id ?? null;
  const id: string | number =
    typeof rawId === "string" || typeof rawId === "number"
      ? rawId
      : `canteen-${Math.random().toString(36).slice(2, 9)}`;
  const name =
    pickString(record, ["name", "canteen_name", "title", "label"]) ??
    `Canteen ${String(id)}`;

  return {
    id,
    name,
  };
}

function coerceDriver(input: unknown): AdminDriver | null {
  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const rawId = record.id ?? record.driver_id ?? record.driverId ?? record.uuid ?? record._id ?? null;
  const id: string | number =
    typeof rawId === "string" || typeof rawId === "number"
      ? rawId
      : `driver-${Math.random().toString(36).slice(2, 9)}`;
  const name =
    pickString(record, ["name", "full_name", "driver_name", "driverName", "username"]) ??
    `Driver ${String(id)}`;

  return {
    id,
    name,
  };
}

async function fetchDashboardData() {
  if (!supabase) {
    return {
      canteens: [] as AdminCanteen[],
      drivers: [] as AdminDriver[],
      orders: [] as AdminOrder[],
      orderItems: [] as AdminOrderItem[],
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    };
  }

  const [ordersResult, canteensResult, driversResult, itemsResult] = await Promise.all([
    supabase.from("orders").select("*"),
    supabase.from("canteens").select("*"),
    supabase.from("driver").select("*"),
    supabase.from("order_items").select("*"),
  ]);

  const logTableError = (tableName: string, error: { message?: string } | null) => {
    if (!error) return;
    if (isMissingTableError(error)) {
      console.warn(`[UniEats Admin] ${tableName} table is not available in this Supabase schema; dashboard continues without it.`);
      return;
    }
    console.error(`[UniEats Admin] Unable to fetch ${tableName}:`, error.message);
  };

  logTableError("orders", ordersResult.error);
  logTableError("canteens", canteensResult.error);
  logTableError("driver", driversResult.error);
  logTableError("order_items", itemsResult.error);

  const canteens = Array.isArray(canteensResult.data)
    ? canteensResult.data
        .map((row) => coerceCanteen(row))
        .filter((row): row is AdminCanteen => row !== null)
    : [];
  const drivers = Array.isArray(driversResult.data)
    ? driversResult.data
        .map((row) => coerceDriver(row))
        .filter((row): row is AdminDriver => row !== null)
    : [];
  const orderItems = Array.isArray(itemsResult.data)
    ? (itemsResult.data as AdminOrderItem[])
    : [];
  const orders = (Array.isArray(ordersResult.data) ? ordersResult.data : [])
    .map((order) => ({
      ...order,
      status: normalizeStatus(
        typeof order.status === "string" ? order.status : "pending",
      ),
    }))
    .sort((first, second) => {
      const firstValue = first.created_at ? new Date(first.created_at).getTime() : 0;
      const secondValue = second.created_at ? new Date(second.created_at).getTime() : 0;
      return secondValue - firstValue;
    }) as AdminOrder[];

  const hasRealError =
    Boolean(ordersResult.error && !isMissingTableError(ordersResult.error)) ||
    Boolean(canteensResult.error && !isMissingTableError(canteensResult.error)) ||
    Boolean(driversResult.error && !isMissingTableError(driversResult.error)) ||
    Boolean(itemsResult.error && !isMissingTableError(itemsResult.error));

  return {
    canteens,
    drivers,
    orders,
    orderItems,
    error: hasRealError
      ? "One or more Supabase queries failed. Check the browser console for details."
      : null,
  };
}

export default function AdminDashboardContent() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [canteens, setCanteens] = useState<AdminCanteen[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [orderItems, setOrderItems] = useState<AdminOrderItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "ai" | "staff" | "portals">("overview");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [deleteTarget, setDeleteTarget] = useState<AdminOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState<string | number | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    const data = await fetchDashboardData();
    setCanteens(data.canteens);
    setDrivers(data.drivers);
    setOrders(data.orders);
    setOrderItems(data.orderItems);
    setError(data.error);
    if (!silent) setIsLoading(false);
    if (!selectedOrderId && data.orders.length > 0) {
      setSelectedOrderId(data.orders[0].id);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Polling fallback every 15 s — silent refresh (no loading flash)
  useEffect(() => {
    const interval = setInterval(() => {
      void loadData(true);
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const client = supabaseAuth;
    if (!client) return;

    const channel = client
      .channel("admin-orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => {
          void loadData(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => {
          void loadData(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        () => {
          void loadData(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        () => {
          void loadData(true);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null,
    [orders, selectedOrderId],
  );

  const canteenMap = useMemo(
    () =>
      Object.fromEntries(
        canteens.map((canteen) => [String(canteen.id), canteen]),
      ) as Record<string, AdminCanteen>,
    [canteens],
  );

  const itemsByOrderId = useMemo(() => {
    return orderItems.reduce<Record<string, AdminOrderItem[]>>((accumulator, item) => {
      const key = String(item.order_id);
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(item);
      return accumulator;
    }, {});
  }, [orderItems]);

  const counts = useMemo(
    () => ({
      total: orders.length,
      pending: orders.filter((order) => order.status === "pending").length,
      confirmed: orders.filter((order) => order.status === "confirmed").length,
      preparing: orders.filter((order) => order.status === "preparing").length,
      ready: orders.filter((order) => order.status === "ready").length,
      outForDelivery: orders.filter((order) => order.status === "out_for_delivery").length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      completed: orders.filter((order) => order.status === "completed").length,
      cancelled: orders.filter((order) => order.status === "cancelled").length,
    }),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((order) => order.status === statusFilter);
  }, [orders, statusFilter]);

  const handleDeleteOrder = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteOrderFromSupabase(deleteTarget.id);
      setOrders((current) => current.filter((o) => String(o.id) !== String(deleteTarget.id)));
      if (String(selectedOrderId) === String(deleteTarget.id)) {
        setSelectedOrderId(null);
      }
      setError(null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error("[UniEats Admin] Delete order failed:", errMsg);
      setError("Failed to delete order. Check the browser console for details.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const updateOrderStatus = async (orderId: number | string, nextStatus: OrderStatus) => {
    if (!supabase) return;

    setIsUpdating(true);

    // Build payload with status timestamp (same as canteen/driver portals)
    const order = orders.find((o) => String(o.id) === String(orderId));
    const payload = buildStatusUpdatePayload(nextStatus, order as unknown as Record<string, unknown>);

    const { error: updateError } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", orderId);

    setIsUpdating(false);

    if (updateError) {
      console.error("[UniEats Admin] Status update failed:", updateError.message);
      setError("Failed to update the order status. Check the browser console for details.");
      return;
    }

    setOrders((current) =>
      current.map((o) =>
        String(o.id) === String(orderId) ? { ...o, status: nextStatus } : o,
      ),
    );
  };

  const updateOrderDriver = async (orderId: number | string, nextDriverId: string) => {
    if (!supabase) return;

    const normalizedDriverId = nextDriverId === "" ? null : nextDriverId;
    const { error: updateError } = await supabase
      .from("orders")
      .update({ driver_id: normalizedDriverId })
      .eq("id", orderId);

    if (updateError) {
      console.error("[UniEats Admin] Driver assignment failed:", updateError.message);
      setError("Failed to assign the driver. Check the browser console for details.");
      return;
    }

    setOrders((current) =>
      current.map((order) =>
        String(order.id) === String(orderId)
          ? { ...order, driver_id: normalizedDriverId }
          : order,
      ),
    );
  };

  const renderSummaryCard = (label: string, value: number, accent: string) => (
    <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${accent}`}>
        {label}
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );

  const selectedItems = selectedOrder ? itemsByOrderId[String(selectedOrder.id)] ?? [] : [];
  const selectedCanteenName =
    selectedOrder && selectedOrder.canteen_id !== null && selectedOrder.canteen_id !== undefined
      ? canteenMap[String(selectedOrder.canteen_id)]?.name ?? "Unknown canteen"
      : "Unknown canteen";

  return (
    <div className="min-h-screen bg-[#f6f4ff] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
              UniEats Admin
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Operations Dashboard
            </h1>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Tab navigation */}
        <div className="mb-6 flex flex-wrap gap-2">
          {([
            { key: "overview" as const, label: "Overview" },
            { key: "orders" as const, label: "Orders" },
            { key: "ai" as const, label: "AI Operations" },
            { key: "staff" as const, label: "Staff Management" },
            { key: "portals" as const, label: "Portals" },
          ]).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? "bg-violet-600 text-white shadow-lg"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <>
            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {renderSummaryCard("Pending", counts.pending, "bg-amber-100 text-amber-700")}
              {renderSummaryCard("Preparing", counts.preparing, "bg-violet-100 text-violet-700")}
              {renderSummaryCard("Ready", counts.ready, "bg-emerald-100 text-emerald-700")}
              {renderSummaryCard("Out for delivery", counts.outForDelivery, "bg-cyan-100 text-cyan-700")}
              {renderSummaryCard("Delivered", counts.delivered, "bg-blue-100 text-blue-700")}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Link
                href="/canteen"
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Canteen Portal</p>
                <p className="mt-2 text-sm text-slate-600">View and manage canteen orders, update statuses, and track the kitchen queue.</p>
                <p className="mt-3 text-sm font-semibold text-violet-600 group-hover:underline">Open Canteen Portal \u2192</p>
              </Link>
              <Link
                href="/driver"
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Driver Portal</p>
                <p className="mt-2 text-sm text-slate-600">Monitor deliveries, view driver status, and track active delivery orders.</p>
                <p className="mt-3 text-sm font-semibold text-violet-600 group-hover:underline">Open Driver Portal \u2192</p>
              </Link>
              <button
                type="button"
                onClick={() => setActiveTab("staff")}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Staff Management</p>
                <p className="mt-2 text-sm text-slate-600">Create staff accounts, manage roles, assign canteens, and control access.</p>
                <p className="mt-3 text-sm font-semibold text-violet-600 group-hover:underline">Manage Staff \u2192</p>
              </button>
            </div>
          </>
        )}

        {/* Orders tab */}
        {activeTab === "orders" && (
        <>
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {renderSummaryCard("Pending", counts.pending, "bg-amber-100 text-amber-700")}
          {renderSummaryCard("Preparing", counts.preparing, "bg-violet-100 text-violet-700")}
          {renderSummaryCard("Ready", counts.ready, "bg-emerald-100 text-emerald-700")}
          {renderSummaryCard("Out for delivery", counts.outForDelivery, "bg-cyan-100 text-cyan-700")}
          {renderSummaryCard("Delivered", counts.delivered, "bg-blue-100 text-blue-700")}
        </div>

        {/* Status filter tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {([
            { value: "all" as const, label: "All" },
            { value: "pending" as const, label: "Pending" },
            { value: "confirmed" as const, label: "Confirmed" },
            { value: "preparing" as const, label: "Preparing" },
            { value: "ready" as const, label: "Ready" },
            { value: "out_for_delivery" as const, label: "Out for Delivery" },
            { value: "delivered" as const, label: "Delivered" },
            { value: "cancelled" as const, label: "Cancelled" },
          ]).map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-violet-600 text-white shadow-md"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {filter.label}
              {filter.value === "all"
                ? ` (${orders.length})`
                : ` (${orders.filter((o) => o.status === filter.value).length})`}
            </button>
          ))}
        </div>
        
        <div className="grid gap-6 xl:grid-cols-[1.7fr_0.9fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Recent Orders</h2>
            </div>
        
            {isLoading ? (
              <div className="p-6 text-sm text-slate-600">Loading orders…</div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                {statusFilter === "all" ? "No orders yet." : `No ${statusFilter.replace(/_/g, " ")} orders.`}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Order ID</th>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Canteen</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Payment</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredOrders.map((order) => {
                      const canteen = canteenMap[String(order.canteen_id ?? "")];
                      const isOpen = deleteMenuOpen === order.id;
                      return (
                        <tr
                          key={String(order.id)}
                          className={`cursor-pointer transition hover:bg-violet-50 ${
                            selectedOrder?.id === order.id ? "bg-violet-50" : "bg-white"
                          }`}
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {order.order_number}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{order.student_name}</div>
                            <div className="text-xs text-slate-500">{order.registration_number || order.department || "\u2014"}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {canteen?.name ?? "Unknown canteen"}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {formatCurrency(Number(order.total_amount ?? 0))}
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-600">
                            {order.order_type === "delivery" ? "Delivery" : "Pickup"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {order.payment_method === "cod"
                              ? "COD"
                              : order.payment_method === "online"
                                ? "Online"
                                : "\u2014"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[order.status]}`}>
                              {order.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {order.created_at ? formatDate(order.created_at) : "\u2014"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteMenuOpen(isOpen ? null : order.id);
                                }}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                aria-label="Order actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                              {isOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={(e) => { e.stopPropagation(); setDeleteMenuOpen(null); }}
                                  />
                                  <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteMenuOpen(null);
                                        setDeleteTarget(order);
                                      }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Delete Order
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            {selectedOrder ? (
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Order detail
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">
                      #{selectedOrder.order_number}
                    </h2>
                  </div>
                </div>

                <div className="space-y-4 text-sm text-slate-700">
                  <div>
                    <p className="text-slate-500">Student</p>
                    <p className="font-semibold text-slate-900">{selectedOrder.student_name}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Phone</p>
                    <p className="font-semibold text-slate-900">{selectedOrder.phone}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Department</p>
                    <p className="font-semibold text-slate-900">{selectedOrder.department ?? "\u2014"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Registration No.</p>
                    <p className="font-semibold text-slate-900">{selectedOrder.registration_number ?? "\u2014"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Payment Method</p>
                    <p className="font-semibold text-slate-900">
                      {selectedOrder.payment_method === "cod"
                        ? "Cash on Delivery"
                        : selectedOrder.payment_method === "online"
                          ? "Online Payment"
                          : selectedOrder.payment_method ?? "\u2014"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Canteen</p>
                    <p className="font-semibold text-slate-900">{selectedCanteenName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Type</p>
                    <p className="font-semibold capitalize text-slate-900">
                      {selectedOrder.order_type}
                    </p>
                  </div>
                  {selectedOrder.delivery_location && (
                    <div>
                      <p className="text-slate-500">Delivery location</p>
                      <p className="font-semibold text-slate-900">{selectedOrder.delivery_location}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-500">Order time</p>
                    <p className="font-semibold text-slate-900">{formatDate(selectedOrder.created_at)}</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Status
                    </label>
                    <select
                      value={selectedOrder.status}
                      onChange={(event) =>
                        void updateOrderStatus(selectedOrder.id, event.target.value as OrderStatus)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-violet-500 focus:outline-none"
                      disabled={isUpdating}
                    >
                      {ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedOrder.order_type === "delivery" && drivers.length > 0 && (
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Driver
                      </label>
                      <select
                        value={selectedOrder.driver_id ? String(selectedOrder.driver_id) : ""}
                        onChange={(event) =>
                          void updateOrderDriver(selectedOrder.id, event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 focus:border-violet-500 focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {drivers.map((driver) => (
                          <option key={String(driver.id)} value={String(driver.id)}>
                            {driver.name ?? `Driver ${driver.id}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                      <span>Delivery charge</span>
                      <span>{formatCurrency(Number(selectedOrder.delivery_charge ?? 0))}</span>
                    </div>
                    {selectedOrder.discount !== null && selectedOrder.discount !== undefined && Number(selectedOrder.discount) > 0 && (
                      <div className="mb-2 flex items-center justify-between text-sm text-emerald-600">
                        <span>Discount</span>
                        <span>-{formatCurrency(Number(selectedOrder.discount))}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-base font-bold text-slate-900">
                      <span>Total</span>
                      <span>{formatCurrency(Number(selectedOrder.total_amount ?? 0))}</span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Ordered items
                    </p>
                    <div className="space-y-2">
                      {(selectedItems.length > 0 ? selectedItems : []).map((item) => (
                        <div key={String(item.id)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">{item.item_name}</span>
                            <span className="text-xs text-slate-500">Qty: {item.quantity}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                            <span>{formatCurrency(Number(item.price ?? 0))} each</span>
                            <span>{formatCurrency(Number(item.subtotal ?? 0))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 text-sm text-slate-600">Select an order to view details.</div>
            )}
          </aside>
        </div>
        </>
        )}

        {/* AI Operations tab */}
        {activeTab === "ai" && (
          <AIOperationsPanel orders={orders} canteens={canteens} />
        )}

        {/* Staff Management tab */}
        {activeTab === "staff" && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <StaffManagement />
          </div>
        )}

        {/* Portals tab */}
        {activeTab === "portals" && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Canteen Portal</h3>
              <p className="mt-2 text-sm text-slate-600">Access the full canteen operations portal to manage orders across all canteens.</p>
              <Link
                href="/canteen"
                className="mt-4 inline-flex rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                Open Canteen Portal
              </Link>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Driver Portal</h3>
              <p className="mt-2 text-sm text-slate-600">Access the driver portal to monitor deliveries and driver activity.</p>
              <Link
                href="/driver"
                className="mt-4 inline-flex rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                Open Driver Portal
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Delete this order?</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Order <span className="font-semibold">#{deleteTarget.order_number}</span> from {deleteTarget.student_name}.
                  This action cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteOrder()}
                disabled={isDeleting}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
