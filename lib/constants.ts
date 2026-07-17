export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://unieats.pk";

export const WHATSAPP_NUMBER = "923424019343";
export const WHATSAPP_URL = "https://wa.me/923424019343";
export const WHATSAPP_DISPLAY = "+92 342 4019343";

export const INSTAGRAM_URL =
  "https://www.instagram.com/unieats_uet?igsh=dTR5MDE0ZDB1amN1";

export const CONTACT_EMAIL = "unieats.uet@gmail.com";

export const DELIVERY_FEE_PER_CANTEEN = 45;

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
