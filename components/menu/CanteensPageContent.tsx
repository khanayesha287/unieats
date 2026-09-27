"use client";

import Link from "next/link";
import Image from "next/image";
import { canteens } from "@/lib/data/canteens";

export default function CanteensPageContent() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#6C2BD9]">
          UET Lahore
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Campus Canteens
        </h1>
        <p className="mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
          Order online from your favourite campus canteen.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canteens.map((canteen) => {
          const isActive = canteen.status === "active";

          const card = (
            <div
              key={canteen.slug}
              className={"group flex h-full flex-col overflow-hidden rounded-2xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 " + (isActive ? "hover:-translate-y-1 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/15" : "opacity-80 cursor-not-allowed")}
            >
              <div className={"relative h-32 shrink-0 overflow-hidden border-t-4 sm:h-36 " + (isActive ? "border-[#6C2BD9]" : "border-gray-300") + " " + (canteen.image ? "" : "bg-gradient-to-br " + canteen.gradient)}>
                {canteen.image ? (
                  <Image
                    src={canteen.image}
                    alt={canteen.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2),transparent_50%)]" />
                )}
              </div>

              <div className="flex flex-1 items-center p-4">
                <h3 className={"text-xl font-bold text-gray-900 " + (isActive ? "transition-colors group-hover:text-[#6C2BD9]" : "")}>
                  {canteen.name}
                </h3>
              </div>
            </div>
          );

          return isActive ? (
            <Link key={canteen.slug} href={"/menu/" + canteen.slug}>
              {card}
            </Link>
          ) : (
            <div key={canteen.slug}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
