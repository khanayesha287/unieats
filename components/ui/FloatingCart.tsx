"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice } from "@/lib/format";

export default function FloatingCart() {
  const { itemCount, subtotal, isHydrated } = useCart();

  if (!isHydrated || itemCount === 0) return null;

  return (
    <aside
      className="fixed bottom-6 right-4 z-40 w-[min(calc(100vw-2rem),320px)] animate-fade-up rounded-2xl border border-white/60 bg-white/90 p-4 shadow-2xl shadow-[#6C2BD9]/20 backdrop-blur-xl sm:right-6"
      aria-label="Cart summary"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6C2BD9] text-white shadow-lg shadow-[#6C2BD9]/25">
          <ShoppingCart className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-600">
            {itemCount} {itemCount === 1 ? "Item" : "Items"}
          </p>
          <p className="text-lg font-bold text-gray-900">
            Subtotal {formatPrice(subtotal)}
          </p>
        </div>
      </div>
      <Link
        href="/cart"
        className="mt-3 flex w-full items-center justify-center rounded-full bg-[#6C2BD9] px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
      >
        View Cart
      </Link>
    </aside>
  );
}
