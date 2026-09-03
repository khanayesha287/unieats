import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppOrderNotifications } from "@/lib/whatsapp-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireAdmin(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return { supabase: null, response: NextResponse.json({ error: "Server is not configured" }, { status: 503 }) };

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { supabase: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return { supabase: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.active) {
    return { supabase: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, response: null };
}

function parseOrderIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const values = (body as { orderIds?: unknown }).orderIds;
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 25) return null;

  const orderIds = values.map((value) => {
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
    if (typeof value === "string" && value.trim().length <= 100) return value.trim();
    return null;
  });
  return orderIds.every((value): value is string => Boolean(value)) ? orderIds : null;
}

export async function GET(request: NextRequest) {
  const { supabase, response } = await requireAdmin(request);
  if (response) return response;
  const { data, error } = await supabase!
    .from("whatsapp_order_notifications")
    .select("order_id, event_type, status, last_error, updated_at, attempt_count")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: "Unable to load notification statuses." }, { status: 500 });
  return NextResponse.json({ notifications: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const { supabase, response } = await requireAdmin(request);
  if (response) return response;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let orderIds = parseOrderIds(body);
  if (!orderIds) {
    return NextResponse.json({ error: "orderIds must be an array of valid IDs." }, { status: 400 });
  }

  if (orderIds.length === 0) {
    const { data, error } = await supabase!
      .from("whatsapp_order_notifications")
      .select("order_id")
      .eq("status", "failed")
      .order("updated_at", { ascending: true })
      .limit(25);
    if (error) {
      return NextResponse.json({ error: "Unable to load failed notifications." }, { status: 500 });
    }
    orderIds = (data ?? []).map((row) => String(row.order_id));
  }

  const result = await processWhatsAppOrderNotifications(orderIds, { includeFailed: true });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
