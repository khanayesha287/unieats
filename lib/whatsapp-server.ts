export type OrderRecord = {
  id: string;
  order_number: string;
  student_name: string;
  registration_number?: string | null;
  phone: string;
  department?: string | null;
  order_type: string;
  delivery_location?: string | null;
  total_amount: number;
  payment_method?: string | null;
  created_at?: string | null;
  driver_name?: string | null;
}

export type OrderItemRecord = {
  item_name: string;
  quantity: number;
};

export interface WhatsAppSendResult {
  providerMessageId: string | null;
}

function cleanText(value: unknown, fallback: string, maxLength = 180): string {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  const cleaned = text.replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
  return cleaned || fallback;
}

function formatAmount(value: unknown): string {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toLocaleString("en-PK") : "0";
}

function formatTime(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-PK", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatWhatsAppStatusNotification(
  eventType: string,
  order: OrderRecord,
  canteenName: string,
): string {
  const orderId = cleanText(order.order_number, order.id);
  const canteen = cleanText(canteenName, "Unknown canteen");
  const location = order.delivery_location && order.order_type === "delivery"
    ? `\n*Delivery Location:* ${cleanText(order.delivery_location, "")}`
    : "";
  const prefix = `*Order #${orderId}*\n*Canteen:* ${canteen}`;
  switch (eventType) {
    case "accepted":
      return `Your UniEats order #${orderId} has been accepted by ${canteen}.`;
    case "preparing":
      return `Your UniEats order #${orderId} is being prepared.`;
    case "ready":
      return order.order_type === "pickup"
        ? `Your UniEats order #${orderId} is ready for pickup.\n${prefix}`
        : `Your UniEats order #${orderId} is ready and will be delivered soon.${location}\n${prefix}`;
    case "out_for_delivery":
      return `🚴 Your UniEats order #${orderId} is out for delivery. Please be available at your delivery location.${location}\n${prefix}`;
    case "delivered":
      return `✓ Your UniEats order #${orderId} has been delivered. Thank you for ordering with UniEats!\n${prefix}`;
    default:
      return `Your UniEats order #${orderId} has been placed with ${canteen}.`;
  }
}

export function formatWhatsAppOrderNotification(
  order: OrderRecord,
  canteenName: string,
  items: OrderItemRecord[],
): string {
  const orderType = order.order_type === "delivery" ? "Delivery" : "Pickup";
  const itemLines = items.map(
    (item) =>
      `• ${cleanText(item.item_name, "Unnamed item")} × ${Math.max(0, Number(item.quantity) || 0)}`,
  );

  return [
    "🔔 *New UniEats Order*",
    "",
    `*Order ID:* ${cleanText(order.order_number, order.id)}`,
    `*Canteen:* ${cleanText(canteenName, "Unknown canteen")}`,
    `*Student:* ${cleanText(order.student_name, "Unknown student")}`,
    `*Order Type:* ${orderType}`,
    order.department ? `*Department:* ${cleanText(order.department, "")}` : null,
    order.delivery_location && order.order_type === "delivery"
      ? `*Delivery Location:* ${cleanText(order.delivery_location, "")}`
      : null,
    "",
    "*Items:*",
    ...(itemLines.length > 0 ? itemLines : ["• No items recorded"]),
    "",
    `*Total:* Rs. ${formatAmount(order.total_amount)}`,
    `*Time:* ${formatTime(order.created_at)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function getWhatsAppConfig() {
  const apiToken = process.env.WHATSAPP_CLOUD_API_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v23.0";

  if (!apiToken || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured on the server.");
  }

  return { apiToken, phoneNumberId, apiVersion };
}

function safeProviderError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Unknown provider error";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "Unknown provider error";
  const message = (error as { message?: unknown }).message;
  return cleanText(message, "Unknown provider error", 500);
}

function normalizeRecipientNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  if (!/^\d{8,15}$/.test(normalized)) {
    throw new Error("The order phone number is not a valid WhatsApp recipient.");
  }
  return normalized;
}

export async function sendWhatsAppOrderNotification(
  message: string,
  recipientPhone: string,
): Promise<WhatsAppSendResult> {
  const { apiToken, phoneNumberId, apiVersion } = getWhatsAppConfig();
  const recipientNumber = normalizeRecipientNumber(recipientPhone);
  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientNumber,
        type: "text",
        text: { preview_url: false, body: message },
      }),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `WhatsApp Cloud API request failed (${response.status}): ${safeProviderError(payload)}`,
    );
  }

  const providerMessageId =
    payload && typeof payload === "object" && Array.isArray((payload as { messages?: unknown }).messages)
      ? String(((payload as { messages: Array<{ id?: string }> }).messages[0]?.id ?? "")) || null
      : null;

  return { providerMessageId };
}
