import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  Clock,
  LogIn,
  LogOut,
  Menu,
  ShoppingBag,
  User,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import rekikLogo from "@/assets/rekik-coffee-logo.jpg";

const links = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function Navbar() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<{ user?: { id: string; email?: string; user_metadata?: Record<string, any> } } | null>(null);
  const [userProfile, setUserProfile] = useState<{ name?: string | undefined; email?: string | undefined } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session as any);
      if (data.session?.user) {
        setUserProfile({
          name:
            data.session.user.user_metadata?.["full_name"] ||
            data.session.user.user_metadata?.["name"] ||
            data.session.user.email?.split("@")[0],
          email: data.session.user.email,
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession as any);
      if (currentSession?.user) {
        setUserProfile({
          name:
            currentSession.user.user_metadata?.["full_name"] ||
            currentSession.user.user_metadata?.["name"] ||
            currentSession.user.email?.split("@")[0],
          email: currentSession.user.email,
        });
      } else {
        setUserProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setSession(null);
    setUserProfile(null);
    toast.success("You have successfully signed out.");
    void navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 shadow-xs backdrop-blur-md">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group">
          <div className="relative size-12 sm:size-13 shrink-0 overflow-hidden rounded-full border-2 border-gold/70 shadow-xs transition-transform duration-300 group-hover:scale-105 bg-white">
            <img
              src={rekikLogo}
              alt="Rekik Coffee logo"
              className="size-full object-contain"
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
          {/* Account Menu Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-cream hover:text-primary",
                  session && "bg-cream/60 text-primary border border-gold/30",
                )}
                aria-label="Account menu"
              >
                <User className="size-4.5" />
                <span className="hidden lg:inline max-w-[120px] truncate">
                  {session ? userProfile?.name || "Account" : "Account"}
                </span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg rounded-xl">
              {session ? (
                <>
                  <div className="px-3 py-2 border-b border-border/60">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {userProfile?.name || "Customer Account"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {userProfile?.email}
                    </p>
                  </div>
                  <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2">
                    <Link to="/account">
                      <User className="size-4 text-primary" />
                      <span>My Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2">
                    <Link to="/orders">
                      <Clock className="size-4 text-primary" />
                      <span>My Orders</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="cursor-pointer gap-2 py-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2">
                    <Link to="/account">
                      <LogIn className="size-4 text-primary" />
                      <span>Sign In</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2">
                    <Link to="/account">
                      <UserPlus className="size-4 text-primary" />
                      <span>Create Account</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem asChild className="cursor-pointer gap-2 py-2">
                    <Link to="/orders">
                      <Clock className="size-4 text-muted-foreground" />
                      <span>Track Orders</span>
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

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
            <SheetContent
              side="right"
              className="w-80 flex flex-col justify-between bg-background border-border"
            >
              <div>
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="size-12 overflow-hidden rounded-full border-2 border-gold/70 shrink-0 bg-white">
                    <img
                      src={rekikLogo}
                      alt="Rekik Coffee logo"
                      className="size-full object-contain"
                    />
                  </div>
                  <div>
                    <SheetTitle className="font-display text-xl font-bold text-primary">
                      Rekik Coffee
                    </SheetTitle>
                    <p className="text-xs text-gold font-medium uppercase tracking-wider">
                      Ethiopian Roastery
                    </p>
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

                {/* Mobile Account Section */}
                {session ? (
                  <div className="mt-6 pt-4 border-t border-border space-y-1">
                    <div className="px-4 py-1.5">
                      <p className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
                        Signed in as
                      </p>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {userProfile?.name || session.user?.email}
                      </p>
                    </div>
                    <Link
                      to="/account"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground hover:bg-cream hover:text-primary transition-colors"
                    >
                      <User className="size-4 text-primary" />
                      <span>My Profile</span>
                    </Link>
                    <Link
                      to="/orders"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground hover:bg-cream hover:text-primary transition-colors"
                    >
                      <Clock className="size-4 text-primary" />
                      <span>My Orders</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        void handleSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors text-left"
                    >
                      <LogOut className="size-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 pt-4 border-t border-border space-y-1.5">
                    <p className="px-4 text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
                      Account
                    </p>
                    <Link
                      to="/account"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground hover:bg-cream hover:text-primary transition-colors"
                    >
                      <LogIn className="size-4 text-primary" />
                      <span>Sign In</span>
                    </Link>
                    <Link
                      to="/account"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground hover:bg-cream hover:text-primary transition-colors"
                    >
                      <UserPlus className="size-4 text-primary" />
                      <span>Create Account</span>
                    </Link>
                  </div>
                )}
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
