/* Supabase rows are intentionally schema-agnostic because this project supports deployed legacy schemas. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";

type ServerSupabaseClient = ReturnType<typeof createClient<any>>;
import {
  formatWhatsAppOrderNotification,
  formatWhatsAppStatusNotification,
  sendWhatsAppOrderNotification,
} from "@/lib/whatsapp-server";

type NotificationStatus = "pending" | "processing" | "failed" | "sent";

type NotificationRecord = {
  id: string;
  order_id: string;
  event_type: string;
  recipient_phone?: string | null;
  status: NotificationStatus;
  attempt_count: number;
};

type ProcessOptions = {
  includeFailed?: boolean;
};

export interface NotificationProcessResult {
  requested: number;
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;

  return createClient<any>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown notification error";
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/token[=:]\s*[^\s,]+/gi, "token=[redacted]")
    .slice(0, 1000);
}

function normalizeOrderIds(orderIds: string[]): string[] {
  return Array.from(
    new Set(
      orderIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 100),
    ),
  ).slice(0, 25);
}

async function claimNotification(
  client: ServerSupabaseClient,
  notification: NotificationRecord,
): Promise<NotificationRecord | null> {
  const { data, error } = await client
    .from("whatsapp_order_notifications")
    .update({
      status: "processing",
      attempt_count: notification.attempt_count + 1,
      locked_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", notification.id)
    .eq("status", notification.status)
    .eq("attempt_count", notification.attempt_count)
    .select("id, order_id, event_type, recipient_phone, status, attempt_count")
    .maybeSingle();

  if (error) {
    console.error("[UniEats WhatsApp] Notification claim failed:", error.message);
    return null;
  }
  return (data as NotificationRecord | null) ?? null;
}

async function markFailed(
  client: ServerSupabaseClient,
  notification: NotificationRecord,
  error: unknown,
): Promise<void> {
  const message = safeErrorMessage(error);
  const { error: updateError } = await client
    .from("whatsapp_order_notifications")
    .update({
      status: "failed",
      locked_at: null,
      last_error: message,
    })
    .eq("id", notification.id)
    .eq("status", "processing")
    .eq("attempt_count", notification.attempt_count);

  if (updateError) {
    console.error("[UniEats WhatsApp] Failed to persist notification error:", updateError.message);
  }
}

async function processOne(
  client: ServerSupabaseClient,
  notification: NotificationRecord,
): Promise<"sent" | "failed"> {
  try {
    const { data: order, error: orderError } = await client
      .from("orders")
      .select("*")
      .eq("id", notification.order_id)
      .maybeSingle();
    if (orderError || !order) {
      throw new Error(orderError?.message ?? "The order could not be found.");
    }

    const [{ data: canteen, error: canteenError }, { data: items, error: itemsError }] =
      await Promise.all([
        client
          .from("canteens")
          .select("name")
          .eq("id", String(order.canteen_id))
          .maybeSingle(),
        client
          .from("order_items")
          .select("item_name, quantity")
          .eq("order_id", notification.order_id)
          .order("id", { ascending: true }),
      ]);

    if (canteenError || !canteen) {
      throw new Error(canteenError?.message ?? "The order canteen could not be found.");
    }
    if (itemsError) throw new Error(itemsError.message);
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("The confirmed order has no saved items.");
    }

    const message = notification.event_type === "order_created"
      ? formatWhatsAppOrderNotification(
          {
            id: notification.order_id,
            order_number: String(order.order_number ?? notification.order_id),
            student_name: String(order.student_name ?? ""),
            registration_number: order.registration_number ?? null,
            phone: String(order.phone ?? ""),
            department: order.department ?? null,
            order_type: String(order.order_type ?? "pickup"),
            delivery_location: order.delivery_location ?? null,
            total_amount: Number(order.total_amount ?? 0),
            payment_method: order.payment_method ?? null,
            created_at: order.created_at ?? null,
          },
          String(canteen.name ?? "Unknown canteen"),
          items,
        )
      : formatWhatsAppStatusNotification(
          notification.event_type,
          {
            id: notification.order_id,
            order_number: String(order.order_number ?? notification.order_id),
            student_name: String(order.student_name ?? ""),
            phone: String(order.phone ?? ""),
            order_type: String(order.order_type ?? "pickup"),
            delivery_location: order.delivery_location ?? null,
            total_amount: Number(order.total_amount ?? 0),
            created_at: order.created_at ?? null,
          },
          String(canteen.name ?? "Unknown canteen"),
        );
    const result = await sendWhatsAppOrderNotification(
      message,
      String(notification.recipient_phone ?? order.phone ?? ""),
    );

    const { error: sentError } = await client
      .from("whatsapp_order_notifications")
      .update({
        status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
        locked_at: null,
        last_error: null,
      })
      .eq("id", notification.id)
      .eq("status", "processing")
      .eq("attempt_count", notification.attempt_count);

    if (sentError) throw new Error(sentError.message);
    return "sent";
  } catch (error) {
    await markFailed(client, notification, error);
    console.error(
      `[UniEats WhatsApp] Notification failed for order ${notification.order_id}:`,
      safeErrorMessage(error),
    );
    return "failed";
  }
}

export async function processWhatsAppOrderNotifications(
  orderIds: string[],
  options: ProcessOptions = {},
): Promise<NotificationProcessResult> {
  const normalizedIds = normalizeOrderIds(orderIds);
  const client = getServerSupabase();
  const result: NotificationProcessResult = {
    requested: normalizedIds.length,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  if (!client || normalizedIds.length === 0) return result;

  let query = client
    .from("whatsapp_order_notifications")
    .select("id, order_id, event_type, recipient_phone, status, attempt_count")
    .in("order_id", normalizedIds);
  query = options.includeFailed
    ? query.in("status", ["pending", "failed"])
    : query.eq("status", "pending");

  const { data: notifications, error } = await query;
  if (error) {
    console.error("[UniEats WhatsApp] Notification queue query failed:", error.message);
    return result;
  }

  for (const row of (notifications ?? []) as NotificationRecord[]) {
    const claimed = await claimNotification(client, row);
    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    result.claimed += 1;
    if (await processOne(client, claimed) === "sent") {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  result.skipped += Math.max(0, normalizedIds.length - result.claimed - result.failed - result.sent);
  return result;
}
