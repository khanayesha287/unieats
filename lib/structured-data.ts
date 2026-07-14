import { SITE_URL } from "@/lib/constants";

export function getOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "UniEats",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      "Order food online from UET Lahore campus canteens. Choose pickup or campus delivery.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Lahore",
      addressRegion: "Punjab",
      addressCountry: "PK",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@unieats.pk",
      availableLanguage: ["English", "Urdu"],
    },
  };
}

export function getWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "UniEats",
    url: SITE_URL,
    description:
      "Order food online from UET Lahore campus canteens.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/menu?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
