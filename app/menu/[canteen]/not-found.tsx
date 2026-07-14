import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";

export default function MenuNotFound() {
  return (
    <>
      <Navbar />
      <PageShell>
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-3xl font-bold text-white">Canteen Not Found</h1>
          <p className="mt-4 text-white/80">
            This canteen menu doesn&apos;t exist. Browse available canteens instead.
          </p>
          <Link
            href="/canteens"
            className="mt-8 inline-flex rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
          >
            Browse Canteens
          </Link>
        </div>
      </PageShell>
      <Footer />
    </>
  );
}
