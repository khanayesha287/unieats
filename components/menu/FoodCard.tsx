"use client";

import Image from "next/image";
import { useState } from "react";
import { Plus, Minus, Check } from "lucide-react";
import { useCart } from "@/components/providers/CartProvider";
import type { MenuItem } from "@/lib/types";
import { getCanteenName, getCanteenBySlug } from "@/lib/data/canteens";
import { getMenuImage } from "@/lib/data/menus";

interface FoodCardProps {
  item: MenuItem;
  /** When true, display a small canteen-name badge on the card. */
  showCanteenBadge?: boolean;
}

export default function FoodCard({ item, showCanteenBadge = false }: FoodCardProps) {
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const canteenData = showCanteenBadge ? getCanteenBySlug(item.canteenSlug) : null;

  // Determine if sizes are pizza-style (S/M/L) or flavour-style
  const hasSizes = item.sizes !== undefined;
  const isPizzaSizes = hasSizes && item.sizes && Object.keys(item.sizes).some(
    (k) => k === "Small" || k === "Medium" || k === "Large",
  );
  const allSamePrice = hasSizes && item.sizes
    ? new Set(Object.values(item.sizes)).size === 1
    : false;
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    if (!item.sizes) return "";
    return "Small" in item.sizes ? "Small" : Object.keys(item.sizes)[0];
  });

  const imageSrc = item.image ?? getMenuImage(item.name);
  const displaySrc = imgError ? "/menu/placeholder.jpg" : imageSrc;
  const currentPrice = hasSizes && selectedSize ? item.sizes![selectedSize] : item.price;
  const isOrderingDisabled = !item.available;
  const isDeal = item.id.includes("-deal-");

  const handleAdd = () => {
    const finalId = hasSizes && selectedSize ? item.id + "-" + selectedSize : item.id;
    addItem(
      {
        id: finalId,
        name: item.name,
        price: currentPrice,
        canteenSlug: item.canteenSlug,
        canteenName: getCanteenName(item.canteenSlug),
        gradient: item.gradient,
        size: hasSizes && selectedSize ? selectedSize : undefined,
      },
      qty,
    );
    setQty(1);
    setExpanded(false);
  };

  return (
    <article
      className={"flex items-start gap-3 px-3 py-3 sm:px-4 sm:py-3.5 " + (!item.available ? "opacity-50" : "")}
    >
      {/* Thumbnail */}
      <div
        className={"relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl sm:h-[76px] sm:w-[76px] bg-gradient-to-br " + item.gradient}
      >
        <Image
          src={displaySrc}
          alt={item.name}
          fill
          sizes="80px"
          className="object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        {!item.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-[10px] font-bold uppercase text-white">N/A</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-semibold leading-snug text-gray-900 sm:text-[15px]">
          {item.name}
        </p>

        {/* Deal description — compact */}
        {isDeal && (
          <p className="line-clamp-2 text-[11px] leading-tight text-gray-500">
            {item.description
              .split("\n")
              .map((l) => l.replace(/^[•\-\s]+/, "").trim())
              .filter(Boolean)
              .join(" • ")}
          </p>
        )}

        {/* Sizes / Flavours — compact pill row */}
        {hasSizes && item.sizes && (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(item.sizes).map(([size, price]) => {
              const active = selectedSize === size;
              const label = isPizzaSizes
                ? (size === "Small" ? 'S (7")' : size === "Medium" ? 'M (10")' : size === "Large" ? 'L (13")' : size)
                : size;
              const priceLabel = allSamePrice ? "" : ` \u00B7 Rs.${price}`;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  className={
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors " +
                    (active
                      ? "border-[#6C2BD9] bg-[#6C2BD9] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-[#6C2BD9]/40")
                  }
                >
                  {label}{priceLabel}
                </button>
              );
            })}
          </div>
        )}

        {/* Canteen badge */}
        {showCanteenBadge && canteenData && (
          <span
            className={`mt-0.5 inline-flex w-fit items-center rounded-full bg-gradient-to-r ${canteenData.gradient} px-2 py-0.5 text-[10px] font-bold text-white shadow-sm`}
          >
            {canteenData.name}
          </span>
        )}

        {/* Price */}
        <p className="mt-0.5 text-xs font-bold text-[#6C2BD9]">
          Rs. {currentPrice}
        </p>
      </div>

      {/* Right-side action */}
      <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
        {isOrderingDisabled ? (
          <span className="mt-1 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-400">
            N/A
          </span>
        ) : !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={"Add " + item.name + " to cart"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6C2BD9] text-white shadow-sm shadow-[#6C2BD9]/30 transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            {/* Qty controls */}
            <div
              className="inline-flex items-center gap-0.5 rounded-full border border-[#6C2BD9]/20 bg-[#F3EDFF]/70 px-1 py-0.5"
              role="group"
              aria-label={"Quantity for " + item.name}
            >
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#6C2BD9] transition-colors hover:bg-[#6C2BD9] hover:text-white disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="w-6 text-center text-sm font-semibold text-gray-900">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#6C2BD9] transition-colors hover:bg-[#6C2BD9] hover:text-white"
                aria-label="Increase quantity"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            {/* Add confirm */}
            <button
              type="button"
              onClick={handleAdd}
              className="flex items-center gap-1 rounded-full bg-[#6C2BD9] px-3 py-1 text-[11px] font-bold text-white shadow-sm shadow-[#6C2BD9]/30 transition-transform active:scale-95"
            >
              <Check className="h-3 w-3" aria-hidden />
              Add
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
