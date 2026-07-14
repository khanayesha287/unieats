"use client";

import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
}

export default function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  label = "Quantity",
}: QuantitySelectorProps) {
  const buttonClass =
    size === "sm"
      ? "flex h-8 w-8 items-center justify-center rounded-full"
      : "flex h-9 w-9 items-center justify-center rounded-full";

  const valueClass = size === "sm" ? "w-8 text-sm" : "w-10 text-base";

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-[#6C2BD9]/15 bg-[#F3EDFF]/60 p-1"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={`${buttonClass} text-[#6C2BD9] transition-all hover:bg-[#6C2BD9] hover:text-white disabled:cursor-not-allowed disabled:opacity-40`}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span
        className={`${valueClass} text-center font-semibold text-gray-900`}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={`${buttonClass} text-[#6C2BD9] transition-all hover:bg-[#6C2BD9] hover:text-white disabled:cursor-not-allowed disabled:opacity-40`}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
