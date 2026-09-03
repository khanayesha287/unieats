"use client";

import { useSscCanteenStatus } from "@/lib/canteen-hours";

interface SscCanteenStatusProps {
  className?: string;
  compact?: boolean;
  showMessage?: boolean;
  variant?: "default" | "dark";
}

export default function SscCanteenStatus({
  className = "",
  compact = false,
  showMessage = true,
  variant = "default",
}: SscCanteenStatusProps) {
  const status = useSscCanteenStatus();

  // All canteens are open 24/7, so the badge permanently renders the open state.
  const pillClasses =
    variant === "dark"
      ? "bg-white/20 text-white ring-white/20"
      : "bg-green-50 text-green-700 ring-green-200";

  const messageClasses = variant === "dark" ? "text-white/90" : "text-gray-700";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span
        className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${pillClasses}`}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
        {status.label}
      </span>
      {showMessage && !compact && (
        <p className={`text-sm ${messageClasses}`}>{status.message}</p>
      )}
    </div>
  );
}
