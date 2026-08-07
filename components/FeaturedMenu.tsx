"use client";

import Image from "next/image";
import Link from "next/link";
import { useSscCanteenStatus } from "@/lib/canteen-hours";
import { getMenuImage } from "@/lib/data/menus";

const featuredItems = [
  { name: "Chicken Biryani", canteen: "SSC Canteen", gradient: "from-[#6C2BD9]/30 to-[#F4C542]/40" },
  { name: "Zinger Burger", canteen: "SSC Canteen", gradient: "from-[#5B21B6]/30 to-[#F4C542]/40" },
  { name: "Mango Shake", canteen: "SSC Canteen", gradient: "from-[#9333EA]/25 to-[#F4C542]/35" },
  { name: "Mayo Fries", canteen: "SSC Canteen", gradient: "from-[#F4C542]/25 to-[#6C2BD9]/20" },
  { name: "Chicken Tikka Pizza", canteen: "SSC Canteen", gradient: "from-[#6C2BD9]/30 to-[#F4C542]/25" },
];

export default function FeaturedMenu() {
  const { isOpen } = useSscCanteenStatus();

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#F3EDFF] via-white to-[#FAF7FF] py-20 lg:py-28"
      aria-labelledby="menu-heading"
    >
      <div className="pointer-events-none absolute left-1/4 top-0 h-72 w-72 rounded-full bg-[#6C2BD9]/5 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-[#F4C542]/10 blur-3xl" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="menu-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Popular Food
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Fresh meals from your favorite UET Lahore canteens.
          </p>
        </header>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredItems.map((item) => (
            <article
              key={item.name}
              className="group overflow-hidden rounded-3xl bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02] hover:shadow-xl hover:shadow-[#6C2BD9]/15"
            >
              <div className={`relative h-40 overflow-hidden bg-gradient-to-br ${item.gradient}`}>
                <Image
                  src={getMenuImage(item.name)}
                  alt={item.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover object-center"
                  loading="lazy"
                />
                <span className="absolute right-3 top-3 rounded-full bg-[#F4C542] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#2E1065] shadow-sm transition-shadow group-hover:shadow-[0_0_12px_rgba(244,197,66,0.6)]">
                  Popular
                </span>
              </div>

              <div className="p-5">
                <h3 className="font-bold text-gray-900">{item.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{item.canteen}</p>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#6C2BD9]">Student Pick</p>
                  <p className="text-sm text-[#F4C542]" aria-label="5 out of 5 stars">★★★★★</p>
                </div>
                {isOpen ? (
                  <Link
                    href="/menu/ssc"
                    className="mt-4 flex w-full items-center justify-center rounded-full bg-[#6C2BD9] py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5B21B6] hover:shadow-md"
                  >
                    Order Now
                  </Link>
                ) : (
                  <span className="mt-4 flex w-full items-center justify-center rounded-full bg-gray-200 py-2.5 text-sm font-semibold text-gray-600">
                    Closed
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/menu"
            className="inline-flex rounded-full bg-[#6C2BD9] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-1 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            View Full Menu
          </Link>
        </div>
      </div>
    </section>
  );
}
