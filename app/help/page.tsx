import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import HelpPageContent from "@/components/help/HelpPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Help Center",
  description:
    "Learn how to order food from UniEats at UET Lahore. Step-by-step guide to browsing the menu, placing an order, and choosing pickup or delivery.",
  path: "/help",
});

export default function HelpPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <HelpPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
