import { DELIVERY_FEE_PER_CANTEEN } from "@/lib/constants";
import type {
  CartItem,
  CanteenOrderGroup,
  CheckoutFormData,
  Order,
  OrderType,
} from "@/lib/types";

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function calculateItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function getUniqueCanteenCount(items: CartItem[]): number {
  return new Set(items.map((item) => item.canteenSlug)).size;
}

export function calculateDeliveryFee(
  items: CartItem[],
  orderType: OrderType,
): number {
  if (orderType !== "delivery" || items.length === 0) return 0;
  return DELIVERY_FEE_PER_CANTEEN;
}

export function groupItemsByCanteen(items: CartItem[]): CanteenOrderGroup[] {
  const groups = new Map<string, CanteenOrderGroup>();

  for (const item of items) {
    const existing = groups.get(item.canteenSlug);
    if (existing) {
      existing.items.push(item);
      existing.subtotal += item.price * item.quantity;
    } else {
      groups.set(item.canteenSlug, {
        canteenSlug: item.canteenSlug,
        canteenName: item.canteenName,
        items: [item],
        subtotal: item.price * item.quantity,
      });
    }
  }

  return Array.from(groups.values());
}

export function buildOrder(
  orderNumber: string,
  form: CheckoutFormData,
  items: CartItem[],
): Order {
  const canteenOrders = groupItemsByCanteen(items);
  const subtotal = calculateSubtotal(items);
  const deliveryFee = calculateDeliveryFee(items, form.orderType);

  return {
    orderNumber,
    studentName: form.studentName,
    registrationNumber: form.registrationNumber,
    phone: form.phone,
    department: form.department,
    orderType: form.orderType,
    deliveryLocation:
      form.orderType === "delivery" ? form.deliveryLocation : undefined,
    specialInstructions: form.specialInstructions.trim() || undefined,
    paymentMethod: form.paymentMethod,
    canteenOrders,
    subtotal,
    deliveryFee,
    grandTotal: subtotal + deliveryFee,
    timestamp: new Date().toISOString(),
  };
}

export function generateOrderNumber(): string {
  return String(Math.floor(Math.random() * 9000) + 1000);
}

export function formatOrderTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoTimestamp));
}
