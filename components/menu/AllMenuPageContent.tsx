"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import FoodCard from "@/components/menu/FoodCard";
import FloatingCart from "@/components/ui/FloatingCart";
import { FOOD_CATEGORIES } from "@/lib/constants";
import { menuItems } from "@/lib/data/menus";
import type { CategoryFilter } from "@/lib/types";

export default function AllMenuPageContent() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return menuItems.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [search, category]);

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-8 flex flex-col gap-6">
          <Link
            href="/canteens"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[#6C2BD9]/20 bg-white/80 px-4 py-2 text-sm font-medium text-[#6C2BD9] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#6C2BD9]/40 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Browse Canteens
          </Link>

          <header>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Full Menu
            </h1>
            <p className="mt-2 max-w-2xl text-base text-white/80 sm:text-lg">
              Explore popular dishes from all UET Lahore campus canteens.
            </p>
          </header>

          <div className="relative max-w-xl">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search all menu items..."
              aria-label="Search menu items"
              className="w-full rounded-2xl border border-white/60 bg-white/90 py-3.5 pl-12 pr-4 text-gray-900 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm transition-all placeholder:text-gray-400 focus:border-[#6C2BD9] focus:outline-none focus:ring-2 focus:ring-[#6C2BD9]/20"
            />
          </div>

          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Food categories"
          >
            {FOOD_CATEGORIES.map((entry) => {
              const isActive = category === entry.id;

              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setCategory(entry.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300 ${
                    isActive
                      ? "bg-[#6C2BD9] text-white shadow-md shadow-[#6C2BD9]/25"
                      : "border border-[#6C2BD9]/15 bg-white/80 text-gray-700 hover:border-[#6C2BD9]/30 hover:text-[#6C2BD9]"
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => (
              <FoodCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-[#6C2BD9]/10 bg-white/80 p-12 text-center shadow-lg backdrop-blur-sm">
            <p className="text-lg font-semibold text-gray-900">
              No items found
            </p>
            <p className="mt-2 text-gray-600">
              Try a different search or category filter.
            </p>
          </div>
        )}
      </div>

      <FloatingCart />
    </>
  );
}
