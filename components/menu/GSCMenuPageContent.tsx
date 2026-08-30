"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FoodCard from "@/components/menu/FoodCard";
import { menuItems } from "@/lib/data/menus";

interface GSCMenuPageContentProps {
  canteenSlug: string;
}

export default function GSCMenuPageContent({ canteenSlug }: GSCMenuPageContentProps) {
  const items = menuItems.filter((item) => item.canteenSlug === canteenSlug);
  const snacks = items.filter((item) => item.category === "snacks");
  const meals = items.filter((item) => item.category === "meals");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#F4C542]">
            GSSC Canteen
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Menu
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/80 sm:text-lg">
            Rolls, samosas, snacks, and quick bites for UET students.
          </p>
        </div>
        <Link
          href="/canteens"
          className="inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All Canteens
        </Link>
      </div>

      {snacks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-base font-bold text-white">Snacks &amp; Rolls</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {snacks.map((item) => (
              <FoodCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {meals.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-base font-bold text-white">Meals</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {meals.map((item) => (
              <FoodCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && (
        <div className="rounded-3xl border border-white/20 bg-white/10 p-12 text-center">
          <p className="text-white/70">No menu items available yet.</p>
        </div>
      )}
    </div>
  );
}
