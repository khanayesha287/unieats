import Image from "next/image";
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
          <span className="inline-flex items-center gap-2 rounded-full border border-[#6C2BD9]/20 bg-white/80 px-3 py-1.5 text-xs font-medium text-[#6C2BD9] shadow-sm backdrop-blur-sm">
            📍 Available at UET Lahore Main Campus
          </span>

          <h1
            id="hero-heading"
            className="mt-5 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl lg:text-5xl"
          >
            Skip The Waiting Time
          </h1>

          <p className="mt-3 text-2xl font-bold leading-tight tracking-tight text-[#6C2BD9] sm:text-3xl lg:text-4xl">
            Order While Sitting In Class
          </p>

          <div className="relative mt-7 aspect-[16/9] w-full max-w-2xl overflow-hidden rounded-2xl bg-white/70 shadow-xl shadow-[#6C2BD9]/10 ring-1 ring-[#6C2BD9]/10">
            <Image
              src="/images/hot-potato-poster.png"
              alt="Hot Potato Canteen poster"
              fill
              priority
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 672px"
              className="object-contain"
            />
          </div>

          <Link
            href="/menu/hot-potato"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#6C2BD9]/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065] hover:shadow-[#F4C542]/30"
          >
            Order Now
          </Link>

        </div>
      </div>
    </section>
  );
}