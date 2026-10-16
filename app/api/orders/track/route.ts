/* Supabase rows are intentionally schema-agnostic because this project supports deployed legacy schemas. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { TrackedOrder } from "@/lib/order-tracking";
import {
  getServerSupabase,
  isMissingColumnError,
  parseRequest,
  queryOrdersByIds,
  safeStatus,
} from "@/lib/order-tracking-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let orders: any[] = [];
  let ordersError: { message?: string; code?: string } | null = null;

  // Primary query: token-hash verified. This is the secure path used on
  // schemas where tracking_token_hash exists (add-order-tracking-workflow-security.sql).
  const primary = await queryOrdersByIds(client, parsed.orderIds, tokenHash);

  if (primary.error && isMissingColumnError(primary.error)) {
    console.error(
      "[UniEats Tracking] tracking_token_hash is missing; refusing unverified order lookup.",
    );
    return NextResponse.json(
      { error: "Order tracking is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (primary.error) {
    ordersError = primary.error;
  } else {
    orders = primary.data;
  }

  if (ordersError) {
    console.error("[TRACKING DEBUG] Orders query failed:", {
      orderIds: parsed.orderIds,
      message: ordersError.message,
      code: ordersError.code,
    });
    return NextResponse.json({ error: "Unable to load order tracking." }, { status: 500 });
  }

  // Return every hash-verified order that matched; never fall back to ID-only
  // lookup because order IDs are not a substitute for the tracking token.
  if (orders.length === 0) {
    return NextResponse.json({ error: "Order tracking access was not valid." }, { status: 404 });
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
