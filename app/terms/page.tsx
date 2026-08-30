import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import TermsPageContent from "@/components/terms/TermsPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Terms & Conditions",
  description:
    "Read the UniEats Terms & Conditions. Understand our policies on orders, payment, delivery, pickup, menu availability, and service at UET Lahore.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <TermsPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
