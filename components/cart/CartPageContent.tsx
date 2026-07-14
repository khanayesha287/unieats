"use client";

import Link from "next/link";
import { ArrowRight, ShoppingCart, Trash2 } from "lucide-react";
import QuantitySelector from "@/components/ui/QuantitySelector";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice } from "@/lib/format";
import { DELIVERY_FEE } from "@/lib/constants";

export default function CartPageContent() {
  const { items, subtotal, updateQuantity, removeItem, isHydrated } = useCart();
  const discount = 0;
  const deliveryFee = items.length > 0 ? DELIVERY_FEE : 0;
  const grandTotal = subtotal + deliveryFee - discount;

  if (!isHydrated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-64 rounded-xl bg-gray-200" />
          <div className="h-32 rounded-3xl bg-gray-100" />
          <div className="h-32 rounded-3xl bg-gray-100" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-lg rounded-3xl border border-[#6C2BD9]/10 bg-white/80 p-10 text-center shadow-xl backdrop-blur-sm">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[#F3EDFF]">
            <ShoppingCart className="h-10 w-10 text-[#6C2BD9]" aria-hidden />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Your cart is empty</h2>
          <p className="mt-3 text-gray-600">
            Add delicious meals from your favorite campus canteens to get started.
          </p>
          <Link
            href="/canteens"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            Continue Shopping
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Shopping Cart
        </h1>
        <p className="mt-2 text-base text-white/80 sm:text-lg">
          Review your order before checkout.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-label="Cart items" className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="group flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/90 p-4 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:flex-row sm:items-center sm:p-5"
            >
              <div
                className={`h-24 w-full shrink-0 rounded-2xl bg-gradient-to-br ${item.gradient} sm:h-20 sm:w-20`}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-900">{item.name}</h2>
                <p className="mt-0.5 text-sm text-gray-500">{item.canteenName}</p>
                <p className="mt-2 text-lg font-bold text-[#6C2BD9]">
                  {formatPrice(item.price)}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                <QuantitySelector
                  value={item.quantity}
                  onChange={(value) => updateQuantity(item.id, value)}
                  size="sm"
                  label={`Quantity for ${item.name}`}
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  aria-label={`Remove ${item.name} from cart`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-[#6C2BD9]/10 backdrop-blur-sm">
            <h2 className="text-xl font-bold text-gray-900">Order Summary</h2>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-gray-900">
                  {formatPrice(subtotal)}
                </dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>Delivery Fee</dt>
                <dd className="font-semibold text-gray-900">
                  {formatPrice(deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>Discount</dt>
                <dd className="font-semibold text-green-600">
                  -{formatPrice(discount)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-3 text-base">
                <dt className="font-bold text-gray-900">Grand Total</dt>
                <dd className="font-bold text-[#6C2BD9]">
                  {formatPrice(grandTotal)}
                </dd>
              </div>
            </dl>

            <PromoCodeForm />

            <Link
              href="/checkout"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#6C2BD9] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
            >
              Checkout
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PromoCodeForm() {
  return (
    <form
      className="mt-6 flex gap-2"
      onSubmit={(event) => event.preventDefault()}
    >
      <label htmlFor="promo-code" className="sr-only">
        Promo code
      </label>
      <input
        id="promo-code"
        type="text"
        placeholder="Promo code"
        className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm transition-colors focus:border-[#6C2BD9] focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/20"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl border border-[#6C2BD9] px-4 py-2.5 text-sm font-semibold text-[#6C2BD9] transition-all hover:bg-[#6C2BD9] hover:text-white"
      >
        Apply
      </button>
    </form>
  );
}
