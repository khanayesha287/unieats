"use client";

import Link from "next/link";
import SscCanteenStatus from "@/components/ui/SscCanteenStatus";
import { useSscCanteenStatus } from "@/lib/canteen-hours";

const features = [
  "🚀 Fast Ordering",
  "🏫 UET Lahore",
  "🍔 Fresh Food",
  "🛵 Campus Delivery",
];

export default function CTA() {
  const { isOpen } = useSscCanteenStatus();

  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28" aria-labelledby="cta-heading">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#6C2BD9] via-[#7C3AED] to-[#5B21B6] px-6 py-16 text-center text-white shadow-2xl shadow-[#6C2BD9]/30 sm:px-12 sm:py-20">
        <div
          className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 animate-float rounded-full bg-[#F4C542]/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -right-16 h-72 w-72 animate-float rounded-full bg-white/10 blur-3xl"
          style={{ animationDelay: "3s" }}
          aria-hidden
        />

        <div className="relative animate-fade-up">
          <h2 id="cta-heading" className="text-3xl font-bold sm:text-4xl lg:text-5xl">
            Hungry? <span className="text-[#F4C542]">Order</span> Before You Leave
            Your Class.
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/85">
            Browse the SSC menu, place your order in seconds, and choose Pickup
            or Campus Delivery.
          </p>

          <div className="mt-6 flex justify-center">
            <SscCanteenStatus className="mx-auto" compact={false} />
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {isOpen ? (
              <Link
                href="/menu/ssc"
                className="w-full rounded-full bg-white px-8 py-4 text-sm font-semibold text-[#6C2BD9] shadow-lg transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:bg-[#F4C542] hover:text-[#2E1065] sm:w-auto"
              >
                Order Now
              </Link>
            ) : (
              <span className="w-full rounded-full bg-white/70 px-8 py-4 text-center text-sm font-semibold text-[#6C2BD9] shadow-lg sm:w-auto">
                Order Now
              </span>
            )}
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {features.map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
