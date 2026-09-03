"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Home, MapPin, UtensilsCrossed } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { formatOrderTime } from "@/lib/cart-utils";
import OrderTracking from "@/components/ui/OrderTracking";
import type { TrackedOrder } from "@/lib/order-tracking";
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

      const load = async () => {
        const response = await fetch("/api/orders/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, orderIds }),
          cache: "no-store",
        });
        if (!response.ok || !mounted) return;
        const payload = (await response.json()) as { orders?: TrackedOrder[] };
        if (mounted && Array.isArray(payload.orders)) setTrackedOrders(payload.orders);
      };
      void load();
      const interval = window.setInterval(load, 10_000);
      return () => {
        mounted = false;
        window.clearTimeout(initialLoad);
        window.clearInterval(interval);
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
