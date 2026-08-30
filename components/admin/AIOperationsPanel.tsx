"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAIOverview,
  type AlertSeverity,
  type OperationalAlert,
  type OperationalAction,
  type ActionState,
  type ResponsibleParty,
  type AIOperationsOverview,
} from "@/lib/ai-operations";

// ---------------------------------------------------------------------------
// Props
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
}

interface MinimalCanteen {
  id: number | string;
  name: string;
}

interface AIOperationsPanelProps {
  orders: MinimalOrder[];
  canteens: MinimalCanteen[];
}

// ---------------------------------------------------------------------------
// Gemini response types
// ---------------------------------------------------------------------------

interface GeminiPriorityItem {
  orderNumber: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  issue: string;
  reason: string;
  recommendedAction: string;
  responsibleParty?: "canteen" | "driver" | "admin";
}

interface GeminiAnalysis {
  summary: string;
  priority: GeminiPriorityItem[];
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Persisted action shape (from Supabase ai_operations_actions table)
// ---------------------------------------------------------------------------

interface PersistedAction {
  id: string;
  order_id: string;
  order_number: string;
  action_key: string;
  priority: string;
  current_status: string;
  issue: string;
  recommended_action: string;
  responsible_party: string;
  reason: string | null;
  category: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-blue-100 text-blue-700 border-blue-200",
};

const PARTY_STYLES: Record<ResponsibleParty, string> = {
  canteen: "bg-orange-100 text-orange-700 border-orange-200",
  driver: "bg-cyan-100 text-cyan-700 border-cyan-200",
  admin: "bg-purple-100 text-purple-700 border-purple-200",
};

const PARTY_LABELS: Record<ResponsibleParty, string> = {
  canteen: "Canteen",
  driver: "Driver",
  admin: "Admin",
};

const ACTION_STATE_STYLES: Record<ActionState, string> = {
  open: "bg-red-50 border-red-200",
  acknowledged: "bg-amber-50 border-amber-200",
  resolved: "bg-green-50 border-green-200",
};

const CATEGORY_ICONS: Record<string, string> = {
  stuck_pending: "\u23F3",
  stuck_confirmed: "\u2705\uFE0F",
  stuck_preparing: "\uD83C\uDF73",
  ready_not_picked_up: "\uD83D\uDCE6",
  delayed_delivery: "\uD83D\uDE9A",
  missing_delivery_info: "\u26A0\uFE0F",
  incomplete_order: "\uD83D\uDCDD",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-PK", {
    timeStyle: "medium",
  }).format(date);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OverviewStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={"mb-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " + accent}>
        {label}
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function AlertCard({
  alert,
  onDismiss,
}: {
  alert: OperationalAlert;
  onDismiss: (id: string) => void;
}) {
  const icon = CATEGORY_ICONS[alert.category] ?? "\uD83D\uDD14";
  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">{icon}</span>
          <h4 className="text-sm font-bold text-slate-900">{alert.title}</h4>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase " + SEVERITY_STYLES[alert.severity]}>
            {alert.severity}
          </span>
          <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase " + PARTY_STYLES[alert.responsibleParty]}>
            {PARTY_LABELS[alert.responsibleParty]}
          </span>
          <button
            type="button"
            onClick={() => onDismiss(alert.id)}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Dismiss alert"
            aria-label="Dismiss alert"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs leading-relaxed text-slate-600">{alert.description}</p>
      <div className="mb-2 rounded-lg bg-violet-50 px-3 py-2">
        <p className="text-xs font-semibold text-violet-800">
          <span className="font-bold">Recommended:</span> {alert.recommendedAction}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>Order <strong className="text-slate-700">#{alert.orderNumber}</strong></span>
        <span>Canteen: <strong className="text-slate-700">{alert.canteenName}</strong></span>
        <span>Status: <strong className="text-slate-700">{alert.currentStatus.replace(/_/g, " ")}</strong></span>
        <span>Time: <strong className="text-slate-700">{alert.minutesInStatus}m</strong></span>
        {alert.deliveryLocation && (
          <span>Location: <strong className="text-slate-700">{alert.deliveryLocation}</strong></span>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  action,
  onTransition,
}: {
  action: OperationalAction;
  onTransition: (id: string, next: ActionState) => void;
}) {
  const icon = CATEGORY_ICONS[action.category] ?? "\uD83D\uDD14";
  const isResolved = action.actionState === "resolved";
  return (
    <div className={"rounded-xl border bg-white p-4 transition hover:shadow-md " + ACTION_STATE_STYLES[action.actionState]}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">{icon}</span>
          <h4 className="text-sm font-bold text-slate-900">Order #{action.orderNumber}</h4>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase " + SEVERITY_STYLES[action.severity]}>
            {action.severity}
          </span>
          <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase " + PARTY_STYLES[action.responsibleParty]}>
            {PARTY_LABELS[action.responsibleParty]}
          </span>
        </div>
      </div>
      <p className="mb-1 text-xs font-semibold text-slate-800">{action.title}</p>
      <p className="mb-2 text-xs leading-relaxed text-slate-600">{action.description}</p>
      <div className="mb-3 rounded-lg bg-violet-50 px-3 py-2">
        <p className="text-xs font-semibold text-violet-800">
          <span className="font-bold">Action:</span> {action.recommendedAction}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>Status: <strong className="text-slate-700">{action.currentStatus.replace(/_/g, " ")}</strong></span>
          <span>Time: <strong className="text-slate-700">{action.minutesInStatus}m</strong></span>
          {action.deliveryLocation && <span>Location: <strong className="text-slate-700">{action.deliveryLocation}</strong></span>}
        </div>
        <div className="flex gap-2">
          {action.actionState === "open" && (
            <button type="button" onClick={() => onTransition(action.id, "acknowledged")} className="rounded-lg bg-amber-500 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-amber-600">
              Acknowledge
            </button>
          )}
          {action.actionState === "acknowledged" && (
            <button type="button" onClick={() => onTransition(action.id, "resolved")} className="rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-600">
              Resolve
            </button>
          )}
          {isResolved && (
            <span className="rounded-lg bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">
              Resolved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function GeminiPriorityCard({ item }: { item: GeminiPriorityItem }) {
  const severityStyles: Record<string, string> = {
    HIGH: "bg-red-100 text-red-700 border-red-200",
    MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
    LOW: "bg-blue-100 text-blue-700 border-blue-200",
  };
  const rp = item.responsibleParty;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-slate-900">Order #{item.orderNumber}</h4>
        <div className="flex shrink-0 items-center gap-2">
          <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase " + (severityStyles[item.severity] ?? "")}>
            {item.severity}
          </span>
          {rp && PARTY_LABELS[rp as ResponsibleParty] && (
            <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase " + (PARTY_STYLES[rp as ResponsibleParty] ?? "")}>
              {PARTY_LABELS[rp as ResponsibleParty]}
            </span>
          )}
        </div>
      </div>
      <p className="mb-1 text-xs font-semibold text-slate-800">{item.issue}</p>
      <p className="mb-2 text-xs text-slate-500">{item.reason}</p>
      <div className="rounded-lg bg-indigo-50 px-3 py-2">
        <p className="text-xs font-semibold text-indigo-800">
          <span className="font-bold">Action:</span> {item.recommendedAction}
        </p>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AIOperationsPanel({ orders, canteens }: AIOperationsPanelProps) {
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);


  // --- Gemini state ---
  const [geminiAnalysis, setGeminiAnalysis] = useState<GeminiAnalysis | null>(null);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiTimestamp, setGeminiTimestamp] = useState<Date | null>(null);
  const fetchRef = useRef(0);

  // --- Deterministic overview ---
  const now = useMemo(() => new Date(), []);
  const overview: AIOperationsOverview = useMemo(
    () => buildAIOverview(orders, canteens, now),
    [orders, canteens, now],
  );

  const visibleAlerts = useMemo(
    () => overview.alerts.filter((a) => !dismissedAlertIds.has(a.id)),
    [overview.alerts, dismissedAlertIds],
  );

  const highAlerts = visibleAlerts.filter((a) => a.severity === "HIGH");
  const mediumAlerts = visibleAlerts.filter((a) => a.severity === "MEDIUM");
  const lowAlerts = visibleAlerts.filter((a) => a.severity === "LOW");

  // --- Persisted action state (Supabase-backed) ---
  const [persistedActions, setPersistedActions] = useState<PersistedAction[]>([]);
  const [isActionsLoading, setIsActionsLoading] = useState(false);

  // Build a map from action_key → persisted status
  const persistedStatusMap = useMemo(() => {
    const map = new Map<string, { dbId: string; status: ActionState }>();
    for (const pa of persistedActions) {
      map.set(pa.action_key, { dbId: pa.id, status: pa.status as ActionState });
    }
    return map;
  }, [persistedActions]);

  // Merge rules-engine actions with persisted Supabase states
  const actionsWithState = useMemo(() => {
    return overview.actions.map((a) => {
      const persisted = persistedStatusMap.get(a.id);
      return {
        ...a,
        actionState: persisted?.status ?? a.actionState,
        _dbId: persisted?.dbId,
      };
    });
  }, [overview.actions, persistedStatusMap]);

  const openActionCount = actionsWithState.filter((a) => a.actionState === "open").length;

  // Fetch persisted actions from Supabase
  const fetchPersistedActions = useCallback(async () => {
    setIsActionsLoading(true);
    try {
      const res = await fetch("/api/ai-actions");
      if (res.ok) {
        const data: PersistedAction[] = await res.json();
        setPersistedActions(data);
      }
    } catch {
      // Silently fall back to client-side state
    } finally {
      setIsActionsLoading(false);
    }
  }, []);

  // Sync fresh alerts to Supabase (creates new action records)
  const syncAlerts = useCallback(async (alerts: OperationalAlert[]) => {
    if (alerts.length === 0) return;
    try {
      await fetch("/api/ai-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts }),
      });
    } catch {
      // Non-critical: persistence is best-effort
    }
  }, []);

  // On mount and when alerts change: sync + fetch
  useEffect(() => {
    if (overview.alerts.length === 0) return;
    void syncAlerts(overview.alerts).then(() => fetchPersistedActions());
  }, [overview.alerts, syncAlerts, fetchPersistedActions]);

  // Initial fetch on mount (even if no current alerts, to show previously persisted ones)
  useEffect(() => {
    void fetchPersistedActions();
  }, [fetchPersistedActions]);

  // Transition action state via Supabase PATCH
  const handleActionTransition = useCallback(async (actionKey: string, next: ActionState) => {
    const action = actionsWithState.find((a) => a.id === actionKey);
    const dbId = (action as (typeof action & { _dbId?: string }))?._dbId;
    if (!dbId) {
      // Fallback: no DB record yet, just update locally
      return;
    }
    // Optimistic update
    setPersistedActions((prev) =>
      prev.map((pa) => pa.id === dbId ? { ...pa, status: next } : pa),
    );
    try {
      const res = await fetch("/api/ai-actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: dbId, next }),
      });
      if (!res.ok) {
        // Revert on failure
        void fetchPersistedActions();
      }
    } catch {
      void fetchPersistedActions();
    }
  }, [actionsWithState, fetchPersistedActions]);

  const handleDismiss = useCallback((alertId: string) => {
    setDismissedAlertIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
  }, []);

  const handleResetDismissed = useCallback(() => {
    setDismissedAlertIds(new Set());
  }, []);

  // --- Fetch Gemini analysis ---
  const fetchGeminiAnalysis = useCallback(async () => {
    if (orders.length === 0) return;

    const fetchId = ++fetchRef.current;
    setIsGeminiLoading(true);
    setGeminiError(null);

    try {
      const response = await fetch("/api/ai-operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders, canteens }),
      });

      if (fetchId !== fetchRef.current) return;

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message =
          errorBody?.error ?? ("API returned " + response.status);
        setGeminiError(message);
        setGeminiAnalysis(null);
        return;
      }

      const data: GeminiAnalysis = await response.json();
      if (fetchId !== fetchRef.current) return;

      setGeminiAnalysis(data);
      setGeminiTimestamp(new Date());
      setGeminiError(null);
    } catch (err) {
      if (fetchId !== fetchRef.current) return;
      setGeminiError(err instanceof Error ? err.message : "Network error");
      setGeminiAnalysis(null);
    } finally {
      if (fetchId === fetchRef.current) {
        setIsGeminiLoading(false);
      }
    }
  }, [orders, canteens]);

  // Auto-fetch when orders or canteens change (debounced by order identity)
  useEffect(() => {
    if (orders.length === 0 || isCollapsed) return;
    const timer = setTimeout(() => {
      void fetchGeminiAnalysis();
    }, 800);
    return () => clearTimeout(timer);
  }, [orders, canteens, isCollapsed, fetchGeminiAnalysis]);

  const attentionCount = visibleAlerts.length;
  const hasGemini = geminiAnalysis !== null && !geminiError;

  return (
    <section className="mt-8">
      {/* ---- Header ---- */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-2 text-left"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-sm text-white shadow">
            AI
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">AI Operations Agent</h2>
            <p className="text-xs text-slate-500">
              {hasGemini
                ? "Powered by Google Gemini + Rules Engine"
                : "Real-time operational intelligence"}
            </p>
          </div>
          <svg
            className={"ml-1 h-5 w-5 text-slate-400 transition-transform " + (isCollapsed ? "" : "rotate-180")}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => void fetchGeminiAnalysis()}
              disabled={isGeminiLoading || orders.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <svg className={"h-3.5 w-3.5 " + (isGeminiLoading ? "animate-spin" : "")} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.379 2.624l-1.42 1.42a7.5 7.5 0 0012.795-3.794l-1.996-.25zM4.688 8.576a5.5 5.5 0 019.379-2.624l1.42-1.42a7.5 7.5 0 00-12.795 3.794l1.996.25z" clipRule="evenodd" />
              </svg>
              {isGeminiLoading ? "Analyzing..." : "Refresh AI"}
            </button>
          )}
          {dismissedAlertIds.size > 0 && (
            <button
              type="button"
              onClick={handleResetDismissed}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Show dismissed ({dismissedAlertIds.size})
            </button>
          )}
        </div>
      </div>

      {isCollapsed ? null : (
        <div className="space-y-6">
          {/* ---- Overview Stats ---- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <OverviewStat
              label="Need Attention"
              value={attentionCount}
              accent={attentionCount > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}
            />
            <OverviewStat label="Delayed" value={overview.delayedOrders} accent="bg-amber-100 text-amber-700" />
            <OverviewStat label="Ready / Waiting" value={overview.readyWaitingForDriver} accent="bg-emerald-100 text-emerald-700" />
            <OverviewStat label="Active Deliveries" value={overview.activeDeliveries} accent="bg-cyan-100 text-cyan-700" />
            <OverviewStat label="Completed Today" value={overview.completedDeliveries} accent="bg-green-100 text-green-700" />
            <OverviewStat
              label="Total Alerts"
              value={overview.alerts.length}
              accent={overview.alerts.length > 0 ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}
            />
          </div>

          {/* ================================================================ */}
          {/* OPERATIONS ACTIONS SECTION                                       */}
          {/* ================================================================ */}
          {actionsWithState.length > 0 && (
            <div className="rounded-2xl border border-slate-300 bg-gradient-to-r from-slate-50 to-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/60 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">{"⚡"}</span>
                  <h3 className="text-sm font-bold text-slate-900">Operations Actions</h3>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {actionsWithState.length} action{actionsWithState.length === 1 ? "" : "s"}
                  </span>
                </div>
                {openActionCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">
                    {openActionCount} open
                  </span>
                )}
              </div>
              <div className="space-y-3 p-5">
                {actionsWithState.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onTransition={handleActionTransition}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* GEMINI AI ANALYSIS SECTION                                       */}
          {/* ================================================================ */}
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 overflow-hidden">
            {/* Gemini header bar */}
            <div className="flex items-center justify-between border-b border-indigo-200 bg-indigo-100/50 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden="true">{"\u2728"}</span>
                <h3 className="text-sm font-bold text-indigo-900">Gemini AI Analysis</h3>
                {hasGemini && geminiTimestamp && (
                  <span className="rounded-full bg-indigo-200/60 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                    Updated {formatTime(geminiTimestamp)}
                  </span>
                )}
                {isGeminiLoading && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Loading...
                  </span>
                )}
              </div>
              {hasGemini && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Gemini Active
                </span>
              )}
            </div>

            <div className="p-5">
              {/* Loading state */}
              {isGeminiLoading && !geminiAnalysis && (
                <div className="flex items-center gap-3 py-6 text-sm text-indigo-600">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 20 20" fill="none">
                    <circle className="opacity-25" cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
                    <path className="opacity-75" fill="currentColor" d="M4 10a6 6 0 016-6v2a4 4 0 00-4 4H4z" />
                  </svg>
                  Gemini is analyzing your orders...
                </div>
              )}

              {/* Error / fallback state */}
              {geminiError && !isGeminiLoading && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-800">
                    Gemini unavailable: {geminiError}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-600">
                    Showing deterministic rules-engine analysis below. The AI will retry on next refresh.
                  </p>
                </div>
              )}

              {/* Gemini analysis content */}
              {hasGemini && !isGeminiLoading && (
                <div className="space-y-5">
                  {/* Summary */}
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                      Operational Summary
                    </h4>
                    <p className="text-sm leading-relaxed text-indigo-900">
                      {geminiAnalysis.summary}
                    </p>
                  </div>

                  {/* Priority items */}
                  {geminiAnalysis.priority.length > 0 && (
                    <div>
                      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-700">
                        Priority Issues ({geminiAnalysis.priority.length})
                      </h4>
                      <div className="space-y-3">
                        {geminiAnalysis.priority.map((item, index) => (
                          <GeminiPriorityCard key={String(index) + "-" + item.orderNumber} item={item} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {geminiAnalysis.recommendations.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                        Recommendations
                      </h4>
                      <ul className="space-y-2">
                        {geminiAnalysis.recommendations.map((rec, index) => (
                          <li key={String(index)} className="flex items-start gap-2 text-xs text-indigo-800">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-[10px] font-bold text-indigo-800">
                              {index + 1}
                            </span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* No issues from Gemini */}
                  {geminiAnalysis.priority.length === 0 && geminiAnalysis.recommendations.length === 0 && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                      <p className="text-sm font-semibold text-green-800">No issues detected by Gemini AI.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ================================================================ */}
          {/* DETERMINISTIC RULES ENGINE (always shown)                        */}
          {/* ================================================================ */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">{"\uD83D\uDCCA"}</span>
              <h3 className="text-sm font-bold text-slate-900">Rules Engine Analysis</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                Deterministic
              </span>
            </div>

            {/* Daily Summary */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm leading-relaxed text-slate-800">
                {overview.dailySummary.summaryText}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span>Total: <strong>{overview.dailySummary.totalOrders}</strong></span>
                <span>Completed: <strong>{overview.dailySummary.completedOrders}</strong></span>
                <span>Active: <strong>{overview.dailySummary.activeOrders}</strong></span>
                <span>Attention: <strong>{overview.dailySummary.ordersRequiringAttention}</strong></span>
                <span>Delayed deliveries: <strong>{overview.dailySummary.delayedDeliveries}</strong></span>
              </div>
            </div>

            {/* Alerts by Priority */}
            {visibleAlerts.length === 0 ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                <span className="mb-2 block text-3xl" aria-hidden="true">{"\u2705"}</span>
                <p className="text-sm font-semibold text-green-800">All operations running smoothly.</p>
                <p className="mt-1 text-xs text-green-600">No alerts at this time. The AI Agent is continuously monitoring orders.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {highAlerts.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-red-700">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                      High Priority ({highAlerts.length})
                    </h3>
                    <div className="space-y-3">
                      {highAlerts.map((alert) => (
                        <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
                      ))}
                    </div>
                  </div>
                )}
                {mediumAlerts.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                      Medium Priority ({mediumAlerts.length})
                    </h3>
                    <div className="space-y-3">
                      {mediumAlerts.map((alert) => (
                        <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
                      ))}
                    </div>
                  </div>
                )}
                {lowAlerts.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-700">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                      Low Priority ({lowAlerts.length})
                    </h3>
                    <div className="space-y-3">
                      {lowAlerts.map((alert) => (
                        <AlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Decision Support */}
            {visibleAlerts.length > 0 && (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">{"\uD83E\uDDE0"}</span>
                  <h3 className="text-sm font-bold text-violet-900">Decision Support</h3>
                </div>
                <p className="mb-3 text-xs text-violet-700">
                  Based on current operational data, here is what you should handle first:
                </p>
                <ol className="space-y-2">
                  {visibleAlerts.slice(0, 5).map((alert, index) => (
                    <li key={alert.id} className="flex items-start gap-2 text-xs text-violet-800">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800">
                        {index + 1}
                      </span>
                      <span>
                        <strong>{alert.title}</strong> &mdash; {alert.recommendedAction}
                        <span className="ml-1 text-violet-500">(Order #{alert.orderNumber}, {alert.minutesInStatus}m ago)</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* ---- Footer ---- */}
          <p className="text-center text-[11px] text-slate-400">
            AI Operations Agent &middot; Monitoring {orders.length} orders across {canteens.length} canteen{canteens.length === 1 ? "" : "s"} &middot; All data sourced from Supabase
          </p>
        </div>
      )}
    </section>
  );
}