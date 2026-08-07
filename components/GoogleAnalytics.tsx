"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function pageview(path: string) {
  if (!window.gtag || !GA_ID) return;

  window.gtag("config", GA_ID, {
    page_path: path,
  });
}

export default function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_ID || !window.gtag) return;

    const path = `${pathname}${window.location.search || ""}`;
    pageview(path);
  }, [pathname]);

  return null;
}
