"use client";

import { Check, Package, Truck } from "lucide-react";
import type { TrackedOrder } from "@/lib/order-tracking";

const PICKUP_LABELS = ["Order Confirmed", "Ready for Pickup", "Order Picked Up"] as const;
const DELIVERY_LABELS = ["Order Confirmed", "Out for Delivery", "Delivered"] as const;

const PICKUP_DESCRIPTIONS = [
  "Your order has been confirmed",
  "Your order is ready for pickup",
  "Your order has been picked up",
] as const;

const DELIVERY_DESCRIPTIONS = [
  "Your order has been confirmed",
  "Your order is on the way",
  "Your order has been delivered",
] as const;

/* Map every backend status to the customer-visible step index (0, 1, or 2).
   Internal statuses like "preparing" collapse into the first visible phase. */
const PICKUP_STATUS_INDEX: Record<string, number> = {
  pending: 0,
  confirmed: 0,
  accepted: 0,
  preparing: 0,
  ready: 1,
  delivered: 2,
  completed: 2,
  cancelled: -1,
};

const DELIVERY_STATUS_INDEX: Record<string, number> = {
  pending: 0,
  confirmed: 0,
  accepted: 0,
  preparing: 0,
  ready: 0,
  out_for_delivery: 1,
  delivered: 2,
  completed: 2,
  cancelled: -1,
};

export default function OrderTracking({ order }: { order: TrackedOrder }) {
  const isPickup = order.orderType === "pickup";
  const labels = isPickup ? PICKUP_LABELS : DELIVERY_LABELS;
  const descriptions = isPickup ? PICKUP_DESCRIPTIONS : DELIVERY_DESCRIPTIONS;
  const statusMap = isPickup ? PICKUP_STATUS_INDEX : DELIVERY_STATUS_INDEX;
  const currentIndex = statusMap[order.status] ?? 0;
  const isCancelled = order.status === "cancelled";

  return (
    <section
      className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm"
      aria-label="Order tracking"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">
        Order Tracking
      </p>
      <h3 className="mt-1 text-sm font-bold text-gray-900">
        #{order.orderNumber} &middot; {order.canteenName}
      </h3>

      <div className="mt-5 space-y-0">
        {labels.map((label, index) => {
          const completed = !isCancelled && index <= currentIndex;
          const current = !isCancelled && index === currentIndex;
          const isLast = index === labels.length - 1;
          const StepIcon = isPickup
            ? index === 0 ? Package : index === 1 ? Package : Check
            : index === 0 ? Package : index === 1 ? Truck : Check;

          return (
            <div key={label} className="relative flex gap-4">
              {/* Vertical connector line */}
              {!isLast && (
                <span
                  className={`absolute left-[15px] top-[32px] h-[calc(100%-8px)] w-0.5 ${
                    completed ? "bg-violet-500" : "bg-gray-200"
                  }`}
                  aria-hidden
                />
              )}
              {/* Circular step indicator */}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  completed
                    ? "border-violet-600 bg-violet-600 text-white"
                    : current
                      ? "border-violet-600 bg-white text-violet-600"
                      : "border-gray-300 bg-white text-gray-300"
                } ${current ? "ring-4 ring-violet-100" : ""}`}
              >
                {completed ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <StepIcon className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              {/* Step text */}
              <div className="pb-8">
                <p
                  className={`text-sm leading-tight ${
                    current
                      ? "font-bold text-violet-700"
                      : completed
                        ? "font-medium text-gray-700"
                        : "text-gray-400"
                  }`}
                >
                  {label}
                </p>
                {current && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {descriptions[index]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isCancelled && (
        <p className="mt-1 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          Cancelled
        </p>
      )}
    </section>
  );
}
