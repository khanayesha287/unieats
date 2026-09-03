export type TrackingStatus =
  | "pending"
  | "confirmed"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export interface TrackedOrderItem {
  id: string | number;
  itemName: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface TrackedOrder {
  id: string;
  orderNumber: string;
  studentName: string;
  orderType: "pickup" | "delivery";
  deliveryLocation: string | null;
  canteenName: string;
  status: TrackingStatus;
  totalAmount: number;
  deliveryCharge: number;
  createdAt: string | null;
  items: TrackedOrderItem[];
}

export interface TrackingReference {
  token: string;
  orderIds: string[];
}

export const TRACKING_STORAGE_KEY = "unieats-order-tracking";

export function createTrackingToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function hashTrackingToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function rememberTrackingReference(reference: TrackingReference): void {
  if (typeof window === "undefined") return;
  try {
    const current = JSON.parse(
      window.localStorage.getItem(TRACKING_STORAGE_KEY) ?? "[]",
    ) as TrackingReference[];
    const next = [
      reference,
      ...current.filter((entry) => entry.token !== reference.token),
    ].slice(0, 10);
    window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Tracking still works on the success page when storage is unavailable.
  }
}

export function readTrackingReferences(): TrackingReference[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TRACKING_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is TrackingReference =>
        Boolean(
          entry &&
            typeof entry.token === "string" &&
            Array.isArray(entry.orderIds) &&
            entry.orderIds.every((id: unknown) => typeof id === "string"),
        ),
    );
  } catch {
    return [];
  }
}
