import type { CartItem, CheckoutFormData } from "@/lib/types";
import { WHATSAPP_NUMBER } from "@/lib/constants";

export function formatWhatsAppOrderMessage(
  form: CheckoutFormData,
  items: CartItem[],
  total: number,
): string {
  const itemLines = items
    .map((item) => `${item.quantity} × ${item.name} - Rs.${item.price * item.quantity}`)
    .join("\n\n");

  const lines = [
    "🍔 New UniEats Order",
    "",
    "👤 Student:",
    form.studentName,
    "",
    "🎓 Registration:",
    form.registrationNumber,
    "",
    "📞 Phone:",
    form.phone,
    "",
    "🏫 Department:",
    form.department,
    "",
    "📍 Order Type:",
    form.orderType === "pickup" ? "Pickup" : "Campus Delivery",
  ];

  if (form.orderType === "delivery" && form.deliveryLocation) {
    lines.push("", "📌 Delivery Location:", form.deliveryLocation);
  }

  if (form.specialInstructions.trim()) {
    lines.push("", "📝 Special Instructions:", form.specialInstructions.trim());
  }

  lines.push(
    "",
    "🛒 Items",
    "",
    itemLines,
    "",
    "💰 Total:",
    `Rs.${total}`,
    "",
    "Thank you for choosing UniEats.",
  );

  return lines.join("\n");
}

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
