import Link from "next/link";
import Image from "next/image";
import { canteens } from "@/lib/data/canteens";

export default function Canteens() {
  const homepageCanteens = canteens.filter(
    (canteen) => canteen.slug === "ssc" || canteen.slug === "bhola",
  );

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

        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
          {homepageCanteens.map((canteen) => {
            const isActive = canteen.status === "active";

            const card = (
              <div
                key={canteen.slug}
                className={"group flex w-full flex-col overflow-hidden rounded-2xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 " + (isActive ? "hover:-translate-y-1 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/15" : "opacity-75 cursor-not-allowed")}
              >
                <div className={"relative h-32 overflow-hidden border-t-4 sm:h-36 " + (isActive ? "border-[#6C2BD9]" : "border-gray-300") + (canteen.image ? "" : " bg-gradient-to-br " + canteen.gradient)}>
                  {canteen.image ? (
                    <Image
                      src={canteen.image}
                      alt={canteen.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 320px"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2),transparent_50%)]" />
                  )}
                </div>

                <div className="flex flex-1 flex-col p-4">
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
