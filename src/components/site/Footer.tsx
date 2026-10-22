import { Link } from "@tanstack/react-router";

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
  return (
    <footer className="mt-12 sm:mt-20 md:mt-24 bg-espresso text-espresso-foreground">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl font-semibold">NEBA CAFÉ</p>
          <p className="mt-2 text-sm opacity-80">Good Food. Great Moments.</p>
          <p className="mt-6 max-w-sm text-sm opacity-70">
            A modern café ordering experience — browse, order, pay and track your food from any
            device.
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="font-display text-sm uppercase tracking-[0.18em] opacity-70">
              {col.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={`${col.title}-${l.label}`}>
                  <Link
                    to={l.to}
                    className="text-sm opacity-85 transition-opacity hover:opacity-100"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-espresso-foreground/15">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs opacity-70 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} NEBA Café. All rights reserved.</p>
          <p>Powered by ORNIX-TECH — from business requirements to real-world software.</p>
        </div>
      </div>
    </footer>
  );
}
