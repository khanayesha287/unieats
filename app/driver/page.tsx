import type { Metadata } from "next";
import DriverPortalContent from "@/components/driver/DriverPortalContent";

export const metadata: Metadata = {
  title: "Driver Portal | UniEats",
  description: "Manage deliveries, update delivery status, and track active orders.",
};

export default function DriverPage() {
  return <DriverPortalContent />;
}
