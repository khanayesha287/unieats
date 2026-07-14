export function formatPrice(amount: number): string {
  return `Rs.${amount.toLocaleString("en-PK")}`;
}

export function getStarDisplay(rating: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
}
