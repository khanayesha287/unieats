export type FoodCategory =
  | "meals"
  | "fast-food"
  | "bbq"
  | "drinks"
  | "snacks";

export type CategoryFilter = "all" | FoodCategory;

export interface Canteen {
  slug: string;
  name: string;
  description: string;
  prepTime: string;
  gradient: string;
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
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  canteenSlug: string;
  canteenName: string;
  gradient: string;
}

export type OrderType = "pickup" | "delivery";

export interface CheckoutFormData {
  registrationNumber: string;
  studentName: string;
  phone: string;
  department: string;
  orderType: OrderType;
  deliveryLocation: string;
  specialInstructions: string;
  paymentMethod: "cash-pickup" | "cash-delivery";
}
