import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/site/Section";
import { useCart } from "@/lib/cart";
import { formatETB, getProduct } from "@/lib/menu-data";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — Rekik Coffee" },
      { name: "description", content: "Review your Rekik Coffee order before checkout." },
      { property: "og:title", content: "Your Cart — Rekik Coffee" },
      { property: "og:description", content: "Review your Rekik Coffee order before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { lines, setQuantity, remove, clear, subtotal, discount, delivery, total } = useCart();

  if (lines.length === 0) {
    return (
      <Section className="max-w-2xl py-12 sm:py-16">
        <h1 className="mb-8 font-display text-4xl font-bold tracking-tight text-coffee">Your Cart</h1>
        <EmptyState
          icon={<ShoppingBag className="size-8 text-gold" />}
          title="Your cart is empty"
          description="Explore our authentic Ethiopian single-origin roasts, drinks, and café treats."
          action={
            <Button asChild className="rounded-full bg-gold hover:bg-gold-light text-espresso font-semibold px-7 shadow-md">
              <Link to="/menu">Explore Menu</Link>
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <Section className="py-10 sm:py-14">
      <div className="flex items-baseline justify-between border-b border-border/80 pb-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Order Review</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-coffee">Your Cart</h1>
        </div>
        <span className="text-sm text-muted-foreground">{lines.length} {lines.length === 1 ? "item" : "items"}</span>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <ul className="space-y-4">
          {lines.map((line) => {
            const product = getProduct(line.productId);
            if (!product) return null;
            return (
              <li key={line.productId} className="surface-card flex gap-4 p-4 rounded-2xl border border-border/80 shadow-xs transition-all hover:border-gold/40">
                <img
                  src={product.image}
                  alt={product.name}
                  loading="lazy"
                  width={768}
                  height={768}
                  className="size-24 shrink-0 rounded-xl object-cover border border-border/40"
                />
                <div className="flex flex-1 flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold text-foreground">{product.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {formatETB(product.price)} each
                      </p>
                    </div>
                    <span className="font-semibold text-coffee">
                      {formatETB(product.price * line.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-full text-muted-foreground hover:text-coffee"
                        aria-label={`Decrease ${product.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold text-foreground">{line.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-full text-muted-foreground hover:text-coffee"
                        aria-label={`Increase ${product.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => remove(line.productId)}
                      aria-label={`Remove ${product.name}`}
                    >
                      <Trash2 className="size-3.5 mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
          <li className="pt-2">
            <Button variant="outline" size="sm" className="rounded-full text-xs text-muted-foreground hover:text-foreground" onClick={clear}>
              Clear cart
            </Button>
          </li>
        </ul>

        <aside className="surface-card h-fit p-6 sm:p-7 rounded-2xl border border-gold/30 bg-warm-white shadow-sm lg:sticky lg:top-24">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <h2 className="font-display text-lg font-semibold text-coffee">Order Summary</h2>
            <span className="text-xs font-semibold uppercase tracking-wider text-gold">Rekik Coffee</span>
          </div>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium text-foreground">{formatETB(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="font-medium text-emerald-600">{discount > 0 ? `-${formatETB(discount)}` : formatETB(0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Estimated Delivery</dt>
              <dd className="font-medium text-foreground">{formatETB(delivery)}</dd>
            </div>
          </dl>
          <div className="mt-5 flex justify-between border-t border-border/80 pt-4 font-display text-xl font-bold text-coffee">
            <span>Total</span>
            <span className="text-primary">{formatETB(total)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Prices in Ethiopian Birr (ETB). Final totals confirmed at checkout.
          </p>
          <Button asChild size="lg" className="mt-6 w-full rounded-full bg-gold hover:bg-gold-light text-espresso font-semibold shadow-md hover:shadow-lg transition-all">
            <Link to="/checkout">Proceed to Checkout</Link>
          </Button>
        </aside>
      </div>
    </Section>
  );
}
