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
  return items.map((item) => `• ${item.name} ×${item.quantity}`);
}

export function formatWhatsAppOrderMessage(order: Order): string {
  const orderTypeLabel = order.orderType === "pickup" ? "Pickup" : "Delivery";
  const isMultiple = order.canteenOrders.length > 1;

  const lines: string[] = [];

  // Header
  lines.push("*New UniEats Order*");
  lines.push(`• *Order:* ${order.orderNumber}`);
  lines.push(`• *Date & Time:* ${formatDateAndTime(order.timestamp)}`);
  lines.push(`• *Type:* ${orderTypeLabel}`);

  if (order.orderType === "delivery" && order.deliveryLocation) {
    lines.push(`• *Location:* ${order.deliveryLocation}`);
  }

  // Customer details shown once, up top, only when multiple canteens
  if (isMultiple) {
    lines.push(`• *Name:* ${order.studentName}`);
    lines.push(`• *Reg No:* ${order.registrationNumber}`);
    lines.push(`• *Phone:* ${order.phone}`);
  }

  if (order.specialInstructions) {
    lines.push(`• *Instructions:* ${order.specialInstructions}`);
  }

  // Canteen sections
  order.canteenOrders.forEach((group) => {
    lines.push(`*${group.canteenName}*`);

    // Single canteen: customer details go inside the canteen block
    if (!isMultiple) {
      lines.push(`• *Name:* ${order.studentName}`);
      lines.push(`• *Reg No:* ${order.registrationNumber}`);
      lines.push(`• *Phone:* ${order.phone}`);
    }

    lines.push(...formatItems(group.items));
    lines.push(`• *Total:* Rs.${group.subtotal}`);
  });

  // Delivery fee + grand total
  if (order.deliveryFee > 0) {
    lines.push(`• *Delivery Fee:* Rs.${order.deliveryFee}`);
    lines.push(`• *Grand Total:* Rs.${order.grandTotal}`);
  } else if (isMultiple) {
    lines.push(`• *Grand Total:* Rs.${order.grandTotal}`);
  }

  return lines.join("\n");
}

export function buildWhatsAppUrl(message: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}