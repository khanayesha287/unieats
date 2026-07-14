import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import CartPageContent from "@/components/cart/CartPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Shopping Cart",
  description:
    "Review your UniEats order, adjust quantities, and proceed to checkout.",
  path: "/cart",
  noIndex: true,
});

export default function CartPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <CartPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
