"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Home, UtensilsCrossed } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { formatOrderTime } from "@/lib/cart-utils";
import type { Order } from "@/lib/types";

export default function OrderSuccessContent() {
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("unieats-last-order");
      if (stored) {
        setOrder(JSON.parse(stored) as Order);
      }
    } catch {
      setOrder(null);
    }
  }, []);

  const orderNumber = order?.orderNumber ?? "UE-PENDING-001";
  const prepTime = "15–20 min";

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
          Order Placed Successfully
        </h1>
        <p className="mt-4 text-gray-600">
          Your order has been sent via WhatsApp. We&apos;ll confirm it shortly.
        </p>

        <div className="mt-8 space-y-3 rounded-2xl bg-[#F3EDFF] p-6 text-left">
          <p className="text-sm text-gray-600">Order Number</p>
          <p className="text-xl font-bold text-[#6C2BD9]">{orderNumber}</p>
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
              <p className="font-semibold text-gray-900">
                {order.orderType === "pickup" ? "Pickup" : "Delivery"}
              </p>
              {order.deliveryLocation && (
                <p className="mt-1 text-gray-600">{order.deliveryLocation}</p>
              )}
            </div>

            {order.canteenOrders.map((group) => (
              <div
                key={group.canteenSlug}
                className="rounded-2xl border border-[#6C2BD9]/10 bg-white p-5 text-left text-sm"
              >
                <h2 className="font-bold text-[#6C2BD9]">{group.canteenName}</h2>
                <dl className="mt-3 space-y-1 text-gray-600">
                  <div>
                    <dt className="font-medium text-gray-900">Student</dt>
                    <dd>{order.studentName}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-900">Registration</dt>
                    <dd>{order.registrationNumber}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-900">Phone</dt>
                    <dd>{order.phone}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-900">Items</dt>
                    <dd>
                      {group.items.map((item) => (
                        <span key={item.id} className="block">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-900">Total</dt>
                    <dd className="font-semibold text-[#6C2BD9]">
                      {formatPrice(group.subtotal)}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}

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
