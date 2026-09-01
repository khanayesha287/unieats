"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FoodCard from "@/components/menu/FoodCard";
import FloatingCart from "@/components/ui/FloatingCart";
import { menuItems } from "@/lib/data/menus";

export default function AnnexeMenuPageContent() {
  const items = menuItems.filter((item) => item.canteenSlug === "annexe");
  const shakes = items.filter((item) => item.category === "shakes-and-juices");
  const drinks = items.filter((item) => item.category === "drinks");
  const other = items.filter(
    (item) => item.category !== "shakes-and-juices" && item.category !== "drinks"
  );

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#6C2BD9]">
              Annexe Canteen
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Menu
            </h1>
            <p className="mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Refreshing shakes and cold drinks for a quick break.
            </p>
          </div>
          <Link
            href="/canteens"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#6C2BD9]/30 hover:text-[#6C2BD9]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All Canteens
          </Link>
        </div>

        {shakes.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Shakes &amp; Drinks</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {shakes.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {drinks.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Drinks</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {drinks.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {other.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">More</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {other.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {items.length === 0 && (
          <div className="rounded-3xl border border-gray-100 bg-white p-12 text-center">
            <p className="text-gray-500">No menu items available yet.</p>
          </div>
        )}
      </div>
      <FloatingCart />
    </>
  );
}