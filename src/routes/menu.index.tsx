import { createFileRoute } from "@tanstack/react-router";
import { MenuBrowser } from "@/components/site/MenuBrowser";
import { fetchCategories, fetchProducts } from "@/services/api";

export const Route = createFileRoute("/menu/")({
  loader: async () => {
    const [categories, products] = await Promise.all([
      fetchCategories().catch(() => []),
      fetchProducts().catch(() => []),
    ]);
    return { categories, products };
  },
  head: () => ({
    meta: [
      { title: "Menu — Rekik Coffee" },
      {
        name: "description",
        content:
          "Browse the full Rekik Coffee menu: single-origin Ethiopian roasts, espresso drinks, fresh pastries, and café bites with live availability and prices in ETB.",
      },
      { property: "og:title", content: "Menu — Rekik Coffee" },
      {
        property: "og:description",
        content: "Authentic single-origin Ethiopian roasts, drinks and bites.",
      },
    ],
  }),
  component: MenuIndexPage,
});

function MenuIndexPage() {
  const { categories, products } = Route.useLoaderData();
  return <MenuBrowser initialCategories={categories} initialProducts={products} />;
}
