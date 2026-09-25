import { NextResponse } from "next/server";
import { processWhatsAppOrderNotifications } from "@/lib/whatsapp-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOrderIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const values = (body as { orderIds?: unknown }).orderIds;
  if (!Array.isArray(values) || values.length === 0 || values.length > 25) return null;

  const orderIds = values.map((value) => {
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
    if (typeof value === "string" && value.trim().length <= 100) return value.trim();
    return null;
  });

  return orderIds.every((value): value is string => Boolean(value)) ? orderIds : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const orderIds = parseOrderIds(body);
  if (!orderIds) {
    return NextResponse.json({ error: "A valid orderIds array is required." }, { status: 400 });
  }

  // The browser supplies identifiers only. The backend reads the notification,
  // order, canteen, items, recipient, and message fields from trusted storage.
  // It never accepts a student-provided WhatsApp number or message payload.
  const result = await processWhatsAppOrderNotifications(orderIds);
  return NextResponse.json(
    { accepted: true, queued: result.requested, sent: result.sent, failed: result.failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
