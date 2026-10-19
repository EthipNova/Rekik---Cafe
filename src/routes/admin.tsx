import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  AlertCircle,
  CreditCard,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  ToggleLeft,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { applyTheme, readSettings } from "@/lib/settings";
import { supabase, type UserRole } from "@/lib/supabase";
import { getInitials, type AdminUserData } from "@/lib/admin-account";
import rekikLogo from "@/assets/rekik-logo.jpg";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Portal — Rekik Coffee" },
      {
        name: "description",
        content:
          "Operations, catalog, availability, payments and settings for Rekik Coffee management.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, exact: false },
  { to: "/admin/payments", label: "Payments", icon: CreditCard, exact: false },
  { to: "/admin/promotions", label: "Promotions", icon: Tag, exact: false },
  { to: "/admin/customers", label: "Customers", icon: Users, exact: false },
  { to: "/admin/products", label: "Products", icon: Package, exact: false },
  { to: "/admin/categories", label: "Categories", icon: FolderTree, exact: false },
  { to: "/admin/availability", label: "Availability", icon: ToggleLeft, exact: false },
  { to: "/admin/content", label: "Website Content", icon: Globe, exact: false },
  { to: "/admin/contact-messages", label: "Messages", icon: Mail, exact: false },
  { to: "/admin/settings", label: "Settings", icon: Settings, exact: false },
  { to: "/admin/account", label: "Account", icon: UserCheck, exact: false },
] as const;

type VerifyAdminResult =
  | { success: true; user: AdminUserData }
  | { success: false; reason: "unauthorized" | "error"; message?: string };

async function verifyAdminUser(userId: string): Promise<VerifyAdminResult> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, role, full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // Fallback if extended profile columns are not yet provisioned in database
      const { data: fallback, error: fbErr } = await supabase
        .from("users")
        .select("id, email, role")
        .eq("id", userId)
        .maybeSingle();

      if (fbErr) {
        return { success: false, reason: "error", message: fbErr.message };
      }

      if (!fallback) {
        return { success: false, reason: "unauthorized" };
      }

      if (fallback.role === "ADMIN" || fallback.role === "STAFF") {
        return {
          success: true,
          user: {
            role: fallback.role,
            email: fallback.email,
            fullName: null,
            avatarUrl: null,
          },
        };
      }

      return { success: false, reason: "unauthorized" };
    }

    if (!data) {
      return { success: false, reason: "unauthorized" };
    }

    if (data.role === "ADMIN" || data.role === "STAFF") {
      return {
        success: true,
        user: {
          role: data.role,
          email: data.email,
          fullName: data.full_name || null,
          avatarUrl: data.avatar_url || null,
        },
      };
    }

    return { success: false, reason: "unauthorized" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, reason: "error", message };
  }
}

function AdminLayout() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUserData | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    applyTheme(readSettings().theme);

    let isMounted = true;

    // Listen for session lifecycle events (INITIAL_SESSION, SIGNED_OUT, TOKEN_REFRESHED)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !session?.user) {
        setRole(null);
        setAdminUser(null);
        setReady(true);
        return;
      }

      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        const result = await verifyAdminUser(session.user.id);
        if (!isMounted) return;

        if (result.success) {
          setRole(result.user.role);
          setAdminUser(result.user);
          setErrorMsg(null);
        } else if (result.reason === "unauthorized") {
          await supabase.auth.signOut();
          setRole(null);
          setAdminUser(null);
          setErrorMsg(
            "Your account has been authenticated, but it has not been assigned an authorized Rekik Coffee staff role. Please contact the administrator.",
          );
        } else {
          // Transient verification or network error: do NOT destroy the session
          setErrorMsg(
            "Unable to verify staff permissions. Please check your connection or refresh the page.",
          );
        }
        setReady(true);
      }
      // Note: "SIGNED_IN" is intentionally omitted here because handleSignIn
      // serves as the single source of truth for the active login operation.
    });

    // Ensure ready state resolves if no session exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (!session?.user) {
        setReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          setErrorMsg("Invalid email or password.");
        } else {
          setErrorMsg(error.message || "Failed to sign in.");
        }
        setLoading(false);
        return;
      }

      if (data.user) {
        const result = await verifyAdminUser(data.user.id);

        if (result.success) {
          setRole(result.user.role);
          setAdminUser(result.user);
          setErrorMsg(null);
          toast.success(`Signed in as ${result.user.role}`);
        } else if (result.reason === "unauthorized") {
          await supabase.auth.signOut();
          setRole(null);
          setAdminUser(null);
          setErrorMsg(
            "Your account has been authenticated, but it has not been assigned an authorized Rekik Coffee staff role. Please contact the administrator.",
          );
        } else {
          // Transient verification / database / network failure: do NOT destroy session
          setErrorMsg(
            "Unable to verify staff permissions due to a network error. Please try again.",
          );
        }
      }
    } catch {
      setErrorMsg("An unexpected network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setRole(null);
      setAdminUser(null);
      setPassword("");
      setErrorMsg(null);
      toast.success("Signed out successfully");
    } catch {
      toast.error("Error signing out");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4">
        <p className="p-10 text-sm text-muted-foreground animate-pulse">Verifying credentials…</p>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="surface-card w-full max-w-sm p-8 rounded-3xl border border-gold/30 shadow-lg text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full border border-gold/40 bg-warm-white p-1 shadow-md">
            <img
              src={rekikLogo}
              alt="Rekik Coffee Logo"
              className="size-full rounded-full object-cover"
            />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Management Console</span>
          <h1 className="font-display text-2xl font-bold text-coffee mt-1">Rekik Coffee</h1>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Enter authorized staff credentials to access café operations and roastery orders.
          </p>

          <form onSubmit={handleSignIn} className="mt-6 space-y-4 text-left">
            {errorMsg && (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2"
                role="alert"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Staff Email</Label>
              <Input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@rekikcoffee.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full mt-2 rounded-full bg-gold hover:bg-gold-light text-espresso font-semibold shadow-md transition-all hover:shadow-lg" disabled={loading}>
              {loading ? "Signing in…" : "Sign In to Console"}
            </Button>
          </form>

          <Button asChild variant="link" className="mt-4 w-full text-xs text-coffee hover:text-gold">
            <Link to="/">Back to Café Website</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-cream">
      <aside className="hidden w-64 shrink-0 flex-col bg-espresso border-r border-gold/20 p-4 text-espresso-foreground md:flex">
        <Link to="/" className="flex items-center gap-3 px-2 py-3 border-b border-gold/20 pb-4">
          <div className="size-9 rounded-full overflow-hidden border border-gold/40 bg-warm-white shrink-0">
            <img src={rekikLogo} alt="Rekik Coffee Logo" className="size-full object-cover" />
          </div>
          <div>
            <span className="font-display text-base font-bold text-warm-white block leading-tight">Rekik Coffee</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-gold font-semibold">Console</span>
          </div>
        </Link>
        <nav className="mt-4 flex-1 space-y-1" aria-label="Admin navigation">
          {nav.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              activeProps={{ className: "bg-gold/20 text-gold font-semibold border-l-2 border-gold" }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-90 transition-colors hover:bg-white/10 hover:text-gold"
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gold/20 pt-3 space-y-2">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-espresso-foreground opacity-85 transition-colors hover:bg-white/10 hover:text-gold hover:opacity-100"
          >
            <Globe className="size-4 text-gold" aria-hidden />
            <span>View Website</span>
          </Link>
          <div className="border-t border-gold/20" />
          <Link
            to="/admin/account"
            activeProps={{ className: "bg-gold/20 text-gold" }}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/10 group"
            title="Manage account profile"
          >
            <Avatar className="size-9 border border-gold/30 shrink-0">
              {adminUser?.avatarUrl && (
                <AvatarImage
                  src={adminUser.avatarUrl}
                  alt={adminUser.fullName || adminUser.email}
                />
              )}
              <AvatarFallback className="bg-gold/20 text-gold text-xs font-semibold">
                {getInitials(adminUser?.fullName, adminUser?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-warm-white group-hover:text-gold transition-colors">
                {adminUser?.fullName || adminUser?.email || "Admin Account"}
              </p>
              <p className="text-[10px] text-gold uppercase tracking-wider font-semibold">
                {adminUser?.role || role}
              </p>
            </div>
          </Link>
          <Button
            variant="ghost"
            disabled={loading}
            className="w-full justify-start text-espresso-foreground hover:bg-white/10 hover:text-destructive text-xs h-8"
            onClick={handleSignOut}
          >
            <LogOut className="size-3.5 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-gold/20 bg-espresso px-4 text-espresso-foreground md:hidden">
          <Link to="/admin" className="flex items-center gap-2.5">
            <div className="size-7 rounded-full overflow-hidden border border-gold/40 bg-warm-white shrink-0">
              <img src={rekikLogo} alt="Rekik Coffee Logo" className="size-full object-cover" />
            </div>
            <div>
              <span className="font-display text-base font-bold text-warm-white leading-tight">Rekik Coffee</span>
              <span className="ml-1.5 text-[9px] uppercase tracking-[0.2em] text-gold font-semibold">Console</span>
            </div>
          </Link>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-espresso-foreground hover:bg-white/10 hover:text-gold"
                aria-label="Open admin navigation menu"
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 max-w-[85vw] bg-espresso text-espresso-foreground border-gold/20 p-4 flex flex-col justify-between overflow-y-auto"
            >
              <div>
                <SheetHeader className="text-left pb-3 border-b border-gold/20 pr-6">
                  <SheetTitle className="font-display text-lg font-semibold text-warm-white flex items-center gap-2">
                    <div className="size-7 rounded-full overflow-hidden border border-gold/40 bg-warm-white shrink-0">
                      <img src={rekikLogo} alt="Rekik Coffee Logo" className="size-full object-cover" />
                    </div>
                    <span>Rekik Coffee</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-gold">Console</span>
                  </SheetTitle>
                  <SheetDescription className="sr-only">Admin navigation menu</SheetDescription>
                </SheetHeader>

                <nav className="mt-3 space-y-1" aria-label="Mobile admin navigation">
                  {nav.map((n) => (
                    <Link
                      key={n.label}
                      to={n.to}
                      activeOptions={{ exact: n.exact }}
                      activeProps={{
                        className: "bg-gold/20 text-gold font-semibold border-l-2 border-gold",
                      }}
                      onClick={() => setMobileNavOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-90 transition-colors hover:bg-white/10 hover:text-gold"
                    >
                      <n.icon className="size-4 shrink-0" aria-hidden />
                      <span>{n.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="border-t border-gold/20 pt-3 space-y-2 mt-4">
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-espresso-foreground opacity-85 transition-colors hover:bg-white/10 hover:text-gold hover:opacity-100"
                >
                  <Globe className="size-4 shrink-0 text-gold" aria-hidden />
                  <span>View Website</span>
                </Link>
                <div className="border-t border-gold/20" />
                <Link
                  to="/admin/account"
                  activeProps={{ className: "bg-gold/20 text-gold" }}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/10 group"
                  title="Manage account profile"
                >
                  <Avatar className="size-9 border border-gold/30 shrink-0">
                    {adminUser?.avatarUrl && (
                      <AvatarImage
                        src={adminUser.avatarUrl}
                        alt={adminUser.fullName || adminUser.email}
                      />
                    )}
                    <AvatarFallback className="bg-gold/20 text-gold text-xs font-semibold">
                      {getInitials(adminUser?.fullName, adminUser?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-warm-white group-hover:text-gold transition-colors">
                      {adminUser?.fullName || adminUser?.email || "Admin Account"}
                    </p>
                    <p className="text-[10px] text-gold uppercase tracking-wider font-semibold">
                      {adminUser?.role || role}
                    </p>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  disabled={loading}
                  className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent text-xs h-9 px-3"
                  onClick={() => {
                    setMobileNavOpen(false);
                    void handleSignOut();
                  }}
                >
                  <LogOut className="size-3.5 mr-2 shrink-0" /> Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <div className="p-4 sm:p-8 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
