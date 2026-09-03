import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import ContactPageContent from "@/components/contact/ContactPageContent";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Contact",
  description:
    "Get in touch with UniEats by email or through our contact form for support at UET Lahore.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <PageShell>
        <ContactPageContent />
      </PageShell>
      <Footer />
    </>
  );
}
