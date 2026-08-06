import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Canteens from "@/components/Canteens";
import Footer from "@/components/Footer";
import Testimonials from "@/components/Testimonials";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({
  title: "UniEats",
  description:
    "Order food online from UET Lahore campus canteens. Choose pickup or campus delivery and skip the queue.",
  path: "/",
});

const FeaturedMenu = dynamic(() => import("@/components/FeaturedMenu"), {
  loading: () => <SectionSkeleton />,
});
const CTA = dynamic(() => import("@/components/CTA"), {
  loading: () => <SectionSkeleton />,
});

function SectionSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl animate-pulse px-4 py-20 sm:px-6 lg:px-8"
      aria-hidden
    >
      <div className="mx-auto mb-10 h-10 max-w-md rounded-xl bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-48 rounded-3xl bg-gray-100" />
        <div className="h-48 rounded-3xl bg-gray-100" />
        <div className="h-48 rounded-3xl bg-gray-100" />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Canteens />
        <FeaturedMenu />
        <CTA />
        <Testimonials />
      </main>
      <Footer />
    </>
  );
}
