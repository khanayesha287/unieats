import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import CheckoutPageContent from "@/components/checkout/CheckoutPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Checkout",
  description:
    "Complete your UniEats order with student details, delivery preferences, and payment method.",
  path: "/checkout",
  noIndex: true,
});

export default function CheckoutPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <CheckoutPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
