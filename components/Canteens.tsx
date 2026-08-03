import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Bike, Clock, Store } from "lucide-react";
import { canteens } from "@/lib/data/canteens";

const FEATURED_CANTEEN_NAMES = ["SSC Canteen", "Bhola Canteen"];

const featuredCanteens = canteens.filter((canteen) =>
  FEATURED_CANTEEN_NAMES.includes(canteen.name)
);

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
            Popular Campus Canteens
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Choose your favourite canteen and browse its menu.
          </p>
        </header>

        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
          {featuredCanteens.map((canteen) => (
            <article
              key={canteen.slug}
              className="group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 hover:-translate-y-2 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/15"
            >
              <div className={`relative h-44 overflow-hidden border-t-4 border-[#6C2BD9] ${canteen.image ? '' : `bg-gradient-to-br ${canteen.gradient}`}`}>
                {canteen.image ? (
                  <Image
                    src={canteen.image}
                    alt={canteen.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(244,197,66,0.25),transparent_50%)]" />
                )}
                <span className="absolute right-4 top-4 rounded-full bg-[#F4C542] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#2E1065]">
                  Open
                </span>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-xl font-bold text-gray-900">{canteen.name}</h3>
                <p className="mt-2 text-sm text-gray-600">{canteen.description}</p>

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

                <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-500">
                  <Clock className="h-4 w-4 text-[#6C2BD9]" aria-hidden />
                  {canteen.prepTime}
                </p>

                <Link
                  href={`/menu/${canteen.slug}`}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#6C2BD9] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
                >
                  View Menu
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/canteens"
            className="inline-flex rounded-full bg-[#6C2BD9] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-1 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            Explore All Canteens
          </Link>
        </div>
      </div>
    </section>
  );
}