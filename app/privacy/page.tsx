import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import PrivacyPageContent from "@/components/privacy/PrivacyPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Privacy Policy",
  description:
    "Read the UniEats Privacy Policy. Understand how we collect, use, and protect your information when you use our food ordering platform at UET Lahore.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <PrivacyPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
