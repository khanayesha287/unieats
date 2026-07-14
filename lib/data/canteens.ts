import type { Canteen } from "@/lib/types";

export const canteens: Canteen[] = [
  {
    slug: "bssc",
    name: "BSSC Canteen",
    description: "Engineering students' favourite.",
    prepTime: "10–15 min",
    gradient: "from-[#6C2BD9] via-[#8B5CF6] to-[#A78BFA]",
  },
  {
    slug: "bhola",
    name: "Bhola Canteen",
    description: "Burgers, Shawarma & Fast Food.",
    prepTime: "12–18 min",
    gradient: "from-[#7C3AED] via-[#6C2BD9] to-[#9333EA]",
  },
  {
    slug: "iqbal",
    name: "Iqbal Canteen",
    description: "Traditional Pakistani Meals.",
    prepTime: "15–20 min",
    gradient: "from-[#5B21B6] via-[#7C3AED] to-[#8B5CF6]",
  },
  {
    slug: "gssc",
    name: "GSSC Canteen",
    description: "Tea, Snacks & Student Deals.",
    prepTime: "8–12 min",
    gradient: "from-[#6C2BD9] via-[#9333EA] to-[#C084FC]",
  },
  {
    slug: "annexe",
    name: "Annexe Canteen",
    description: "Pizza, Fries & Drinks.",
    prepTime: "10–15 min",
    gradient: "from-[#4C1D95] via-[#6C2BD9] to-[#A855F7]",
  },
  {
    slug: "lalazar",
    name: "Lalazar Canteen",
    description: "BBQ, Rice & Fresh Juices.",
    prepTime: "15–20 min",
    gradient: "from-[#581C87] via-[#7E22CE] to-[#9333EA]",
  },
];

export function getCanteenBySlug(slug: string): Canteen | undefined {
  return canteens.find((c) => c.slug === slug);
}

export function getCanteenName(slug: string): string {
  return getCanteenBySlug(slug)?.name ?? "Canteen";
}
