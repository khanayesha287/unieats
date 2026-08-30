/**
 * UniEats AI Operations Agent
 *
 * Pure-logic module that analyses real Supabase order data and produces
 * operational alerts, recommendations and daily summaries.
 *
 * No external LLM is required for the base rules engine.
 * The module exports well-typed helpers so a future integration can
 * forward the same inputs to an LLM API for richer natural-language output.
 *
 * Environment variables (optional, for future LLM integration):
 *   AI_OPERATIONS_API_URL   - endpoint of an external AI service
 *   AI_OPERATIONS_API_KEY   - secret key (server-only, never exposed to the client)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";

export type ResponsibleParty = "canteen" | "driver" | "admin";

export type ActionState = "open" | "acknowledged" | "resolved";

export type AlertCategory =
  | "stuck_pending"
  | "stuck_confirmed"
  | "stuck_preparing"
  | "ready_not_picked_up"
  | "delayed_delivery"
  | "missing_delivery_info"
  | "incomplete_order";

export interface OperationalAlert {
  id: string;
  orderId: number | string;
  orderNumber: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  description: string;
  recommendedAction: string;
  canteenName: string;
  deliveryLocation: string | null;
  currentStatus: string;
  minutesInStatus: number;
  responsibleParty: ResponsibleParty;
}

/** An OperationalAction is an alert promoted with an action lifecycle state. */
export interface OperationalAction extends OperationalAlert {
  actionState: ActionState;
}

export interface DailySummary {
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  ordersRequiringAttention: number;
  delayedDeliveries: number;
  summaryText: string;
}

export interface AIOperationsOverview {
  ordersRequiringAttention: number;
  delayedOrders: number;
  readyWaitingForDriver: number;
  activeDeliveries: number;
  completedDeliveries: number;
  alerts: OperationalAlert[];
  actions: OperationalAction[];
  dailySummary: DailySummary;
}

// ---------------------------------------------------------------------------
// Minimal order/canteen shapes (avoids coupling to the admin component)
// ---------------------------------------------------------------------------

interface MinimalOrder {
  id: number | string;
  order_number: string;
  student_name: string;
  registration_number: string;
  phone?: string | null;
  order_type: string;
  delivery_location?: string | null;
  canteen_id?: number | string | null;
  status: string;
  total_amount?: number | null;
  created_at?: string | null;
  confirmed_at?: string | null;
  preparing_at?: string | null;
  ready_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
}

interface MinimalCanteen {
  id: number | string;
  name: string;
}

// ---------------------------------------------------------------------------
// Delay thresholds (minutes)
// ---------------------------------------------------------------------------

const THRESHOLD_PENDING_MINUTES = 15;
const THRESHOLD_CONFIRMED_MINUTES = 20;
const THRESHOLD_PREPARING_MINUTES = 30;
const THRESHOLD_READY_MINUTES = 15;
const THRESHOLD_OUT_FOR_DELIVERY_MINUTES = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minutesSince(isoTimestamp: string | null | undefined, now: Date): number {
  if (!isoTimestamp) return 0;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
}

function buildCanteenMap(canteens: MinimalCanteen[]): Record<string, MinimalCanteen> {
  return Object.fromEntries(canteens.map((c) => [String(c.id), c]));
}

function alertId(orderId: number | string, category: AlertCategory): string {
  return String(orderId) + ":" + category;
}

function getResponsibleParty(category: AlertCategory): ResponsibleParty {
  switch (category) {
    case "stuck_pending":
    case "stuck_confirmed":
    case "stuck_preparing":
      return "canteen";
    case "ready_not_picked_up":
    case "delayed_delivery":
      return "driver";
    case "missing_delivery_info":
    case "incomplete_order":
      return "admin";
    default:
      return "admin";
  }
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

export function analyzeOrders(
  orders: MinimalOrder[],
  canteens: MinimalCanteen[],
  now: Date = new Date(),
): OperationalAlert[] {
  const canteenMap = buildCanteenMap(canteens);
  const alerts: OperationalAlert[] = [];

  for (const order of orders) {
    const status = order.status;
    // Use the per-status timestamp when available; fall back to created_at
    const statusTimestamp =
      status === "confirmed" ? order.confirmed_at :
      status === "preparing" ? order.preparing_at :
      status === "ready" ? order.ready_at :
      status === "out_for_delivery" ? order.out_for_delivery_at :
      status === "delivered" ? order.delivered_at :
      null;
    const minutes = minutesSince(statusTimestamp ?? order.created_at, now);
    const canteenName =
      order.canteen_id !== null && order.canteen_id !== undefined
        ? canteenMap[String(order.canteen_id)]?.name ?? "Unknown canteen"
        : "Unknown canteen";
    const deliveryLocation = order.delivery_location ?? null;

    // Determine responsible party from current status + order type
    const responsibleParty: ResponsibleParty =
      (status === "pending" || status === "confirmed" || status === "preparing") ? "canteen" :
      (status === "ready" || status === "out_for_delivery") ? "driver" :
      "admin";

    const base = {
      orderId: order.id,
      orderNumber: order.order_number,
      canteenName,
      deliveryLocation,
      currentStatus: status,
      minutesInStatus: minutes,
      responsibleParty,
    };

    // --- Stuck in pending ---
    if (status === "pending" && minutes >= THRESHOLD_PENDING_MINUTES) {
      alerts.push({
        ...base,
        id: alertId(order.id, "stuck_pending"),
        severity: minutes >= THRESHOLD_PENDING_MINUTES * 2 ? "HIGH" : "MEDIUM",
        category: "stuck_pending",
        title: "Order stuck in Pending",
        description:
          "Order #" + order.order_number + " has been pending for " + minutes +
          " minutes. The canteen (" + canteenName + ") has not confirmed it yet.",
        recommendedAction: "Contact " + canteenName + " to confirm the order or follow up with the student.",
      });
    }

    // --- Stuck in confirmed ---
    if (status === "confirmed" && minutes >= THRESHOLD_CONFIRMED_MINUTES) {
      alerts.push({
        ...base,
        id: alertId(order.id, "stuck_confirmed"),
        severity: minutes >= THRESHOLD_CONFIRMED_MINUTES * 2 ? "HIGH" : "MEDIUM",
        category: "stuck_confirmed",
        title: "Order confirmed but not started",
        description:
          "Order #" + order.order_number + " was confirmed " + minutes +
          " minutes ago but has not moved to Preparing at " + canteenName + ".",
        recommendedAction: "Check with " + canteenName + " whether preparation has started.",
      });
    }

    // --- Stuck in preparing ---
    if (status === "preparing" && minutes >= THRESHOLD_PREPARING_MINUTES) {
      alerts.push({
        ...base,
        id: alertId(order.id, "stuck_preparing"),
        severity: minutes >= THRESHOLD_PREPARING_MINUTES * 2 ? "HIGH" : "MEDIUM",
        category: "stuck_preparing",
        title: "Order stuck in Preparing",
        description:
          "Order #" + order.order_number + " has been in Preparing for " + minutes +
          " minutes at " + canteenName + ".",
        recommendedAction: "Check with " + canteenName + " on the preparation status.",
      });
    }

    // --- Ready but not picked up ---
    if (status === "ready" && order.order_type === "delivery" && minutes >= THRESHOLD_READY_MINUTES) {
      alerts.push({
        ...base,
        id: alertId(order.id, "ready_not_picked_up"),
        severity: minutes >= THRESHOLD_READY_MINUTES * 2 ? "HIGH" : "MEDIUM",
        category: "ready_not_picked_up",
        title: "Ready order waiting for driver",
        description:
          "Order #" + order.order_number + " has been Ready for " + minutes +
          " minutes and is waiting for driver pickup.",
        recommendedAction: "Notify the driver that this order is ready for collection.",
      });
    }

    // --- Delayed delivery ---
    if (status === "out_for_delivery" && minutes >= THRESHOLD_OUT_FOR_DELIVERY_MINUTES) {
      alerts.push({
        ...base,
        id: alertId(order.id, "delayed_delivery"),
        severity: minutes >= THRESHOLD_OUT_FOR_DELIVERY_MINUTES * 2 ? "HIGH" : "MEDIUM",
        category: "delayed_delivery",
        title: "Delivery appears delayed",
        description:
          "Order #" + order.order_number + " has been Out for Delivery for " + minutes +
          " minutes to " + (deliveryLocation ?? "an unknown location") + ".",
        recommendedAction: "Contact the driver to check on the delivery progress.",
      });
    }

    // --- Missing delivery info ---
    if (
      order.order_type === "delivery" &&
      !deliveryLocation &&
      status !== "delivered" &&
      status !== "completed" &&
      status !== "cancelled"
    ) {
      alerts.push({
        ...base,
        id: alertId(order.id, "missing_delivery_info"),
        severity: "HIGH",
        category: "missing_delivery_info",
        title: "Missing delivery location",
        description:
          "Order #" + order.order_number + " is a delivery order but has no delivery location recorded.",
        recommendedAction: "Contact the student (" + order.student_name + ") to confirm the delivery address.",
        responsibleParty: "admin",
      });
    }

    // --- Incomplete order data ---
    if (
      !order.student_name &&
      status !== "cancelled" &&
      status !== "completed" &&
      status !== "delivered"
    ) {
      alerts.push({
        ...base,
        id: alertId(order.id, "incomplete_order"),
        severity: "LOW",
        category: "incomplete_order",
        title: "Incomplete order data",
        description:
          "Order #" + order.order_number + " is missing the student name.",
        recommendedAction: "Verify the order details and update the record.",
        responsibleParty: "admin",
      });
    }
  }

  // Sort: HIGH first, then MEDIUM, then LOW; within the same severity sort by minutes descending
  const severityRank: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  alerts.sort((a, b) => {
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.minutesInStatus - a.minutesInStatus;
  });

  return alerts;
}

// ---------------------------------------------------------------------------
// Daily summary
// ---------------------------------------------------------------------------

export function generateDailySummary(
  orders: MinimalOrder[],
  alerts: OperationalAlert[],
): DailySummary {
  const terminalStatuses = new Set(["delivered", "completed", "cancelled"]);
  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => terminalStatuses.has(o.status)).length;
  const activeOrders = totalOrders - completedOrders;
  const delayedDeliveries = alerts.filter((a) => a.category === "delayed_delivery").length;

  const summaryText =
    "Today UniEats processed " + totalOrders + " order" + (totalOrders === 1 ? "" : "s") + ". " +
    completedOrders + " " + (completedOrders === 1 ? "was" : "were") + " completed. " +
    activeOrders + " " + (activeOrders === 1 ? "is" : "are") + " currently active. " +
    (alerts.length > 0
      ? alerts.length + " order" + (alerts.length === 1 ? "" : "s") + " require" + (alerts.length === 1 ? "s" : "") + " attention."
      : "No orders require attention.") +
    (delayedDeliveries > 0
      ? " " + delayedDeliveries + " delivery" + (delayedDeliveries === 1 ? "" : "ies") + " appear" + (delayedDeliveries === 1 ? "s" : "") + " delayed."
      : "");

  return {
    totalOrders,
    completedOrders,
    activeOrders,
    ordersRequiringAttention: alerts.length,
    delayedDeliveries,
    summaryText,
  };
}

// ---------------------------------------------------------------------------
// Overview (single entry point for the UI)
// ---------------------------------------------------------------------------

export function buildAIOverview(
  orders: MinimalOrder[],
  canteens: MinimalCanteen[],
  now: Date = new Date(),
): AIOperationsOverview {
  const alerts = analyzeOrders(orders, canteens, now);
  const dailySummary = generateDailySummary(orders, alerts);

  const readyWaitingForDriver = orders.filter(
    (o) => o.status === "ready" && o.order_type === "delivery",
  ).length;
  const activeDeliveries = orders.filter(
    (o) => o.status === "out_for_delivery",
  ).length;
  const completedDeliveries = orders.filter(
    (o) => (o.status === "delivered" || o.status === "completed") && o.order_type === "delivery",
  ).length;
  const delayedOrders = alerts.filter(
    (a) =>
      a.category === "delayed_delivery" ||
      a.category === "ready_not_picked_up",
  ).length;

  const actions = buildActions(alerts);

  return {
    ordersRequiringAttention: alerts.length,
    delayedOrders,
    readyWaitingForDriver,
    activeDeliveries,
    completedDeliveries,
    alerts,
    actions,
    dailySummary,
  };
}
// ---------------------------------------------------------------------------
// Action layer
// ---------------------------------------------------------------------------

/**
 * Promotes alerts into OperationalActions with an initial state.
 * Action states are tracked client-side (not persisted in Supabase).
 * The admin can transition: open -> acknowledged -> resolved.
 */
export function buildActions(alerts: OperationalAlert[]): OperationalAction[] {
  return alerts.map((alert) => ({
    ...alert,
    actionState: "open" as ActionState,
  }));
}

// ---------------------------------------------------------------------------
// Timing enrichment (for Gemini)
// ---------------------------------------------------------------------------

/**
 * Computes real timing durations for each order.
 * Returns enriched order data with human-readable timing fields
 * that can be passed directly to the Gemini prompt.
 */
export function computeOrderTimings(
  orders: MinimalOrder[],
  now: Date = new Date(),
): Record<string, unknown>[] {
  return orders.map((order) => {
    const statusTimestamp =
      order.status === "confirmed" ? order.confirmed_at :
      order.status === "preparing" ? order.preparing_at :
      order.status === "ready" ? order.ready_at :
      order.status === "out_for_delivery" ? order.out_for_delivery_at :
      order.status === "delivered" ? order.delivered_at :
      null;

    const minutesInCurrentStatus = minutesSince(statusTimestamp ?? order.created_at, now);
    const totalLifecycleMinutes = minutesSince(order.created_at, now);

    // Compute stage durations where timestamps exist
    const preparationMinutes =
      order.preparing_at && order.ready_at
        ? Math.max(0, Math.floor((new Date(order.ready_at).getTime() - new Date(order.preparing_at).getTime()) / 60_000))
        : order.status === "preparing" ? minutesInCurrentStatus : null;

    const waitingForDriverMinutes =
      order.ready_at && order.status === "ready"
        ? minutesSince(order.ready_at, now)
        : null;

    const deliveryMinutes =
      order.out_for_delivery_at
        ? (order.delivered_at
            ? Math.max(0, Math.floor((new Date(order.delivered_at).getTime() - new Date(order.out_for_delivery_at).getTime()) / 60_000))
            : minutesSince(order.out_for_delivery_at, now))
        : null;

    return {
      orderNumber: order.order_number,
      studentName: order.student_name,
      orderType: order.order_type,
      status: order.status,
      deliveryLocation: order.delivery_location ?? null,
      minutesInCurrentStatus,
      totalLifecycleMinutes,
      preparationMinutes,
      waitingForDriverMinutes,
      deliveryMinutes,
      createdAt: order.created_at ?? null,
      confirmedAt: order.confirmed_at ?? null,
      preparingAt: order.preparing_at ?? null,
      readyAt: order.ready_at ?? null,
      outForDeliveryAt: order.out_for_delivery_at ?? null,
      deliveredAt: order.delivered_at ?? null,
    };
  });
}