import Link from "next/link";
import { Bike, ShoppingBag } from "lucide-react";

const options = [
  {
    icon: ShoppingBag,
    title: "Order & Pickup",
    description:
      "Order your food online and pick it up when it's ready. No waiting in long queues.",
    features: ["Skip Waiting", "Ready on Arrival", "Fast Collection"],
    button: "Choose Pickup",
    href: "/canteens",
  },
  {
    icon: Bike,
    title: "Order & Delivery",
    description:
      "Stay in class or your department while our UniEats rider delivers your order across campus.",
    features: ["Campus Delivery", "Fast Rider Service", "Convenient Ordering"],
    button: "Choose Delivery",
    href: "/canteens",
  },
];

export default function OrderOptions() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-white via-[#FAF7FF] to-[#F3EDFF] py-20 lg:py-28"
      aria-labelledby="order-options-heading"
    >
      <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-[#6C2BD9]/8 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-[#F4C542]/10 blur-3xl" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto mb-14 max-w-2xl text-center">
          <h2 id="order-options-heading" className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Choose How You Want Your Food
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Whether you&apos;re rushing between classes or relaxing on campus,
            UniEats gives you the flexibility to choose.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {options.map((option) => (
            <article
              key={option.title}
              className="group rounded-3xl border border-white/60 bg-white/70 p-8 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:border-[#6C2BD9]/30 hover:shadow-xl hover:shadow-[#6C2BD9]/10"
            >
              <div className="mb-6 inline-flex rounded-2xl bg-[#F4C542]/20 p-4">
                <option.icon className="h-8 w-8 text-[#6C2BD9]" aria-hidden />
              </div>

              <h3 className="text-2xl font-bold text-gray-900">{option.title}</h3>
              <p className="mt-3 leading-relaxed text-gray-600">{option.description}</p>

              <ul className="mt-6 space-y-2" role="list">
                {option.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-[#6C2BD9]" aria-hidden>✔</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={option.href}
                className="mt-8 inline-flex rounded-full bg-[#6C2BD9] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
              >
                {option.button}
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-16 overflow-hidden rounded-3xl bg-gradient-to-r from-[#6C2BD9] to-[#7C3AED] p-8 text-center text-white shadow-xl shadow-[#6C2BD9]/20 sm:p-12">
          <h3 className="text-2xl font-bold sm:text-3xl">Made for UET Lahore Students</h3>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Save time, avoid queues and enjoy your favorite meals with UniEats.
          </p>
          <Link
            href="/canteens"
            className="mt-8 inline-flex rounded-full bg-white px-8 py-4 text-sm font-semibold text-[#6C2BD9] transition-all duration-300 hover:-translate-y-1 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            Order Now
          </Link>
        </div>
      </div>
    </section>
  );
}
