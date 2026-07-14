import Link from "next/link";
import {
  ArrowRight,
  Bike,
  Building2,
  GraduationCap,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "About",
  description:
    "Learn about UniEats — the food ordering platform built for UET Lahore students and campus canteens.",
  path: "/about",
});

const steps = [
  {
    icon: Store,
    title: "Choose a Canteen",
    description: "Pick from popular UET Lahore campus canteens.",
  },
  {
    icon: ShoppingBag,
    title: "Build Your Order",
    description: "Browse menus, add items, and review your cart.",
  },
  {
    icon: Bike,
    title: "Pickup or Delivery",
    description: "Collect on arrival or get campus delivery to your department.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <header className="mx-auto mb-16 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
              <Sparkles className="h-4 w-4" aria-hidden />
              About UniEats
            </span>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Food Ordering Built for UET Lahore
            </h1>
            <p className="mt-4 text-base text-white/80 sm:text-lg">
              UniEats connects students with campus canteens through a fast,
              modern ordering experience.
            </p>
          </header>

          <section className="mb-16 rounded-3xl border border-white/60 bg-white/90 p-8 shadow-xl backdrop-blur-sm sm:p-12">
            <h2 className="text-2xl font-bold text-gray-900">What is UniEats?</h2>
            <p className="mt-4 max-w-3xl leading-relaxed text-gray-600">
              UniEats is a campus food ordering platform that lets UET Lahore
              students browse canteen menus, place orders online, and choose
              between pickup or campus delivery — all without waiting in long
              queues.
            </p>
          </section>

          <div className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <InfoCard
              title="Why UniEats was created"
              content="Long lunch queues and limited break times make it hard for students to eat well between classes. UniEats was created to give students a smarter way to order food from campus canteens."
            />
            <InfoCard
              title="Our Mission"
              content="To make campus dining faster, easier, and more convenient for every UET Lahore student."
            />
            <InfoCard
              title="Our Vision"
              content="To become the go-to food ordering platform for universities across Pakistan, starting with UET Lahore."
            />
            <InfoCard
              title="Why students should use UniEats"
              content="Save time, skip queues, browse multiple canteens, and order before your class ends — with pickup or delivery options."
            />
          </div>

          <section className="mb-16" aria-labelledby="how-it-works">
            <h2
              id="how-it-works"
              className="mb-10 text-center text-2xl font-bold text-gray-900 sm:text-3xl"
            >
              How It Works
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <article
                  key={step.title}
                  className="rounded-3xl border border-white/60 bg-white/90 p-6 text-center shadow-lg backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3EDFF]">
                    <step.icon className="h-6 w-6 text-[#6C2BD9]" aria-hidden />
                  </div>
                  <span className="text-sm font-semibold text-[#6C2BD9]">
                    Step {index + 1}
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-gray-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="mb-16 rounded-3xl border border-[#6C2BD9]/10 bg-gradient-to-br from-[#F3EDFF] to-white p-8 shadow-lg sm:p-12">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#6C2BD9] text-white">
                <Building2 className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Why canteens should join
                </h2>
                <ul className="mt-4 space-y-2 text-gray-600" role="list">
                  <li className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[#6C2BD9]" aria-hidden />
                    Reach more students during peak hours
                  </li>
                  <li className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-[#6C2BD9]" aria-hidden />
                    Reduce queue congestion and improve service
                  </li>
                  <li className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#6C2BD9]" aria-hidden />
                    Modern digital ordering without complex setup
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-gradient-to-br from-[#6C2BD9] via-[#7C3AED] to-[#5B21B6] p-8 text-center text-white shadow-2xl shadow-[#6C2BD9]/30 sm:p-12">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Ready to order smarter?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/85">
              Browse campus canteens and place your first order in minutes.
            </p>
            <Link
              href="/canteens"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-semibold text-[#6C2BD9] transition-all duration-300 hover:-translate-y-1 hover:bg-[#F4C542] hover:text-[#2E1065]"
            >
              Browse Canteens
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </section>
        </div>
      </PageShell>
      <Footer />
    </>
  );
}

function InfoCard({ title, content }: { title: string; content: string }) {
  return (
    <article className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <p className="mt-3 leading-relaxed text-gray-600">{content}</p>
    </article>
  );
}
