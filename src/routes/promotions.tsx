import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, Clock, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section, SectionHeading, EmptyState } from "@/components/site/Section";
import {
  calculateDiscountedPrice,
  derivePromotionStatus,
  formatDiscount,
  formatPromotionExpiry,
  resolvePromotionTargetType,
  type Promotion,
} from "@/lib/promotions";
import {
  categories as seedCategories,
  formatETB,
  type Category,
  type Product,
} from "@/lib/menu-data";
import { fetchCategories, fetchProducts, fetchPromotions } from "@/services/api";

export const Route = createFileRoute("/promotions")({
  loader: async () => {
    const [promotions, products, categories] = await Promise.all([
      fetchPromotions().catch(() => []),
      fetchProducts().catch(() => []),
      fetchCategories().catch(() => []),
    ]);
    return { promotions, products, categories };
  },
  head: () => ({
    meta: [
      { title: "Promotions & Specials — NEBA Café" },
      {
        name: "description",
        content:
          "Browse all active special promotions, limited-time discounts, and combo deals at NEBA Café.",
      },
      { property: "og:title", content: "Promotions & Specials — NEBA Café" },
      {
        property: "og:description",
        content:
          "Enjoy handcrafted burgers, stone-baked pizza, sides, and drinks with exclusive active discounts.",
      },
    ],
  }),
  component: PromotionsPage,
});

function PromotionProductCard({
  product,
  discountType,
  discountValue,
}: {
  product: Product;
  discountType: "percentage" | "fixed";
  discountValue: number;
}) {
  const origPrice = Number(product.price) || 0;
  const discPrice = calculateDiscountedPrice(origPrice, discountType, discountValue);
  const hasDisc = discPrice < origPrice;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/90 p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-md">
      <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 hover:scale-105"
        />
      </div>

      <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold text-foreground">{product.name}</h4>
          {product.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
          ) : null}
        </div>

        <div className="pt-2 border-t border-border/50 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-base font-semibold text-primary">
              {formatETB(discPrice)}
            </span>
            {hasDisc && (
              <span className="text-xs text-muted-foreground line-through">
                {formatETB(origPrice)}
              </span>
            )}
          </div>
          <Button asChild size="sm" className="rounded-full text-xs">
            <Link to="/product/$id" params={{ id: product.id }}>
              Order
              <ArrowRight className="ml-1 size-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PromotionsPage() {
  const { promotions, products, categories } = Route.useLoaderData();

  // 1. Build lookup map for products
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products || []) {
      if (p && p.id) {
        map.set(p.id, p);
      }
    }
    return map;
  }, [products]);

  // 2. Build category collections following Menu page organization
  const categoriesList = useMemo(() => {
    return categories && categories.length > 0 ? categories : seedCategories;
  }, [categories]);

  const activeCategories = useMemo(() => {
    return categoriesList.filter((c) => c && c.active !== false);
  }, [categoriesList]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categoriesList) {
      if (c && c.id) map.set(c.id, c);
    }
    return map;
  }, [categoriesList]);

  const categoryBySlug = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categoriesList) {
      if (c && c.slug) map.set(c.slug, c);
    }
    return map;
  }, [categoriesList]);

  const inactiveCategoryIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of categoriesList) {
      if (c && c.active === false) set.add(c.id);
    }
    return set;
  }, [categoriesList]);

  const inactiveCategorySlugs = useMemo(() => {
    const set = new Set<string>();
    for (const c of categoriesList) {
      if (c && c.active === false) set.add(c.slug);
    }
    return set;
  }, [categoriesList]);

  // 3. Eligible available products (excluding unavailable items and items in inactive categories)
  const eligibleAvailableProducts = useMemo(() => {
    return (products || []).filter((p) => {
      if (!p || p.available === false) return false;
      if (p.categoryId && inactiveCategoryIds.has(p.categoryId)) return false;
      if (p.categorySlug && inactiveCategorySlugs.has(p.categorySlug)) return false;
      return true;
    });
  }, [products, inactiveCategoryIds, inactiveCategorySlugs]);

  // 4. Filter ONLY currently active promotions and sort newest-first (createdAt DESC)
  const activePromotions = useMemo(() => {
    return (promotions || [])
      .filter((p) => derivePromotionStatus(p) === "active")
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return (b.id || "").localeCompare(a.id || "");
      });
  }, [promotions]);

  // 5. Pre-resolve promotions into renderable groups across all 3 targeting modes
  const renderablePromotions = useMemo(() => {
    return activePromotions
      .map((promo) => {
        const targetType = resolvePromotionTargetType(promo);

        // --- Mode A: All Products ---
        if (targetType === "all") {
          const categoryGroups = activeCategories
            .map((cat) => ({
              category: cat,
              products: eligibleAvailableProducts.filter(
                (p) => (p.categoryId && p.categoryId === cat.id) || p.categorySlug === cat.slug,
              ),
            }))
            .filter((group) => group.products.length > 0);

          // Append any unassigned eligible products to "Other"
          const assignedIds = new Set(categoryGroups.flatMap((g) => g.products.map((p) => p.id)));
          const unassigned = eligibleAvailableProducts.filter((p) => !assignedIds.has(p.id));
          if (unassigned.length > 0) {
            categoryGroups.push({
              category: {
                id: "other",
                slug: "other",
                name: "Other",
                tagline: "Seasonal picks",
                active: true,
              },
              products: unassigned,
            });
          }

          if (categoryGroups.length === 0) return null;
          return {
            promo,
            targetType: "all" as const,
            categoryGroups,
          };
        }

        // --- Mode B: Category ---
        if (targetType === "category") {
          const targetCategory: Category | undefined =
            (promo.categoryId ? categoryById.get(promo.categoryId) : undefined) ||
            (promo.applicableCategorySlug
              ? categoryBySlug.get(promo.applicableCategorySlug)
              : undefined) ||
            undefined;

          // Inactive category -> do not display
          if (targetCategory && targetCategory.active === false) return null;

          const categoryProducts = eligibleAvailableProducts.filter((p) => {
            if (promo.categoryId && p.categoryId) {
              return p.categoryId === promo.categoryId;
            }
            if (targetCategory) {
              return (
                (p.categoryId && p.categoryId === targetCategory.id) ||
                p.categorySlug === targetCategory.slug
              );
            }
            if (promo.applicableCategorySlug) {
              return p.categorySlug === promo.applicableCategorySlug;
            }
            return false;
          });

          if (categoryProducts.length === 0) return null;
          return {
            promo,
            targetType: "category" as const,
            targetCategory,
            products: categoryProducts,
          };
        }

        // --- Mode C: Specific Products ---
        const targetedProducts: Product[] = [];
        for (const pid of promo.applicableProductIds) {
          if (pid === "*") continue;
          const prod = productById.get(pid);
          if (prod && prod.available !== false) {
            if (prod.categoryId && inactiveCategoryIds.has(prod.categoryId)) continue;
            if (prod.categorySlug && inactiveCategorySlugs.has(prod.categorySlug)) continue;
            targetedProducts.push(prod);
          }
        }

        // Fallback to embedded products if not in productById
        if (
          targetedProducts.length === 0 &&
          Array.isArray(promo.products) &&
          promo.products.length > 0
        ) {
          for (const item of promo.products) {
            if (item && item.isAvailable !== false) {
              if (item.categoryId && inactiveCategoryIds.has(item.categoryId)) continue;
              targetedProducts.push({
                id: item.id,
                categoryId: item.categoryId ?? undefined,
                name: item.name,
                slug: item.slug || item.id,
                categorySlug: "other",
                description: "",
                ingredients: [],
                price: item.price,
                image: item.imageUrl || "/images/classic-burger.jpg",
                available: item.isAvailable,
                featured: false,
              });
            }
          }
        }

        if (targetedProducts.length === 0) return null;
        return {
          promo,
          targetType: "products" as const,
          products: targetedProducts,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [
    activePromotions,
    activeCategories,
    eligibleAvailableProducts,
    categoryById,
    categoryBySlug,
    productById,
    inactiveCategoryIds,
    inactiveCategorySlugs,
  ]);

  return (
    <div className="min-h-screen py-10 sm:py-16">
      {/* ── Page Header ── */}
      <Section className="pt-0 pb-10 sm:pb-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <SectionHeading
            eyebrow="Special Offers"
            title="Active promotions & deals"
            description="Handcrafted favorites prepared fresh in our kitchen with limited-time promotional pricing."
          />
          <Button
            asChild
            variant="outline"
            className="rounded-full gap-2 hover:bg-secondary transition-all duration-300 w-fit"
          >
            <Link to="/menu">
              View full menu
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </Section>

      {/* ── Content: Active Deals or Empty State ── */}
      <Section className="pt-0">
        {renderablePromotions.length === 0 ? (
          <EmptyState
            icon={<Tag className="size-12 stroke-1 text-muted-foreground/80" aria-hidden />}
            title="No active promotions right now"
            description="We refresh our specials frequently. Check back soon for new discounts, combo deals, and seasonal specials."
            action={
              <Button asChild className="rounded-full px-6 shadow-sm">
                <Link to="/menu">Explore our menu</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-10 sm:space-y-12">
            {renderablePromotions.map((item, idx) => {
              const { promo, targetType } = item;
              const discountBadge = formatDiscount(promo);
              const expiryLabel = formatPromotionExpiry(promo.endDate);

              // ── Case A: All Products (Complete menu grouped by category) ──
              if (targetType === "all") {
                return (
                  <article
                    key={promo.id || `promo-${idx}`}
                    className="group relative surface-card overflow-hidden rounded-3xl border border-border/80 p-6 sm:p-8 md:p-10 shadow-[var(--shadow-lift)] transition-all duration-500 hover:border-primary/30"
                  >
                    {/* Ambient background glow */}
                    <div
                      className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary/10 blur-3xl"
                      aria-hidden
                    />

                    <div className="relative z-10 flex flex-col gap-6">
                      {/* Top Meta row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                            <Sparkles className="size-3.5" aria-hidden />
                            {discountBadge}
                          </span>
                          <Badge
                            variant="secondary"
                            className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                          >
                            All Products
                          </Badge>
                        </div>

                        <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                          <Clock className="size-3.5 text-primary" aria-hidden />
                          {expiryLabel}
                        </div>
                      </div>

                      {/* Header & Description */}
                      <div className="max-w-2xl space-y-2">
                        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                          {promo.name}
                        </h2>
                        {promo.description ? (
                          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                            {promo.description}
                          </p>
                        ) : (
                          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                            Applies across our entire menu. Enjoy this special discount on all your
                            favorite meals.
                          </p>
                        )}
                      </div>

                      {/* Complete eligible menu grouped by category */}
                      <div className="space-y-8 pt-2">
                        {item.categoryGroups.map((group) => (
                          <div key={group.category.id} className="space-y-4">
                            <div className="flex items-center gap-2.5 border-b border-border/60 pb-2">
                              <h3 className="font-display text-lg font-semibold text-foreground tracking-tight">
                                {group.category.name}
                              </h3>
                              <span className="text-xs text-muted-foreground font-medium">
                                ({group.products.length})
                              </span>
                              {group.category.tagline && (
                                <span className="hidden sm:inline text-xs text-muted-foreground/80">
                                  — {group.category.tagline}
                                </span>
                              )}
                            </div>

                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                              {group.products.map((p) => (
                                <PromotionProductCard
                                  key={p.id}
                                  product={p}
                                  discountType={promo.discountType}
                                  discountValue={promo.discountValue}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Bottom action */}
                      <div className="pt-2">
                        <Button asChild size="lg" className="rounded-full px-7 shadow-sm">
                          <Link to="/menu">
                            Explore full menu
                            <ArrowRight className="ml-2 size-4" aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              }

              // ── Case B: Category Promotion ──
              if (targetType === "category") {
                const categoryName = item.targetCategory?.name || "Selected Category";

                return (
                  <article
                    key={promo.id || `promo-${idx}`}
                    className="group relative surface-card overflow-hidden rounded-3xl border border-border/80 p-6 sm:p-8 md:p-10 shadow-[var(--shadow-lift)] transition-all duration-500 hover:border-primary/30"
                  >
                    {/* Ambient background glow */}
                    <div
                      className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary/10 blur-3xl"
                      aria-hidden
                    />

                    <div className="relative z-10 flex flex-col gap-6">
                      {/* Top Meta row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                            <Sparkles className="size-3.5" aria-hidden />
                            {discountBadge}
                          </span>
                          <Badge
                            variant="secondary"
                            className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                          >
                            Category: {categoryName}
                          </Badge>
                        </div>

                        <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                          <Clock className="size-3.5 text-primary" aria-hidden />
                          {expiryLabel}
                        </div>
                      </div>

                      {/* Header & Description */}
                      <div className="max-w-2xl space-y-2">
                        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                          {promo.name}
                        </h2>
                        {promo.description ? (
                          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                            {promo.description}
                          </p>
                        ) : (
                          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                            Special discount valid on all items in our{" "}
                            <strong className="text-foreground">{categoryName}</strong> selection.
                          </p>
                        )}
                      </div>

                      {/* Category products grid */}
                      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 pt-2">
                        {item.products.map((p) => (
                          <PromotionProductCard
                            key={p.id}
                            product={p}
                            discountType={promo.discountType}
                            discountValue={promo.discountValue}
                          />
                        ))}
                      </div>

                      {/* Bottom action */}
                      <div className="pt-2">
                        {item.targetCategory?.slug ? (
                          <Button asChild size="lg" className="rounded-full px-7 shadow-sm">
                            <Link
                              to="/menu/$category"
                              params={{ category: item.targetCategory.slug }}
                            >
                              View {categoryName} on menu
                              <ArrowRight className="ml-2 size-4" aria-hidden />
                            </Link>
                          </Button>
                        ) : (
                          <Button asChild size="lg" className="rounded-full px-7 shadow-sm">
                            <Link to="/menu">
                              View {categoryName} on menu
                              <ArrowRight className="ml-2 size-4" aria-hidden />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              }

              // ── Case C: Specific Products ──
              const targetedProducts = item.products;

              // C1. Single targeted product layout
              if (targetedProducts.length === 1) {
                const singleProd = targetedProducts[0]!;
                const origPrice = Number(singleProd.price) || 0;
                const discPrice = calculateDiscountedPrice(
                  origPrice,
                  promo.discountType,
                  promo.discountValue,
                );
                const hasDisc = discPrice < origPrice;

                return (
                  <article
                    key={promo.id || `promo-${idx}`}
                    className="group relative surface-card overflow-hidden rounded-3xl border border-border/80 shadow-[var(--shadow-lift)] transition-all duration-500 hover:border-primary/30"
                  >
                    <div className="grid items-center md:grid-cols-12">
                      {/* Product Image */}
                      <div className="relative h-64 sm:h-72 md:col-span-5 md:h-full min-h-[260px] overflow-hidden">
                        <img
                          src={singleProd.image}
                          alt={singleProd.name}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-md">
                          <Sparkles className="size-3.5" aria-hidden />
                          {discountBadge}
                        </div>
                      </div>

                      {/* Editorial & Pricing Details */}
                      <div className="relative flex flex-col justify-center space-y-4 p-6 sm:p-8 md:col-span-7 md:p-10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary w-fit">
                            <span
                              className="size-1.5 rounded-full bg-primary animate-pulse"
                              aria-hidden
                            />
                            {promo.name}
                          </span>
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                            <Clock className="size-3.5 text-primary" aria-hidden />
                            {expiryLabel}
                          </div>
                        </div>

                        <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                          {singleProd.name}
                        </h3>

                        <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                          {promo.description?.trim() ||
                            singleProd.description ||
                            "Limited-time special offer."}
                        </p>

                        <div className="flex items-baseline gap-3 pt-1">
                          <span className="font-display text-3xl font-semibold text-primary">
                            {formatETB(discPrice)}
                          </span>
                          {hasDisc && (
                            <span className="text-base text-muted-foreground line-through sm:text-lg">
                              {formatETB(origPrice)}
                            </span>
                          )}
                          <span className="text-xs uppercase tracking-wider text-muted-foreground">
                            Special Deal
                          </span>
                        </div>

                        <div className="pt-2">
                          <Button asChild size="lg" className="rounded-full px-7 shadow-sm">
                            <Link to="/product/$id" params={{ id: singleProd.id }}>
                              Order this special
                              <ArrowRight className="ml-2 size-4" aria-hidden />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              }

              // C2. Multiple targeted products layout
              return (
                <article
                  key={promo.id || `promo-${idx}`}
                  className="group relative surface-card overflow-hidden rounded-3xl border border-border/80 p-6 sm:p-8 md:p-10 shadow-[var(--shadow-lift)] transition-all duration-500 hover:border-primary/30"
                >
                  <div className="relative z-10 flex flex-col gap-6">
                    {/* Header meta */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                          <Sparkles className="size-3.5" aria-hidden />
                          {discountBadge}
                        </span>
                        <Badge
                          variant="secondary"
                          className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                        >
                          {targetedProducts.length} Products Included
                        </Badge>
                      </div>

                      <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                        <Clock className="size-3.5 text-primary" aria-hidden />
                        {expiryLabel}
                      </div>
                    </div>

                    <div className="max-w-2xl space-y-2">
                      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                        {promo.name}
                      </h2>
                      {promo.description ? (
                        <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                          {promo.description}
                        </p>
                      ) : (
                        <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
                          Special promotion valid across the following selected menu items.
                        </p>
                      )}
                    </div>

                    {/* Products Grid */}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 pt-2">
                      {targetedProducts.map((p) => (
                        <PromotionProductCard
                          key={p.id}
                          product={p}
                          discountType={promo.discountType}
                          discountValue={promo.discountValue}
                        />
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
