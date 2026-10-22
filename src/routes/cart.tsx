import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/site/Section";
import { useCart } from "@/lib/cart";
import { formatETB, getProduct } from "@/lib/menu-data";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — NEBA Café" },
      { name: "description", content: "Review your NEBA Café order before checkout." },
      { property: "og:title", content: "Your Cart — NEBA Café" },
      { property: "og:description", content: "Review your NEBA Café order before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { lines, setQuantity, remove, clear, subtotal, discount, delivery, total } = useCart();

  if (lines.length === 0) {
    return (
      <Section className="max-w-2xl">
        <h1 className="mb-8 text-4xl font-semibold">Your cart</h1>
        <EmptyState
          icon={<ShoppingBag className="size-8" />}
          title="Your cart is empty"
          description="Looks like you haven't added anything yet."
          action={
            <Button asChild>
              <Link to="/menu">Explore Menu</Link>
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <Section>
      <h1 className="text-4xl font-semibold">Your cart</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <ul className="space-y-4">
          {lines.map((line) => {
            const product = getProduct(line.productId);
            if (!product) return null;
            return (
              <li key={line.productId} className="surface-card flex gap-4 p-4">
                <img
                  src={product.image}
                  alt={product.name}
                  loading="lazy"
                  width={768}
                  height={768}
                  className="size-24 shrink-0 rounded-lg object-cover"
                />
                <div className="flex flex-1 flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">{product.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {formatETB(product.price)} each
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatETB(product.price * line.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-full border border-border p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Decrease ${product.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Increase ${product.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(line.productId)}
                      aria-label={`Remove ${product.name}`}
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
          <li>
            <Button variant="outline" onClick={clear}>
              Clear cart
            </Button>
          </li>
        </ul>

        <aside className="surface-card h-fit p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-semibold">Order summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatETB(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>{formatETB(discount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd>{formatETB(delivery)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-between border-t border-border pt-4 font-display text-xl font-semibold">
            <span>Total</span>
            <span>{formatETB(total)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Final totals are verified by the backend before payment.
          </p>
          <Button asChild size="lg" className="mt-5 w-full">
            <Link to="/checkout">Proceed to Checkout</Link>
          </Button>
        </aside>
      </div>
    </Section>
  );
}
