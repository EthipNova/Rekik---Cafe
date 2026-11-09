import { Link } from "@tanstack/react-router";
import { Loader2, Search, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/site/Section";
import { ProductCard } from "@/components/site/ProductCard";
import {
  categories as seedCategories,
  products as seedProducts,
  registerProducts,
  type Category,
  type Product,
} from "@/lib/menu-data";
import { cn } from "@/lib/utils";
import { fetchCategories, fetchProducts } from "@/services/api";

export function MenuBrowser({
  activeCategory,
  initialCategories,
  initialProducts,
}: {
  activeCategory?: string | undefined;
  initialCategories?: Category[] | undefined;
  initialProducts?: Product[] | undefined;
}) {
  const [categoriesList, setCategoriesList] = useState<Category[]>(
    initialCategories && initialCategories.length > 0 ? initialCategories : seedCategories,
  );
  const [productsList, setProductsList] = useState<Product[]>(
    initialProducts && initialProducts.length > 0 ? initialProducts : seedProducts,
  );
  const [loading, setLoading] = useState(
    (!initialProducts || initialProducts.length === 0) &&
      (!initialCategories || initialCategories.length === 0),
  );
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    if (initialCategories && initialCategories.length > 0) {
      setCategoriesList(initialCategories);
    }
  }, [initialCategories]);

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setProductsList(initialProducts);
      registerProducts(initialProducts);
    }
  }, [initialProducts]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [cats, prods] = await Promise.all([
          fetchCategories().catch(() => seedCategories),
          fetchProducts().catch(() => seedProducts),
        ]);
        if (!cancelled) {
          if (cats && cats.length > 0) setCategoriesList(cats);
          if (prods && prods.length > 0) {
            setProductsList(prods);
            registerProducts(prods);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCategories = useMemo(() => {
    return categoriesList.filter((c) => c && c.active !== false);
  }, [categoriesList]);

  const disabledCategoryIdentifiers = useMemo(() => {
    const slugs = new Set<string>();
    const ids = new Set<string>();
    for (const c of categoriesList) {
      if (c && c.active === false) {
        if (c.slug) slugs.add(c.slug.toLowerCase());
        if (c.id) ids.add(c.id);
      }
    }
    return { slugs, ids };
  }, [categoriesList]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productsList.filter((p) => {
      // Exclude products belonging to disabled categories
      const isProductCategoryDisabled =
        (p.categorySlug && disabledCategoryIdentifiers.slugs.has(p.categorySlug.toLowerCase())) ||
        (p.categoryId && disabledCategoryIdentifiers.ids.has(p.categoryId));
      if (isProductCategoryDisabled) return false;

      if (activeCategory && p.categorySlug !== activeCategory) return false;
      if (availableOnly && !p.available) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    });
  }, [query, availableOnly, activeCategory, productsList, disabledCategoryIdentifiers]);

  const current = activeCategories.find((c) => c.slug === activeCategory);

  return (
    <Section>
      <header
        className={cn(
          "rounded-2xl transition-all",
          current?.imageUrl
            ? "relative overflow-hidden bg-espresso p-6 sm:p-8 text-warm-white shadow-md border border-gold/20"
            : ""
        )}
      >
        {current?.imageUrl && (
          <div className="absolute inset-0 z-0">
            <img
              src={current.imageUrl}
              alt={current.name}
              className="h-full w-full object-cover opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-espresso via-espresso/90 to-espresso/60" />
          </div>
        )}
        <div className="relative z-10">
          <p className={cn("text-xs font-semibold uppercase tracking-[0.22em]", current?.imageUrl ? "text-gold" : "text-primary")}>
            Menu
          </p>
          <h1 className={cn("mt-3 text-3xl sm:text-4xl font-semibold", current?.imageUrl ? "text-warm-white" : "text-foreground")}>
            {current ? current.name : "Our full menu"}
          </h1>
          <p className={cn("mt-3 max-w-xl", current?.imageUrl ? "text-cream/80" : "text-muted-foreground")}>
            {current ? current.tagline : "Burgers, pizza, sides and drinks — freshly prepared."}
          </p>
        </div>
      </header>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          to="/menu"
          className={cn(
            "rounded-full border px-4 py-2 text-sm font-medium transition-all shadow-2xs",
            !activeCategory
              ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
              : "border-border/80 bg-cream/30 text-foreground/85 hover:bg-cream hover:text-primary hover:border-gold/40",
          )}
        >
          All Offerings
        </Link>
        {activeCategories.map((c) => (
          <Link
            key={c.id}
            to="/menu/$category"
            params={{ category: c.slug }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all shadow-2xs",
              activeCategory === c.slug
                ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                : "border-border/80 bg-cream/30 text-foreground/85 hover:bg-cream hover:text-primary hover:border-gold/40",
            )}
          >
            {c.imageUrl && (
              <img
                src={c.imageUrl}
                alt=""
                className="size-4.5 rounded-full object-cover border border-white/20 shrink-0"
                aria-hidden
              />
            )}
            <span>{c.name}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search our coffee, roasts, dishes and drinks..."
            aria-label="Search menu"
            className="pl-9 bg-card border-border/80 focus-visible:ring-gold"
          />
        </div>
        <Button
          variant={availableOnly ? "default" : "outline"}
          onClick={() => setAvailableOnly((v) => !v)}
          aria-pressed={availableOnly}
          className={cn(
            "rounded-full",
            availableOnly ? "bg-primary text-primary-foreground" : "border-border hover:bg-cream"
          )}
        >
          Available only
        </Button>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading menu items…
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed className="size-8" />}
            title="No matching products"
            description="Try a different search term or category."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
