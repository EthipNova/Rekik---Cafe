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
  Truck,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import hero from "@/assets/grilled-beef-hero.png";
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
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { ProductCard } from "@/components/site/ProductCard";
import {
  categories as seedCategories,
  formatETB,
  products as seedProducts,
  registerProducts,
  type Category,
  type Product,
} from "@/lib/menu-data";
import { DEFAULT_ABOUT_CONTENT, type AboutContent } from "@/lib/content";
import { resolveTodaySpecial, type Promotion } from "@/lib/promotions";
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
      { title: "NEBA CafÃ© â€” Good Food. Great Moments. Simply NEBA." },
      {
        name: "description",
        content:
          "Order burgers, pizza, sides and drinks from NEBA CafÃ©. Browse the menu, pay securely and track your order in real time.",
      },
      { property: "og:title", content: "NEBA CafÃ© â€” Good Food. Great Moments." },
      {
        property: "og:description",
        content: "A modern cafÃ© ordering experience, powered by ORNIX-TECH.",
      },
    ],
  }),
  component: Home,
});

const benefits = [
  {
    image: easyOrderingImage,
    imageAlt: "Easy online food ordering",
    title: "Easy Ordering",
    text: "Browse and order without unnecessary steps.",
    highlight: false,
  },
  {
    image: freshMenuImage,
    imageAlt: "Fresh food ingredients",
    title: "Fresh Menu",
    text: "See products and availability in real time.",
    highlight: false,
  },
  {
    image: simpleCheckoutImage,
    imageAlt: "Simple checkout",
    title: "Simple Checkout",
    text: "A clear and convenient ordering process.",
    highlight: false,
  },
  {
    image: orderTrackingImage,
    imageAlt: "Order tracking and delivery",
    title: "Order Tracking",
    text: "Know what is happening with your order.",
    highlight: true,
  },
  {
    image: securePaymentsImage,
    imageAlt: "Secure payments",
    title: "Secure Payments",
    text: "Handled through secure payment infrastructure.",
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
    loaderData?.content?.homepage_hero_image?.trim() || hero,
  );

  useEffect(() => {
    if (content?.homepage_hero_image?.trim()) {
      setHeroImgSrc(content.homepage_hero_image.trim());
    } else {
      setHeroImgSrc(hero);
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

  const featured = productsList.filter((p) => p.featured);
  const displayFeatured = featured.length > 0 ? featured : productsList.slice(0, 3);
  const todaySpecial = useMemo(
    () => resolveTodaySpecial(promotionsList, productsList),
    [promotionsList, productsList],
  );

  return (
    <>
      {/* ----------------------------------------------------------------------
          SECTION 1 â€” EDITORIAL HERO
          Asymmetric desktop layout with 3D showcase card and glass pill badge
         ---------------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden">
        <img
          src={heroImgSrc}
          alt="Freshly prepared burger meal at NEBA CafÃ©"
          width={1440}
          height={1800}
          className="absolute inset-0 size-full object-cover"
          onError={() => setHeroImgSrc(hero)}
        />
        <div className="overlay-hero absolute inset-0" />

        <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 md:py-32 lg:py-36">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
            {/* Left Column: Editorial Headline & Actions */}
            <div className="flex flex-col justify-center space-y-6 text-espresso-foreground lg:col-span-7">
              <div className="rise-in inline-flex items-center gap-2.5 rounded-full border border-espresso-foreground/20 bg-espresso/60 py-1 pl-1 pr-3.5 shadow-xs backdrop-blur-md w-fit">
                <div className="overflow-hidden rounded-full border border-espresso-foreground/20 size-8 sm:size-9 shrink-0">
                  <img
                    src={hero}
                    alt="Freshly prepared burger at NEBA CafÃ©"
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-espresso-foreground/90">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
                  <span>Freshly Prepared Daily</span>
                </div>
              </div>

              <h1 className="rise-in [animation-delay:100ms] font-display text-4xl font-semibold leading-[1.12] sm:leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl text-espresso-foreground max-w-2xl">
                Good Food. Great Moments. Simply NEBA.
              </h1>

              <p className="rise-in [animation-delay:200ms] max-w-xl text-base leading-relaxed opacity-90 sm:text-lg">
                Discover your favorite meals, order with ease, and enjoy a seamless cafÃ© experience
                powered by modern technology.
              </p>

              <div className="rise-in [animation-delay:300ms] flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-2 w-full sm:w-auto">
                <Button
                  asChild
                  size="lg"
                  className="group w-full sm:w-auto rounded-full bg-primary px-8 text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-primary/40"
                >
                  <Link to="/menu">
                    Order Now
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
                  className="w-full sm:w-auto rounded-full border border-espresso-foreground/20 bg-espresso-foreground/15 px-8 text-espresso-foreground backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-espresso-foreground/25"
                >
                  <a href="#categories">Explore Menu</a>
                </Button>
              </div>
            </div>

            {/* Right Column: Layered 3D Visual Showcase */}
            <div className="hidden lg:col-span-5 lg:flex lg:justify-end">
              <div className="rise-in [animation-delay:400ms] group relative w-full max-w-sm [perspective:1000px]">
                {/* Offset decorative backdrop frame */}
                <div
                  className="pointer-events-none absolute -inset-3 -rotate-2 rounded-3xl border border-primary/30 bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent transition-transform duration-700 ease-out group-hover:rotate-0 motion-reduce:transform-none -z-10"
                  aria-hidden
                />

                {/* 3D Showcase Card */}
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-espresso-foreground/20 bg-espresso/60 shadow-[var(--shadow-lift)] backdrop-blur-md transition-all duration-700 ease-out [transform-style:preserve-3d] group-hover:[transform:rotateX(2deg)_rotateY(-2deg)_translateY(-4px)] motion-reduce:transform-none">
                  <img
                    src={heroImgSrc}
                    alt="Freshly prepared culinary dishes at NEBA Café"
                    width={800}
                    height={600}
                    className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transform-none"
                    onError={() => setHeroImgSrc(hero)}
                  />

                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-transparent"
                    aria-hidden
                  />
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
          SECTION 3 â€” FEATURED MENU
          Enhanced hierarchy & spacing around the existing ProductCard
         ---------------------------------------------------------------------- */}
      <Section className="pt-0 pb-10 sm:pb-16 sm:pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="Featured"
            title="Popular right now"
            description="Guest favorites prepared fresh to order in our kitchen."
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

        <div className="mt-6 sm:mt-10 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
          {displayFeatured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
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
          SECTION 5 â€” WHY NEBA
          Editorial feature matrix with watermark numerals and tracking highlight
         ---------------------------------------------------------------------- */}
      <div className="border-y border-border/60 bg-cream py-10 sm:py-16 sm:py-20 md:py-24">
        <Section>
          <SectionHeading
            eyebrow="Why NEBA"
            title="Built around the way you order"
            align="center"
            description="A thoughtfully designed digital ordering experience built for speed, transparency, and delight."
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
          SECTION 6 â€” ORDERING PROCESS
          Connected journey with progressive timeline nodes
         ---------------------------------------------------------------------- */}
      <Section className="py-10 sm:py-16 sm:py-20 md:py-24">
        <SectionHeading
          eyebrow="Ordering process"
          title="Six simple steps"
          align="center"
          description="From your first tap to your final bite, here is how effortless ordering is at NEBA."
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
          SECTION 7 â€” ORDERING METHODS
          Elevated service cards with experience badges
         ---------------------------------------------------------------------- */}
      <Section className="pt-0 pb-10 sm:pb-16 sm:pb-20">
        <SectionHeading
          eyebrow="Ordering methods"
          title="However you like to eat"
          description="Choose the way that best fits your schedule and lifestyle."
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
          SECTION 8 â€” VISIT NEBA & ORNIX-TECH PLATFORM
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
            {/* Left Side: Physical CafÃ© Experience */}
            <div className="space-y-4 sm:space-y-6 lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-espresso-foreground/20 bg-espresso-foreground/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-espresso-foreground/80">
                <MapPin className="size-3.5 text-primary" aria-hidden />
                Visit NEBA CafÃ©
              </div>

              <h2 className="font-display text-2xl sm:text-3xl lg:text-5xl font-semibold tracking-tight text-espresso-foreground">
                Good Food. Great Moments.
              </h2>

              <p className="max-w-xl text-sm leading-relaxed text-espresso-foreground/80 sm:text-base">
                Address, phone and opening hours are placeholders until official details are
                provided. Drop by our Piassa location or get in touch for reservations and
                enquiries.
              </p>

              <div className="pt-2">
                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto rounded-full border border-espresso-foreground/20 bg-espresso-foreground/15 px-8 text-espresso-foreground transition-all duration-300 hover:bg-espresso-foreground/25 hover:shadow-md"
                >
                  <Link to="/contact">
                    Contact us
                    <ArrowRight className="ml-2 size-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right Side: ORNIX-TECH Digital Ordering Platform */}
            <div className="lg:col-span-5">
              <div className="space-y-3.5 sm:space-y-4 rounded-xl sm:rounded-2xl border border-espresso-foreground/15 bg-espresso-foreground/[0.06] p-4 sm:p-6 backdrop-blur-md sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-espresso-foreground/70">
                    Digital Platform
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                    <span
                      className="size-1.5 rounded-full bg-emerald-400 animate-pulse"
                      aria-hidden
                    />
                    ORNIX-TECH Active
                  </span>
                </div>

                <h3 className="font-display text-lg font-semibold text-espresso-foreground">
                  Modern Ordering Architecture
                </h3>

                <ul className="space-y-2.5 text-xs text-espresso-foreground/75 sm:text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                    Real-time menu availability & pricing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                    Live kitchen tracking from order to table
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
                    Secure payments with instant receipt verification
                  </li>
                </ul>

                <div className="border-t border-espresso-foreground/10 pt-2">
                  <Button
                    asChild
                    className="w-full rounded-full bg-primary text-primary-foreground shadow-md transition-all duration-300 hover:bg-primary/90 hover:shadow-lg"
                  >
                    <Link to="/menu">Explore Digital Menu</Link>
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
