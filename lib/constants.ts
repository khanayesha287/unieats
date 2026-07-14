export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://unieats.pk";

export const WHATSAPP_NUMBER = "923197157979";

export const DELIVERY_FEE = 50;

export const DEPARTMENTS = [
  "Computer Science",
  "Mechanical Engineering",
  "Electrical Engineering",
  "Civil Engineering",
  "Chemical Engineering",
  "Architecture",
  "Other",
] as const;

export const FOOD_CATEGORIES = [
  { id: "all" as const, label: "All" },
  { id: "meals" as const, label: "Meals" },
  { id: "fast-food" as const, label: "Fast Food" },
  { id: "bbq" as const, label: "BBQ" },
  { id: "drinks" as const, label: "Drinks" },
  { id: "snacks" as const, label: "Snacks" },
];
