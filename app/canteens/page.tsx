import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import CanteensPageContent from "@/components/menu/CanteensPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "UET Lahore Canteens",
  description: "Browse all UET Lahore campus canteens. Order online from SSC, GSSC, Bhola, Annexe, and Hot Potato canteens.",
  path: "/canteens",
});

export default function CanteensPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <CanteensPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
