import type { Canteen } from "@/lib/types";

export const canteens: Canteen[] = [
  {
    slug: "ssc",
    name: "SSC Canteen",
    description: "Engineering students' favourite.",
    prepTime: "10–15 min",
    gradient: "from-[#6C2BD9] via-[#8B5CF6] to-[#A78BFA]",
    image: "/ssc-building.jpg.jpeg",
  },
];

export function getCanteenBySlug(slug: string): Canteen | undefined {
  return canteens.find((c) => c.slug === slug);
}

export function getCanteenName(slug: string): string {
  return getCanteenBySlug(slug)?.name ?? "Canteen";
}
