import type { Metadata } from "next";
import CanteenPortalContent from "@/components/canteen/CanteenPortalContent";

export const metadata: Metadata = {
  title: "Canteen Portal | UniEats",
  description: "View and manage canteen orders, update workflow status, and track live order activity.",
};

export default function CanteenPage() {
  return <CanteenPortalContent />;
}
