import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import rekikLogo from "@/assets/rekik-coffee-logo.jpg";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldAlert,
  ShoppingBag,
  UserCheck,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { applyTheme, readSettings } from "@/lib/settings";
import { supabase } from "@/lib/supabase";
import {
  fetchWaiterProfile,
  updateWaiterAvailability,
  type WaiterProfile,
} from "@/lib/waiter";

export const Route = createFileRoute("/waiter")({
  head: () => ({
    meta: [
      { title: "Waiter Station — NEBA Café" },
      {
        name: "description",
        content: "Dedicated order review, table assignment and payment tracking for NEBA Café waiters.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterLayout,
});

const waiterNav = [
  { to: "/waiter", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/waiter/orders", label: "Assigned Orders", icon: ShoppingBag, exact: false },
  { to: "/waiter/payments", label: "Payment Status", icon: CreditCard, exact: false },
  { to: "/waiter/history", label: "Order History", icon: History, exact: false },
  { to: "/waiter/notifications", label: "Notifications", icon: Bell, exact: false },
  { to: "/waiter/account", label: "Staff Account", icon: UserCheck, exact: false },
] as const;

function WaiterLayout() {
  const [profile, setProfile] = useState<WaiterProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const verifyWaiter = async () => {
    try {
      const p = await fetchWaiterProfile();
      if (p) {
        setProfile(p);
        setIsUnauthorized(false);
        setAuthError(null);
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          setIsUnauthorized(true);
        } else {
          setProfile(null);
          setIsUnauthorized(false);
        }
      }
    } catch {
      setAuthError("Failed to verify staff permissions. Please check connection.");
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    applyTheme(readSettings().theme);

    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !session?.user) {
        setProfile(null);
        setIsUnauthorized(false);
        setReady(true);
        return;
      }

      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        await verifyWaiter();
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (!session?.user) {
        setReady(true);
      } else {
        void verifyWaiter();
      }
    });

    // Real-time listener for live order assignments and updates
    const channel = supabase
      .channel("waiter-station-realtime")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "orders" }, () => {
        // Dispatches custom event for child views to re-fetch
        window.dispatchEvent(new CustomEvent("neba:waiter-order-update"));
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "notifications" }, () => {
        window.dispatchEvent(new CustomEvent("neba:waiter-notif-update"));
      })
      .subscribe();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setAuthError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          setAuthError("Invalid email or password.");
        } else {
          setAuthError(error.message || "Failed to sign in.");
        }
        setLoading(false);
        return;
      }

      if (data.user) {
        const p = await fetchWaiterProfile();
        if (p) {
          setProfile(p);
          setIsUnauthorized(false);
          setAuthError(null);
          toast.success(`Welcome back, ${p.fullName}!`);
        } else {
          setIsUnauthorized(true);
        }
      }
    } catch {
      setAuthError("Network error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setProfile(null);
      setIsUnauthorized(false);
      setPassword("");
      toast.success("Signed out successfully");
    } catch {
      toast.error("Error signing out");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDuty = async (nextState: boolean) => {
    if (!profile) return;
    setTogglingAvailability(true);
    try {
      const res = await updateWaiterAvailability(nextState);
      setProfile((prev: WaiterProfile | null) =>
        prev ? { ...prev, isAvailable: res.isAvailable } : null,
      );
      toast.success(res.isAvailable ? "You are now ON DUTY" : "You are now OFF DUTY");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update availability";
      toast.error(msg);
    } finally {
      setTogglingAvailability(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="flex flex-col items-center gap-3">
          <UtensilsCrossed className="size-8 text-primary animate-pulse" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            Verifying waiter credentials…
          </p>
        </div>
      </div>
    );
  }

  // 1. Unauthorized Screen (User logged in but does not have waiter/admin role)
  if (isUnauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="surface-card w-full max-w-md p-8 text-center space-y-4">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold">Access Restricted</h1>
          <p className="text-sm text-muted-foreground">
            Your account is authenticated, but it has not been assigned active{" "}
            <span className="font-semibold text-foreground">Waiter</span> or{" "}
            <span className="font-semibold text-foreground">Admin</span> staff permissions.
          </p>
          <div className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
            If you are a staff member, ask your manager to register your account in Staff Management.
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="outline" onClick={handleSignOut} disabled={loading}>
              <LogOut className="size-4 mr-2" /> Sign Out
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">Back to Café Menu</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Screen (Waiter Sign In)
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="surface-card w-full max-w-sm p-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="size-11 overflow-hidden rounded-full border-2 border-gold/70 shrink-0 bg-white">
              <img
                src={rekikLogo}
                alt="Rekik Coffee logo"
                className="size-full object-contain"
              />
            </div>
            <div>
              <span className="font-display text-lg font-bold text-foreground">Rekik Coffee</span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-gold font-semibold">
                Waiter Station
              </span>
            </div>
          </div>

          <h1 className="font-display text-2xl font-semibold mt-4">Staff Sign In</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in with your staff credentials to manage table orders.
          </p>

          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            {authError && (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2"
                role="alert"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="waiter-email">Staff Email</Label>
              <Input
                id="waiter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="waiter@rekikcafe.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="waiter-password">Password</Label>
              <Input
                id="waiter-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? "Verifying…" : "Sign In to Station"}
            </Button>
          </form>

          <Button asChild variant="link" className="mt-4 w-full text-xs">
            <Link to="/">Back to café site</Link>
          </Button>
        </div>
      </div>
    );
  }

  const initials = profile.fullName
    .split(" ")
    .map((w: string) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "W";

  // 3. Authorized Waiter Console
  return (
    <div className="flex min-h-screen bg-cream">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex border-r border-sidebar-border">
        {/* Brand */}
        <div className="px-2 py-3 flex items-center justify-between">
          <Link to="/waiter" className="flex items-center gap-2.5 group">
            <div className="size-9 overflow-hidden rounded-full border border-gold/70 shrink-0 bg-white">
              <img
                src={rekikLogo}
                alt="Rekik Coffee logo"
                className="size-full object-contain"
              />
            </div>
            <div>
              <span className="font-display text-base font-bold text-sidebar-foreground">Rekik Coffee</span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-gold font-medium">Waiter Station</span>
            </div>
          </Link>
        </div>

        {/* Waiter Status Badge */}
        <div className="mx-2 my-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`size-2.5 rounded-full ${
                  profile.isAvailable ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
                }`}
              />
              <span className="text-xs font-medium">
                {profile.isAvailable ? "On Duty" : "Off Duty"}
              </span>
            </div>
            <Switch
              checked={profile.isAvailable}
              disabled={togglingAvailability}
              onCheckedChange={handleToggleDuty}
              aria-label="Toggle duty status"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-tight">
            {profile.isAvailable
              ? "Receiving order assignments"
              : "Paused from new assignments"}
          </p>
        </div>

        {/* Navigation */}
        <nav className="mt-2 flex-1 space-y-1" aria-label="Waiter Station Navigation">
          {waiterNav.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm opacity-90 transition-colors hover:bg-sidebar-accent hover:opacity-100"
            >
              <n.icon className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom Profile & Actions */}
        <div className="border-t border-sidebar-border pt-3 space-y-2">
          {profile.role === "admin" && (
            <Link
              to="/admin"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-sidebar-foreground opacity-80 hover:bg-sidebar-accent hover:opacity-100 transition-colors"
            >
              <LayoutDashboard className="size-3.5 text-primary" />
              <span>Switch to Admin Console</span>
            </Link>
          )}

          <Link
            to="/waiter/account"
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-sidebar-accent"
          >
            <Avatar className="size-9 border border-sidebar-border shrink-0">
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">
                {profile.fullName}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {profile.role}
              </p>
            </div>
          </Link>

          <Button
            variant="ghost"
            disabled={loading}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8"
            onClick={handleSignOut}
          >
            <LogOut className="size-3.5 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground md:hidden">
          <Link to="/waiter" className="flex items-center gap-2">
            <div className="size-7 overflow-hidden rounded-full border border-gold/70 shrink-0 bg-white">
              <img
                src={rekikLogo}
                alt="Rekik Coffee logo"
                className="size-full object-contain"
              />
            </div>
            <span className="font-display text-sm font-bold">Rekik Coffee Waiter</span>
          </Link>

          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 rounded-full ${
                profile.isAvailable ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
              }`}
            />
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 text-sidebar-foreground hover:bg-sidebar-accent"
                  aria-label="Open waiter navigation menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground border-sidebar-border p-4 flex flex-col justify-between overflow-y-auto"
              >
                <div>
                  <SheetHeader className="text-left pb-3 border-b border-sidebar-border">
                    <SheetTitle className="font-display text-lg font-semibold text-sidebar-foreground flex items-center gap-2.5">
                      <div className="size-8 overflow-hidden rounded-full border border-gold/70 shrink-0 bg-white">
                        <img
                          src={rekikLogo}
                          alt="Rekik Coffee logo"
                          className="size-full object-contain"
                        />
                      </div>
                      <div>
                        <span className="font-display text-base font-bold">Rekik Coffee</span>
                        <span className="block text-[10px] uppercase tracking-[0.2em] text-gold font-medium">Waiter Station</span>
                      </div>
                    </SheetTitle>
                    <SheetDescription className="sr-only">Waiter navigation</SheetDescription>
                  </SheetHeader>

                  {/* Mobile Availability Toggle */}
                  <div className="my-3 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {profile.isAvailable ? "On Duty" : "Off Duty"}
                      </span>
                      <Switch
                        checked={profile.isAvailable}
                        disabled={togglingAvailability}
                        onCheckedChange={handleToggleDuty}
                      />
                    </div>
                  </div>

                  <nav className="mt-3 space-y-1">
                    {waiterNav.map((n) => (
                      <Link
                        key={n.label}
                        to={n.to}
                        activeOptions={{ exact: n.exact }}
                        activeProps={{
                          className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                        }}
                        onClick={() => setMobileNavOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm opacity-90 transition-colors hover:bg-sidebar-accent"
                      >
                        <n.icon className="size-4" />
                        <span>{n.label}</span>
                      </Link>
                    ))}
                  </nav>
                </div>

                <div className="border-t border-sidebar-border pt-4 space-y-2">
                  <div className="flex items-center gap-3 px-2 py-1">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{profile.fullName}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{profile.role}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="w-full justify-start text-xs text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    <LogOut className="size-3.5 mr-2" /> Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
