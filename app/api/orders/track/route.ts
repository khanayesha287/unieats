/* Supabase rows are intentionally schema-agnostic because this project supports deployed legacy schemas. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { TrackedOrder, TrackingStatus } from "@/lib/order-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.warn("[TRACKING DEBUG] Server Supabase configuration is incomplete.", {
      hasUrl: Boolean(url),
      hasServiceRoleKey: Boolean(key),
    });
    return null;
  }
  return createClient<any>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function parseRequest(body: unknown): { token: string; orderIds: string[] } | null {
  if (!body || typeof body !== "object") return null;
  const input = body as { token?: unknown; orderIds?: unknown };
  if (typeof input.token !== "string" || input.token.length < 32 || input.token.length > 160) return null;
  if (!Array.isArray(input.orderIds) || input.orderIds.length < 1 || input.orderIds.length > 25) return null;
  const orderIds = Array.from(new Set(input.orderIds.map((id) => {
    if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
    if (typeof id === "string" && id.trim().length <= 100) return id.trim();
    return null;
  }).filter((id): id is string => Boolean(id))));
  return orderIds.length === input.orderIds.length ? { token: input.token, orderIds } : null;
}

function safeStatus(value: unknown): TrackingStatus {
  const statuses: TrackingStatus[] = ["pending", "confirmed", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "completed", "cancelled"];
  return statuses.includes(value as TrackingStatus) ? value as TrackingStatus : "pending";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = parseRequest(body);
  if (!parsed) return NextResponse.json({ error: "A valid tracking token and orderIds are required." }, { status: 400 });

  const client = getServerSupabase();
  if (!client) return NextResponse.json({ error: "Tracking service is not configured." }, { status: 503 });

  const tokenHash = createHash("sha256").update(parsed.token, "utf8").digest("hex");
  const { data: orders, error: ordersError } = await client
    .from("orders")
    .select("id,order_number,student_name,order_type,delivery_location,canteen_id,status,total_amount,delivery_charge,created_at,tracking_token_hash")
    .in("id", parsed.orderIds)
    .eq("tracking_token_hash", tokenHash);
  if (ordersError) {
    console.error("[TRACKING DEBUG] Orders query failed:", {
      orderIds: parsed.orderIds,
      message: ordersError.message,
      code: ordersError.code,
    });
    return NextResponse.json({ error: "Unable to load order tracking." }, { status: 500 });
  }
  if (!Array.isArray(orders) || orders.length !== parsed.orderIds.length) {
    return NextResponse.json({ error: "Order tracking access was not valid." }, { status: 404 });
  }

  for (const order of orders as any[]) {
    console.log("[TRACKING DEBUG] Order ID:", String(order.id));
    console.log("[TRACKING DEBUG] DB status:", String(order.status ?? "unknown"));
  }

  const orderIds = orders.map((order: any) => String(order.id));
  const [{ data: items, error: itemsError }, { data: canteens, error: canteensError }] = await Promise.all([
    client.from("order_items").select("id,order_id,item_name,quantity,price,subtotal").in("order_id", orderIds).order("id", { ascending: true }),
    client.from("canteens").select("id,name"),
  ]);
  if (itemsError || canteensError) {
    console.error("[TRACKING DEBUG] Related order data query failed:", {
      orderIds,
      itemsError: itemsError?.message,
      canteensError: canteensError?.message,
    });
    return NextResponse.json({ error: "Unable to load order details." }, { status: 500 });
  }

  const canteenMap = new Map((canteens ?? []).map((canteen: any) => [String(canteen.id), String(canteen.name ?? "Unknown canteen")]));
  const itemsByOrder = new Map<string, any[]>();
  for (const item of items ?? []) {
    const key = String(item.order_id);
    const existing = itemsByOrder.get(key) ?? [];
    existing.push(item);
    itemsByOrder.set(key, existing);
  }

  const result: TrackedOrder[] = orders.map((order: any) => ({
    id: String(order.id),
    orderNumber: String(order.order_number ?? order.id),
    studentName: String(order.student_name ?? ""),
    orderType: order.order_type === "delivery" ? "delivery" : "pickup",
    deliveryLocation: order.delivery_location ?? null,
    canteenName: canteenMap.get(String(order.canteen_id)) ?? "Unknown canteen",
    status: safeStatus(order.status),
    totalAmount: Number(order.total_amount ?? 0),
    deliveryCharge: Number(order.delivery_charge ?? 0),
    createdAt: order.created_at ?? null,
    items: (itemsByOrder.get(String(order.id)) ?? []).map((item: any) => ({
      id: String(item.id),
      itemName: String(item.item_name ?? "Item"),
      quantity: Number(item.quantity ?? 0),
      price: Number(item.price ?? 0),
      subtotal: Number(item.subtotal ?? 0),
    })),
  }));

  return NextResponse.json({ orders: result }, { headers: { "Cache-Control": "no-store" } });
}
