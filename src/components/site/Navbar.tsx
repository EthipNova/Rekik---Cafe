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
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 shadow-[0_1px_20px_-14px_oklch(0_0_0_/_0.35)] backdrop-blur-md">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link to="/" className="flex flex-col leading-none">
          <span className="font-display text-xl font-semibold tracking-tight">NEBA</span>
          <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Café
          </span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                activeOptions={{ exact: l.to === "/" }}
                activeProps={{
                  className: "bg-secondary text-foreground shadow-sm shadow-primary/10",
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11 sm:size-9"
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
            className="relative size-11 sm:size-9"
            aria-label={`Cart, ${count} items`}
          >
            <Link to="/cart">
              <ShoppingBag className="size-5" />
              {count > 0 && (
                <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground sm:-right-0.5 sm:-top-0.5">
                  {count}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild size="sm" className="ml-1 hidden sm:inline-flex">
            <Link to="/menu">Order Now</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 flex flex-col justify-between">
              <div>
                <SheetTitle className="font-display text-lg">NEBA Café</SheetTitle>
                <ul className="mt-6 space-y-1">
                  {links.map((l) => (
                    <li key={l.to}>
                      <Link
                        to={l.to}
                        onClick={() => setOpen(false)}
                        activeOptions={{ exact: l.to === "/" }}
                        activeProps={{
                          className:
                            "bg-primary/10 text-primary font-semibold border-l-2 border-primary pl-2.5",
                        }}
                        className="block rounded-lg px-3 py-3 text-base font-medium text-foreground/85 transition-colors hover:bg-secondary"
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
                          "bg-primary/10 text-primary font-semibold border-l-2 border-primary pl-2.5",
                      }}
                      className="block rounded-lg px-3 py-3 text-base font-medium text-foreground/85 transition-colors hover:bg-secondary"
                    >
                      My Orders
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="pt-6 border-t border-border/70 mt-auto">
                <Button
                  asChild
                  size="lg"
                  className="w-full rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
                >
                  <Link to="/menu" onClick={() => setOpen(false)}>
                    Order Now
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
