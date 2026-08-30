import type { Order } from "@/lib/types";
import { WHATSAPP_URL } from "@/lib/constants";

function formatItems(items: Order["canteenOrders"][number]["items"]): string[] {
  return items.map((item) => `• ${item.name}${item.size ? ` (${item.size})` : ""} ×${item.quantity}`);
}

export function formatWhatsAppOrderMessage(order: Order): string {
  const orderTypeLabel = order.orderType === "pickup" ? "Pickup" : "Delivery";
  const paymentLabel = order.paymentMethod === "cod" ? "Cash on Delivery (COD)" : "Online Payment";
  const lines: string[] = [];

  lines.push("\u2022 New UniEats Order");
  lines.push("");
  lines.push("*Order No:* " + order.orderNumber);
  lines.push("");
  lines.push("*Name:* " + order.studentName);
  lines.push("*Phone Number:* " + order.phone);
  lines.push("*Department:* " + order.department);
  lines.push("*Order Type:* " + orderTypeLabel);

  if (order.orderType === "delivery" && order.deliveryLocation) {
    lines.push("*Delivery Location:* " + order.deliveryLocation);
  }

  lines.push("*Payment Method:* " + paymentLabel);

  order.canteenOrders.forEach((group) => {
    lines.push("");
    lines.push("*Canteen: " + group.canteenName + "*");
    lines.push("Items:");
    lines.push(...formatItems(group.items));
  });

  lines.push("");
  lines.push("Total: Rs." + order.subtotal);

  if (order.deliveryFee > 0) {
    lines.push("Delivery Charges: Rs." + order.deliveryFee);
  }

  lines.push("Grand Total: Rs." + order.grandTotal);

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