import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/cart";
import { formatETB, type Product } from "@/lib/menu-data";
import { calculateDiscountedPrice, formatDiscount, type Promotion } from "@/lib/promotions";

export function ProductCard({
  product,
  promotion,
}: {
  product: Product;
  promotion?: Promotion | null;
}) {
  const { add } = useCart();

  const originalPrice = Number(product.price) || 0;
  const discountedPrice = promotion
    ? calculateDiscountedPrice(originalPrice, promotion.discountType, promotion.discountValue)
    : originalPrice;
  const hasDiscount = discountedPrice < originalPrice;

  return (
    <article className="group surface-card hover-lift flex flex-col overflow-hidden border border-border/80 bg-card rounded-2xl transition-all duration-300 hover:border-gold/50 hover:shadow-md">
      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="relative block aspect-4/3 overflow-hidden bg-cream/40"
      >
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          width={768}
          height={768}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {product.featured && (
          <span className="absolute top-2.5 left-2.5 rounded-full bg-gold/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-espresso shadow-xs">
            Signature
          </span>
        )}
        {hasDiscount && (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
            {formatDiscount(promotion!)}
          </span>
        )}
        {!product.available && (
          <span className="absolute inset-0 flex items-center justify-center bg-espresso/70 backdrop-blur-xs">
            <Badge variant="secondary" className="text-xs uppercase tracking-widest font-semibold bg-cream text-espresso">
              Sold Out
            </Badge>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3.5 sm:p-4">
        <div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
            <h3 className="font-display text-base font-bold leading-tight sm:text-lg text-primary group-hover:text-gold transition-colors">
              <Link
                to="/product/$id"
                params={{ id: product.id }}
                className="line-clamp-1 sm:line-clamp-none"
              >
                {product.name}
              </Link>
            </h3>
            <div className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-sm font-bold text-primary font-display sm:text-base">
                {formatETB(discountedPrice)}
              </span>
              {hasDiscount && (
                <span className="text-xs text-muted-foreground line-through">
                  {formatETB(originalPrice)}
                </span>
              )}
            </div>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:mt-1.5 sm:text-sm leading-relaxed">
            {product.description}
          </p>
        </div>

        <Button
          size="sm"
          className="mt-2.5 w-full h-9 rounded-xl text-xs sm:mt-3 sm:h-9.5 sm:text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 border border-gold/25 transition-all shadow-xs"
          disabled={!product.available}
          onClick={() => {
            add(product.id);
            toast.success(`${product.name} added to cart`);
          }}
        >
          <Plus className="size-3.5 sm:size-4 text-gold" />
          <span className="truncate">{product.available ? "Add to Cart" : "Unavailable"}</span>
        </Button>
      </div>
    </article>
  );
}
