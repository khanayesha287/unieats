/* Server-Sent Events bridge for student order tracking.
 *
 * Supabase Realtime (WebSocket) events for the `orders` table are received
 * server-side with the service-role key — guest students are anon and have no
 * RLS SELECT policy on orders, so the browser must not subscribe directly
 * (that would either leak order PII or receive nothing). Each connected
 * student is verified with the same tracking-token hash rules as the REST
 * endpoint, then receives a push event for every status change the canteen or
 * driver makes, so the student's tracking box updates instantly without a
 * browser refresh.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import {
  getServerSupabase,
  parseRequest,
  resolveTokenOrderIds,
  safeStatus,
} from "@/lib/order-tracking-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAM_MAX_LIFETIME_MS = 10 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const CHANGE_POLL_INTERVAL_MS = 3_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "A valid tracking token and orderIds are required." }, { status: 400 });
  }

  const client = getServerSupabase();
  if (!client) {
    return NextResponse.json({ error: "Tracking service is not configured." }, { status: 503 });
  }

  const { verifiedIds, error } = await resolveTokenOrderIds(client, parsed.token, parsed.orderIds);
  if (error) {
    console.error("[UniEats Tracking] Stream ownership check failed:", {
      orderIds: parsed.orderIds,
      message: error.message,
      code: error.code,
    });
    return NextResponse.json({ error: "Unable to establish order tracking stream." }, { status: 500 });
  }
  if (verifiedIds.length === 0) {
    return NextResponse.json({ error: "Order tracking access was not valid." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let changePoll: ReturnType<typeof setInterval> | undefined;
  let channel: any = undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (lifetime) clearTimeout(lifetime);
        if (changePoll) clearInterval(changePoll);
        if (channel) void client.removeChannel(channel);
        try {
          controller.close();
        } catch {
          // Stream already closed by the client disconnecting.
        }
      };

      // Seed last-known statuses immediately and include them in the ready
      // frame: the client syncs instantly, and every later staff change is
      // guaranteed to push as a diff (no change can hide inside a seeding
      // window — a transition made before this query is delivered via the
      // ready frame itself).
      const lastKnown = new Map<string, string>();
      const seeded: Array<{ id: string; status: string; orderNumber?: string }> = [];
      try {
        const { data: seedRows, error: seedError } = await client
          .from("orders")
          .select("id,status,order_number")
          .in("id", verifiedIds);
        if (!seedError && seedRows) {
          for (const row of seedRows as any[]) {
            const id = String(row.id);
            const status = safeStatus(row.status);
            lastKnown.set(id, status);
            seeded.push({
              id,
              status,
              orderNumber: row.order_number != null ? String(row.order_number) : undefined,
            });
          }
        }
      } catch {
        // Seeding is an optimization; the client's initial poll covers sync.
      }

      // Initial ready frame lets the client confirm the stream is live and
      // sync current statuses without waiting for its first poll.
      send({ type: "ready", orderIds: verifiedIds, orders: seeded });

      channel = client.channel(`order-track-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      for (const id of verifiedIds) {
        const filter = `id=eq.${id}`;
        channel.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter },
          (payload: any) => {
            const row = payload?.new ?? {};
            send({
              type: "status",
              id: String(row.id ?? id),
              status: safeStatus(row.status),
              orderNumber: row.order_number != null ? String(row.order_number) : undefined,
            });
          },
        );
        channel.on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "orders", filter },
          (payload: any) => {
            const old = payload?.old ?? {};
            send({ type: "deleted", id: String(old.id ?? id) });
          },
        );
      }
      channel.subscribe((status: string) => {
        // Fatal channel states end the stream; the client reconnects with
        // backoff and re-verifies the token.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") cleanup();
      });

      // Server-side change detection: postgres_changes push events only flow
      // once `orders` is added to the supabase_realtime publication
      // (supabase-migrations/enable-realtime-and-rls-policies.sql). Until that
      // migration is applied, this lightweight status diff-poll keeps the
      // stream live so staff status changes still reach the student without a
      // browser refresh. Once the publication is enabled, postgres_changes
      // delivers sub-second push and this poll simply finds nothing new.
      changePoll = setInterval(() => {
        if (closed) return;
        void (async () => {
          try {
            const { data, error } = await client
              .from("orders")
              .select("id,status,order_number")
              .in("id", verifiedIds);
            if (error || !data || closed) return;
            const seen = new Set<string>();
            for (const row of data as any[]) {
              const id = String(row.id);
              seen.add(id);
              const status = safeStatus(row.status);
              if (lastKnown.get(id) !== status) {
                lastKnown.set(id, status);
                send({
                  type: "status",
                  id,
                  status,
                  orderNumber: row.order_number != null ? String(row.order_number) : undefined,
                });
              }
            }
            for (const id of [...lastKnown.keys()]) {
              if (!seen.has(id)) {
                lastKnown.delete(id);
                send({ type: "deleted", id });
              }
            }
          } catch {
            // Transient failure; the next tick retries.
          }
        })();
      }, CHANGE_POLL_INTERVAL_MS);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Cap the connection lifetime so server resources are reclaimed; the
      // client auto-reconnects and re-verifies the token.
      lifetime = setTimeout(cleanup, STREAM_MAX_LIFETIME_MS);

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (lifetime) clearTimeout(lifetime);
      if (changePoll) clearInterval(changePoll);
      if (channel) void client.removeChannel(channel);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
