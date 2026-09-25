"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FoodCard from "@/components/menu/FoodCard";
import FloatingCart from "@/components/ui/FloatingCart";
import { getMenuByCanteen } from "@/lib/data/menus";
import type { MenuSection } from "@/lib/types";

const sections: Array<{ id: MenuSection; label: string }> = [
  { id: "karahi", label: "Karahi" },
  { id: "desi-food", label: "Desi Food" },
  { id: "shakes-and-juices", label: "Juices & Shakes" },
  { id: "tang-and-drinks", label: "Tang & Drinks" },
];

export default function BholaMenuPageContent() {
  const items = getMenuByCanteen("bhola");

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#6C2BD9]">
              Bhola Canteen
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Bhola Canteen Menu
            </h1>
            <p className="mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Fresh karahi, desi favourites, shakes, juices, and refreshing drinks.
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

        {sections.map((section) => {
          const sectionItems = items.filter((item) => item.menuSection === section.id);
          if (sectionItems.length === 0) return null;

          return (
            <section key={section.id} className="mb-6">
              <h2 className="mb-3 text-base font-bold text-gray-900">{section.label}</h2>
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
                {sectionItems.map((item) => (
                  <FoodCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <FloatingCart />
    </>
  );
}
