import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MenuBrowser } from "@/components/site/MenuBrowser";
import { fetchCategories, fetchProducts } from "@/services/api";

export const Route = createFileRoute("/menu/$category")({
  loader: async ({ params }) => {
    const [categories, products] = await Promise.all([
      fetchCategories().catch(() => []),
      fetchProducts().catch(() => []),
    ]);

    const targetCategory = categories.find((c) => c.slug === params.category);
    if (targetCategory && targetCategory.active === false) {
      throw redirect({ to: "/menu" });
    }

    return { categories, products };
  },
  head: ({ params, loaderData }) => {
    const category = loaderData?.categories?.find((c: any) => c.slug === params.category);
    if (category && category.active === false) {
      return {
        meta: [
          { title: "Menu — Rekik Café" },
          { name: "description", content: "Browse the full Rekik Café menu." },
        ],
      };
    }

    const title = category ? `${category.name} — Rekik Café Menu` : "Menu — Rekik Café";
    const description = category
      ? `${category.name}: ${category.tagline}. Order online from Rekik Café.`
      : "Browse the Rekik Café menu.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useParams();
  const { categories, products } = Route.useLoaderData();
  const navigate = useNavigate();

  const targetCategory = (categories as any[])?.find((c: any) => c.slug === category);

  useEffect(() => {
    if (targetCategory && targetCategory.active === false) {
      void navigate({ to: "/menu" });
    }
  }, [targetCategory, navigate]);

  if (targetCategory && targetCategory.active === false) {
    return null;
  }

  return (
    <MenuBrowser
      activeCategory={category}
      initialCategories={categories}
      initialProducts={products}
    />
  );
}
