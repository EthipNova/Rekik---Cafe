import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import rekikLogo from "@/assets/rekik-coffee-logo.jpg";
import {
  AlertCircle,
  CheckCircle2,
  Boxes,
  CreditCard,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Tag,
  TrendingUp,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { adminSupabase, supabase, type UserRole } from "@/lib/supabase";
import { getInitials, type AdminUserData } from "@/lib/admin-account";
import { fetchCashierMe } from "@/services/cashier";
import { LanguageSelector } from "@/components/site/LanguageSelector";
import { useTranslation } from "@/lib/i18n";

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

export interface AdminNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact: boolean;
}

export interface AdminNavGroup {
  group: string;
  items: AdminNavItem[];
}

export const DESIGNATED_ADMIN_ID = "e145d152-0ecb-43d6-863c-06fa40c12db4";
export const DESIGNATED_ADMIN_EMAIL = "kbstar77sisay@gmail.com";

const navGroups: AdminNavGroup[] = [
  {
    group: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    group: "Business Operations",
    items: [
      { to: "/admin/orders", label: "Order & Payment", icon: ShoppingBag, exact: false },
      { to: "/admin/expenses", label: "Expenses", icon: Receipt, exact: false },
    ],
  },
  {
    group: "Management",
    items: [
      { to: "/admin/products", label: "Menu Management", icon: Package, exact: false },
      { to: "/admin/categories", label: "Categories", icon: FolderTree, exact: false },
      { to: "/admin/content", label: "Website Content", icon: Globe, exact: false },
      { to: "/admin/staff", label: "People Management", icon: Users, exact: false },
    ],
  },
  {
    group: "Configuration",
    items: [
      { to: "/admin/settings", label: "Settings", icon: Settings, exact: false },
    ],
  },
];

type VerifyAdminResult =
  | { success: true; user: AdminUserData }
  | { success: false; reason: "unauthorized" | "error"; message?: string };

async function verifyAdminUser(userId: string): Promise<VerifyAdminResult> {
  try {
    let authEmail = "";
    try {
      const { data: authData } = await adminSupabase.auth.getUser();
      if (authData?.user?.email) {
        authEmail = authData.user.email;
      }
    } catch {
      /* ignore */
    }

    // Strict Single Admin Invariant:
    // Only the designated admin account is permitted access to the Admin Dashboard.
    const isDesignated =
      userId === DESIGNATED_ADMIN_ID ||
      (Boolean(authEmail) && authEmail.toLowerCase() === DESIGNATED_ADMIN_EMAIL.toLowerCase());

    if (!isDesignated) {
      return { success: false, reason: "unauthorized", message: "Only the designated administrator is authorized to access the Admin Console." };
    }

    // 1. Check Rekik staff_profiles table first
    const { data: staffData } = await (
      adminSupabase as unknown as {
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
      if (r === "ADMIN") {
        return {
          success: true,
          user: {
            role: "ADMIN",
            email: authEmail,
            fullName: staffData.full_name || "Admin Sisay",
            avatarUrl: null,
          },
        };
      }
    }

    // 2. Fall back to legacy users table
    const { data, error } = await adminSupabase
      .from("users")
      .select("id, email, role, full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      const { data: fallback, error: fbErr } = await adminSupabase
        .from("users")
        .select("id, email, role")
        .eq("id", userId)
        .maybeSingle();

      if (fbErr) {
        return { success: false, reason: "error", message: fbErr.message };
      }

      if (fallback && fallback.role === "ADMIN") {
        return {
          success: true,
          user: {
            role: "ADMIN",
            email: fallback.email,
            fullName: "Admin Sisay",
            avatarUrl: null,
          },
        };
      }

      return { success: false, reason: "unauthorized" };
    }

    if (data && data.role === "ADMIN") {
      return {
        success: true,
        user: {
          role: "ADMIN",
          email: data.email,
          fullName: data.full_name || "Admin Sisay",
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
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [unauthorizedStaff, setUnauthorizedStaff] = useState<{
    fullName: string;
    role: string;
  } | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUserData | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    applyTheme(readSettings().theme);

    let isMounted = true;

    // Listen for session lifecycle events (INITIAL_SESSION, SIGNED_OUT, TOKEN_REFRESHED)
    const {
      data: { subscription },
    } = adminSupabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
        toast.info("Password recovery session active. Please enter your new password.");
        return;
      }

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
          // If a staff member (cashier or waiter) accesses /admin, display Access Restricted screen without redirect loop
          try {
            const { data: sp } = await (
              adminSupabase.from("staff_profiles" as any) as any
            )
              .select("role, full_name")
              .eq("user_id", session.user.id)
              .maybeSingle();

            if (sp) {
              setUnauthorizedStaff({
                fullName: sp.full_name || "Staff Member",
                role: sp.role || "staff",
              });
              setRole(null);
              setAdminUser(null);
              setReady(true);
              return;
            }
          } catch {
            // Not a staff member
          }

          setRole(null);
          setAdminUser(null);
          setUnauthorizedStaff(null);
          setErrorMsg(
            "Access restricted. Only the designated Rekik Café administrator is authorized to access the Admin Console.",
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
    adminSupabase.auth.getSession().then(async ({ data: { session } }) => {
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
          setUnauthorizedStaff(null);
        } else if (result.reason === "unauthorized") {
          try {
            const { data: sp } = await (
              adminSupabase.from("staff_profiles" as any) as any
            )
              .select("role, full_name")
              .eq("user_id", session.user.id)
              .maybeSingle();

            if (sp) {
              setUnauthorizedStaff({
                fullName: sp.full_name || "Staff Member",
                role: sp.role || "staff",
              });
              setRole(null);
              setAdminUser(null);
            }
          } catch {
            /* ignore */
          }
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
    const staffIdInput = email.trim();
    if (!staffIdInput || !password) {
      setErrorMsg(t("error.missingCredentials", "Please enter both Staff ID and password."));
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: staffIdInput,
          password,
          targetPortal: "admin",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (json.status === "deactivated") {
          setErrorMsg(t("error.deactivated", "Your account has been deactivated."));
        } else if (json.status === "role_mismatch") {
          setErrorMsg(t("error.roleMismatch", "You do not have permission to access this portal."));
        } else if (json.status === "not_found") {
          setErrorMsg(t("error.notFound", "Your Staff ID could not be found."));
        } else {
          setErrorMsg(json.message || json.error || t("error.invalidCredentials", "Invalid Staff ID or password."));
        }
        setLoading(false);
        return;
      }

      if (json.session) {
        await adminSupabase.auth.setSession({
          access_token: json.session.access_token,
          refresh_token: json.session.refresh_token,
        });
      }

      const adminRole: UserRole = "ADMIN";
      setRole(adminRole);
      setAdminUser({
        email: json.user?.email || "",
        role: adminRole,
        fullName: json.profile?.fullName || "Administrator",
        avatarUrl: null,
      });
      setUnauthorizedStaff(null);
      setErrorMsg(null);
      toast.success(`Signed in as ${json.profile.fullName || "Administrator"}`);
    } catch {
      setErrorMsg("An unexpected network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error("Please enter your administrator email address.");
      return;
    }
    setForgotLoading(true);
    setForgotSuccess(null);
    try {
      const res = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || data.error || "Failed to send reset link.");
      } else {
        setForgotSuccess(data.message || "A secure password reset link has been sent to your email.");
        toast.success("Recovery email sent.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryNewPassword || recoveryNewPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setRecoveryLoading(true);
    try {
      const { error } = await adminSupabase.auth.updateUser({ password: recoveryNewPassword });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password updated successfully! Please sign in with your new password.");
        setIsRecoveryMode(false);
        setRecoveryNewPassword("");
        setRecoveryConfirmPassword("");
      }
    } catch {
      toast.error("Failed to update password.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await adminSupabase.auth.signOut(); // supabase.auth.signOut()
      setRole(null);
      setAdminUser(null);
      setUnauthorizedStaff(null);
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

  if (unauthorizedStaff) {
    return (
      <div className="admin-theme flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="surface-card w-full max-w-md p-8 text-center space-y-5 shadow-lg border border-border">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-xs">
            <ShieldAlert className="size-7" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {t("error.accessRestricted", "Access Restricted")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              You are currently authenticated as{" "}
              <span className="font-semibold text-foreground">{unauthorizedStaff.fullName}</span> with role{" "}
              <span className="font-semibold capitalize text-foreground">{unauthorizedStaff.role}</span>.
              The Admin Console is restricted strictly to the designated Rekik Café Administrator.
            </p>
          </div>

          <div className="rounded-xl bg-muted/60 p-3.5 text-xs text-muted-foreground border border-border/50 text-left space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <AlertCircle className="size-3.5 text-amber-500" /> Need Admin Access?
            </div>
            <p>
              Please sign out below and log in using your Administrator Staff ID (e.g. RK-003) and password.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            {unauthorizedStaff.role === "waiter" && (
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link to="/waiter">
                  Go to Waiter Station
                </Link>
              </Button>
            )}
            {unauthorizedStaff.role === "cashier" && (
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link to="/casher">
                  Go to Cashier Dashboard
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                setLoading(true);
                try {
                  await adminSupabase.auth.signOut(); // supabase.auth.signOut()
                  setRole(null);
                  setAdminUser(null);
                  setUnauthorizedStaff(null);
                  setEmail("");
                  setPassword("");
                  setErrorMsg(null);
                  toast.success("Signed out. Please enter Administrator credentials.");
                } catch {
                  toast.error("Error signing out");
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full border-border hover:bg-accent"
            >
              <LogOut className="size-4 mr-2" />
              {t("nav.switchAccount", "Sign Out & Switch Account")}
            </Button>
            <Button asChild variant="ghost" className="w-full text-xs text-muted-foreground">
              <Link to="/">{t("nav.backToMenu", "Back to Café Menu")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="admin-theme flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="surface-card w-full max-w-sm p-8 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="size-14 overflow-hidden rounded-full border-2 border-gold/70 shadow-sm bg-white">
              <img
                src={rekikLogo}
                alt="Rekik Coffee logo"
                className="size-full object-contain"
              />
            </div>
            <LanguageSelector />
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {t("login.adminSignIn", "Admin Sign In")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("login.enterCredentials", "Enter your Rekik staff credentials to access café operations.")}
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
              <Label htmlFor="admin-email">{t("login.staffId", "Staff ID")}</Label>
              <Input
                id="admin-email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="RK-003"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-password">Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotSuccess(null);
                    setForgotEmail(email.includes("@") ? email : "");
                    setIsForgotOpen(true);
                  }}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Forgot Password?
                </button>
              </div>
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

          {/* Reset Administrator Password Recovery Dialog */}
          <Dialog open={isForgotOpen} onOpenChange={setIsForgotOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reset Administrator Password</DialogTitle>
                <DialogDescription>
                  Enter your administrator email address and we will send you a secure password reset link.
                </DialogDescription>
              </DialogHeader>
              {forgotSuccess ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">Reset Link Sent</p>
                    <p className="text-xs mt-1 text-emerald-800">{forgotSuccess}</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Administrator Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="admin@rekikcafe.com"
                      disabled={forgotLoading}
                    />
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsForgotOpen(false)}
                      disabled={forgotLoading}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={forgotLoading}>
                      {forgotLoading ? "Sending Link…" : "Send Reset Link"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>

          {/* Set New Password Dialog (Password Recovery Session) */}
          <Dialog open={isRecoveryMode} onOpenChange={setIsRecoveryMode}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Set New Administrator Password</DialogTitle>
                <DialogDescription>
                  Create a new secure password for your administrator account.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rec-new-password">New Password</Label>
                  <Input
                    id="rec-new-password"
                    type="password"
                    required
                    minLength={6}
                    value={recoveryNewPassword}
                    onChange={(e) => setRecoveryNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    disabled={recoveryLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rec-confirm-password">Confirm New Password</Label>
                  <Input
                    id="rec-confirm-password"
                    type="password"
                    required
                    minLength={6}
                    value={recoveryConfirmPassword}
                    onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    disabled={recoveryLoading}
                  />
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsRecoveryMode(false)}
                    disabled={recoveryLoading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={recoveryLoading}>
                    {recoveryLoading ? "Saving…" : "Save New Password"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-theme flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex border-r border-sidebar-border">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-3 group">
          <div className="size-9 overflow-hidden rounded-full border border-gold/70 shrink-0 bg-white">
            <img
              src={rekikLogo}
              alt="Rekik Coffee logo"
              className="size-full object-contain"
            />
          </div>
          <div>
            <span className="font-display text-base font-bold text-sidebar-foreground">Rekik Coffee</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-gold font-medium">Console</span>
          </div>
        </Link>
        <nav className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1" aria-label="Admin navigation">
          {navGroups.map((group) => (
            <div key={group.group} className="space-y-1">
              <h3 className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.group}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    activeOptions={{ exact: n.exact }}
                    activeProps={{
                      className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs",
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <n.icon className="size-4 shrink-0 text-sidebar-foreground/70" />
                    <span>{n.label}</span>
                  </Link>
                ))}
              </div>
            </div>
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
          <div className="flex items-center justify-between px-2 pt-1 pb-1">
            <span className="text-[10px] uppercase font-semibold text-sidebar-foreground/60 tracking-wider">
              {t("nav.language", "Language")}
            </span>
            <LanguageSelector variant="compact" />
          </div>
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
                      <span className="block text-[10px] uppercase tracking-[0.2em] text-gold font-medium">Console</span>
                    </div>
                  </SheetTitle>
                  <SheetDescription className="sr-only">Admin navigation menu</SheetDescription>
                </SheetHeader>

                <nav className="mt-3 space-y-4" aria-label="Mobile admin navigation">
                  {navGroups.map((group) => (
                    <div key={group.group} className="space-y-1">
                      <h3 className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                        {group.group}
                      </h3>
                      <div className="space-y-0.5">
                        {group.items.map((n) => (
                          <Link
                            key={n.to}
                            to={n.to}
                            activeOptions={{ exact: n.exact }}
                            activeProps={{
                              className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                            }}
                            onClick={() => setMobileNavOpen(false)}
                            className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          >
                            <n.icon className="size-4 shrink-0" aria-hidden />
                            <span>{n.label}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
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
                <div className="flex items-center justify-between px-2 pt-1 pb-1">
            <span className="text-[10px] uppercase font-semibold text-sidebar-foreground/60 tracking-wider">
              {t("nav.language", "Language")}
            </span>
            <LanguageSelector variant="compact" />
          </div>
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
