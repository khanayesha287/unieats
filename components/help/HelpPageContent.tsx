import Link from "next/link";
import {
  Search,
  ShoppingBag,
  ShoppingCart,
  ClipboardList,
  MapPin,
  CheckCircle,
  Package,
  MessageCircle,
} from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/constants";

const steps = [
  {
    icon: Search,
    number: "1",
    title: "Browse the Menu",
    description:
      "Explore the available food items from all campus canteens. Browse by category to find your favourite meals, snacks, and drinks.",
  },
  {
    icon: ShoppingBag,
    number: "2",
    title: "Choose Your Food",
    description:
      "Select your favourite items and add them to your cart. You can adjust quantities directly from the cart.",
  },
  {
    icon: ShoppingCart,
    number: "3",
    title: "Review Your Cart",
    description:
      "Check your selected items, quantities, and total amount before placing the order. Make sure everything looks correct.",
  },
  {
    icon: ClipboardList,
    number: "4",
    title: "Enter Your Details",
    description:
      "Provide your Name and Registration Number so your order can be identified and delivered to the right person.",
  },
  {
    icon: MapPin,
    number: "5",
    title: "Choose Order Type",
    description:
      "Select either Pickup — collect your order from the canteen — or Delivery — get your food delivered to your department, hostel, or another suitable location on campus.",
  },
  {
    icon: CheckCircle,
    number: "6",
    title: "Place Your Order",
    description:
      "Confirm your order and submit it. You will receive an Order ID to track and reference your order.",
  },
  {
    icon: Package,
    number: "7",
    title: "Receive Your Order",
    description:
      "For delivery, wait for the order to arrive at your selected campus location. For pickup, collect it from the canteen when it is ready.",
  },
];

export default function HelpPageContent() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm">
          Support — Help Center
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          How to Order Food from UniEats
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
          Ordering food through UniEats is simple. Follow the steps below to
          place your first order in minutes.
        </p>
      </header>

      <ol className="space-y-4" aria-label="How to order food from UniEats">
        {steps.map((step) => (
          <li
            key={step.number}
            className="flex gap-5 rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F3EDFF]">
              <step.icon className="h-5 w-5 text-[#6C2BD9]" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">
                <span className="mr-2 text-[#6C2BD9]">Step {step.number}.</span>
                {step.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section
        className="mt-12 rounded-3xl border border-white/60 bg-white/90 p-8 text-center shadow-xl shadow-[#6C2BD9]/5 backdrop-blur-sm"
        aria-labelledby="help-cta"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3EDFF]">
          <MessageCircle className="h-6 w-6 text-[#6C2BD9]" aria-hidden />
        </div>
        <h2 id="help-cta" className="mt-4 text-xl font-bold text-gray-900">
          Still need help?
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">
          If you have a question or a problem with your order, email UniEats
          Support and provide your Order ID.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 rounded-full bg-[#6C2BD9] px-7 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Email Support
          </a>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[#6C2BD9]/30 bg-white px-7 py-3 text-sm font-semibold text-[#6C2BD9] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#6C2BD9]"
          >
            Contact Page
          </Link>
        </div>
      </section>
    </div>
  );
}
