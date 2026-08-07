import type { Order } from "@/lib/types";
import { WHATSAPP_URL } from "@/lib/constants";

function formatItems(items: Order["canteenOrders"][number]["items"]): string[] {
  return items.map((item) => `• ${item.name}${item.size ? ` (${item.size})` : ""} ×${item.quantity}`);
}

export function formatWhatsAppOrderMessage(order: Order): string {
  const orderTypeLabel = order.orderType === "pickup" ? "Pickup" : "Delivery";
  const lines: string[] = [];

  lines.push("• New UniEats Order");
  lines.push("");
  lines.push(`Order #${order.orderNumber}`);
  lines.push("");
  lines.push(`Order Type: ${orderTypeLabel}`);

  if (order.orderType === "delivery" && order.deliveryLocation) {
    lines.push(`Delivery Location: ${order.deliveryLocation}`);
  }

  lines.push("");
  lines.push("Student:");
  lines.push(order.studentName);
  lines.push("Registration:");
  lines.push(order.registrationNumber);
  lines.push("Phone:");
  lines.push(order.phone);

  order.canteenOrders.forEach((group) => {
    lines.push("");
    lines.push(group.canteenName);
    lines.push("Items:");
    lines.push(...formatItems(group.items));
  });

  lines.push("");
  lines.push("Total:");
  lines.push(`Rs.${order.subtotal}`);

  if (order.deliveryFee > 0) {
    lines.push("Delivery Charges:");
    lines.push(`Rs.${order.deliveryFee}`);
  }

  lines.push("Grand Total:");
  lines.push(`Rs.${order.grandTotal}`);

  return lines.join("\n");
}

export function buildWhatsAppUrl(message: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppReviewMessage(review: string): string {
  return [
    "• New UniEats Review",
    "",
    "Review:",
    review,
  ].join("\n");
}