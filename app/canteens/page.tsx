import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { ArrowRight, Bike, Clock, Store } from "lucide-react";
import { createMetadata } from "@/lib/seo";
import { canteens } from "@/lib/data/canteens";

export const metadata = createMetadata({
  title: "Choose Your Canteen",
  description:
    "Select a campus canteen at UET Lahore to browse its menu and order food online.",
  path: "/canteens",
});

export default function CanteensPage() {
  return (
    <>
      <Navbar />

      <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#FAF7FF] via-white to-[#F3EDFF] pt-20">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-[#6C2BD9] via-[#6C2BD9]/40 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-32 top-32 h-72 w-72 rounded-full bg-[#6C2BD9]/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 top-64 h-64 w-64 rounded-full bg-[#F4C542]/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#6C2BD9]/5 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <header className="relative mx-auto mb-14 max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Choose Your Canteen
            </h1>
            <p className="mt-4 text-lg text-white/80">
              Select a campus canteen to browse its menu.
            </p>
          </header>

          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
            {canteens.map((canteen) => (
              <article
                key={canteen.slug}
                className="group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 hover:-translate-y-2 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/15"
              >
                <div
                  className={`relative h-44 bg-gradient-to-br ${canteen.gradient} border-t-4 border-[#6C2BD9]`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(244,197,66,0.25),transparent_50%)]" />
                  <span className="absolute right-4 top-4 rounded-full bg-[#F4C542] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#2E1065] shadow-sm">
                    Open
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {canteen.name}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {canteen.description}
                  </p>

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
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#6C2BD9] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[#6C2BD9]/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065] hover:shadow-[#F4C542]/30"
                  >
                    View Menu
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      aria-hidden
                    />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
