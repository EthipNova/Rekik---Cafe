import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Boxes,
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
  TrendingUp,
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
import { fetchCashierMe } from "@/services/cashier";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Rekik Café" },
      {
        name: "description",
        content:
          "Operations, catalog, inventory, availability, payments and settings for Rekik Café management.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, exact: false },
  { to: "/admin/payments", label: "Sales & Payments", icon: CreditCard, exact: false },
  { to: "/admin/staff", label: "Staff & Activity", icon: UserCheck, exact: false },
  { to: "/admin/promotions", label: "Promotions", icon: Tag, exact: false },
  { to: "/admin/customers", label: "Customers", icon: Users, exact: false },
  { to: "/admin/products", label: "Products", icon: Package, exact: false },
  { to: "/admin/categories", label: "Categories", icon: FolderTree, exact: false },
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
    let authEmail = "";
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.email) {
        authEmail = authData.user.email;
      }
    } catch {
      /* ignore */
    }

    // 1. Check Rekik staff_profiles table first
    const { data: staffData } = await (
      supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (
              col: string,
              val: string,
            ) => {
              maybeSingle: () => Promise<{
                data: {
                  user_id: string;
                  full_name: string | null;
                  role: string | null;
                  is_active: boolean | null;
                } | null;
              }>;
            };
          };
        };
      }
    )
      .from("staff_profiles")
      .select("user_id, full_name, role, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (staffData && staffData.is_active !== false) {
      const r = (staffData.role || "").toUpperCase();
      const normalizedRole: UserRole = r === "ADMIN" ? "ADMIN" : "STAFF";
      return {
        success: true,
        user: {
          role: normalizedRole,
          email: authEmail,
          fullName: staffData.full_name || null,
          avatarUrl: null,
        },
      };
    }

    // 2. Fall back to legacy users table
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

    if (data && (data.role === "ADMIN" || data.role === "STAFF")) {
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

    // 3. Fall back to authoritative database RPC check (handles RLS-restricted profiles)
    try {
      const { data: isStaff, error: rpcErr } = await (
        supabase as unknown as {
          rpc: (
            name: string,
          ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
        }
      ).rpc("is_admin_or_staff");

      if (!rpcErr && isStaff === true) {
        const { data: authData } = await supabase.auth.getUser();
        const authUser = authData?.user;
        const meta = authUser?.user_metadata as Record<string, unknown> | undefined;
        const metaRole = (typeof meta?.["role"] === "string" ? meta["role"] : "").toUpperCase();
        const resolvedRole: UserRole = metaRole === "STAFF" ? "STAFF" : "ADMIN";
        const metaName =
          (typeof meta?.["full_name"] === "string" ? meta["full_name"] : null) ||
          (typeof meta?.["name"] === "string" ? meta["name"] : null) ||
          authUser?.email?.split("@")[0] ||
          null;

        return {
          success: true,
          user: {
            role: resolvedRole,
            email: authUser?.email || "",
            fullName: metaName,
            avatarUrl: null,
          },
        };
      }
    } catch {
      // Ignore RPC fallback exception and proceed to unauthorized
    }

    return { success: false, reason: "unauthorized" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, reason: "error", message };
  }
}

function AdminLayout() {
  const navigate = useNavigate();
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

      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        const result = await verifyAdminUser(session.user.id);
        if (!isMounted) return;

        if (result.success) {
          setRole(result.user.role);
          setAdminUser(result.user);
          setErrorMsg(null);
        } else if (result.reason === "unauthorized") {
          try {
            const cashierCheck = await fetchCashierMe();
            if (cashierCheck.success && cashierCheck.role === "cashier") {
              void navigate({ to: "/casher", replace: true });
              return;
            }
          } catch {
            // Not a cashier
          }

          await supabase.auth.signOut();
          setRole(null);
          setAdminUser(null);
          setErrorMsg(
            "Your account has been authenticated, but it has not been assigned an authorized Rekik staff role. Please contact the administrator.",
          );
        } else {
          // Transient verification or network error: do NOT destroy the session
          setErrorMsg(
            "Unable to verify staff permissions. Please check your connection or refresh the page.",
          );
        }
        setReady(true);
      }
    });

    // Ensure session resolves and verifies immediately on load or reload
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      if (!session?.user) {
        setReady(true);
      } else {
        const result = await verifyAdminUser(session.user.id);
        if (!isMounted) return;
        if (result.success) {
          setRole(result.user.role);
          setAdminUser(result.user);
          setErrorMsg(null);
        }
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
          try {
            const cashierCheck = await fetchCashierMe();
            if (cashierCheck.success && cashierCheck.role === "cashier") {
              toast.success(
                `Welcome back, ${cashierCheck.profile.full_name}! Redirecting to Cashier Dashboard...`,
              );
              void navigate({ to: "/casher" });
              return;
            }
          } catch {
            // Not a cashier
          }

          await supabase.auth.signOut();
          setRole(null);
          setAdminUser(null);
          setErrorMsg(
            "Your account has been authenticated, but it has not been assigned an authorized Rekik staff role. Please contact the administrator.",
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
      <div className="admin-theme flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <p className="p-10 text-sm text-muted-foreground animate-pulse">Verifying credentials…</p>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="admin-theme flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="surface-card w-full max-w-sm p-8 shadow-sm">
          <h1 className="font-display text-2xl font-semibold text-foreground">Admin sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your Rekik staff credentials to access café operations.
          </p>

          <form onSubmit={handleSignIn} className="mt-6 space-y-4">
            {errorMsg && (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2"
                role="alert"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="admin-email">Admin email</Label>
              <Input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@rekikcafe.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
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

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <Button
            asChild
            variant="link"
            className="mt-4 w-full text-muted-foreground hover:text-foreground"
          >
            <Link to="/">Back to café site</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-theme flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex border-r border-sidebar-border">
        <Link to="/" className="px-2 py-3 flex items-center">
          <span className="font-display text-lg font-semibold text-sidebar-foreground">
            Rekik Café
          </span>
          <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/70">
            Console
          </span>
        </Link>
        <nav className="mt-4 flex-1 space-y-1" aria-label="Admin navigation">
          {nav.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-90 transition-colors hover:bg-sidebar-accent"
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border pt-3 space-y-2">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground opacity-85 transition-colors hover:bg-sidebar-accent hover:opacity-100"
          >
            <Globe className="size-4" aria-hidden />
            <span>View Website</span>
          </Link>
          <div className="border-t border-sidebar-border" />
          <Link
            to="/admin/account"
            activeProps={{ className: "bg-sidebar-accent" }}
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-sidebar-accent group"
            title="Manage account profile"
          >
            <Avatar className="size-9 border border-sidebar-border shrink-0">
              {adminUser?.avatarUrl && (
                <AvatarImage
                  src={adminUser.avatarUrl}
                  alt={adminUser.fullName || adminUser.email}
                />
              )}
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {getInitials(adminUser?.fullName, adminUser?.email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium text-sidebar-foreground group-hover:text-primary transition-colors">
                {adminUser?.fullName || adminUser?.email || "Admin Account"}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {adminUser?.role || role}
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

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile Header */}
        <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground md:hidden">
          <Link to="/admin" className="flex items-center">
            <span className="font-display text-lg font-semibold text-sidebar-foreground">
              Rekik Café
            </span>
            <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/70">
              Console
            </span>
          </Link>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label="Open admin navigation menu"
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground border-sidebar-border p-4 flex flex-col justify-between overflow-y-auto"
            >
              <div>
                <SheetHeader className="text-left pb-3 border-b border-sidebar-border pr-6">
                  <SheetTitle className="font-display text-lg font-semibold text-sidebar-foreground flex items-center">
                    <span>Rekik Café</span>
                    <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/70">
                      Console
                    </span>
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
                        className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                      }}
                      onClick={() => setMobileNavOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm opacity-90 transition-colors hover:bg-sidebar-accent"
                    >
                      <n.icon className="size-4 shrink-0" aria-hidden />
                      <span>{n.label}</span>
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="border-t border-sidebar-border pt-3 space-y-2 mt-4">
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground opacity-85 transition-colors hover:bg-sidebar-accent hover:opacity-100"
                >
                  <Globe className="size-4 shrink-0" aria-hidden />
                  <span>View Website</span>
                </Link>
                <div className="border-t border-sidebar-border" />
                <Link
                  to="/admin/account"
                  activeProps={{ className: "bg-sidebar-accent" }}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-sidebar-accent group"
                  title="Manage account profile"
                >
                  <Avatar className="size-9 border border-sidebar-border shrink-0">
                    {adminUser?.avatarUrl && (
                      <AvatarImage
                        src={adminUser.avatarUrl}
                        alt={adminUser.fullName || adminUser.email}
                      />
                    )}
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                      {getInitials(adminUser?.fullName, adminUser?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-sidebar-foreground group-hover:text-primary transition-colors">
                      {adminUser?.fullName || adminUser?.email || "Admin Account"}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
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
