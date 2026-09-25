"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import FoodCard from "@/components/menu/FoodCard";
import FloatingCart from "@/components/ui/FloatingCart";
import { FOOD_CATEGORIES } from "@/lib/constants";
import { menuItems } from "@/lib/data/menus";
import type { CategoryFilter, MenuItem } from "@/lib/types";

const fastFoodSections = [
  { slug: "burgers", label: "Burgers" },
  { slug: "shawarma-rolls", label: "Shawarma & Rolls" },
  { slug: "fried-chicken", label: "Fried Chicken" },
  { slug: "fries-sides", label: "Fries & Sides" },
  { slug: "sandwiches", label: "Sandwiches" },
  { slug: "deals", label: "Deals" },
  { slug: "pizza", label: "Pizza" },
  { slug: "pizza-deals", label: "Pizza Deals" },
];

function getFastFoodSectionSlug(item: MenuItem): string {
  const name = item.name.toLowerCase();
  const id = item.id.toLowerCase();

  if (id.startsWith("ssc-fast-deal-")) {
    return "deals";
  }
  if (id.startsWith("ssc-pizza-deal-")) {
    return "pizza-deals";
  }
  if (id.startsWith("ssc-pizza-")) {
    return "pizza";
  }
  if (name.includes("burger") || name.includes("zinger") || name.includes("pizza burger")) {
    return "burgers";
  }
  if (name.includes("shawarma") || name.includes("roll")) {
    return "shawarma-rolls";
  }
  if (name.includes("wing") || name.includes("nugget") || name.includes("chicken piece")) {
    return "fried-chicken";
  }
  if (name.includes("fries") || name.includes("pasta")) {
    return "fries-sides";
  }
  if (name.includes("sandwich") || name.includes("panini")) {
    return "sandwiches";
  }

  return "sandwiches";
}

export default function AllMenuPageContent() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [activeSection, setActiveSection] = useState<string>("burgers");

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

  // Scroll spy effect to highlight active section on scroll
  useEffect(() => {
    if (category !== "fast-food") return;

    const observerOptions = {
      root: null,
      rootMargin: "-120px 0px -60% 0px", // offset for sticky main navbar + sub navbar
      threshold: 0,
    };

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(() => {
            setActiveSection(entry.target.id);
          });
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, observerOptions);

    fastFoodSections.forEach((sec) => {
      const el = document.getElementById(sec.slug);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [category, filteredItems]);

  return (
    <>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-8 flex flex-col gap-6">
          <Link
            href="/canteens"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[#6C2BD9]/20 bg-white/80 px-4 py-2 text-sm font-medium text-[#6C2BD9] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#6C2BD9]/40 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Canteens
          </Link>

          <header>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
              Full Menu
            </h1>
            <p className="mt-2 max-w-2xl text-base text-gray-600 sm:text-lg">
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
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-2 px-2 sm:mx-0 sm:flex-wrap sm:px-0"
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
          category === "fast-food" ? (
            <div className="space-y-4">
              {fastFoodSections.map((sec) => {
                const sectionItems = filteredItems.filter(
                  (item) => getFastFoodSectionSlug(item) === sec.slug
                );

                if (sectionItems.length === 0) return null;

                const categoryImage = sectionItems[0]?.image ?? "/menu/placeholder.jpg";

                return (
                  <div key={sec.slug} id={sec.slug} className="scroll-mt-[140px]">
                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
                      <h2 className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50">
                        {sec.label}
                      </h2>
                      {sectionItems.map((item) => (
                        <FoodCard key={item.id} item={item} showCanteenBadge />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <FoodCard key={item.id} item={item} showCanteenBadge />
              ))}
            </div>
          )
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
