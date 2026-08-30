export type FoodCategory =
  | "meals"
  | "fast-food"
  | "bbq"
  | "drinks"
  | "snacks"
  | "shakes-and-juices"
  | "chai-and-paratha"
  | "desi-food"
  | "chinese-food";

export type CategoryFilter = "all" | FoodCategory;

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
}

export type OrderType = "pickup" | "delivery";

export interface CheckoutFormData {
  studentName: string;
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
}

export interface Order {
  orderNumber: string;
  studentName: string;
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
}
