import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#FAF7FF] to-white px-4 pt-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900">Page Not Found</h1>
        <p className="mt-4 max-w-md text-gray-600">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-full bg-[#6C2BD9] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
        >
          Back to Home
        </Link>
      </main>
      <Footer />
    </>
  );
}
