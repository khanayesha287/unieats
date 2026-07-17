import type { Order } from "@/lib/types";
import { WHATSAPP_URL } from "@/lib/constants";
import { formatOrderTime } from "@/lib/cart-utils";

function formatCanteenBlock(order: Order, group: Order["canteenOrders"][number]): string {
  const itemLines = group.items
    .map((item) => `${item.name} ×${item.quantity}`)
    .join("\n");

  const lines = [
    group.canteenName,
    "",
    "Student:",
    order.studentName,
    "",
    "Registration:",
    order.registrationNumber,
    "",
    "Phone:",
    order.phone,
    "",
    "Items:",
    itemLines,
    "",
    "Total:",
    `Rs.${group.subtotal}`,
  ];

  return lines.join("\n");
}

export function formatWhatsAppOrderMessage(order: Order): string {
  const orderTypeLabel =
    order.orderType === "pickup" ? "Pickup" : "Delivery";

  const header = [
    "🍔 New UniEats Order",
    "",
    `Order #: ${order.orderNumber}`,
    `Time: ${formatOrderTime(order.timestamp)}`,
    "",
    "Order Type:",
    orderTypeLabel,
  ];

  if (order.orderType === "delivery" && order.deliveryLocation) {
    header.push("", "Delivery Location:", order.deliveryLocation);
  }

  if (order.specialInstructions) {
    header.push("", "Special Instructions:", order.specialInstructions);
  }

  const canteenBlocks = order.canteenOrders.map((group) =>
    formatCanteenBlock(order, group),
  );

  const footer: string[] = [];

  if (order.deliveryFee > 0) {
    footer.push(
      "",
      `Delivery Fee: Rs.${order.deliveryFee} (${order.canteenOrders.length} canteen${order.canteenOrders.length > 1 ? "s" : ""} × Rs.100)`,
    );
  }

  footer.push("", "Grand Total:", `Rs.${order.grandTotal}`, "", "Thank you for choosing UniEats.");

  return [...header, "", "------------------------------------", "", ...canteenBlocks.flatMap((block, index) =>
    index < canteenBlocks.length - 1
      ? [block, "", "------------------------------------", ""]
      : [block],
  ), ...footer].join("\n");
}

export function buildWhatsAppUrl(message: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}
