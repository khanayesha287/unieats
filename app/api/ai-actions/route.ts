import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncAlert {
  id: string;           // action_key: orderId:category
  orderId: string;
  orderNumber: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  recommendedAction: string;
  canteenName: string;
  deliveryLocation: string | null;
  currentStatus: string;
  minutesInStatus: number;
  responsibleParty: string;
}

interface TransitionRequest {
  actionId: string;     // UUID from ai_operations_actions
  next: "open" | "acknowledged" | "resolved";
}

// ---------------------------------------------------------------------------
// GET /api/ai-actions  →  fetch all non-resolved actions
// ---------------------------------------------------------------------------

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("ai_operations_actions")
    .select("*")
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[AI Actions] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// ---------------------------------------------------------------------------
// POST /api/ai-actions  →  sync new alerts (upsert, preserve existing states)
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const alerts: SyncAlert[] = Array.isArray(body.alerts) ? body.alerts : [];

    if (alerts.length === 0) {
      return NextResponse.json({ synced: 0 });
    }

    // Fetch existing actions that are still active (not resolved)
    const { data: existing } = await supabase
      .from("ai_operations_actions")
      .select("action_key, status")
      .in("status", ["open", "acknowledged"]);

    const existingMap = new Map<string, string>();
    if (existing) {
      for (const row of existing) {
        existingMap.set(row.action_key, row.status);
      }
    }

    let synced = 0;

    for (const alert of alerts) {
      const actionKey = alert.id; // This is "orderId:category"

      // If this action already exists and is active, skip (preserve state)
      if (existingMap.has(actionKey)) {
        continue;
      }

      // Check if a resolved version exists (don't reopen resolved actions)
      const { data: resolvedCheck } = await supabase
        .from("ai_operations_actions")
        .select("id, status")
        .eq("action_key", actionKey)
        .eq("status", "resolved")
        .limit(1)
        .maybeSingle();

      if (resolvedCheck) {
        // Action was previously resolved - don't reopen
        continue;
      }

      // Insert new action
      const { error: insertError } = await supabase
        .from("ai_operations_actions")
        .insert({
          order_id: alert.orderId,
          order_number: alert.orderNumber,
          action_key: actionKey,
          priority: alert.severity,
          current_status: alert.currentStatus,
          issue: alert.title,
          recommended_action: alert.recommendedAction,
          responsible_party: alert.responsibleParty,
          reason: alert.description,
          category: alert.category,
          status: "open",
        });

      if (insertError) {
        // Ignore duplicate key errors (race condition protection)
        if (insertError.code === "23505") {
          continue;
        }
        console.error("[AI Actions] Insert error for", actionKey, ":", insertError.message);
        continue;
      }

      synced++;
    }

    return NextResponse.json({ synced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[AI Actions] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/ai-actions  →  transition action state
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const body: TransitionRequest = await request.json();
    const { actionId, next } = body;

    if (!actionId || !next) {
      return NextResponse.json({ error: "Missing actionId or next state" }, { status: 400 });
    }

    if (!["open", "acknowledged", "resolved"].includes(next)) {
      return NextResponse.json({ error: "Invalid state: " + next }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      status: next,
      updated_at: new Date().toISOString(),
    };

    if (next === "resolved") {
      updatePayload.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("ai_operations_actions")
      .update(updatePayload)
      .eq("id", actionId)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("[AI Actions] PATCH error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Action not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[AI Actions] PATCH error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
