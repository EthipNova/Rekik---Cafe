import { Link } from "@tanstack/react-router";
import { Menu, ShoppingBag, User } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const links = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function Navbar() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 shadow-xs backdrop-blur-md">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group">
          <div className="relative size-11 sm:size-12 shrink-0 overflow-hidden rounded-full border-2 border-gold shadow-xs transition-transform duration-300 group-hover:scale-105">
            <img
              src="/images/rekik-logo.jpg"
              alt="Rekik Coffee Logo"
              className="size-full object-cover"
            />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-primary group-hover:text-primary/90 transition-colors">
              Rekik Coffee
            </span>
          </div>
        </Link>

        <ul className="hidden items-center gap-1.5 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                activeOptions={{ exact: l.to === "/" }}
                activeProps={{
                  className: "bg-primary text-primary-foreground shadow-xs font-semibold",
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-foreground/80 transition-all hover:bg-cream hover:text-primary"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-10 rounded-full hover:bg-cream hover:text-primary"
            aria-label="Your account"
          >
            <Link to="/account">
              <User className="size-5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="relative size-10 rounded-full hover:bg-cream hover:text-primary"
            aria-label={`Cart, ${count} items`}
          >
            <Link to="/cart">
              <ShoppingBag className="size-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-espresso shadow-xs">
                  {count}
                </span>
              )}
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="ml-1 hidden sm:inline-flex rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 border border-gold/30"
          >
            <Link to="/menu">Order Online</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 rounded-full md:hidden hover:bg-cream"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 flex flex-col justify-between bg-background border-border">
              <div>
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="size-11 overflow-hidden rounded-full border-2 border-gold shrink-0">
                    <img
                      src="/images/rekik-logo.jpg"
                      alt="Rekik Coffee Logo"
                      className="size-full object-cover"
                    />
                  </div>
                  <div>
                    <SheetTitle className="font-display text-xl font-bold text-primary">Rekik Coffee</SheetTitle>
                    <p className="text-xs text-gold font-medium uppercase tracking-wider">Ethiopian Roastery</p>
                  </div>
                </div>

                <ul className="mt-6 space-y-1.5">
                  {links.map((l) => (
                    <li key={l.to}>
                      <Link
                        to={l.to}
                        onClick={() => setOpen(false)}
                        activeOptions={{ exact: l.to === "/" }}
                        activeProps={{
                          className:
                            "bg-primary text-primary-foreground font-semibold shadow-xs",
                        }}
                        className="block rounded-xl px-4 py-3 text-base font-medium text-foreground transition-colors hover:bg-cream hover:text-primary"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      to="/orders"
                      onClick={() => setOpen(false)}
                      activeProps={{
                        className:
                          "bg-primary text-primary-foreground font-semibold shadow-xs",
                      }}
                      className="block rounded-xl px-4 py-3 text-base font-medium text-foreground transition-colors hover:bg-cream hover:text-primary"
                    >
                      My Orders
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="pt-6 border-t border-border mt-auto">
                <Button
                  asChild
                  size="lg"
                  className="w-full rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 border border-gold/30"
                >
                  <Link to="/menu" onClick={() => setOpen(false)}>
                    Browse Menu & Order
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
