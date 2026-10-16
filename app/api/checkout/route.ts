/* Supabase RPC arguments are defined by the accompanying SQL migration. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANTEEN_SLUGS = new Set([
  "annexe",
  "bhola",
  "gssc",
  "hot-potato",
  "ssc",
]);

type CheckoutItemInput = {
  clientLineId: string;
  catalogueKey: string;
  canteenSlug: string;
  quantity: number;
  size: string | null;
  addOnNames: string[];
};

type CheckoutInput = {
  idempotencyKey: string;
  requestHash: string;
  studentName: string;
  phone: string;
  orderType: "pickup" | "delivery";
  deliveryLocation: string | null;
  specialInstructions: string | null;
  paymentMethod: "cod" | "online";
  trackingTokenHash: string;
  items: CheckoutItemInput[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(
  value: unknown,
  field: string,
  maximumLength: number,
  required: boolean,
): string | null {
  if (typeof value !== "string") return required ? "" : null;
  const text = value.trim();
  if (
    text.length > maximumLength ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)
  ) {
    throw new Error(`${field} is invalid.`);
  }
  if (required && !text) throw new Error(`${field} is required.`);
  return text || null;
}

function readRequiredText(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  const text = readText(value, field, maximumLength, true);
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function parseCheckoutInput(body: unknown): CheckoutInput {
  if (!isRecord(body)) throw new Error("Invalid checkout request.");

  const idempotencyKey = readRequiredText(body.idempotencyKey, "Checkout", 36);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw new Error("Checkout session is invalid. Please try placing your order again.");
  }

  const studentName = readRequiredText(body.studentName, "Student name", 100);
  const phone = readRequiredText(body.phone, "Phone number", 20).replace(/\s/g, "");
  if (!/^03\d{9}$/.test(phone)) {
    throw new Error("Enter a valid Pakistani phone number (03XXXXXXXXX).");
  }

  if (body.orderType !== "pickup" && body.orderType !== "delivery") {
    throw new Error("Choose pickup or delivery.");
  }
  const orderType = body.orderType;
  const deliveryLocation =
    orderType === "delivery"
      ? readRequiredText(body.deliveryLocation, "Delivery location", 200)
      : null;
  const specialInstructions = readText(
    body.specialInstructions ?? "",
    "Special instructions",
    500,
    false,
  );

  if (body.paymentMethod !== "cod" && body.paymentMethod !== "online") {
    throw new Error("Choose a valid payment method.");
  }
  const paymentMethod = body.paymentMethod;

  const rawTrackingToken = readRequiredText(body.trackingToken, "Tracking token", 160);
  if (rawTrackingToken.length < 32 || !/^[A-Za-z0-9-]+$/.test(rawTrackingToken)) {
    throw new Error("Checkout session is invalid. Please try placing your order again.");
  }
  const trackingTokenHash = createHash("sha256")
    .update(rawTrackingToken, "utf8")
    .digest("hex");

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    throw new Error("Your cart must contain between 1 and 50 items.");
  }

  const clientLineIds = new Set<string>();
  const items = body.items.map((value): CheckoutItemInput => {
    if (!isRecord(value)) throw new Error("A cart item is invalid.");
    const clientLineId = readRequiredText(value.clientLineId, "Cart item", 150);
    const catalogueKey = readRequiredText(value.menuItemKey, "Menu item", 100);
    const canteenSlug = readRequiredText(value.canteenSlug, "Canteen", 40);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(catalogueKey)) {
      throw new Error("A cart item is invalid.");
    }
    if (clientLineIds.has(clientLineId)) {
      throw new Error("Your cart contains duplicate item entries. Please review it and retry.");
    }
    clientLineIds.add(clientLineId);

    if (!CANTEEN_SLUGS.has(canteenSlug)) {
      throw new Error("A selected canteen is not available for checkout.");
    }
    const quantity = value.quantity;
    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      throw new Error("Each item quantity must be between 1 and 20.");
    }

    if (
      value.size !== undefined &&
      value.size !== null &&
      typeof value.size !== "string"
    ) {
      throw new Error("A selected item size is invalid.");
    }
    const size = readText(value.size ?? "", "Item size", 80, false);
    if (value.addOnNames !== undefined && !Array.isArray(value.addOnNames)) {
      throw new Error("A selected item option is invalid.");
    }
    const rawAddOnNames: unknown[] = Array.isArray(value.addOnNames)
      ? value.addOnNames
      : [];
    const addOnNames = rawAddOnNames.map((name) =>
      readRequiredText(name, "Item option", 80),
    );
    if (
      addOnNames.some((name) => !name) ||
      addOnNames.length > 10 ||
      new Set(addOnNames).size !== addOnNames.length
    ) {
      throw new Error("A selected item option is invalid.");
    }

    return {
      clientLineId,
      catalogueKey,
      canteenSlug,
      quantity,
      size,
      addOnNames,
    };
  });

  if (new Set(items.map((item) => item.canteenSlug)).size > 5) {
    throw new Error("Your cart contains an unsupported canteen.");
  }

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        studentName,
        phone,
        orderType,
        deliveryLocation,
        specialInstructions,
        paymentMethod,
        trackingTokenHash,
        items,
      }),
      "utf8",
    )
    .digest("hex");

  return {
    idempotencyKey,
    requestHash,
    studentName,
    phone,
    orderType,
    deliveryLocation,
    specialInstructions,
    paymentMethod,
    trackingTokenHash,
    items,
  };
}

function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient<any>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

class CheckoutBodyTooLargeError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Checkout request body is missing.");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 65_536) {
        throw new CheckoutBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function POST(request: Request) {
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (Number.isFinite(contentLength) && contentLength > 65_536) {
    return errorResponse("Checkout request is too large.", 413);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof CheckoutBodyTooLargeError) {
      return errorResponse("Checkout request is too large.", 413);
    }
    return errorResponse(
      "Checkout request body is invalid.",
      400,
    );
  }

  let input: CheckoutInput;
  try {
    input = parseCheckoutInput(body);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Please review your checkout details.",
      400,
    );
  }

  const client = createServerSupabase();
  if (!client) {
    console.error("[UniEats Checkout] Server Supabase configuration is incomplete.");
    return errorResponse("Checkout is temporarily unavailable. Please try again later.", 503);
  }

  let data: unknown;
  let error: { code?: string; message: string } | null;
  try {
    const result = await client.rpc("create_student_checkout", {
      p_checkout_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_student_name: input.studentName,
      p_phone: input.phone,
      p_order_type: input.orderType,
      p_delivery_location: input.deliveryLocation,
      p_special_instructions: input.specialInstructions,
      p_payment_method: input.paymentMethod,
      p_tracking_token_hash: input.trackingTokenHash,
      p_items: input.items.map((item) => ({
        client_line_id: item.clientLineId,
        catalogue_key: item.catalogueKey,
        canteen_slug: item.canteenSlug,
        quantity: item.quantity,
        size: item.size,
        add_on_names: item.addOnNames,
      })),
    });
    data = result.data;
    error = result.error;
  } catch (rpcError) {
    console.error(
      "[UniEats Checkout] Checkout RPC transport failed:",
      rpcError instanceof Error ? rpcError.message : "unknown error",
    );
    return errorResponse(
      "We couldn't confirm your order just yet. Your cart is saved; please retry checkout.",
      503,
    );
  }

  if (error) {
    console.error("[UniEats Checkout] Order transaction failed:", {
      code: error.code ?? "unknown",
      message: error.message,
    });
    const knownFailures: Record<string, { message: string; status: number }> = {
      CHECKOUT_CANTEEN_MAPPING_INVALID: {
        message: "Checkout is temporarily unavailable. Please try again later.",
        status: 503,
      },
      CHECKOUT_CANTEEN_CLOSED: {
        message: "One of the selected canteens is currently unavailable. Please review your cart.",
        status: 409,
      },
      CHECKOUT_ITEM_UNAVAILABLE: {
        message: "One or more items are no longer available. Please review your cart.",
        status: 409,
      },
      CHECKOUT_INVALID_SELECTION: {
        message: "One of your selected sizes or options is no longer available. Please review your cart.",
        status: 400,
      },
      CHECKOUT_KEY_REUSED: {
        message: "Checkout details changed. Please submit your order again.",
        status: 409,
      },
      CHECKOUT_INVALID_REQUEST: {
        message: "Checkout details are invalid. Please review your cart and try again.",
        status: 400,
      },
      CHECKOUT_RETRY_STATE_INVALID: {
        message: "We couldn't confirm your previous checkout. Please contact support before retrying.",
        status: 503,
      },
      CHECKOUT_FORBIDDEN: {
        message: "Checkout is temporarily unavailable. Please try again later.",
        status: 503,
      },
    };
    const knownFailure = Object.entries(knownFailures).find(([code]) =>
      error.message.includes(code),
    )?.[1];
    if (knownFailure) return errorResponse(knownFailure.message, knownFailure.status);
    if (error.code === "PGRST202" || error.code === "42883") {
      return errorResponse("Checkout is being configured. Please try again later.", 503);
    }
    return errorResponse(
      "We couldn't place your order. Your cart is saved; please try again.",
      500,
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as { orders?: unknown }).orders) ||
    (data as { orders: unknown[] }).orders.length === 0
  ) {
    console.error("[UniEats Checkout] Checkout RPC returned an invalid confirmation.");
    return errorResponse(
      "We couldn't confirm your order just yet. Your cart is saved; please retry checkout.",
      502,
    );
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
