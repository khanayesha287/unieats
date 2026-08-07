import type { Order } from "@/lib/types";
import { WHATSAPP_URL } from "@/lib/constants";
// import { formatOrderTime } from "@/lib/cart-utils"; // swap in below if it already returns "DD MMM YYYY, h:mm A"

/**
 * Formats a timestamp as "19 Jul 2026, 6:45 PM".
 * Replace the body with `return formatOrderTime(timestamp);`
 * if your existing helper already outputs this exact combined format.
 */
function formatDateAndTime(timestamp: string | number | Date): string {
  const date = new Date(timestamp);
  const datePart = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi", // ensures correct time regardless of server location
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  });
  return `${datePart}, ${timePart}`;
}

function formatItems(items: Order["canteenOrders"][number]["items"]): string[] {
  return items.map((item) => `• ${item.name}${item.size ? ` (${item.size})` : ""} ×${item.quantity}`);
}

export function formatWhatsAppOrderMessage(order: Order): string {
  const orderTypeLabel = order.orderType === "pickup" ? "Pickup" : "Delivery";

  const lines: string[] = [];

  lines.push("*New UniEats Order*");
  lines.push(`*Order ID:* ${order.orderNumber}`);
  lines.push(`*Date & Time:* ${formatDateAndTime(order.timestamp)}`);
  lines.push(`*Order Type:* ${orderTypeLabel}`);

  if (order.orderType === "delivery" && order.deliveryLocation) {
    lines.push(`*Delivery Location:* ${order.deliveryLocation}`);
  }

  lines.push(`*Student Name:* ${order.studentName}`);
  lines.push(`*Registration Number:* ${order.registrationNumber}`);
  lines.push(`*Phone Number:* ${order.phone}`);

  if (order.specialInstructions) {
    lines.push(`*Instructions:* ${order.specialInstructions}`);
  }

  order.canteenOrders.forEach((group) => {
    lines.push(`*Canteen:* ${group.canteenName}`);
    lines.push(...formatItems(group.items));
  });

  if (order.deliveryFee > 0) {
    lines.push(`*Delivery Fee:* Rs.${order.deliveryFee}`);
  }

  lines.push(`*Grand Total:* Rs.${order.grandTotal}`);

  return lines.join("\n");
}

export function buildWhatsAppUrl(message: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppReviewMessage(rating: number, review: string): string {
  const stars = "⭐".repeat(Math.max(1, Math.min(5, rating)));

  return [
    "--------------------------------",
    "",
    "• New UniEats Review",
    "",
    `**Rating:** ${stars}`,
    "",
    "**Review:**",
    review,
    "",
    "--------------------------------",
  ].join("\n");
}