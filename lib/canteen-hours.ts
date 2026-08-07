import { useEffect, useState } from "react";

export interface SscCanteenStatus {
  isOpen: boolean;
  label: string;
  message: string;
  operatingHours: string;
}

const OPENING_HOUR = 6;
const OPERATING_HOURS = "6:00 AM – 12:00 AM";

export function getSscCanteenStatus(date = new Date()): SscCanteenStatus {
  const formatter = new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const second = Number(parts.find((part) => part.type === "second")?.value ?? "0");

  const currentSeconds = hour * 3600 + minute * 60 + second;
  const openingSeconds = OPENING_HOUR * 3600;
  const isOpen = currentSeconds >= openingSeconds && currentSeconds < 24 * 3600;

  return {
    isOpen,
    label: isOpen ? "🟢 Open Now" : "🔴 Closed Now",
    message: isOpen
      ? `Open • ${OPERATING_HOURS}`
      : `SSC Canteen is currently closed. Operating hours: ${OPERATING_HOURS}.`,
    operatingHours: OPERATING_HOURS,
  };
}

export function isSscCanteenOpenNow(date = new Date()): boolean {
  return getSscCanteenStatus(date).isOpen;
}

export function useSscCanteenStatus() {
  const [status, setStatus] = useState<SscCanteenStatus>(() => getSscCanteenStatus());

  useEffect(() => {
    const refreshStatus = () => setStatus(getSscCanteenStatus());

    refreshStatus();
    const interval = window.setInterval(refreshStatus, 60000);

    return () => window.clearInterval(interval);
  }, []);

  return status;
}
