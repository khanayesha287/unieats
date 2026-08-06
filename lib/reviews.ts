export interface Review {
  id: string;
  name: string;
  rating: number;
  message: string;
  createdAt: string;
}

const STORAGE_KEY = "unieats-student-reviews";

export const sampleReviews: Review[] = [
  {
    id: "sample-1",
    name: "Ayesha",
    rating: 5,
    message: "Fast ordering and super reliable during lunch breaks.",
    createdAt: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "sample-2",
    name: "Bilal",
    rating: 5,
    message: "The campus delivery option saved me so much time.",
    createdAt: "2026-08-02T12:30:00.000Z",
  },
  {
    id: "sample-3",
    name: "Hina",
    rating: 4,
    message: "Great food choices and the checkout flow feels very simple.",
    createdAt: "2026-08-03T14:15:00.000Z",
  },
  {
    id: "sample-4",
    name: "Usman",
    rating: 5,
    message: "I love how quickly I can order from my favorite canteen.",
    createdAt: "2026-08-04T09:45:00.000Z",
  },
];

export function getStoredReviews(): Review[] {
  if (typeof window === "undefined") {
    return sampleReviews;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return sampleReviews;
    }

    const parsed = JSON.parse(stored) as Review[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : sampleReviews;
  } catch {
    return sampleReviews;
  }
}

export function saveReview(review: Omit<Review, "id" | "createdAt">): Review[] {
  const nextReview: Review = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...review,
  };

  const existing = getStoredReviews();
  const updated = [nextReview, ...existing].slice(0, 12);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  return updated;
}
