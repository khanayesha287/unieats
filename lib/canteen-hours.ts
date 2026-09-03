import { useState } from "react";

export interface SscCanteenStatus {
  isOpen: boolean;
  label: string;
  message: string;
  operatingHours: string;
}

const OPERATING_HOURS = "Open 24 hours, 7 days a week";

/**
 * All canteens operate 24/7 — ordering is available at any time of day.
 * Kept as a function so consumers retain a stable API if hours ever change.
 */
export function getSscCanteenStatus(): SscCanteenStatus {
  return {
    isOpen: true,
    label: "Open Now",
    message: `Open 24/7 • ${OPERATING_HOURS}`,
    operatingHours: OPERATING_HOURS,
  };
}

export function isSscCanteenOpenNow(): boolean {
  return true;
}

export function useSscCanteenStatus() {
  // Always open; kept as a hook so existing consumers keep working unchanged.
  const [status] = useState<SscCanteenStatus>(getSscCanteenStatus);
  return status;
}
