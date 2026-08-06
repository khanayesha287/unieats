import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageShell from "@/components/ui/PageShell";
import MenuPageContent from "@/components/menu/MenuPageContent";
import { createMetadata } from "@/lib/seo";
import type { CategoryFilter } from "@/lib/types";

const allowedCategories = [
  "fast-food",
  "shakes-and-juices",
  "chai-and-paratha",
  "desi-food",
] as const;

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;

  if (!allowedCategories.includes(category as (typeof allowedCategories)[number])) {
    return createMetadata({
      title: "Category Not Found",
      description: "The requested SSC category could not be found.",
      path: `/menu/ssc/${category}`,
      noIndex: true,
    });
  }

  return createMetadata({
    title: `${category.replace(/-/g, " ")} - SSC Canteen`,
    description: `Browse ${category.replace(/-/g, " ")} items from SSC Canteen.`,
    path: `/menu/ssc/${category}`,
  });
}

export default async function SSCCategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;

  if (!allowedCategories.includes(category as (typeof allowedCategories)[number])) {
    notFound();
  }

  const categoryFilter = category as CategoryFilter;

  return (
    <>
      <Navbar />
      <PageShell>
        <MenuPageContent canteenSlug="ssc" initialCategory={categoryFilter} />
      </PageShell>
      <Footer />
    </>
  );
}
