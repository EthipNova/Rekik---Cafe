import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import rekikLogo from "@/assets/rekik-coffee-logo.jpg";
import { DEFAULT_SETTINGS, type NebaSettings } from "@/lib/settings";
import { fetchSettings } from "@/services/api";

const columns = [
  {
    title: "Explore",
    links: [
      { to: "/", label: "Home" },
      { to: "/menu", label: "Menu" },
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Ordering",
    links: [
      { to: "/menu", label: "Menu" },
      { to: "/cart", label: "Cart" },
      { to: "/orders", label: "Orders" },
      { to: "/account", label: "Account" },
    ],
  },
] as const;

export function Footer() {
  const [settings, setSettings] = useState<NebaSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const remote = await fetchSettings();
        if (!cancelled && remote) {
          setSettings(remote);
        }
      } catch {
        /* ignore */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="mt-12 sm:mt-20 md:mt-24 bg-espresso text-espresso-foreground border-t border-gold/20">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="size-13 overflow-hidden rounded-full border-2 border-gold/70 shrink-0 bg-white">
              <img
                src={rekikLogo}
                alt="Rekik Coffee logo"
                className="size-full object-contain"
              />
            </div>
            <div>
              <p className="font-display text-2xl font-bold tracking-tight text-espresso-foreground">
                Rekik Coffee
              </p>
              <p className="text-xs uppercase tracking-[0.24em] font-semibold text-gold">
                Authentic Ethiopian Roastery
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-[#F4EBDD]/90 italic font-display">
            "Taste the Heritage of Ethiopian Coffee."
          </p>
          <p className="mt-4 max-w-sm text-sm text-[#F4EBDD]/75 leading-relaxed">
            From single-origin Yirgacheffe and Sidama beans to freshly prepared meals and pastries,
            Rekik Coffee brings warmth, authentic hospitality, and seamless digital ordering to your day.
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-gold">
              {col.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={`${col.title}-${l.label}`}>
                  <Link
                    to={l.to}
                    className="text-sm text-[#F4EBDD]/80 transition-colors hover:text-gold"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-gold/15">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-[#F4EBDD]/70 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Rekik Coffee. All rights reserved.</p>
          <p className="text-gold/90 font-medium">{settings.address || "Bole, Addis Ababa, Ethiopia"} • {settings.openingHours || "Mon – Sun: 7:00 AM – 10:00 PM"}</p>
        </div>
      </div>
    </footer>
  );
}
