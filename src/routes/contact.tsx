import { createFileRoute } from "@tanstack/react-router";
import { Clock, ExternalLink, Mail, MapPin, Navigation, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/site/Section";
import { DEFAULT_SETTINGS, type NebaSettings } from "@/lib/settings";
import { validateContactInput, type ContactValidationResult } from "@/lib/contact";
import { fetchSettings, submitContactMessage } from "@/services/api";

export const Route = createFileRoute("/contact")({
  loader: async () => {
    try {
      const settings = await fetchSettings();
      return { settings };
    } catch {
      return { settings: DEFAULT_SETTINGS };
    }
  },
  head: () => ({
    meta: [
      { title: "Contact NEBA Café" },
      {
        name: "description",
        content:
          "Get in touch with NEBA Café — location, phone, email, opening hours and enquiries.",
      },
      { property: "og:title", content: "Contact NEBA Café" },
      { property: "og:description", content: "Location, hours and how to reach NEBA Café." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const loaderData = Route.useLoaderData();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<ContactValidationResult["errors"]>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [settings, setSettings] = useState<NebaSettings>(loaderData?.settings || DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const remote = await fetchSettings();
        if (!cancelled && remote) {
          setSettings(remote);
        }
      } catch (err) {
        console.warn("Failed to load contact settings:", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitError(null);
    const validation = validateContactInput({ name, email, message });
    if (!validation.valid) {
      setErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0] || "Please check the form inputs.";
      toast.error(firstError);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await submitContactMessage({
        name,
        email,
        message,
      });

      setSent(true);
      toast.success("Message sent successfully. Thank you for contacting NEBA Café.");
      setName("");
      setEmail("");
      setMessage("");
      setErrors({});
      setSubmitError(null);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to send message. Please try again.";
      setSubmitError(errMsg);
      toast.error(errMsg);
      setSent(false);
    } finally {
      setSubmitting(false);
    }
  };

  const details = [
    { icon: MapPin, label: "Location", value: settings.address || DEFAULT_SETTINGS.address },
    { icon: Phone, label: "Phone", value: settings.phone || DEFAULT_SETTINGS.phone },
    { icon: Mail, label: "Email", value: settings.email || DEFAULT_SETTINGS.email },
    {
      icon: Clock,
      label: "Opening hours",
      value: settings.openingHours || DEFAULT_SETTINGS.openingHours,
    },
  ];

  return (
    <Section>
      <h1 className="text-4xl font-semibold">Contact us</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Questions about an order, a booking or catering? Send us a message.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <ul className="grid gap-4 sm:grid-cols-2">
            {details.map((d) => (
              <li key={d.label} className="surface-card p-5">
                <d.icon className="size-5 text-primary" aria-hidden />
                <h2 className="mt-3 font-display text-base font-semibold">{d.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{d.value}</p>
              </li>
            ))}
          </ul>
          <div className="surface-card relative overflow-hidden p-6 sm:p-7">
            {/* Subtle decorative coordinate grid background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.10]"
              aria-hidden
            >
              <svg
                className="h-full w-full"
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                height="100%"
              >
                <defs>
                  <pattern
                    id="contact-map-grid"
                    width="24"
                    height="24"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 24 0 L 0 0 0 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#contact-map-grid)" />
              </svg>
            </div>

            {/* Subtle ambient brand glow */}
            <div
              className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-primary/10 blur-2xl"
              aria-hidden
            />

            <div className="relative z-10 flex flex-col justify-between gap-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    <MapPin className="size-3.5" aria-hidden />
                    Our Location
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Piassa • Near Kibru Hospital
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    Visit NEBA Café
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {settings.address || DEFAULT_SETTINGS.address}
                  </p>
                </div>
              </div>

              <div className="flex items-center pt-1">
                <Button asChild className="gap-2">
                  <a
                    href="https://maps.app.goo.gl/JSWYJbLG9sL3gfK5A"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View NEBA Café on Google Maps"
                  >
                    <Navigation className="size-4" aria-hidden />
                    View on Google Maps
                    <ExternalLink className="size-3.5 opacity-80" aria-hidden />
                  </a>
                </Button>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Social media: @nebacafe</p>
        </div>

        <form className="surface-card space-y-4 p-6" onSubmit={handleSubmit} noValidate>
          <h2 className="font-display text-xl font-semibold">Send a message</h2>

          {submitError && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
              role="alert"
            >
              {submitError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.name;
                    return next;
                  });
                }
              }}
              disabled={submitting}
              required
              autoComplete="name"
              placeholder="Your full name"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.email;
                    return next;
                  });
                }
              }}
              disabled={submitting}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-message">Message</Label>
            <Textarea
              id="c-message"
              rows={5}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (errors.message) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.message;
                    return next;
                  });
                }
              }}
              disabled={submitting}
              required
              placeholder="How can we help you?"
            />
            {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending message…" : "Send message"}
          </Button>

          {sent && (
            <p role="status" className="text-sm font-medium text-success">
              Message sent successfully. Thank you for contacting NEBA Café.
            </p>
          )}
        </form>
      </div>
    </Section>
  );
}
