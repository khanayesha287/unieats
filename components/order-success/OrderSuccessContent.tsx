"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Home, MapPin, UtensilsCrossed } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { formatOrderTime } from "@/lib/cart-utils";
import OrderTracking from "@/components/ui/OrderTracking";
import { TRACKING_STATUSES, type TrackedOrder, type TrackingStatus } from "@/lib/order-tracking";
import type { Order } from "@/lib/types";

function createInitialTrackingOrders(savedOrder: Order): TrackedOrder[] {
  return savedOrder.canteenOrders.map((group, index) => ({
    id: String(group.orderId ?? `${savedOrder.orderNumber}-${group.canteenSlug}-${index}`),
    orderNumber: group.orderNumber ?? savedOrder.orderNumber,
    studentName: savedOrder.studentName,
    orderType: savedOrder.orderType,
    deliveryLocation: savedOrder.deliveryLocation ?? null,
    canteenName: group.canteenName,
    // Checkout creates every order as pending. This initial view is replaced
    // by the verified Supabase status as soon as the tracking request returns.
    status: "pending",
    totalAmount: group.subtotal,
    deliveryCharge: 0,
    createdAt: savedOrder.timestamp,
    items: group.items.map((item) => ({
      id: item.id,
      itemName: item.name,
      quantity: item.quantity,
      price: Number(item.price),
      subtotal: Number(item.price * item.quantity),
    })),
  }));
}

export default function OrderSuccessContent() {
  const [order, setOrder] = useState<Order | null>(null);
  const [trackedOrders, setTrackedOrders] = useState<TrackedOrder[]>([]);

  useEffect(() => {
    let mounted = true;
    try {
      const stored = sessionStorage.getItem("unieats-last-order");
      if (!stored) return;
      const saved = JSON.parse(stored) as Order;
      const initialLoad = window.setTimeout(() => setOrder(saved), 0);
      const token = saved.trackingToken;
      const orderIds = saved.canteenOrders
        .map((group) => group.orderId)
        .filter((id): id is string | number => id !== undefined && id !== null)
        .map(String);
      if (!token || orderIds.length === 0) {
        return () => {
          mounted = false;
          window.clearTimeout(initialLoad);
        };
      }

      // Real-time status patches pushed by /api/orders/track/stream (Supabase
      // Realtime relayed server-side, since guest browsers have no RLS read
      // access). Patches apply the moment canteen/driver staff act; the
      // polling loop below stays as a reconciling fallback.
      const statusPatches = new Map<string, TrackingStatus>();
      const applyPatches = (list: TrackedOrder[]) =>
        statusPatches.size === 0
          ? list
          : list.map((tracked) => {
              const patched = statusPatches.get(tracked.id);
              return patched && patched !== tracked.status
                ? { ...tracked, status: patched }
                : tracked;
            });

      // Merge fresh server results into the tracked list by id. A degraded or
      // partial response (e.g. one per-canteen order deleted by an admin)
      // must never erase the last-known status of the remaining boxes.
      const mergeTracked = (fresh: TrackedOrder[]) => {
        setTrackedOrders((previous) => {
          if (previous.length === 0) return applyPatches(fresh);
          const freshIds = new Set(fresh.map((order) => order.id));
          return [
            ...applyPatches(fresh),
            ...previous.filter((order) => !freshIds.has(order.id)),
          ];
        });
      };

      const load = async () => {
        try {
          const response = await fetch("/api/orders/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, orderIds }),
            cache: "no-store",
          });
          if (!response.ok || !mounted) return;
          const payload = (await response.json()) as { orders?: TrackedOrder[] };
          if (mounted && Array.isArray(payload.orders)) mergeTracked(payload.orders);
        } catch {
          // Transient network failures keep the last-known statuses.
        }
      };

      const refreshWhenVisible = () => {
        if (mounted && document.visibilityState === "visible") void load();
      };

      void load();
      const interval = window.setInterval(load, 5_000);
      // Refresh immediately when the student returns to the tab or comes
      // back online so statuses feel live instead of waiting for the next tick.
      document.addEventListener("visibilitychange", refreshWhenVisible);
      window.addEventListener("online", refreshWhenVisible);

      // Real-time stream: when canteen or driver staff change an order status,
      // the server broadcasts the change to this student's stream and local
      // state updates instantly — no browser refresh, no polling delay.
      // Reconnects automatically with exponential backoff.
      const streamController = new AbortController();
      let reconnectTimer: number | undefined;
      let retryDelayMs = 1_000;

      const handleStreamFrame = (frame: string) => {
        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) return;
        try {
          const event = JSON.parse(dataLine.slice("data: ".length)) as {
            type?: string;
            id?: unknown;
            status?: unknown;
            orders?: Array<{ id?: unknown; status?: unknown }>;
          };
          if (event.type === "ready" && Array.isArray(event.orders)) {
            // Seed frame: apply current server statuses instantly so the
            // boxes never render a stale state while the first poll runs.
            for (const seeded of event.orders) {
              if (
                seeded?.id !== undefined &&
                typeof seeded.status === "string" &&
                TRACKING_STATUSES.includes(seeded.status as TrackingStatus)
              ) {
                statusPatches.set(String(seeded.id), seeded.status as TrackingStatus);
              }
            }
            setTrackedOrders((previous) =>
              previous.length > 0 ? applyPatches(previous) : previous,
            );
            return;
          }
          if (
            event.type === "status" &&
            event.id !== undefined &&
            typeof event.status === "string" &&
            TRACKING_STATUSES.includes(event.status as TrackingStatus)
          ) {
            const id = String(event.id);
            statusPatches.set(id, event.status as TrackingStatus);
            setTrackedOrders((previous) =>
              previous.length > 0 ? applyPatches(previous) : previous,
            );
          }
          // "deleted" events intentionally keep the last-known box, matching
          // the merge behavior of the polling fallback.
        } catch {
          // Malformed frame: skip it; subsequent frames still apply.
        }
      };

      const connectStream = async () => {
        while (mounted && !streamController.signal.aborted) {
          try {
            const response = await fetch("/api/orders/track/stream", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, orderIds }),
              cache: "no-store",
              signal: streamController.signal,
            });
            if (!response.ok || !response.body) {
              throw new Error(`stream ${response.status}`);
            }
            retryDelayMs = 1_000;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for (;;) {
              const { done, value } = await reader.read();
              if (done || !mounted) break;
              buffer += decoder.decode(value, { stream: true });
              const frames = buffer.split("\n\n");
              buffer = frames.pop() ?? "";
              for (const frame of frames) handleStreamFrame(frame);
            }
          } catch {
            // Stream dropped; reconnect below with exponential backoff.
          }
          if (!mounted || streamController.signal.aborted) return;
          await new Promise<void>((resolve) => {
            reconnectTimer = window.setTimeout(resolve, retryDelayMs);
          });
          retryDelayMs = Math.min(retryDelayMs * 2, 15_000);
        }
      };

      void connectStream();

      return () => {
        mounted = false;
        window.clearTimeout(initialLoad);
        window.clearInterval(interval);
        window.clearTimeout(reconnectTimer);
        streamController.abort();
        document.removeEventListener("visibilitychange", refreshWhenVisible);
        window.removeEventListener("online", refreshWhenVisible);
      };
    } catch {
      window.setTimeout(() => setOrder(null), 0);
    }
    return () => { mounted = false; };
  }, []);

  const orderNumber = order?.orderNumber ?? "—";
  const prepTime = "15–20 min";
  const displayTrackedOrders = trackedOrders.length > 0
    ? trackedOrders
    : order
      ? createInitialTrackingOrders(order)
      : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="rounded-3xl border border-white/60 bg-white/90 p-8 text-center shadow-2xl shadow-[#6C2BD9]/10 backdrop-blur-sm sm:p-12">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2
            className="h-14 w-14 animate-fade-up text-green-600"
            aria-hidden
          />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Order Confirmed
        </h1>

        <div className="mt-8 space-y-3 rounded-2xl bg-[#F3EDFF] p-6 text-left">
          <p className="text-sm text-gray-600">Order Reference</p>
          <p className="text-xl font-bold text-[#6C2BD9]">#{orderNumber}</p>
          {order && (
            <p className="text-sm text-gray-600">
              Time: {formatOrderTime(order.timestamp)}
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <Clock className="h-4 w-4 text-[#6C2BD9]" aria-hidden />
            Estimated preparation time: <strong>{prepTime}</strong>
          </div>
        </div>

        {order && (
          <div className="mt-6 space-y-4 text-left">
            <div className="rounded-2xl border border-[#6C2BD9]/10 bg-white p-5 text-sm">
              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span className="font-semibold">{formatPrice(order.deliveryFee)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between text-base font-bold text-gray-900">
                <span>Grand Total</span>
                <span className="text-[#6C2BD9]">{formatPrice(order.grandTotal)}</span>
              </div>
            </div>

            {/* Delivery / Pickup Information */}
            <div className="rounded-2xl border border-[#6C2BD9]/10 bg-white p-5 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#6C2BD9]" aria-hidden />
                <span className="font-bold text-gray-900">
                  {order.orderType === "delivery" ? "Campus Delivery" : "Pickup"}
                </span>
              </div>
              {order.orderType === "delivery" ? (
                <p className="mt-2 text-gray-600">
                  Delivering to: <span className="font-medium text-gray-900">{order.deliveryLocation}</span>
                </p>
              ) : (
                <p className="mt-2 text-gray-600">
                  Collect from the canteen counter
                </p>
              )}
            </div>
          </div>
        )}

        {displayTrackedOrders.length > 0 && (
          <div className="mt-6 space-y-4 text-left">
            {displayTrackedOrders.map((tracked) => (
              <OrderTracking key={tracked.id} order={tracked} />
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            <Home className="h-4 w-4" aria-hidden />
            Back Home
          </Link>
          <Link
            href="/canteens"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-[#6C2BD9] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F3EDFF]"
          >
            <UtensilsCrossed className="h-4 w-4" aria-hidden />
            Browse More Food
          </Link>
        </div>
      </div>
    </div>
  );
}
