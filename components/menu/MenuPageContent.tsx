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

const fastFoodSections = [
  { slug: "burgers", label: "Burgers" },
  { slug: "rolls", label: "Rolls" },
  { slug: "fries", label: "Fries" },
  { slug: "nuggets", label: "Nuggets" },
  { slug: "chicken-piece", label: "Chicken Piece" },
  { slug: "sandwiches", label: "Sandwiches" },
  { slug: "pizza", label: "Pizza" },
  { slug: "pizza-deals", label: "Pizza Deals" },
  { slug: "other-deals", label: "Other Deals" },
];

function getFastFoodSectionSlug(item: MenuItem): string {
  const name = item.name.toLowerCase();
  const id = item.id.toLowerCase();

  if (id.startsWith("ssc-fast-deal-")) {
    return "other-deals";
  }
  if (id.startsWith("ssc-pizza-deal-")) {
    return "pizza-deals";
  }
  if (id.startsWith("ssc-pizza-")) {
    return "pizza";
  }
  if (name.includes("burger") || name.includes("zinger")) {
    return "burgers";
  }
  if (name.includes("roll") || name.includes("shawarma")) {
    return "rolls";
  }
  if (name.includes("fries") || name.includes("pasta")) {
    return "fries";
  }
  if (name.includes("nugget") || name.includes("wing")) {
    return "nuggets";
  }
  if (name.includes("chicken piece")) {
    return "chicken-piece";
  }
  if (name.includes("sandwich") || name.includes("panini")) {
    return "sandwiches";
  }

  return "sandwiches"; // fallback
}

export default function MenuPageContent({ canteenSlug, initialCategory = "all" }: MenuPageContentProps) {
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [activeSection, setActiveSection] = useState<string>("burgers");

  const items = useMemo(() => getMenuByCanteen(canteenSlug), [canteenSlug]);
  const isComingSoonCategory = false;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      return matchesCategory;
    });
  }, [items, category]);

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
      {category === "fast-food" && (
        <div className="sticky top-20 z-30 -mx-4 border-b border-[#6C2BD9]/10 bg-white/95 py-3 shadow-sm backdrop-blur-md sm:-mx-6 lg:-mx-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav className="flex overflow-x-auto gap-2 pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" aria-label="Fast food categories">
              {fastFoodSections.map((sec) => {
                const sectionItems = filteredItems.filter(
                  (item) => getFastFoodSectionSlug(item) === sec.slug
                );

                // Only display section button if there are matching search items in it
                if (sectionItems.length === 0) return null;

                const isActive = activeSection === sec.slug;

                return (
                  <a
                    key={sec.slug}
                    href={`#${sec.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveSection(sec.slug);
                      document.getElementById(sec.slug)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`snap-start shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 ${
                      isActive
                        ? "bg-[#6C2BD9] text-white shadow-sm"
                        : "border border-gray-200 bg-white text-gray-700 hover:border-[#6C2BD9]/30 hover:text-[#6C2BD9]"
                    }`}
                  >
                    {sec.label}
                  </a>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <section className="animate-fade-up overflow-hidden rounded-[32px] bg-gradient-to-br from-[#F5F3FF] via-[#EDE9FE] to-[#DDD6FE] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(115,65,255,0.16)] sm:px-8 sm:py-10">
          <div className="flex flex-col gap-5">
            <Link
              href="/menu/ssc"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/80 px-4 py-2 text-sm font-medium text-[#6C2BD9] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Categories
            </Link>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-[#1F2937] sm:text-4xl lg:text-5xl">
                SSC Canteen Menu
              </h1>
              <p className="max-w-3xl text-base text-[#6B7280] sm:text-lg">
                Browse your favourite food categories and order instantly.
              </p>
            </div>

            <SscCanteenStatus className="max-w-fit" />

            <nav className="flex flex-wrap gap-2">
              {FOOD_CATEGORIES.map((entry) => {
                const isActive = category === entry.id;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setCategory(entry.id)}
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
        {isComingSoonCategory ? (
          <ComingSoonCard />
        ) : filteredItems.length > 0 ? (
          category === "fast-food" ? (
            <div className="space-y-12">
              {fastFoodSections.map((sec) => {
                const sectionItems = filteredItems.filter(
                  (item) => getFastFoodSectionSlug(item) === sec.slug
                );

                if (sectionItems.length === 0) return null;

                return (
                  <div key={sec.slug} id={sec.slug} className="scroll-mt-[140px] space-y-6">
                    <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
                      {sec.label}
                    </h2>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {sectionItems.map((item) => (
                        <FoodCard key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <FoodCard key={item.id} item={item} />
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
