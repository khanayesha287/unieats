"use client";

import { useState } from "react";
import StarRating from "@/components/ui/StarRating";
import QuantitySelector from "@/components/ui/QuantitySelector";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice } from "@/lib/format";
import type { MenuItem } from "@/lib/types";
import { getCanteenName } from "@/lib/data/canteens";

interface FoodCardProps {
  item: MenuItem;
}

export default function FoodCard({ item }: FoodCardProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    addItem(
      {
        id: item.id,
        name: item.name,
        price: item.price,
        canteenSlug: item.canteenSlug,
        canteenName: getCanteenName(item.canteenSlug),
        gradient: item.gradient,
      },
      quantity,
    );
    setQuantity(1);
  };

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-3xl border border-transparent bg-white shadow-lg shadow-[#6C2BD9]/5 transition-all duration-300 hover:-translate-y-2 hover:border-[#6C2BD9]/20 hover:shadow-xl hover:shadow-[#6C2BD9]/20 ${
        !item.available ? "opacity-60" : ""
      }`}
    >
      <div
        className={`relative h-44 bg-gradient-to-br ${item.gradient} transition-shadow duration-300 group-hover:shadow-[inset_0_0_40px_rgba(108,43,217,0.15)]`}
      >
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
          <p className="text-xl font-bold text-[#6C2BD9]">
            {formatPrice(item.price)}
          </p>
          <StarRating rating={item.rating} />
        </div>

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
