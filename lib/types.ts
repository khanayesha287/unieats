export type FoodCategory =
  | "meals"
  | "fast-food"
  | "bbq"
  | "drinks"
  | "snacks"
  | "shakes-and-juices"
  | "chai-and-paratha"
  | "desi-food"
  | "chinese-food"
  | "tea";

export type CategoryFilter = "all" | FoodCategory;

export type MenuSection = "karahi" | "desi-food" | "shakes-and-juices" | "tang-and-drinks";

export interface Canteen {
  slug: string;
  name: string;
  description: string;
  prepTime: string;
  gradient: string;
  image?: string;
  status: "active" | "coming-soon";
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: FoodCategory;
  rating: number;
  available: boolean;
  canteenSlug: string;
  gradient: string;
  image?: string;
  sizes?: Record<string, number>;
  menuSection?: MenuSection;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  canteenSlug: string;
  canteenName: string;
  gradient: string;
  size?: string;
  /** Resolved database canteen ID (optional — resolved at checkout if absent). */
  canteenId?: string | number | null;
}

export type OrderType = "pickup" | "delivery";

/**
 * Canonical order-status type shared across all portals.
 * Status flow: pending → confirmed → preparing → ready → out_for_delivery → delivered → completed
 * Any status can transition to cancelled.
 */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export interface CheckoutFormData {
  studentName: string;
  /** University registration number (guest checkout — optional identifier). */
  registrationNumber: string;
  phone: string;
  department: string;
  orderType: OrderType;
  deliveryLocation: string;
  specialInstructions: string;
  paymentMethod: "cod" | "online";
}

export interface CanteenOrderGroup {
  canteenSlug: string;
  canteenName: string;
  items: CartItem[];
  subtotal: number;
  /** Unique 3-digit order number assigned at insert time (populated by saveOrderToSupabase). */
  orderNumber?: string;
  /** Database order ID populated after the group is saved. */
  orderId?: string | number;
}

export interface Order {
  orderNumber: string;
  studentName: string;
  /** University registration number, if provided at checkout. */
  registrationNumber?: string;
  phone: string;
  department: string;
  orderType: OrderType;
  deliveryLocation?: string;
  specialInstructions?: string;
  paymentMethod: "cod" | "online";
  canteenOrders: CanteenOrderGroup[];
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  timestamp: string;
  /** Guest tracking token retained only in browser storage, never sent as a database field. */
  trackingToken?: string;
}
