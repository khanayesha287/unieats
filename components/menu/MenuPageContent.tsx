"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FoodCard from "@/components/menu/FoodCard";
import ComingSoonCard from "@/components/menu/ComingSoonCard";
import FloatingCart from "@/components/ui/FloatingCart";
import SscCanteenStatus from "@/components/ui/SscCanteenStatus";
import { FOOD_CATEGORIES } from "@/lib/constants";
import { getMenuByCanteen } from "@/lib/data/menus";
import type { CategoryFilter, MenuItem } from "@/lib/types";

interface MenuPageContentProps {
  canteenSlug: string;
  initialCategory?: CategoryFilter;
}

// Fast Food subcategory definitions
const fastFoodSubcategories = [
  { slug: "burgers",        label: "Burgers",          emoji: "🍔" },
  { slug: "pizza",          label: "Pizza",            emoji: "🍕" },
  { slug: "sandwiches",     label: "Sandwiches",       emoji: "🥪" },
  { slug: "shawarma-rolls", label: "Shawarma & Rolls", emoji: "🌯" },
  { slug: "fries-sides",    label: "Fries & Sides",    emoji: "🍟" },
  { slug: "fried-chicken",  label: "Wings & Chicken",  emoji: "🍗" },
  { slug: "deals",          label: "Deals",            emoji: "🎁" },
  { slug: "pizza-deals",    label: "Pizza Deals",      emoji: "🍕" },
];

function getFastFoodSubSlug(item: MenuItem): string {
  const name = item.name.toLowerCase();
  const id = item.id.toLowerCase();
  if (id.startsWith("ssc-fast-deal-"))  return "deals";
  if (id.startsWith("ssc-pizza-deal-")) return "pizza-deals";
  if (id.startsWith("ssc-pizza-"))      return "pizza";
  if (name.includes("burger") || name.includes("zinger")) return "burgers";
  if (name.includes("shawarma") || name.includes("roll"))  return "shawarma-rolls";
  if (name.includes("wing") || name.includes("nugget") || name.includes("chicken piece")) return "fried-chicken";
  if (name.includes("fries") || name.includes("pasta"))    return "fries-sides";
  if (name.includes("sandwich") || name.includes("panini")) return "sandwiches";
  return "sandwiches";
}

export default function MenuPageContent({ canteenSlug, initialCategory = "all" }: MenuPageContentProps) {
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  // null = show subcategory picker; string = show items for that subcategory
  const [fastFoodSub, setFastFoodSub] = useState<string | null>(null);

  const items = useMemo(() => getMenuByCanteen(canteenSlug), [canteenSlug]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => category === "all" || item.category === category);
  }, [items, category]);

  // Reset subcategory when switching away from fast-food
  useEffect(() => {
    if (category !== "fast-food") setFastFoodSub(null);
  }, [category]);

  // Only show subcategories that actually have items
  const availableSubcategories = useMemo(() => {
    const ffItems = items.filter((i) => i.category === "fast-food");
    return fastFoodSubcategories.filter((sub) =>
      ffItems.some((item) => getFastFoodSubSlug(item) === sub.slug)
    );
  }, [items]);

  // Items for the selected subcategory
  const subItems = useMemo(() => {
    if (category !== "fast-food" || !fastFoodSub) return [];
    return filteredItems.filter((item) => getFastFoodSubSlug(item) === fastFoodSub);
  }, [filteredItems, category, fastFoodSub]);

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        {/* Header card */}
        <section className="animate-fade-up overflow-hidden rounded-[32px] bg-gradient-to-br from-[#F5F3FF] via-[#EDE9FE] to-[#DDD6FE] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(115,65,255,0.16)] sm:px-8 sm:py-10">
          <div className="flex flex-col gap-5">
            {/* Back nav */}
            {fastFoodSub ? (
              <button
                type="button"
                onClick={() => setFastFoodSub(null)}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/80 px-4 py-2 text-sm font-medium text-[#6C2BD9] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to Fast Food
              </button>
            ) : (
              <Link
                href="/menu/ssc"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/80 px-4 py-2 text-sm font-medium text-[#6C2BD9] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to Categories
              </Link>
            )}

            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-[#1F2937] sm:text-4xl lg:text-5xl">
                SSC Canteen Menu
              </h1>
              <p className="max-w-3xl text-base text-[#6B7280] sm:text-lg">
                {fastFoodSub
                  ? (fastFoodSubcategories.find((s) => s.slug === fastFoodSub)?.label ?? "Fast Food")
                  : "Browse your favourite food categories and order instantly."}
              </p>
            </div>

            <SscCanteenStatus className="max-w-fit" />

            {/* Category tabs */}
            <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-2 px-2 sm:mx-0 sm:flex-wrap sm:px-0">
              {FOOD_CATEGORIES.map((entry) => {
                const isActive = category === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setCategory(entry.id);
                      if (entry.id !== "fast-food") setFastFoodSub(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? "bg-[#6C2BD9] text-white shadow-md shadow-[#6C2BD9]/25"
                        : "border border-gray-200 bg-white text-gray-700 hover:-translate-y-0.5 hover:border-[#6C2BD9]/30 hover:text-[#6C2BD9]"
                    }`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </section>

        {/* Content area */}
        {category === "fast-food" && !fastFoodSub ? (
          // Fast Food subcategory picker — 2-col mobile grid
          <div className="mt-6">
            <p className="mb-3 text-sm font-semibold text-white/70 uppercase tracking-wider">
              Choose a subcategory
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {availableSubcategories.map((sub) => (
                <button
                  key={sub.slug}
                  type="button"
                  onClick={() => setFastFoodSub(sub.slug)}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-white/95 px-3 py-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:shadow-[#6C2BD9]/15 active:scale-95 min-h-[80px]"
                >
                  <span className="text-2xl leading-none" aria-hidden>{sub.emoji}</span>
                  <span className="text-[13px] font-semibold text-gray-900 leading-tight">{sub.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-[#6C2BD9]/10 bg-white/80 p-12 text-center shadow-lg backdrop-blur-sm mt-6">
            <p className="text-lg font-semibold text-gray-900">No items found</p>
            <p className="mt-2 text-gray-600">Try a different search or category filter.</p>
          </div>
        ) : category === "fast-food" && fastFoodSub ? (
          // Items for the selected fast-food subcategory
          <div className="mt-6">
            {subItems.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
                {subItems.map((item) => (
                  <FoodCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-[#6C2BD9]/10 bg-white/80 p-12 text-center shadow-lg backdrop-blur-sm">
                <p className="text-lg font-semibold text-gray-900">No items in this subcategory</p>
              </div>
            )}
          </div>
        ) : (
          // Non-fast-food categories — flat list
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
            {filteredItems.map((item) => (
              <FoodCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <FloatingCart />
    </>
  );
}