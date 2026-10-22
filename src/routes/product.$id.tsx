import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/site/Section";
import { useCart } from "@/lib/cart";
import { formatETB, getProduct, registerProduct } from "@/lib/menu-data";
import { fetchProductById } from "@/services/api";

export const Route = createFileRoute("/product/$id")({
  loader: async ({ params }) => {
    try {
      const product = await fetchProductById(params.id);
      if (product) {
        registerProduct(product);
        return { product };
      }
    } catch {
      // Fall back to synchronous getProduct
    }
    const product = getProduct(params.id);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Product unavailable — NEBA Café" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { product } = loaderData;
    const title = `${product.name} — NEBA Café`;
    return {
      meta: [
        { title },
        { name: "description", content: product.description },
        { property: "og:title", content: title },
        { property: "og:description", content: product.description },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);

  return (
    <Section>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link to="/menu" className="hover:text-foreground">
          Menu
        </Link>
        <span className="px-2">/</span>
        <Link
          to="/menu/$category"
          params={{ category: product.categorySlug }}
          className="hover:text-foreground"
        >
          {product.categorySlug}
        </Link>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            width={768}
            height={768}
            className="aspect-square w-full object-cover"
          />
        </div>

        <div>
          <h1 className="text-4xl font-semibold">{product.name}</h1>
          <p className="mt-3 font-display text-2xl font-semibold text-primary">
            {formatETB(product.price)}
          </p>
          <Badge
            variant={product.available ? "secondary" : "outline"}
            className="mt-4 rounded-full"
          >
            {product.available ? "Available now" : "Unavailable"}
          </Badge>

          <p className="mt-6 text-muted-foreground">{product.description}</p>

          {product.ingredients.length > 0 && (
            <div className="mt-6">
              <h2 className="font-display text-base font-semibold">Ingredients</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {product.ingredients.map((i) => (
                  <li key={i} className="rounded-full bg-secondary px-3 py-1 text-sm">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 rounded-full border border-border p-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-8 text-center font-medium" aria-live="polite">
                {quantity}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <Button
              size="lg"
              disabled={!product.available}
              onClick={() => {
                add(product.id, quantity);
                toast.success(`${quantity} × ${product.name} added to cart`);
              }}
            >
              {product.available ? "Add to Cart" : "Product unavailable"}
            </Button>
          </div>

          {!product.available && (
            <p className="mt-4 text-sm text-muted-foreground">
              This product is currently unavailable and cannot be added to a new order.
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}
