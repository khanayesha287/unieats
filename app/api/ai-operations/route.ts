import { NextResponse } from "next/server";
import { computeOrderTimings } from "@/lib/ai-operations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeminiPriorityItem {
  orderNumber: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  issue: string;
  reason: string;
  recommendedAction: string;
  responsibleParty?: "canteen" | "driver" | "admin";
}

interface GeminiResponse {
  summary: string;
  priority: GeminiPriorityItem[];
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidGeminiResponse(data: unknown): data is GeminiResponse {
  if (!data || typeof data !== "object") return false;

  const record = data as Record<string, unknown>;

  if (typeof record.summary !== "string") return false;

  if (!Array.isArray(record.priority)) return false;

  for (const item of record.priority) {
    if (!item || typeof item !== "object") return false;

    const alert = item as Record<string, unknown>;
    if (typeof alert.orderNumber !== "string") return false;
    const sev = typeof alert.severity === "string" ? alert.severity.toUpperCase() : "";
    if (!["HIGH", "MEDIUM", "LOW"].includes(sev))
      return false;
    if (typeof alert.issue !== "string") return false;
    if (typeof alert.reason !== "string") return false;
    if (typeof alert.recommendedAction !== "string") return false;
    // responsibleParty is optional (falls back to rules engine)
    if (alert.responsibleParty !== undefined) {
      const rp = typeof alert.responsibleParty === "string" ? alert.responsibleParty.toLowerCase() : "";
      if (!["canteen", "driver", "admin"].includes(rp)) return false;
    }
  }

  if (!Array.isArray(record.recommendations)) return false;
  for (const rec of record.recommendations) {
    if (typeof rec !== "string") return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(orders: unknown[], canteens: unknown[]): string {
  // Compute real timing durations for each order
  const timedOrders = computeOrderTimings(orders as Parameters<typeof computeOrderTimings>[0]);
  const ordersJson = JSON.stringify(timedOrders, null, 2);
  const canteensJson = JSON.stringify(canteens, null, 2);

  return (
    "You are the UniEats AI Operations Coordinator for a university food ordering platform.\n\n" +
    "Analyze the following real-time operational data from our Supabase database and provide an operational analysis.\n\n" +
    "## Orders:\n" +
    ordersJson +
    "\n\n## Canteens:\n" +
    canteensJson +
    "\n\n## Analysis Requirements:\n" +
    "1. Identify delayed orders (pending > 15 min, confirmed > 20 min, preparing > 30 min)\n" +
    "2. Identify stuck orders that have not progressed in their current status\n" +
    "3. Identify ready delivery orders waiting for driver pickup (> 15 min)\n" +
    "4. Identify unusually long deliveries (out_for_delivery > 30 min)\n" +
    "5. Identify operational bottlenecks across canteens or delivery\n" +
    "6. Identify missing or inconsistent order information (delivery orders without location, missing student name)\n\n" +
    "## Severity Rules:\n" +
    "- HIGH: Order stuck more than 2x the threshold time, missing delivery info, incomplete data on active order\n" +
    "- MEDIUM: Order stuck between 1x and 2x threshold, ready but waiting for driver\n" +
    "- LOW: Minor data inconsistencies, informational alerts\n\n" +
    "## Response Format:\n" +
    "Return ONLY valid JSON (no markdown fences, no extra text) with exactly this structure:\n" +
    "{\n" +
    '  "summary": "A concise 2-4 sentence operational summary based on real data.",\n' +
    '  "priority": [\n' +
    "    {\n" +
    '      "orderNumber": "the order number from the data",\n' +
    '      "severity": "HIGH or MEDIUM or LOW",\n' +
    '      "issue": "Short description of the issue",\n' +
    '      "reason": "Why this is a problem based on the data",\n' +
    '      "recommendedAction": "Specific action the admin should take",\n' +
    '      "responsibleParty": "canteen or driver or admin"\n' +
    "    }\n" +
    "  ],\n" +
    '  "recommendations": ["Recommendation 1 based on data", "Recommendation 2"]\n' +
    "}\n\n" +
    "## CRITICAL RULES:\n" +
    "- Do NOT invent orders, times, canteens, students or statistics that are not in the data above.\n" +
    "- Only reference order numbers, canteen names, student names, and times from the provided data.\n" +
    "- If there are no issues, return an empty priority array and a positive summary.\n" +
    "- Use the pre-computed timing fields (minutesInCurrentStatus, preparationMinutes, waitingForDriverMinutes, deliveryMinutes, totalLifecycleMinutes) — do NOT recalculate from timestamps.\n" +
    "- Report exact durations in minutes from the data, e.g. 'preparing for 28 minutes'.\n" +
    "- Be specific: reference exact order numbers, canteen names, and time durations.\n" +
    "- Keep recommendations actionable and practical for a single admin.\n" +
    "- Assign responsibleParty: 'canteen' for preparation/confirmation delays, 'driver' for pickup/delivery delays, 'admin' for data issues."
  );
}

// ---------------------------------------------------------------------------
// POST /api/ai-operations
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orders: unknown[] = Array.isArray(body.orders) ? body.orders : [];
    const canteens: unknown[] = Array.isArray(body.canteens) ? body.canteens : [];

    // --- Check API key ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_actual_gemini_api_key" || apiKey === "PASTE_YOUR_GEMINI_API_KEY_HERE") {
      return NextResponse.json(
        {
          error: "Gemini API key not configured",
          fallback: true,
        },
        { status: 503 },
      );
    }

    // --- Build prompt ---
    const prompt = buildPrompt(orders, canteens);

    // --- Call Gemini ---
    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
      apiKey;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[AI Operations] Gemini API error:", geminiResponse.status, errorText);
      return NextResponse.json(
        {
          error: "Gemini API request failed: " + geminiResponse.status,
          fallback: true,
        },
        { status: 502 },
      );
    }

    const geminiData = await geminiResponse.json();

    // --- Extract text from Gemini response ---
    const textContent =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;


    if (!textContent || typeof textContent !== "string") {
      console.error(
        "[AI Operations] Unexpected Gemini response structure:",
        JSON.stringify(geminiData).slice(0, 500),
      );
      return NextResponse.json(
        { error: "Invalid Gemini response structure", fallback: true },
        { status: 502 },
      );
    }

    // --- Extract JSON (handle markdown fences, extra whitespace) ---
    let jsonText = textContent.trim();
    // Strip markdown code fences if present
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1].trim();
    }
    // Try to find a JSON object if the text contains extra content
    if (!jsonText.startsWith("{")) {
      const braceStart = jsonText.indexOf("{");
      const braceEnd = jsonText.lastIndexOf("}");
      if (braceStart !== -1 && braceEnd > braceStart) {
        jsonText = jsonText.slice(braceStart, braceEnd + 1);
      }
    }

    // --- Parse JSON ---
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : "unknown";
      console.error("[AI Operations] JSON parse error:", errMsg);
      console.error("[AI Operations] JSON text length:", jsonText.length);
      // Try to extract the last } and re-parse (handles truncated trailing content)
      const lastBrace = jsonText.lastIndexOf("}");
      if (lastBrace > 0 && lastBrace < jsonText.length - 1) {
        const trimmed = jsonText.slice(0, lastBrace + 1);
        try {
          parsed = JSON.parse(trimmed);
          console.error("[AI Operations] Recovery parse succeeded after trimming trailing content.");
        } catch {
          console.error("[AI Operations] Recovery parse also failed. First 300 chars:", jsonText.slice(0, 300));
          console.error("[AI Operations] Last 100 chars:", jsonText.slice(-100));
          return NextResponse.json(
            { error: "Gemini response is not valid JSON", fallback: true },
            { status: 502 },
          );
        }
      } else {
        console.error("[AI Operations] First 300 chars:", jsonText.slice(0, 300));
        console.error("[AI Operations] Last 100 chars:", jsonText.slice(-100));
        return NextResponse.json(
          { error: "Gemini response is not valid JSON", fallback: true },
          { status: 502 },
        );
      }
    }

    // --- Normalize parsed response ---
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).priority)) {
      const p = parsed as Record<string, unknown>;
      p.priority = (p.priority as Record<string, unknown>[]).map((item) => ({
        ...item,
        severity: typeof item.severity === "string" ? item.severity.toUpperCase() : "MEDIUM",
        orderNumber: typeof item.orderNumber === "string" ? item.orderNumber.replace(/^#/, "") : String(item.orderNumber ?? ""),
        responsibleParty: typeof item.responsibleParty === "string"
          ? (["canteen", "driver", "admin"].includes(item.responsibleParty.toLowerCase()) ? item.responsibleParty.toLowerCase() : "admin")
          : undefined,
      }));
    }

    // --- Validate structure ---
    if (!isValidGeminiResponse(parsed)) {
      console.error(
        "[AI Operations] Gemini response failed validation:",
        JSON.stringify(parsed).slice(0, 500),
      );
      return NextResponse.json(
        {
          error: "Gemini response did not match expected structure",
          fallback: true,
        },
        { status: 502 },
      );
    }

    // --- Return validated response ---
    return NextResponse.json(parsed);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    console.error("[AI Operations] Server error:", message);
    return NextResponse.json(
      { error: message, fallback: true },
      { status: 500 },
    );
  }
}