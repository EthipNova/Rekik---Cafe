import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/cart";
import { formatETB, type Product } from "@/lib/menu-data";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();

  return (
    <article className="group surface-card hover-lift flex flex-col overflow-hidden">
      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="relative block aspect-4/3 overflow-hidden bg-muted"
      >
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          width={768}
          height={768}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {!product.available && (
          <span className="absolute inset-0 flex items-center justify-center bg-espresso/60">
            <Badge variant="secondary" className="text-xs uppercase tracking-widest">
              Unavailable
            </Badge>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col justify-between gap-2 p-3 sm:p-4">
        <div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <h3 className="font-display text-sm font-semibold leading-tight sm:text-lg">
              <Link
                to="/product/$id"
                params={{ id: product.id }}
                className="line-clamp-1 sm:line-clamp-none"
              >
                {product.name}
              </Link>
            </h3>
            <span className="whitespace-nowrap text-xs font-bold text-primary sm:text-sm sm:font-semibold">
              {formatETB(product.price)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:mt-1.5 sm:text-sm">
            {product.description}
          </p>
        </div>

        <Button
          size="sm"
          className="mt-2.5 w-full h-8 text-xs sm:mt-3 sm:h-9 sm:text-sm"
          disabled={!product.available}
          onClick={() => {
            add(product.id);
            toast.success(`${product.name} added to cart`);
          }}
        >
          <Plus className="size-3.5 sm:size-4" />
          <span className="truncate">{product.available ? "Add to Cart" : "Unavailable"}</span>
        </Button>
      </div>
    </article>
  );
}
