import type { Canteen } from "@/lib/types";

export const canteens: Canteen[] = [
  {
    slug: "ssc",
    name: "SSC Canteen",
    description: "Engineering students' favourite — fast food, desi meals, shakes and more.",
    prepTime: "10–15 min",
    gradient: "from-[#6C2BD9] via-[#8B5CF6] to-[#A78BFA]",
    image: "/ssc-building.jpg.jpeg",
    status: "active",
  },
  {
    slug: "gssc",
    name: "GSSC Canteen",
    description: "Rolls, samosas, snacks, and quick bites for UET students.",
    prepTime: "5–10 min",
    gradient: "from-[#059669] via-[#10B981] to-[#34D399]",
    status: "active",
  },
  {
    slug: "bhola",
    name: "Bhola Canteen",
    description: "Fresh karahi, desi food, shakes, juices, and refreshing drinks.",
    prepTime: "10–15 min",
    gradient: "from-[#D97706] via-[#F59E0B] to-[#FCD34D]",
    status: "active",
  },
  {
    slug: "annexe",
    name: "Annexe Canteen",
    description: "Refreshing shakes and cold drinks for a quick break.",
    prepTime: "10–15 min",
    gradient: "from-[#DC2626] via-[#EF4444] to-[#FCA5A5]",
    status: "active",
  },
  {
    slug: "hot-potato",
    name: "Hot Potato",
    description: "Sandwiches, fries, teas, and quick bites — fresh and flavourful.",
    prepTime: "10–15 min",
    gradient: "from-[#7C3AED] via-[#8B5CF6] to-[#C4B5FD]",
    status: "active",
  },
];

export function getCanteenBySlug(slug: string): Canteen | undefined {
  return canteens.find((c) => c.slug === slug);
}

export function getCanteenName(slug: string): string {
  return getCanteenBySlug(slug)?.name ?? "Canteen";
}
