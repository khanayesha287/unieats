"use client";

import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import type { Canteen } from "@/lib/types";

interface ComingSoonCanteenContentProps {
  canteen: Canteen;
}

export default function ComingSoonCanteenContent({ canteen }: ComingSoonCanteenContentProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#6C2BD9]">
            {canteen.name}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Coming Soon
          </h1>
          <p className="mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
            {canteen.description}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-lg rounded-3xl border border-white/60 bg-white/90 p-10 text-center shadow-xl backdrop-blur-sm">
        <div className={"mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br " + canteen.gradient + " shadow-lg"}>
          <Clock className="h-10 w-10 text-white" aria-hidden />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Menu Coming Soon</h2>
        <p className="mt-3 text-gray-600">
          The menu for {canteen.name} will be available shortly.
          Check back soon!
        </p>
        <Link
          href="/canteens"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5B21B6]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Canteens
        </Link>
      </div>
    </div>
  );
}
