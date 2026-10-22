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
      { title: "Menu — NEBA Café" },
      {
        name: "description",
        content:
          "Browse the full NEBA Café menu: burgers, pizza, chips & sides and soft drinks with live availability and prices in ETB.",
      },
      { property: "og:title", content: "Menu — NEBA Café" },
      {
        property: "og:description",
        content: "Burgers, pizza, sides and drinks, freshly prepared.",
      },
    ],
  }),
  component: MenuIndexPage,
});

function MenuIndexPage() {
  const { categories, products } = Route.useLoaderData();
  return <MenuBrowser initialCategories={categories} initialProducts={products} />;
}
