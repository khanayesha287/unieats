"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Coffee, Milk, Sandwich, Soup } from "lucide-react";
import SscCanteenStatus from "@/components/ui/SscCanteenStatus";
import { useSscCanteenStatus } from "@/lib/canteen-hours";
import { getCanteenBySlug } from "@/lib/data/canteens";

const categories = [
  {
    slug: "fast-food",
    label: "Fast Food",
    description: "Crispy favourites and comfort bites.",
    icon: Sandwich,
    image: "/menu/fast-food-category.jpg.png",
    gradient: "from-[#6C2BD9]/30 via-[#6C2BD9]/20 to-[#F4C542]/25",
  },
  {
    slug: "shakes-and-juices",
    label: "Shakes & Juices",
    description: "Cool blends and refreshing fruit juices.",
    icon: Milk,
    image: "/menu/shakes-juices-category.jpg.png",
    gradient: "from-[#F4C542]/35 via-[#F4C542]/20 to-[#6C2BD9]/25",
  },
  {
    slug: "chai-and-paratha",
    label: "Chai & Paratha",
    description: "A warm classic for every student break.",
    icon: Coffee,
    image: "/menu/chai-paratha-category.jpg.png",
    gradient: "from-[#7C3AED]/25 via-[#A78BFA]/20 to-[#F4C542]/25",
  },
  {
    slug: "desi-food",
    label: "Desi Food",
    description: "Hearty local favourites with a homely feel.",
    icon: Soup,
    image: "/menu/desi-food-category.jpg.png",
    gradient: "from-[#5B21B6]/25 via-[#6C2BD9]/20 to-[#A78BFA]/25",
  },
] as const;

export default function SSCMenuPageContent() {
  const canteen = getCanteenBySlug("ssc");
  const { isOpen } = useSscCanteenStatus();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#F4C542]">
            SSC Canteen
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Choose a Category
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/80 sm:text-lg">
            {canteen?.description ?? "Fresh favourites, quick bites, and student-friendly comfort food."}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <SscCanteenStatus className="max-w-fit" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {categories.map((category) => {
          const Icon = category.icon;

          const cardContent = (
            <div className="group overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-lg shadow-[#6C2BD9]/10 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-[#6C2BD9]/20">
              <div className={`relative h-40 overflow-hidden bg-gradient-to-br ${category.gradient}`}>
                <Image
                  src={category.image}
                  alt={category.label}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover object-center"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.35),transparent_45%)]" />
                <div className="absolute left-5 top-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/50 bg-white/80 text-[#6C2BD9] shadow-lg shadow-[#6C2BD9]/10">
                  <Icon className="h-7 w-7" aria-hidden />
                </div>
                <span className="absolute bottom-4 left-5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2E1065]">
                  {isOpen ? "Open now" : "Closed"}
                </span>
              </div>

              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900">{category.label}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {category.description}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6C2BD9] transition-colors group-hover:text-[#5B21B6]">
                  View Menu
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </div>
              </div>
            </div>
          );

          return isOpen ? (
            <Link key={category.slug} href={`/menu/ssc/${category.slug}`}>
              {cardContent}
            </Link>
          ) : (
            <div key={category.slug} aria-disabled="true" className="cursor-not-allowed opacity-80">
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
