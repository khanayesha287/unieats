import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import AllMenuPageContent from "@/components/menu/AllMenuPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Full Menu",
  description:
    "Browse the full UniEats menu from all UET Lahore campus canteens. Meals, fast food, BBQ, drinks and snacks.",
  path: "/menu",
});

export default function MenuPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <AllMenuPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
