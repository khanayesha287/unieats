import Image from "next/image";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { FaInstagram } from "react-icons/fa";
import {
  CONTACT_EMAIL,
  INSTAGRAM_URL,
  WHATSAPP_DISPLAY,
  WHATSAPP_URL,
} from "@/lib/constants";

const quickLinks = [
  { label: "Home", href: "/" },
  { label: "Canteens", href: "/canteens" },
  { label: "Menu", href: "/menu" },
  { label: "Contact", href: "/contact" },
];

const supportLinks = [
  { label: "Help Center", href: "/help" },
  { label: "FAQs", href: "/faqs" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
];

export default function Footer() {
  return (
    <footer
      className="bg-gradient-to-b from-[#2E1065] to-[#4C1D95] text-white"
      role="contentinfo"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="inline-flex items-center gap-3" aria-label="UniEats home">
              <Image
                src="/logo.png"
                alt="UniEats logo"
                width={48}
                height={48}
                className="h-12 w-12 rounded-xl object-cover"
              />
              <div>
                <p className="text-lg font-bold text-[#F4C542]">UniEats</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
                  Order • Pickup • Enjoy
                </p>
              </div>
            </Link>

            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
              UniEats makes ordering food from UET Lahore campus canteens faster,
              easier and smarter.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#F4C542]">
              Quick Links
            </h3>

            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-[#F4C542] hover:underline hover:underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#F4C542]">
              Support
            </h3>

            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-[#F4C542] hover:underline hover:underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#F4C542]">
              Contact
            </h3>

            <ul className="space-y-4 text-sm">
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-3 text-white/70 transition-colors hover:text-[#F4C542]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 group-hover:bg-[#F4C542]/20">
                    <MessageCircle className="h-4 w-4" />
                  </span>

                  <span>
                    <span className="block font-medium text-white/90">
                      WhatsApp
                    </span>
                    {WHATSAPP_DISPLAY}
                  </span>
                </a>
              </li>

              <li>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-3 text-white/70 transition-colors hover:text-[#F4C542]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 group-hover:bg-[#F4C542]/20">
                    <FaInstagram className="h-4 w-4" />
                  </span>

                  <span>
                    <span className="block font-medium text-white/90">
                      Instagram
                    </span>
                    @unieats_uet
                  </span>
                </a>
              </li>

              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="group inline-flex items-center gap-3 text-white/70 transition-colors hover:text-[#F4C542]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 group-hover:bg-[#F4C542]/20">
                    <Mail className="h-4 w-4" />
                  </span>

                  <span>
                    <span className="block font-medium text-white/90">
                      Email
                    </span>
                    {CONTACT_EMAIL}
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-sm text-white/60">
            © 2026 UniEats. All Rights Reserved.
          </p>

          <p className="text-sm text-white/60">
            Made with ❤️ for UET Lahore Students
          </p>
        </div>
      </div>
    </footer>
  );
}