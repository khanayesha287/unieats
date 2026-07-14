import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";

const defaultTitle = "UniEats | Order Food from UET Lahore Campus Canteens";
const defaultDescription =
  "Order food online from UET Lahore campus canteens. Choose pickup or campus delivery and skip the queue.";

export function createMetadata({
  title,
  description = defaultDescription,
  path = "",
  noIndex = false,
}: {
  title: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title === "UniEats" ? defaultTitle : `${title} | UniEats`;

  return {
    title: fullTitle,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "en_PK",
      url,
      siteName: "UniEats",
      title: fullTitle,
      description,
      images: [{ url: "/logo.png", width: 512, height: 512, alt: "UniEats Logo" }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ["/logo.png"],
    },
  };
}

export const rootMetadata: Metadata = {
  ...createMetadata({ title: "UniEats", path: "/" }),
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};
