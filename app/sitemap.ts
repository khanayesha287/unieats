import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { canteens } from "@/lib/data/canteens";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/canteens",
    "/menu",
    "/cart",
    "/checkout",
    "/contact",
    "/about",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.8,
  }));

  const menuRoutes = canteens.map((canteen) => ({
    url: `${SITE_URL}/menu/${canteen.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...menuRoutes];
}
