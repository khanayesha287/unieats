import Link from "next/link";

export default function Hero() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-[#FAF7FF] via-white to-[#F3EDFF] pt-28 pb-20 lg:pt-36 lg:pb-28"
      aria-labelledby="hero-heading"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#6C2BD9] via-[#6C2BD9]/40 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-20 top-20 h-96 w-96 animate-float rounded-full bg-[#6C2BD9]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 animate-float rounded-full bg-[#F4C542]/15 blur-3xl"
        style={{ animationDelay: "2s" }}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[55%_45%] lg:gap-16 lg:px-8">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#6C2BD9]/20 bg-white/80 px-4 py-2 text-sm font-medium text-[#6C2BD9] shadow-sm backdrop-blur-sm">
            📍 Available at UET Lahore Main Campus
          </span>

          <h1
            id="hero-heading"
            className="mt-6 text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl"
          >
            Skip the Queue.{" "}
            <span className="text-[#6C2BD9]">Order</span> Before Class Ends.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">
            UniEats lets students order food online from campus canteens while
            sitting in class. Choose Pickup or Campus Delivery and save your
            valuable time.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/canteens"
              className="rounded-full bg-[#6C2BD9] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-1 hover:bg-[#F4C542] hover:text-[#2E1065] hover:shadow-[#F4C542]/30"
            >
              Order Food
            </Link>
            <Link
              href="/canteens"
              className="rounded-full border-2 border-[#6C2BD9]/30 bg-white/80 px-8 py-4 text-sm font-semibold text-[#6C2BD9] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#6C2BD9] hover:bg-white"
            >
              Browse Canteens
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            {[
              "⚡ Fast Ordering",
              "🚴 Campus Delivery",
              "🎓 Built for UET Students",
            ].map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-[#6C2BD9]/10"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div className="animate-fade-up lg:justify-self-end" style={{ animationDelay: "0.15s" }}>
          <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-2xl shadow-[#6C2BD9]/10 backdrop-blur-xl">
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Select Canteen
              </label>
              <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <span className="font-medium text-gray-900">BSSC Canteen</span>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { name: "Chicken Biryani", price: 220 },
                { name: "Zinger Burger", price: 350 },
                { name: "Shawarma", price: 280 },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-3 transition-shadow hover:shadow-md"
                >
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-gradient-to-br from-[#6C2BD9]/20 to-[#F4C542]/30" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">{item.name}</p>
                    <p className="text-sm font-medium text-[#6C2BD9]">Rs.{item.price}</p>
                    <p className="text-xs text-[#F4C542]" aria-label="5 out of 5 stars">★★★★★</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-[#F3EDFF] px-3 py-1.5 text-xs font-semibold text-[#6C2BD9] transition-colors hover:bg-[#6C2BD9] hover:text-white"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl bg-[#F3EDFF] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">3 Items</span>
                <span className="font-bold text-gray-900">Total Rs.850</span>
              </div>
              <Link
                href="/checkout"
                className="mt-3 flex w-full items-center justify-center rounded-full bg-[#6C2BD9] py-3 text-sm font-semibold text-white transition-all hover:bg-[#F4C542] hover:text-[#2E1065]"
              >
                Checkout
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
