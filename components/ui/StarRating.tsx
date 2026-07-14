import { getStarDisplay } from "@/lib/format";

interface StarRatingProps {
  rating: number;
  className?: string;
}

export default function StarRating({ rating, className = "" }: StarRatingProps) {
  return (
    <p
      className={`text-sm text-[#F4C542] ${className}`}
      aria-label={`${rating} out of 5 stars`}
    >
      {getStarDisplay(rating)}
    </p>
  );
}
