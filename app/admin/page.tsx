import type { Metadata } from "next";
import AdminDashboardContent from "@/components/admin/AdminDashboardContent";

export const metadata: Metadata = {
  title: "Admin Dashboard | UniEats",
  description: "Operations dashboard for UniEats orders, status updates, and delivery tracking.",
};

export default function AdminPage() {
  return <AdminDashboardContent />;
}
