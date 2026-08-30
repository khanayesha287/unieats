import Link from "next/link";
import Image from "next/image";
import { Bike, Clock, Store } from "lucide-react";
import { canteens } from "@/lib/data/canteens";

export default function Canteens() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-white via-[#FAF7FF] to-[#F3EDFF] py-20 lg:py-28"
      aria-labelledby="canteens-heading"
    >
      <div className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-[#6C2BD9]/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-16 bottom-16 h-56 w-56 rounded-full bg-[#F4C542]/10 blur-3xl" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="canteens-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            UET Lahore Canteens
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Browse and order online from your favourite campus canteen.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {canteens.map((canteen) => {
            const isActive = canteen.status === "active";

            const card = (
              <div
                key={canteen.slug}
                className={"group flex w-full flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 " + (isActive ? "hover:-translate-y-2 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/15" : "opacity-75 cursor-not-allowed")}
              >
                <div className={"relative h-44 overflow-hidden border-t-4 " + (isActive ? "border-[#6C2BD9]" : "border-gray-300") + (canteen.image ? "" : " bg-gradient-to-br " + canteen.gradient)}>
                  {canteen.image ? (
                    <Image
                      src={canteen.image}
                      alt={canteen.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2),transparent_50%)]" />
                  )}
                  <span className={"absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide shadow-sm " + (isActive ? "bg-[#F4C542] text-[#2E1065] transition-shadow group-hover:shadow-[0_0_12px_rgba(244,197,66,0.6)]" : "bg-gray-200 text-gray-600")}>
                    {isActive ? "OPEN" : "Coming Soon"}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <h3 className={"text-xl font-bold text-gray-900 " + (isActive ? "transition-colors group-hover:text-[#6C2BD9]" : "")}>
                    {canteen.name}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">{canteen.description}</p>

                  {isActive && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EDFF] px-3 py-1 text-xs font-medium text-[#6C2BD9]">
                        <Store className="h-3.5 w-3.5" aria-hidden />
                        Pickup
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EDFF] px-3 py-1 text-xs font-medium text-[#6C2BD9]">
                        <Bike className="h-3.5 w-3.5" aria-hidden />
                        Delivery
                      </span>
                    </div>
                  )}

                  <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-500">
                    <Clock className={"h-4 w-4 " + (isActive ? "text-[#6C2BD9]" : "text-gray-400")} aria-hidden />
                    {canteen.prepTime}
                  </p>
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

        <div className="mt-12 text-center">
          <Link
            href="/canteens"
            className="inline-flex rounded-full border border-[#6C2BD9]/30 px-6 py-2.5 text-sm font-semibold text-[#6C2BD9] transition-all hover:bg-[#F3EDFF]"
          >
            View All Canteens
          </Link>
        </div>
      </div>
    </section>
  );
}
