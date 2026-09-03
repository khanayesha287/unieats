export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://unieats.pk";


export const INSTAGRAM_URL = "https://www.instagram.com/unieats_uet";

export const CONTACT_EMAIL = "unieats.uet@gmail.com";

export const DELIVERY_FEE_PER_CANTEEN = 25;
export const DELIVERY_ACTUAL = 50;
export const DELIVERY_CHARGED = 25;

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
  { id: "fast-food" as const, label: "Fast Food" },
  { id: "shakes-and-juices" as const, label: "Shakes & Juices" },
  { id: "chai-and-paratha" as const, label: "Chai & Paratha" },
  { id: "desi-food" as const, label: "Desi Food" },
  { id: "chinese-food" as const, label: "Chinese Food" },
];
