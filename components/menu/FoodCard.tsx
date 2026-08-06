"use client";

import Image from "next/image";
import { useState } from "react";
import StarRating from "@/components/ui/StarRating";
import QuantitySelector from "@/components/ui/QuantitySelector";
import { useCart } from "@/components/providers/CartProvider";
import type { MenuItem } from "@/lib/types";
import { getCanteenName } from "@/lib/data/canteens";
import { getMenuImage } from "@/lib/data/menus";

interface FoodCardProps {
  item: MenuItem;
}

export default function FoodCard({ item }: FoodCardProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [imgError, setImgError] = useState(false);

  // Determine if it's a Deal card
  const isDealCard = item.id.includes("-deal-");

  // Determine size selector variables
  const hasSizes = item.sizes !== undefined;
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    if (!item.sizes) return "";
    return "Small" in item.sizes ? "Small" : "Medium";
  });

  const imageSrc = item.image ?? getMenuImage(item.name);
  const displaySrc = imgError ? "/menu/placeholder.jpg" : imageSrc;
  const currentPrice = hasSizes && selectedSize ? item.sizes![selectedSize] : item.price;

  const handleAddToCart = () => {
    const finalPrice = currentPrice;
    const finalId = hasSizes && selectedSize ? `${item.id}-${selectedSize}` : item.id;
    addItem(
      {
        id: finalId,
        name: item.name,
        price: finalPrice,
        canteenSlug: item.canteenSlug,
        canteenName: getCanteenName(item.canteenSlug),
        gradient: item.gradient,
        size: hasSizes && selectedSize ? selectedSize : undefined,
      },
      quantity,
    );
    setQuantity(1);
  };

  if (isDealCard) {
    return (
      <article
        className={`group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 hover:-translate-y-2 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/20 ${
          !item.available ? "opacity-60" : ""
        }`}
      >
        <div className={`relative h-[220px] w-full overflow-hidden rounded-t-xl bg-gradient-to-br ${item.gradient} transition-shadow duration-300 group-hover:shadow-[inset_0_0_40px_rgba(108,43,217,0.15)] sm:h-[180px] md:h-[220px]`}>
          <Image
            src={displaySrc}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
          {!item.available && (
            <span className="absolute left-4 top-4 rounded-full bg-gray-900/80 px-3 py-1 text-xs font-semibold text-white">
              Unavailable
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
          </div>
          
          <ul className="mt-2 flex-1 space-y-1 text-sm text-gray-600">
            {item.description.split("\n").map((line, index) => {
              const cleanLine = line.replace(/^[•\-\s]+/, "").trim();
              if (!cleanLine) return null;
              return (
                <li key={index} className="flex items-center gap-1.5">
                  <span className="text-[#6C2BD9] font-bold">•</span>
                  <span>{cleanLine}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-3">
            <QuantitySelector
              value={quantity}
              onChange={setQuantity}
              label={`Quantity for ${item.name}`}
            />
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!item.available}
              className="flex-1 rounded-full bg-[#6C2BD9] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#6C2BD9]/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5B21B6] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </article>
    );
  }

  // Normal / Pizza item card layout
  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 hover:-translate-y-2 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/20 ${
        !item.available ? "opacity-60" : ""
      }`}
    >
      <div className={`relative h-[220px] overflow-hidden rounded-[20px] bg-gradient-to-br ${item.gradient} transition-shadow duration-300 group-hover:shadow-[inset_0_0_40px_rgba(108,43,217,0.15)] sm:h-[180px] md:h-[220px]`}>
        <Image
          src={displaySrc}
          alt={item.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={() => setImgError(true)}
        />
        {!item.available && (
          <span className="absolute left-4 top-4 rounded-full bg-gray-900/80 px-3 py-1 text-xs font-semibold text-white">
            Unavailable
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-600">
          {item.description}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <StarRating rating={item.rating} />
        </div>

        {hasSizes && item.sizes && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Choose Size</p>
            <div className="mt-2 flex gap-2">
              {Object.keys(item.sizes).map((size) => {
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all duration-200 border ${
                      isSelected
                        ? "bg-[#6C2BD9] text-white border-[#6C2BD9] shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:border-[#6C2BD9]/30 hover:text-[#6C2BD9]"
                    }`}
                  >
                    {size === "Small" ? 'Small (7")' : size === "Medium" ? 'Medium (10")' : 'Large (13")'}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <QuantitySelector
            value={quantity}
            onChange={setQuantity}
            label={`Quantity for ${item.name}`}
          />
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!item.available}
            className="flex-1 rounded-full bg-[#6C2BD9] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#6C2BD9]/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#5B21B6] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </article>
  );
}
