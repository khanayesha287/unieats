"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FoodCard from "@/components/menu/FoodCard";
import FloatingCart from "@/components/ui/FloatingCart";
import { menuItems } from "@/lib/data/menus";

export default function HotPotatoMenuPageContent() {
  const items = menuItems.filter((item) => item.canteenSlug === "hot-potato");

  const sandwiches = items.filter((item) => item.name.includes("Sandwich"));
  const tea = items.filter(
    (item) =>
      item.id.startsWith("hp-tea-")
  );
  const greenTea = items.filter(
    (item) =>
      item.id.startsWith("hp-greentea-")
  );
  const regularItems = items.filter(
    (item) =>
      item.id.startsWith("hp-regular-") ||
      item.id === "hp-malai-boti-samosa" ||
      item.id === "hp-kabab-roll" ||
      item.id === "hp-nuggets-piece"
  );
  const masalaFries = items.filter((item) => item.id.startsWith("hp-masala-"));
  const loadedFries = items.filter((item) => item.id.startsWith("hp-loaded-"));

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#6C2BD9]">
              Hot Potato
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Menu
            </h1>
            <p className="mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Sandwiches, fries, teas, and quick bites — fresh and flavourful.
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

        {sandwiches.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Sandwich</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {sandwiches.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {tea.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Tea</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {tea.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {greenTea.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Green Tea</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {greenTea.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {regularItems.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Regular Items</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {regularItems.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {masalaFries.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Masala Fries</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {masalaFries.map((item) => (
                <FoodCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {loadedFries.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-base font-bold text-gray-900">Loaded Fries</h2>
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {loadedFries.map((item) => (
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
