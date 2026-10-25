import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Coffee,
  Flame,
  MapPin,
  Pizza,
  Sparkles,
  Store,
  Tag,
  Truck,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import heroFallback from "@/assets/rekik-hero.jpg";
import rekikLogo from "@/assets/rekik-coffee-logo.jpg";
import rekikStory from "@/assets/rekik-story.jpg";
import burgersImage from "@/assets/burgers.png";
import clubSandwichImage from "@/assets/club-sandwich.png";
import easyOrderingImage from "@/assets/easy-ordering.png";
import freshMenuImage from "@/assets/fresh-menu.png";
import orderTrackingImage from "@/assets/order-tracking.png";
import pizzaImage from "@/assets/pizza.png";
import securePaymentsImage from "@/assets/secure-payments.png";
import shiroImage from "@/assets/shiro.png";
import simpleCheckoutImage from "@/assets/simple-checkout.png";
import softDrinkImage from "@/assets/soft-drink.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import {
  categories as seedCategories,
  formatETB,
  products as seedProducts,
  registerProducts,
  type Category,
  type Product,
} from "@/lib/menu-data";
import { DEFAULT_ABOUT_CONTENT, type AboutContent } from "@/lib/content";
import {
  derivePromotionStatus,
  formatDiscount,
  formatPromotionExpiry,
  resolvePromotionTargetType,
  resolveTodaySpecial,
  type Promotion,
} from "@/lib/promotions";
import { cn } from "@/lib/utils";
import { fetchAboutContent, fetchCategories, fetchProducts, fetchPromotions } from "@/services/api";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [categories, products, promotions, content] = await Promise.all([
      fetchCategories().catch(() => seedCategories),
      fetchProducts().catch(() => seedProducts),
      fetchPromotions().catch(() => []),
      fetchAboutContent().catch(() => DEFAULT_ABOUT_CONTENT),
    ]);
    return { categories, products, promotions, content };
  },
  head: () => ({
    meta: [
      { title: "Rekik Coffee — Rooted in Tradition. Crafted for the Modern Palate." },
      {
        name: "description",
        content:
          "Experience authentic Ethiopian specialty coffee, artisanal single-origin roasts, pastries and modern café ordering from Rekik Coffee.",
      },
      { property: "og:title", content: "Rekik Coffee — Rooted in Tradition. Crafted for the Modern Palate." },
      {
        property: "og:description",
        content: "Authentic Ethiopian specialty coffee and seamless modern ordering at Rekik Coffee.",
      },
    ],
  }),
  component: Home,
});

const benefits = [
  {
    image: easyOrderingImage,
    imageAlt: "Easy online coffee ordering",
    title: "Effortless Ordering",
    text: "Browse single-origin beans, drinks, and bites in seconds.",
    highlight: false,
  },
  {
    image: freshMenuImage,
    imageAlt: "Specialty Ethiopian single origin roast",
    title: "Specialty Roasts",
    text: "Hand-selected highland beans roasted fresh every week.",
    highlight: false,
  },
  {
    image: simpleCheckoutImage,
    imageAlt: "Simple checkout",
    title: "Simple Checkout",
    text: "Fast and convenient ordering with Telebirr or CBE.",
    highlight: false,
  },
  {
    image: orderTrackingImage,
    imageAlt: "Order tracking and delivery",
    title: "Live Order Tracking",
    text: "Follow your order status in real time from brewing to delivery.",
    highlight: true,
  },
  {
    image: securePaymentsImage,
    imageAlt: "Secure payments",
    title: "Secure Payments",
    text: "Protected checkout with instant verification and receipts.",
    highlight: false,
  },
];

const categoryImages: Record<string, { src: string; alt: string }> = {
  burgers: { src: burgersImage, alt: "Burger" },
  "club-sandwich": { src: clubSandwichImage, alt: "Club sandwich" },
  pizza: { src: pizzaImage, alt: "Pizza" },
  shiro: { src: shiroImage, alt: "Shiro" },
  "soft-drink": { src: softDrinkImage, alt: "Soft drink" },
};

const journey = [
  { step: "01", title: "Browse", text: "Explore the menu." },
  { step: "02", title: "Choose", text: "Select your favorite products." },
  { step: "03", title: "Cart", text: "Review your order." },
  { step: "04", title: "Checkout", text: "Provide the required information." },
  { step: "05", title: "Pay", text: "Complete payment." },
  { step: "06", title: "Track", text: "Follow your order status." },
];

const methods = [
  {
    icon: Utensils,
    title: "Dine-in",
    text: "Enjoy your meal at the cafÃ©.",
    badge: "CafÃ© Atmosphere",
  },
  {
    icon: Store,
    title: "Takeaway",
    text: "Order ahead and collect your food.",
    badge: "Skip the Queue",
  },
  {
    icon: Truck,
    title: "Delivery",
    text: "Have your order delivered to your location.",
    badge: "To Your Door",
  },
];

function getCategoryIcon(slug: string) {
  const s = slug.toLowerCase();
  if (s.includes("burger")) return Flame;
  if (s.includes("pizza")) return Pizza;
  if (s.includes("side") || s.includes("chip") || s.includes("fry")) return Utensils;
  if (s.includes("drink") || s.includes("beverage") || s.includes("coffee") || s.includes("soft"))
    return Coffee;
  return Sparkles;
}

function getPromotionScopeLabel(
  promo: Promotion,
  categoriesList: Category[],
  productsList: Product[],
): string {
  const targetType = resolvePromotionTargetType(promo);
  if (targetType === "all" || promo.appliesToAll) {
    return "All Menu Items";
  }
  if (targetType === "category") {
    const cat = categoriesList.find(
      (c) => c.id === promo.categoryId || c.slug === promo.applicableCategorySlug,
    );
    if (cat) return `Category: ${cat.name}`;
    if (promo.applicableCategorySlug) return `Category: ${promo.applicableCategorySlug}`;
    return "Category Special";
  }
  const targetedNames = promo.applicableProductIds
    .filter((id) => id && id !== "*")
    .map(
      (id) =>
        productsList.find((p) => p.id === id)?.name ||
        promo.products?.find((p) => p.id === id)?.name,
    )
    .filter(Boolean);
  if (targetedNames.length > 0) {
    if (targetedNames.length <= 2) return `Selected: ${targetedNames.join(", ")}`;
    return `Selected Items (${targetedNames.length} items)`;
  }
  return "Selected Menu Items";
}

function Home() {
  const loaderData = Route.useLoaderData();
  const [categoriesList, setCategoriesList] = useState<Category[]>(
    loaderData?.categories && loaderData.categories.length > 0
      ? loaderData.categories
      : seedCategories,
  );
  const [productsList, setProductsList] = useState<Product[]>(
    loaderData?.products && loaderData.products.length > 0 ? loaderData.products : seedProducts,
  );
  const [promotionsList, setPromotionsList] = useState<Promotion[]>(loaderData?.promotions ?? []);

  const [content, setContent] = useState<AboutContent>(
    loaderData?.content || DEFAULT_ABOUT_CONTENT,
  );
  const [heroImgSrc, setHeroImgSrc] = useState<string>(
    loaderData?.content?.homepage_hero_image?.trim() || heroFallback,
  );

  useEffect(() => {
    if (content?.homepage_hero_image?.trim()) {
      setHeroImgSrc(content.homepage_hero_image.trim());
    } else {
      setHeroImgSrc(heroFallback);
    }
  }, [content?.homepage_hero_image]);

  useEffect(() => {
    if (loaderData?.products && loaderData.products.length > 0) {
      registerProducts(loaderData.products);
    }
  }, [loaderData?.products]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [cats, prods, promos, cnt] = await Promise.all([
          fetchCategories().catch(() => seedCategories),
          fetchProducts().catch(() => seedProducts),
          fetchPromotions().catch(() => []),
          fetchAboutContent().catch(() => DEFAULT_ABOUT_CONTENT),
        ]);
        if (!cancelled) {
          if (cats && cats.length > 0) setCategoriesList(cats);
          if (prods && prods.length > 0) {
            setProductsList(prods);
            registerProducts(prods);
          }
          if (promos) {
            setPromotionsList(promos);
          }
          if (cnt) {
            setContent(cnt);
          }
        }
      } catch (err) {
        console.warn("Failed to load home page dynamic data:", err);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);


  const todaySpecial = useMemo(
    () => resolveTodaySpecial(promotionsList, productsList),
    [promotionsList, productsList],
  );
  const activePromotions = useMemo(
    () => promotionsList.filter((p) => derivePromotionStatus(p) === "active"),
    [promotionsList],
  );

  return (
    <>
      {/* ----------------------------------------------------------------------
          SECTION 1 — EDITORIAL HERO
          Authentic Rekik Coffee brand showcase with logo badge & golden accents
         ---------------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden bg-espresso">
        <img
          src={heroImgSrc}
          alt="Rekik Coffee Ethiopian Single Origin Coffee Experience"
          width={1440}
          height={1800}
          className="absolute inset-0 size-full object-cover opacity-35 mix-blend-luminosity filter contrast-125"
          onError={() => setHeroImgSrc(heroFallback)}
        />
        <div className="overlay-hero absolute inset-0 bg-gradient-to-r from-espresso via-espresso/90 to-espresso/60" />

        <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 md:py-28 lg:py-36">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
            {/* Left Column: Editorial Headline & Actions */}
            <div className="flex flex-col justify-center space-y-6 text-espresso-foreground lg:col-span-7">
              <div className="rise-in inline-flex items-center gap-3 rounded-full border border-gold/40 bg-espresso/80 py-1.5 pl-1.5 pr-4 shadow-lg backdrop-blur-md w-fit">
                <div className="overflow-hidden rounded-full border border-gold/70 size-10 sm:size-11 shrink-0 bg-white">
                  <img
                    src={rekikLogo}
                    alt="Rekik Coffee logo"
                    className="size-full object-contain"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-gold">
                  <span className="size-2 rounded-full bg-gold animate-pulse" aria-hidden />
                  <span>Ethiopian Single-Origin & Roastery</span>
                </div>
              </div>

              <h1 className="rise-in [animation-delay:100ms] font-display text-4xl font-bold leading-[1.12] sm:leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl text-warm-white max-w-2xl">
                Rooted in Tradition. <br />
                <span className="text-gold italic font-normal">Crafted for the Modern Palate.</span>
              </h1>

              <p className="rise-in [animation-delay:200ms] max-w-xl text-base leading-relaxed text-cream/90 sm:text-lg">
                Discover the pure elegance of Ethiopian highland coffees, small-batch roasted to perfection. 
                Experience seamless ordering, whether dining in, picking up, or delivered to your door.
              </p>

              <div className="rise-in [animation-delay:300ms] flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-2 w-full sm:w-auto">
                <Button
                  asChild
                  size="lg"
                  className="group w-full sm:w-auto rounded-full bg-gold hover:bg-gold-light text-espresso font-semibold px-8 shadow-lg shadow-gold/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-gold/40 border border-gold-light/40"
                >
                  <Link to="/menu">
                    Order Coffee Now
                    <ArrowRight
                      className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                      aria-hidden
                    />
                  </Link>
                </Button>

                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto rounded-full border border-gold/30 bg-white/10 text-warm-white backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/20 hover:text-gold"
                >
                  <a href="#categories">Explore Roasts & Menu</a>
                </Button>
              </div>
            </div>

            {/* Right Column: Layered 3D Visual Showcase */}
            <div className="hidden lg:col-span-5 lg:flex lg:justify-end">
              <div className="rise-in [animation-delay:400ms] group relative w-full max-w-md [perspective:1000px]">
                {/* Offset decorative golden backdrop frame */}
                <div
                  className="pointer-events-none absolute -inset-3 -rotate-2 rounded-3xl border border-gold/40 bg-gradient-to-tr from-gold/20 via-gold/5 to-transparent transition-transform duration-700 ease-out group-hover:rotate-0 motion-reduce:transform-none -z-10"
                  aria-hidden
                />

                {/* 3D Showcase Card */}
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-gold/30 bg-espresso/80 shadow-[var(--shadow-lift)] backdrop-blur-md transition-all duration-700 ease-out [transform-style:preserve-3d] group-hover:[transform:rotateX(2deg)_rotateY(-2deg)_translateY(-4px)] motion-reduce:transform-none">
                  <img
                    src={heroImgSrc}
                    alt="Authentic Rekik Coffee Experience"
                    width={800}
                    height={600}
                    className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transform-none"
                    onError={() => setHeroImgSrc(heroFallback)}
                  />

                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso via-transparent to-transparent opacity-70"
                    aria-hidden
                  />
                  
                  {/* Floating Gold Quality Seal Badge */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between p-3 rounded-xl bg-espresso/90 border border-gold/40 backdrop-blur-md">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-full bg-gold/20 border border-gold/50 flex items-center justify-center text-gold">
                        <Coffee className="size-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-warm-white">Rekik Specialty Roastery</p>
                        <p className="text-[10px] text-gold/80">Yirgacheffe • Sidama • Guji</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gold bg-gold/15 px-2 py-0.5 rounded-full border border-gold/30">
                      100% Arabica
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section id="categories" className="scroll-mt-20">
        <SectionHeading eyebrow="Categories" title="Find what you're craving" />
        <div className="mt-6 sm:mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {categoriesList
            .filter((c) => c && c.active !== false)
            .map((c) => (
              <Link
                key={c.id}
                to="/menu/$category"
                params={{ category: c.slug }}
                className="surface-card hover-lift flex flex-col justify-between p-3.5 sm:p-5 transition-all duration-300"
              >
                <div>
                  {(() => {
                    const catImg = categoryImages[c.slug];
                    if (catImg) {
                      return (
                        <div className="mb-2 sm:mb-3 flex h-12 sm:h-16 w-full items-center justify-center sm:justify-start">
                          <img
                            src={catImg.src}
                            alt={catImg.alt}
                            className="h-full w-full object-contain object-center sm:object-left"
                          />
                        </div>
                      );
                    }
                    const CatIcon = getCategoryIcon(c.slug);
                    return (
                      <div className="mb-2 sm:mb-3 flex h-12 sm:h-16 w-full items-center justify-center sm:justify-start text-primary">
                        <CatIcon className="size-7 sm:size-9" />
                      </div>
                    );
                  })()}
                  <span className="block font-display text-sm font-semibold tracking-tight leading-tight sm:text-lg">
                    {c.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-1 sm:mt-1 sm:text-sm">
                    {c.tagline}
                  </span>
                </div>
                <ArrowRight className="mt-3 size-3.5 text-primary self-end sm:mt-4 sm:size-4 sm:self-start" />
              </Link>
            ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------------------
          SECTION 3 — PROMOTIONS
          Dedicated promotional offers and campaigns section replacing popular right now
         ---------------------------------------------------------------------- */}
      <Section className="pt-0 pb-10 sm:pb-16 sm:pb-20" id="promotions">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="Special Offers"
            title="Promotions"
            description="Exclusive discounts and limited-time promotional deals on our handcrafted coffee and fresh menu."
          />
          <Button
            asChild
            variant="outline"
            className="rounded-full gap-2 hover:bg-secondary transition-all duration-300"
          >
            <Link to="/menu">
              View full menu
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        {activePromotions.length === 0 ? (
          <div className="mt-6 sm:mt-8 rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center sm:p-12">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Tag className="size-6" aria-hidden />
            </div>
            <h3 className="mt-3 font-display text-base font-semibold text-foreground sm:text-lg">
              No active promotions right now
            </h3>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm max-w-md mx-auto">
              Check back soon for upcoming holiday specials, discount hours, and exclusive offers on our handcrafted coffee and kitchen dishes!
            </p>
          </div>
        ) : (
          <div className="mt-6 sm:mt-8 grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {activePromotions.map((promo) => {
              const scopeLabel = getPromotionScopeLabel(promo, categoriesList, productsList);
              const discountLabel = formatDiscount(promo);
              const validityLabel = formatPromotionExpiry(promo.endDate);

              return (
                <div
                  key={promo.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:border-primary/50 hover:shadow-md"
                >
                  <div className="space-y-3.5">
                    {promo.imageUrl ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted border border-border/50">
                        <img
                          src={promo.imageUrl}
                          alt={promo.name}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                        />
                        <div className="absolute top-2.5 left-2.5">
                          <Badge className="bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider px-2.5 py-0.5 shadow-sm">
                            <Tag className="size-3 mr-1" aria-hidden />
                            {discountLabel}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <Badge className="bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider px-2.5 py-0.5 shadow-sm">
                          <Tag className="size-3 mr-1" aria-hidden />
                          {discountLabel}
                        </Badge>
                      </div>
                    )}

                    <div className="space-y-1">
                      <h3 className="font-display font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                        {promo.name}
                      </h3>
                      {promo.description ? (
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                          {promo.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5 rounded-xl bg-secondary/30 p-3 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                          <Sparkles className="size-3 text-gold" aria-hidden />
                          Scope
                        </span>
                        <span className="font-medium text-foreground truncate max-w-[180px]">
                          {scopeLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                          <Clock className="size-3 text-primary" aria-hidden />
                          Valid until
                        </span>
                        <span className="font-medium text-foreground">
                          {promo.endDate} ({validityLabel})
                        </span>
                      </div>
                      {promo.minOrderAmount ? (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Min. order</span>
                          <span className="font-semibold text-foreground">
                            {formatETB(promo.minOrderAmount)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-success inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-success animate-pulse" aria-hidden />
                      Active offer
                    </span>
                    <Button
                      asChild
                      size="sm"
                      className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shrink-0 gap-1.5 shadow-xs"
                    >
                      <Link to="/menu">
                        Order Now
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ----------------------------------------------------------------------
          SECTION 4 — TODAY'S SPECIAL (DYNAMIC PROMOTION)
          Editorial culinary campaign showcase with floating discount badge
         ---------------------------------------------------------------------- */}
      {todaySpecial && (
        <Section className="pt-0 pb-10 sm:pb-16 sm:pb-20">
          <div className="group relative surface-card overflow-hidden rounded-3xl border border-border/80 shadow-[var(--shadow-lift)] [perspective:1000px]">
            {/* Subtle ambient brand glow in background */}
            <div
              className="pointer-events-none absolute -right-16 -top-16 size-80 rounded-full bg-primary/10 blur-3xl"
              aria-hidden
            />

            <div className="grid items-center md:grid-cols-12">
              {/* Left Column: Layered Campaign Image */}
              <div className="relative h-72 min-h-[300px] overflow-hidden sm:h-80 md:col-span-6 md:h-full lg:col-span-5">
                <img
                  src={todaySpecial.product.image}
                  alt={todaySpecial.product.name}
                  loading="lazy"
                  width={768}
                  height={768}
                  className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transform-none"
                />
                {/* Floating Discount Badge */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full border border-primary/30 bg-primary px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-lg">
                  <Sparkles className="size-3.5" aria-hidden />
                  {todaySpecial.discountBadge}
                </div>
              </div>

              {/* Right Column: Editorial Copy */}
              <div className="relative flex flex-col justify-center space-y-4 p-5 sm:p-8 md:col-span-6 md:p-10 lg:col-span-7 lg:p-12">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary w-fit shadow-xs">
                    <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
                    Today's Special
                  </div>
                  {todaySpecial.promotion.name && (
                    <span className="inline-flex items-center rounded-full bg-secondary/80 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {todaySpecial.promotion.name}
                    </span>
                  )}
                </div>

                <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                  {todaySpecial.headline}
                </h2>

                {todaySpecial.description ? (
                  <p className="max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {todaySpecial.description}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                    <Clock className="size-3.5 text-primary" aria-hidden />
                    {todaySpecial.expiryLabel}
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2">
                  <span className="font-display text-2xl font-semibold text-primary sm:text-3xl">
                    {formatETB(todaySpecial.discountedPrice)}
                  </span>
                  {todaySpecial.hasDiscount && (
                    <span className="text-sm text-muted-foreground line-through sm:text-base sm:text-lg">
                      {formatETB(todaySpecial.originalPrice)}
                    </span>
                  )}
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Limited Time Special
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 w-full sm:w-auto">
                  <Button
                    asChild
                    size="lg"
                    className="w-full sm:w-auto rounded-full px-7 shadow-md transition-all duration-300 hover:shadow-lg"
                  >
                    <Link to="/product/$id" params={{ id: todaySpecial.product.id }}>
                      Order the special
                      <ArrowRight className="ml-2 size-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto rounded-full px-6 transition-all duration-300 hover:bg-secondary"
                  >
                    <Link to="/promotions">
                      View all specials
                      <ArrowRight className="ml-2 size-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ----------------------------------------------------------------------
          SECTION 5 — WHY REKIK COFFEE
          Editorial feature matrix with watermark numerals and tracking highlight
         ---------------------------------------------------------------------- */}
      <div className="border-y border-border/60 bg-cream py-10 sm:py-16 sm:py-20 md:py-24">
        <Section>
          <SectionHeading
            eyebrow="Why Rekik Coffee"
            title="The Soul of Ethiopian Coffee, Modernised"
            align="center"
            description="From highland terroir to small-batch roasting and live tracking, we celebrate the world's finest coffee culture."
          />
          <div className="mt-8 sm:mt-12 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-5">
            {benefits.map((b, idx) => {
              const numStr = `0${idx + 1}`;

              return (
                <div
                  key={b.title}
                  className={cn(
                    "group relative surface-card overflow-hidden p-3.5 sm:p-6 transition-all duration-500 ease-out",
                    "hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]",
                    b.highlight
                      ? "border-primary/40 ring-1 ring-primary/20 bg-background"
                      : "border-border/80",
                    idx === 4 && "col-span-2 sm:col-span-1",
                  )}
                >
                  <span
                    className="pointer-events-none absolute right-2 top-0.5 font-display text-4xl sm:text-6xl font-bold tracking-tighter text-foreground/[0.04] select-none transition-colors duration-500 group-hover:text-primary/[0.08]"
                    aria-hidden
                  >
                    {numStr}
                  </span>

                  <div className="relative z-10">
                    <div className="mb-3 sm:mb-5 flex h-14 sm:h-20 w-full items-center justify-center overflow-hidden rounded-lg sm:rounded-xl bg-secondary/50">
                      <img
                        src={b.image}
                        alt={b.imageAlt}
                        className="h-full w-full object-contain p-1.5 sm:p-2 transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>

                    <h3 className="font-display text-sm sm:text-base font-semibold tracking-tight text-foreground">
                      {b.title}
                    </h3>

                    <p className="mt-1 sm:mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                      {b.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* ----------------------------------------------------------------------
          SECTION 6 — ORDERING PROCESS
          Connected journey with progressive timeline nodes
         ---------------------------------------------------------------------- */}
      <Section className="py-10 sm:py-16 sm:py-20 md:py-24">
        <SectionHeading
          eyebrow="Ordering Process"
          title="Six Simple Steps"
          align="center"
          description="From selecting your preferred roast to your first warm sip, ordering at Rekik Coffee is effortless."
        />

        <div className="relative mt-8 sm:mt-14">
          {/* Mobile Connected Timeline (< lg) */}
          <ol className="relative flex flex-col lg:hidden">
            {journey.map((j, idx) => {
              const isLast = idx === journey.length - 1;
              return (
                <li key={j.step} className="relative flex items-start gap-3.5 pb-3.5 last:pb-0">
                  {/* Step Marker Badge */}
                  <div className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-background shadow-xs">
                    <span className="font-display text-sm font-bold text-primary">{j.step}</span>
                  </div>

                  {/* Continuous Visual Connector Line */}
                  {!isLast && (
                    <div
                      className="pointer-events-none absolute top-8 bottom-0 left-[19px] z-0 w-0.5 bg-primary/25"
                      aria-hidden
                    />
                  )}

                  {/* Compact Step Content Card */}
                  <div className="surface-card flex-1 px-3.5 py-2.5 rounded-xl transition-all duration-300">
                    <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                      {j.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{j.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Desktop 6-Column Connected Journey (lg+) */}
          <div className="relative hidden lg:block">
            {/* Connecting track line across desktop steps */}
            <div
              className="pointer-events-none absolute top-7 left-12 right-12 h-0.5 bg-border/80"
              aria-hidden
            />

            <ol className="grid grid-cols-6 gap-6">
              {journey.map((j, idx) => {
                const delayClass =
                  idx === 0
                    ? ""
                    : idx === 1
                      ? "[animation-delay:100ms]"
                      : idx === 2
                        ? "[animation-delay:200ms]"
                        : idx === 3
                          ? "[animation-delay:300ms]"
                          : idx === 4
                            ? "[animation-delay:400ms]"
                            : "[animation-delay:500ms]";

                return (
                  <li
                    key={j.step}
                    className={cn(
                      "group relative surface-card hover-lift flex flex-col items-center p-6 text-center transition-all duration-300",
                      delayClass,
                    )}
                  >
                    {/* Circular 3D Step Marker */}
                    <div className="relative -mt-10 mb-4 flex size-13 items-center justify-center rounded-full border-2 border-primary/30 bg-background shadow-md transition-transform duration-500 group-hover:scale-110 group-hover:border-primary motion-reduce:transform-none">
                      <span className="font-display text-lg font-bold text-primary">{j.step}</span>
                    </div>

                    <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
                      {j.title}
                    </h3>

                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{j.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------------------------------
          SECTION 7 — ORDERING METHODS
          Elevated service cards with experience badges
         ---------------------------------------------------------------------- */}
      <Section className="pt-0 pb-10 sm:pb-16 sm:pb-20">
        <SectionHeading
          eyebrow="Ordering Methods"
          title="However You Like to Enjoy"
          description="Choose the experience that fits your day best."
        />

        <div className="mt-6 sm:mt-10 grid gap-3 sm:gap-6 md:grid-cols-3">
          {methods.map((m) => (
            <div
              key={m.title}
              className="group surface-card hover-lift flex flex-col justify-between p-4 sm:p-7 transition-all duration-300 [perspective:800px]"
            >
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <div className="flex size-10 sm:size-13 items-center justify-center rounded-xl sm:rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs transition-transform duration-500 group-hover:scale-110 motion-reduce:transform-none">
                  <m.icon className="size-5 sm:size-6 shrink-0" aria-hidden />
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.badge}
                </span>
              </div>

              <div className="mt-3 sm:mt-6">
                <h3 className="font-display text-base sm:text-xl font-semibold tracking-tight text-foreground">
                  {m.title}
                </h3>
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                  {m.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------------------
          SECTION 8 — VISIT REKIK COFFEE
          Atmospheric espresso flagship experience with technology highlights
         ---------------------------------------------------------------------- */}
      <Section className="py-10 sm:py-16 sm:py-20 md:py-24">
        <div className="relative surface-card overflow-hidden rounded-2xl sm:rounded-3xl bg-espresso p-5 sm:p-8 md:p-12 lg:p-16 text-espresso-foreground shadow-[var(--shadow-lift)] border border-espresso-foreground/10">
          {/* Subtle brand glow discs in background */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 size-80 rounded-full bg-primary/20 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-16 -bottom-16 size-80 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />

          <div className="relative z-10 grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
            {/* Left Side: Physical Café Experience */}
            <div className="space-y-4 sm:space-y-6 lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-gold">
                <MapPin className="size-3.5 text-gold" aria-hidden />
                Visit Rekik Coffee
              </div>

              <h2 className="font-display text-2xl sm:text-3xl lg:text-5xl font-semibold tracking-tight text-warm-white">
                Authentic Buna Heritage. <br />
                <span className="text-gold italic font-normal">Modern Café Comfort.</span>
              </h2>

              <p className="max-w-xl text-sm leading-relaxed text-cream/80 sm:text-base">
                Join us at our Bole Atlas location in Addis Ababa for an authentic Ethiopian coffee experience, or order ahead on our digital platform for instant bar pickup and speedy delivery.
              </p>

              <div className="pt-2">
                <Button
                  asChild
                  size="lg"
                  className="w-full sm:w-auto rounded-full bg-gold hover:bg-gold-light text-espresso font-semibold px-8 shadow-md transition-all duration-300 hover:shadow-lg"
                >
                  <Link to="/contact">
                    Get in Touch
                    <ArrowRight className="ml-2 size-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right Side: Digital Ordering Platform */}
            <div className="lg:col-span-5">
              <div className="space-y-3.5 sm:space-y-4 rounded-xl sm:rounded-2xl border border-gold/20 bg-white/[0.04] p-4 sm:p-6 backdrop-blur-md sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gold">
                    Rekik Digital
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                    <span
                      className="size-1.5 rounded-full bg-emerald-400 animate-pulse"
                      aria-hidden
                    />
                    Live Ordering Active
                  </span>
                </div>

                <h3 className="font-display text-lg font-semibold text-warm-white">
                  Seamless Coffee Experience
                </h3>

                <ul className="space-y-2.5 text-xs text-cream/80 sm:text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-gold" aria-hidden />
                    Real-time single-origin roast availability
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-gold" aria-hidden />
                    Live barista status from grind to cup
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-gold" aria-hidden />
                    Instant Telebirr & CBE digital payment
                  </li>
                </ul>

                <div className="border-t border-espresso-foreground/10 pt-2">
                  <Button
                    asChild
                    className="w-full rounded-full bg-coffee hover:bg-coffee/90 text-warm-white border border-gold/30 shadow-md transition-all duration-300 hover:shadow-lg"
                  >
                    <Link to="/menu">Explore Coffee & Menu</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
