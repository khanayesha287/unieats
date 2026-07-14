import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import OrderSuccessContent from "@/components/order-success/OrderSuccessContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Order Placed",
  description: "Your UniEats order has been placed successfully.",
  path: "/order-success",
  noIndex: true,
});

export default function OrderSuccessPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <OrderSuccessContent />
      </PageShell>
      <Footer />
    </>
  );
}
