import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import SSCMenuPageContent from "@/components/menu/SSCMenuPageContent";
import GSCMenuPageContent from "@/components/menu/GSCMenuPageContent";
import ComingSoonCanteenContent from "@/components/menu/ComingSoonCanteenContent";
import AnnexeMenuPageContent from "@/components/menu/AnnexeMenuPageContent";
import { createMetadata } from "@/lib/seo";
import { getCanteenBySlug } from "@/lib/data/canteens";

interface MenuPageProps {
  params: Promise<{ canteen: string }>;
}

export async function generateMetadata({
  params,
}: MenuPageProps): Promise<Metadata> {
  const { canteen } = await params;
  const canteenData = getCanteenBySlug(canteen);

  if (!canteenData) {
    return createMetadata({
      title: "Menu Not Found",
      description: "The requested canteen menu could not be found.",
      path: `/menu/${canteen}`,
      noIndex: true,
    });
  }

  return createMetadata({
    title: `${canteenData.name} Menu`,
    description: `Browse and order food online from ${canteenData.name} at UET Lahore. ${canteenData.description}`,
    path: `/menu/${canteen}`,
  });
}

export default async function CanteenMenuPage({ params }: MenuPageProps) {
  const { canteen } = await params;
  const canteenData = getCanteenBySlug(canteen);

  if (!canteenData) {
    notFound();
  }

  return (
    <>
      <Navbar />
      <PageShell>
        {canteen === "ssc" ? (
        <SSCMenuPageContent />
      ) : canteen === "annexe" ? (
        <AnnexeMenuPageContent />
      ) : canteenData.status === "coming-soon" ? (
        <ComingSoonCanteenContent canteen={canteenData} />
      ) : (
        <GSCMenuPageContent canteenSlug={canteen} />
      )}
      </PageShell>
      <Footer />
    </>
  );
}
