import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Coffee, HeartHandshake, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import about from "@/assets/about.jpg";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/Section";
import { DEFAULT_ABOUT_CONTENT, type AboutContent } from "@/lib/content";
import { cn } from "@/lib/utils";
import { fetchAboutContent } from "@/services/api";

export const Route = createFileRoute("/about")({
  loader: async () => {
    try {
      const content = await fetchAboutContent();
      return { content };
    } catch {
      return { content: DEFAULT_ABOUT_CONTENT };
    }
  },
  head: () => ({
    meta: [
      { title: "About NEBA Café — Our Story" },
      {
        name: "description",
        content:
          "NEBA Café brings warm hospitality, fresh food and a modern digital ordering experience together in one place.",
      },
      { property: "og:title", content: "About NEBA Café" },
      { property: "og:description", content: "Warm hospitality, fresh food, modern ordering." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const loaderData = Route.useLoaderData();
  const [content, setContent] = useState<AboutContent>(
    loaderData?.content || DEFAULT_ABOUT_CONTENT,
  );
  const [heroImgSrc, setHeroImgSrc] = useState<string>(
    loaderData?.content?.about_hero_image?.trim() || about,
  );
  const [storyImgSrc, setStoryImgSrc] = useState<string | null>(
    loaderData?.content?.story_image?.trim() || null,
  );

  useEffect(() => {
    if (content?.about_hero_image?.trim()) {
      setHeroImgSrc(content.about_hero_image.trim());
    } else {
      setHeroImgSrc(about);
    }
  }, [content?.about_hero_image]);

  useEffect(() => {
    if (content?.story_image?.trim()) {
      setStoryImgSrc(content.story_image.trim());
    } else {
      setStoryImgSrc(null);
    }
  }, [content?.story_image]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const data = await fetchAboutContent();
        if (!cancelled && data) {
          setContent(data);
        }
      } catch (err) {
        console.warn("Failed to load about page dynamic data:", err);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const dynamicValues = [
    {
      icon: Coffee,
      title: content.value_1_title || "Food we're proud of",
      text:
        content.value_1_description ||
        "Prepared fresh to order, with ingredients we'd serve our own family.",
    },
    {
      icon: HeartHandshake,
      title: content.value_2_title || "Genuine hospitality",
      text:
        content.value_2_description ||
        "Whether you dine in or order ahead, the welcome is the same.",
    },
    {
      icon: Sparkles,
      title: content.value_3_title || "Modern by design",
      text:
        content.value_3_description ||
        "Ordering, payment and tracking are effortless on any device.",
    },
  ];

  return (
    <>
      {/* ----------------------------------------------------------------------
          SECTION 1 — EDITORIAL HERO
          Spacious 2-column layout with layered 3D perspective hero visual
         ---------------------------------------------------------------------- */}
      <div className="relative overflow-hidden">
        {/* Subtle ambient brand glow in background */}
        <div
          className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-primary/5 blur-3xl"
          aria-hidden
        />

        <Section className="pt-8 pb-16 md:pt-14 md:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
            {/* Left Column: Editorial Copy */}
            <div className="flex flex-col justify-center space-y-6 lg:col-span-6 xl:col-span-7">
              <div className="rise-in inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-primary w-fit shadow-xs">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
                About NEBA Café
              </div>

              <h1 className="rise-in [animation-delay:100ms] font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.08] max-w-xl">
                {content.about_title}
              </h1>

              <p className="rise-in [animation-delay:200ms] max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                {content.about_description}
              </p>

              <div className="rise-in [animation-delay:300ms] pt-2">
                <Button
                  asChild
                  size="lg"
                  className="group gap-2 rounded-full px-7 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)] transition-all duration-300"
                >
                  <Link to="/menu">
                    Explore the menu
                    <ArrowRight
                      className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                      aria-hidden
                    />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right Column: Layered 3D Hero Image */}
            <div className="lg:col-span-6 xl:col-span-5">
              <div className="group relative [perspective:1000px]">
                {/* Subtle offset background accent layer */}
                <div
                  className="pointer-events-none absolute -inset-2 sm:-inset-3 rounded-3xl border border-primary/15 bg-gradient-to-tr from-primary/10 via-primary/5 to-transparent -rotate-1 sm:-rotate-2 transition-transform duration-700 ease-out group-hover:rotate-0 motion-reduce:transform-none -z-10"
                  aria-hidden
                />

                {/* Main 3D Card with Subtle Tilt */}
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl surface-card shadow-[var(--shadow-lift)] border border-border/80 transition-all duration-700 ease-out [transform-style:preserve-3d] group-hover:[transform:rotateX(2deg)_rotateY(-2deg)_translateY(-4px)] motion-reduce:transform-none">
                  <img
                    src={heroImgSrc}
                    alt={content.about_title || "Guests enjoying coffee inside NEBA Café"}
                    loading="lazy"
                    width={1200}
                    height={900}
                    className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
                    onError={() => setHeroImgSrc(about)}
                  />

                  {/* Floating Detail Pill */}
                  <div className="absolute bottom-4 left-4 sm:bottom-5 sm:left-5 z-10 flex items-center gap-2 rounded-full border border-border/80 bg-background/90 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur-md transition-transform duration-500 group-hover:translate-y-[-2px]">
                    <span className="size-2 rounded-full bg-primary" aria-hidden />
                    <span className="font-display tracking-wider uppercase text-[10px] sm:text-[11px] font-semibold text-foreground">
                      Crafted with Care · Hawassa
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ----------------------------------------------------------------------
          SECTION 2 — DEDICATED OUR STORY
          Editorial two-column narrative section separating story from hero
         ---------------------------------------------------------------------- */}
      {(content.story_title || content.story_content || storyImgSrc) && (
        <div className="border-t border-border/60 bg-background">
          <Section className="py-16 sm:py-20 md:py-28">
            {storyImgSrc ? (
              <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
                {/* Left: Layered Story Image */}
                <div className="order-2 lg:order-1 lg:col-span-5">
                  <div className="group relative [perspective:1000px]">
                    {/* Offset shadow backdrop */}
                    <div
                      className="pointer-events-none absolute -inset-2 sm:-inset-3 rounded-3xl bg-secondary/80 translate-x-2 translate-y-2 sm:translate-x-3 sm:translate-y-3 -z-10 border border-border/60 transition-transform duration-500 ease-out group-hover:translate-x-1 group-hover:translate-y-1 motion-reduce:transform-none"
                      aria-hidden
                    />

                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl surface-card shadow-[var(--shadow-lift)] border border-border/80 transition-all duration-700 ease-out [transform-style:preserve-3d] group-hover:[transform:rotateX(1.5deg)_rotateY(-1.5deg)_translateY(-4px)] motion-reduce:transform-none">
                      <img
                        src={storyImgSrc}
                        alt={content.story_title || "Our Story"}
                        loading="lazy"
                        width={1000}
                        height={750}
                        className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transform-none"
                        onError={() => setStoryImgSrc(null)}
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Editorial Story Copy */}
                <div className="order-1 lg:order-2 lg:col-span-7 space-y-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary w-fit shadow-xs">
                    Our Heritage & Craft
                  </div>

                  {content.story_title && (
                    <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                      {content.story_title}
                    </h2>
                  )}

                  {content.story_content && (
                    <div className="relative pl-5 border-l-2 border-primary/40">
                      <p className="text-base sm:text-lg leading-relaxed text-muted-foreground font-normal">
                        {content.story_content}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Graceful fallback when story image is not uploaded */
              <div className="mx-auto max-w-3xl text-center space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary w-fit shadow-xs mx-auto">
                  Our Heritage & Craft
                </div>

                {content.story_title && (
                  <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                    {content.story_title}
                  </h2>
                )}

                {content.story_content && (
                  <p className="text-base sm:text-lg leading-relaxed text-muted-foreground max-w-2xl mx-auto">
                    {content.story_content}
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ----------------------------------------------------------------------
          SECTION 3 — OUR COMMITMENT / VALUES
          3D Interactive Cards with Fraunces Watermark Numerals & Icon Capsules
         ---------------------------------------------------------------------- */}
      <div className="border-y border-border/60 bg-cream">
        <Section className="py-16 sm:py-20 md:py-28">
          <SectionHeading
            eyebrow="What we stand for"
            title="Our commitment"
            align="center"
            description="The core values that guide our kitchen, our hospitality, and every order we prepare."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {dynamicValues.map((v, i) => {
              const stepNumber = `0${i + 1}`;
              return (
                <div
                  key={i}
                  className={cn(
                    "group relative surface-card p-7 sm:p-8 transition-all duration-500 ease-out [perspective:800px]",
                    "hover:-translate-y-1.5 hover:[transform:rotateX(2deg)_rotateY(-1deg)_translateY(-6px)] hover:shadow-[var(--shadow-lift)]",
                    "motion-reduce:transform-none motion-reduce:hover:translate-y-0",
                    "overflow-hidden border border-border/80",
                  )}
                >
                  {/* Subtle watermark numeral in background */}
                  <span
                    className="pointer-events-none absolute right-4 top-1 font-display text-7xl font-bold tracking-tighter text-foreground/[0.04] select-none group-hover:text-primary/[0.08] transition-colors duration-500"
                    aria-hidden
                  >
                    {stepNumber}
                  </span>

                  <div className="relative z-10 flex flex-col items-start">
                    <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs transition-transform duration-500 group-hover:scale-110 motion-reduce:transform-none">
                      <v.icon className="size-6" aria-hidden />
                    </div>

                    <h3 className="mt-6 font-display text-xl font-semibold tracking-tight text-foreground">
                      {v.title}
                    </h3>

                    <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted-foreground">
                      {v.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* ----------------------------------------------------------------------
          SECTION 4 — CLOSING CAFÉ INVITATION
          Atmospheric espresso card inviting visitors to dine or order online
         ---------------------------------------------------------------------- */}
      <Section className="py-16 sm:py-20 md:py-24">
        <div className="relative surface-card overflow-hidden rounded-3xl bg-espresso p-8 sm:p-12 md:p-16 text-espresso-foreground shadow-[var(--shadow-lift)] border border-espresso-foreground/10">
          {/* Subtle ambient brand glow discs */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-primary/20 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-16 -bottom-16 size-72 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />

          <div className="relative z-10 mx-auto max-w-2xl text-center space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-espresso-foreground/70">
              Experience NEBA Café
            </p>

            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl text-espresso-foreground">
              Good food is meant to be shared.
            </h2>

            <p className="mx-auto max-w-xl text-sm leading-relaxed text-espresso-foreground/80 sm:text-base">
              Take a seat, explore the menu, and enjoy the NEBA experience — whether dining in with
              us in Hawassa or ordering ahead for quick pickup.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-primary px-8 text-primary-foreground shadow-md transition-all duration-300 hover:bg-primary/90 hover:shadow-lg"
              >
                <Link to="/menu">Explore Menu</Link>
              </Button>

              <Button
                asChild
                size="lg"
                variant="secondary"
                className="rounded-full border border-espresso-foreground/20 bg-espresso-foreground/10 px-8 text-espresso-foreground transition-all duration-300 hover:bg-espresso-foreground/20"
              >
                <Link to="/contact">Find Our Location</Link>
              </Button>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
