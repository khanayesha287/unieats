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
];

export function getCanteenBySlug(slug: string): Canteen | undefined {
  return canteens.find((c) => c.slug === slug);
}

export function getCanteenName(slug: string): string {
  return getCanteenBySlug(slug)?.name ?? "Canteen";
}
