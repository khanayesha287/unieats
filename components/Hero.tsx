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

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
        <div className="animate-fade-up flex flex-col items-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#6C2BD9]/20 bg-white/80 px-4 py-2 text-sm font-medium text-[#6C2BD9] shadow-sm backdrop-blur-sm">
            📍 Available at UET Lahore Main Campus
          </span>

          <h1
            id="hero-heading"
            className="mt-6 text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl"
          >
            Skip The Waiting Time
          </h1>

          <p className="mt-6 text-3xl font-bold leading-tight tracking-tight text-[#6C2BD9] sm:text-5xl lg:text-6xl">
            Order While Sitting In Class
          </p>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">
            Uni Eats is making food ordering easy for students, teachers and staff. Order online and get your food delivered to your department, hostel or anywhere on campus. Just order, we’ll deliver.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/canteens"
              className="rounded-full bg-[#6C2BD9] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-1 hover:bg-[#F4C542] hover:text-[#2E1065] hover:shadow-[#F4C542]/30"
            >
              Order Food
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
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
      </div>
    </section>
  );
}