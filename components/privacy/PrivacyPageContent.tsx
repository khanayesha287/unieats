import { MessageCircle } from "lucide-react";
import { CONTACT_EMAIL } from "@/lib/constants";

const sections = [
  {
    number: "1",
    title: "Information We Collect",
    content:
      "When you place an order, we may collect your name, registration number, contact details, order details, and delivery information.",
  },
  {
    number: "2",
    title: "How We Use Your Information",
    content:
      "Your information is used to process orders, arrange delivery or pickup, provide support, and improve our services.",
  },
  {
    number: "3",
    title: "Information Sharing",
    content:
      "We do not sell or rent your personal information. Information may be shared with the relevant canteen or delivery personnel only when necessary to fulfil your order.",
  },
  {
    number: "4",
    title: "Data Protection",
    content:
      "We take reasonable steps to protect your information. However, no online service can guarantee complete security.",
  },
  {
    number: "5",
    title: "Analytics & Cookies",
    content:
      "UniEats may use Google Analytics and cookies to understand website usage, improve performance, and enhance the user experience. Analytics are not intended to collect personal order information.",
  },
  {
    number: "6",
    title: "Changes to This Policy",
    content:
      "We may update this Privacy Policy when necessary. Updates will be published on this website.",
  },
  {
    number: "7",
    title: "Contact Us",
    content:
      "For privacy questions or concerns, please contact UniEats Support through the contact option provided on the website.",
  },
];

export default function PrivacyPageContent() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-12 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm">
          Legal
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Privacy Policy
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
          UniEats respects your privacy and is committed to protecting your
          information.
        </p>
        <p className="mt-2 text-sm text-white/60">Last Updated: August 2026</p>
      </header>

      <div className="space-y-4">
        {sections.map((sec) => (
          <section
            key={sec.number}
            className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-lg shadow-[#6C2BD9]/5 backdrop-blur-sm sm:p-8"
            aria-labelledby={`privacy-${sec.number}`}
          >
            <h2
              id={`privacy-${sec.number}`}
              className="flex items-center gap-2 text-base font-bold text-gray-900 sm:text-lg"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3EDFF] text-sm font-bold text-[#6C2BD9]">
                {sec.number}
              </span>
              {sec.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              {sec.content}
            </p>
          </section>
        ))}
      </div>

      <section
        className="mt-10 rounded-3xl border border-white/60 bg-white/90 p-8 text-center shadow-xl shadow-[#6C2BD9]/5 backdrop-blur-sm"
        aria-labelledby="privacy-contact"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3EDFF]">
          <MessageCircle className="h-6 w-6 text-[#6C2BD9]" aria-hidden />
        </div>
        <h2 id="privacy-contact" className="mt-4 text-xl font-bold text-gray-900">
          Privacy questions?
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">
          Contact UniEats Support by email for any privacy-related questions
          or concerns.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#6C2BD9] px-7 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#F4C542] hover:text-[#2E1065]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Email Support
        </a>
      </section>
    </div>
  );
}
