import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  User,
  UserPlus,
  Utensils,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Section } from "@/components/site/Section";
import { OrderTimeline } from "@/components/site/OrderTimeline";
import { formatETB, getProduct } from "@/lib/menu-data";
import {
  methodLabels,
  saveOrder,
  statusLabels,
  type Order,
  type OrderMethod,
  type OrderStatus,
} from "@/lib/orders";
import { fetchCustomerProfile, fetchOrders, updateOrderPaymentMethod } from "@/services/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Customer Dashboard & Orders — Rekik Coffee" },
      {
        name: "description",
        content:
          "Track live orders, view your complete order history, and manage your Rekik Coffee account.",
      },
      { property: "og:title", content: "Customer Dashboard — Rekik Coffee" },
      { property: "og:description", content: "Real-time order tracking and customer history." },
    ],
  }),
  component: AccountPage,
});

function MethodIcon({ method }: { method: OrderMethod }) {
  if (method === "delivery") return <Truck className="size-4" aria-hidden />;
  if (method === "takeaway") return <Store className="size-4" aria-hidden />;
  return <Utensils className="size-4" aria-hidden />;
}

function AccountPage() {
  // Session & customer profile state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<{ name: string; phone: string; email: string } | null>(
    null,
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  // Auth UI state (when not signed in)
  const [authMode, setAuthMode] = useState<"signin" | "register">("signin");
  const [signInForm, setSignInForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  // Inline payment modal state
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"telebirr" | "cbe" | "cash">("telebirr");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Load customer profile and orders using verified Bearer session token
  const loadProfileAndOrders = async (token?: string, isManual = false) => {
    if (isManual) setRefreshing(true);
    setLoadingOrders(true);
    try {
      // 1. Fetch profile from /api/customer/profile
      const profData = await fetchCustomerProfile({ token });
      if (profData) {
        setProfile({
          name: profData.customer?.name || profData.user.full_name || "Valued Customer",
          phone: profData.customer?.phone || profData.user.phone || "",
          email: profData.customer?.email || profData.user.email || "",
        });
      }

      // 2. Fetch authenticated customer's owned orders
      const remoteOrders = await fetchOrders({ token });
      setOrders(remoteOrders);
    } catch (err) {
      console.warn("Error loading customer data:", err);
      setOrders([]);
    } finally {
      setLoadingOrders(false);
      if (isManual) {
        setRefreshing(false);
        toast.success("Orders refreshed with live database");
      }
    }
  };

  // Synchronize session on mount & subscribe to Supabase Auth state changes
  useEffect(() => {
    let mounted = true;

    // Check existing active session
    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        if (!mounted) return;
        setSession(currentSession);
        setAuthLoading(false);
        if (currentSession) {
          void loadProfileAndOrders(currentSession.access_token);
        }
      })
      .catch(() => {
        if (mounted) setAuthLoading(false);
      });

    // Subscribe to auth events (SIGN_IN, SIGNED_OUT, TOKEN_REFRESHED)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthLoading(false);

      if (nextSession) {
        void loadProfileAndOrders(nextSession.access_token);
      } else {
        setOrders([]);
        setProfile({ name: "Valued Customer", phone: "", email: "" });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Realtime subscription for customer's live orders & payment changes
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel("customer-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void loadProfileAndOrders(session.access_token);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        void loadProfileAndOrders(session.access_token);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_logs" }, () => {
        void loadProfileAndOrders(session.access_token);
      })
      .subscribe();

    const interval = setInterval(() => {
      void loadProfileAndOrders(session.access_token);
    }, 10000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [session]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const email = signInForm.email.trim();
    const password = signInForm.password;

    if (!email || !password) {
      setAuthError("Please enter both your email address and password.");
      return;
    }

    setSubmittingAuth(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          setAuthError("Invalid email or password. Please check your credentials.");
        } else {
          setAuthError(error.message || "Failed to sign in.");
        }
        return;
      }

      if (data.session) {
        setSession(data.session);
        toast.success("Welcome back!");
        void loadProfileAndOrders(data.session.access_token);
      }
    } catch {
      setAuthError("An unexpected network error occurred. Please try again.");
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const name = registerForm.fullName.trim();
    const email = registerForm.email.trim();
    const phone = registerForm.phone.trim();
    const password = registerForm.password;
    const confirmPassword = registerForm.confirmPassword;

    if (!name) {
      setAuthError("Please enter your full name.");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError("Please enter a valid email address.");
      return;
    }
    if (!phone || phone.replace(/\D/g, "").length < 8) {
      setAuthError("Please enter a valid phone number (at least 9 digits).");
      return;
    }
    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("Passwords do not match. Please verify.");
      return;
    }

    setSubmittingAuth(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            phone,
            role: "CUSTOMER",
          },
        },
      });

      if (error) {
        setAuthError(error.message || "Registration failed. Please try again.");
        return;
      }

      if (data.session) {
        setSession(data.session);
        toast.success("Welcome to Rekik Coffee! Your account is created.");
        void loadProfileAndOrders(data.session.access_token);
      } else if (data.user) {
        toast.info(
          "Account created! If email confirmation is enabled, please verify your email before signing in.",
        );
        setAuthMode("signin");
        setSignInForm({ email, password: "" });
      }
    } catch {
      setAuthError("An unexpected network error occurred during registration. Please try again.");
    } finally {
      setSubmittingAuth(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setSession(null);
    setProfile(null);
    setOrders([]);
    setSignInForm({ email: "", password: "" });
    setRegisterForm({
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    });
    setAuthError(null);
    toast.success("You have signed out");
  };

  // Update payment method for pending order
  const handleUpdatePaymentMethod = async (order: Order) => {
    setSubmittingPayment(true);
    try {
      const methodName =
        payMethod === "telebirr"
          ? "Telebirr Mobile"
          : payMethod === "cbe"
            ? "Bank Transfer (CBE)"
            : "Cash / In-Person";

      const updated = await updateOrderPaymentMethod({
        orderId: order.id,
        paymentMethod: methodName,
      });

      saveOrder(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setPayingOrderId(null);
      toast.success(`Payment method updated to ${methodName} for Order ${order.number}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update payment method. Please try again.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Extract customer data
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "completed"), [orders]);

  const pastOrders = useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);

  const filteredOrders = useMemo(() => {
    if (filter === "active") return activeOrders;
    if (filter === "completed") return pastOrders;
    return orders;
  }, [filter, activeOrders, pastOrders, orders]);

  const savedAddresses = useMemo(() => {
    const list: string[] = [];
    for (const o of orders) {
      if (o.customer?.address && !list.includes(o.customer.address)) {
        list.push(o.customer.address);
      }
    }
    return list;
  }, [orders]);

  const totalSpent = useMemo(() => orders.reduce((sum, o) => sum + (o.total || 0), 0), [orders]);

  // Loading state while determining session
  if (authLoading) {
    return (
      <Section className="max-w-md py-20 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <RefreshCw className="size-6 animate-spin" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground animate-pulse">
          Checking customer session...
        </p>
      </Section>
    );
  }

  // Unauthenticated: Show real Sign In / Register tabs
  if (!session) {
    return (
      <Section className="max-w-md py-12">
        <div className="text-center">
          <div className="mx-auto size-16 overflow-hidden rounded-full border-2 border-gold shadow-sm">
            <img
              src="/images/rekik-logo.jpg"
              alt="Rekik Coffee Logo"
              className="size-full object-cover"
            />
          </div>
          <h1 className="mt-4 text-3xl font-display font-semibold">Rekik Coffee Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to track active orders in real time, view your order history, and manage your
            Rekik Coffee account.
          </p>
        </div>

        {/* Auth Mode Toggle Tabs */}
        <div className="mt-8 grid grid-cols-2 rounded-xl bg-muted/60 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setAuthMode("signin");
              setAuthError(null);
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all",
              authMode === "signin"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LogIn className="size-4" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("register");
              setAuthError(null);
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all",
              authMode === "register"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <UserPlus className="size-4" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Error notification banner */}
        {authError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        {/* SIGN IN FORM */}
        {authMode === "signin" ? (
          <form onSubmit={handleSignIn} className="surface-card mt-4 space-y-4 p-6 sm:p-8">
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="signin-email"
                  type="email"
                  value={signInForm.email}
                  onChange={(e) => setSignInForm({ ...signInForm, email: e.target.value })}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signin-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  value={signInForm.password}
                  onChange={(e) => setSignInForm({ ...signInForm, password: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={submittingAuth} className="w-full font-semibold gap-2">
              {submittingAuth ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <LogIn className="size-4" />
                  <span>Sign In to Dashboard</span>
                </>
              )}
            </Button>

            <div className="text-center pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span>Don't have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
                className="text-primary hover:underline font-medium"
              >
                Create one now →
              </button>
            </div>
          </form>
        ) : (
          /* REGISTRATION FORM */
          <form onSubmit={handleRegister} className="surface-card mt-4 space-y-4 p-6 sm:p-8">
            <div className="space-y-2">
              <Label htmlFor="reg-name">Full name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reg-name"
                  type="text"
                  value={registerForm.fullName}
                  onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
                  placeholder="Abebe Kebede"
                  autoComplete="name"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reg-email"
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-phone">Contact phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reg-phone"
                  type="tel"
                  value={registerForm.phone}
                  onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                  placeholder="+251 91 234 5678"
                  autoComplete="tel"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg-confirm-password">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reg-confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={registerForm.confirmPassword}
                  onChange={(e) =>
                    setRegisterForm({ ...registerForm, confirmPassword: e.target.value })
                  }
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <Button type="submit" disabled={submittingAuth} className="w-full font-semibold gap-2">
              {submittingAuth ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  <span>Register & Continue</span>
                </>
              )}
            </Button>

            <div className="text-center pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <span>Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthError(null);
                }}
                className="text-primary hover:underline font-medium"
              >
                Sign in here →
              </button>
            </div>
          </form>
        )}

        <div className="text-center pt-4">
          <Link
            to="/menu"
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Browse Menu & Order as Guest →
          </Link>
        </div>
      </Section>
    );
  }

  const primaryActiveOrder = activeOrders[0] || null;

  return (
    <Section className="max-w-5xl py-8 sm:py-12 space-y-8">
      {/* 1. DASHBOARD HEADER & QUICK STATS */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <Badge
            variant="outline"
            className="mb-2 gap-1 px-2.5 py-0.5 text-xs text-primary border-primary/30"
          >
            <User className="size-3" /> Customer Dashboard
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-display font-bold">
            Welcome back,{" "}
            {profile?.name ||
              session?.user?.user_metadata?.["full_name"] ||
              session?.user?.email?.split("@")[0] ||
              "Valued Customer"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile?.phone || session?.user?.user_metadata?.["phone"]
              ? `Contact: ${profile?.phone || session?.user?.user_metadata?.["phone"]} · `
              : ""}
            {session?.user?.email ? `Account: ${session.user.email} · ` : ""}
            Real-time status updates and order history
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadProfileAndOrders(session?.access_token, true)}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            <span>Sync</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-3.5" />
            <span>Sign out</span>
          </Button>
        </div>
      </header>

      {/* METRIC TILES */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="surface-card p-4">
          <span className="text-xs text-muted-foreground uppercase font-medium">Total Orders</span>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{orders.length}</p>
        </div>
        <div className="surface-card p-4">
          <span className="text-xs text-muted-foreground uppercase font-medium">Active Orders</span>
          <p className="mt-1 font-display text-2xl font-bold text-primary">{activeOrders.length}</p>
        </div>
        <div className="surface-card p-4">
          <span className="text-xs text-muted-foreground uppercase font-medium">Total Spent</span>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {formatETB(totalSpent)}
          </p>
        </div>
        <div className="surface-card p-4">
          <span className="text-xs text-muted-foreground uppercase font-medium">
            Saved Locations
          </span>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {savedAddresses.length}
          </p>
        </div>
      </div>

      {/* 2. LIVE ACTIVE ORDER HERO SECTION (IF IN PROGRESS) */}
      {primaryActiveOrder && (
        <section
          aria-labelledby="active-order-title"
          className="surface-card overflow-hidden border-primary/30 p-6 sm:p-8 space-y-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="gap-1.5 bg-primary/10 text-primary font-semibold text-xs py-0.5 px-2.5"
                >
                  <span className="size-2 rounded-full bg-primary animate-pulse" />
                  Order In Progress
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {methodLabels[primaryActiveOrder.method]}
                </Badge>
              </div>
              <h2 id="active-order-title" className="mt-2 font-display text-2xl font-bold">
                Order {primaryActiveOrder.number}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Placed{" "}
                {new Date(primaryActiveOrder.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · Status:{" "}
                <strong className="text-primary">{statusLabels[primaryActiveOrder.status]}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={primaryActiveOrder.paymentStatus === "paid" ? "default" : "outline"}
                className={cn(
                  "text-xs px-2.5 py-1 font-medium",
                  primaryActiveOrder.paymentStatus === "paid"
                    ? "bg-success text-success-foreground"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
                )}
              >
                {primaryActiveOrder.paymentStatus === "paid" ? "Paid" : "Payment Pending"}
              </Badge>
            </div>
          </div>

          {/* Live Progress Timeline */}
          <div className="py-2">
            <OrderTimeline order={primaryActiveOrder} />
          </div>

          {/* Items Preview & Fulfillment Row */}
          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr] pt-4 border-t border-border">
            {/* Ordered Items Preview */}
            <div className="space-y-3">
              <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Items Ordered ({primaryActiveOrder.items.reduce((s, i) => s + i.quantity, 0)})
              </span>
              <div className="divide-y divide-border/60 max-h-48 overflow-y-auto pr-1">
                {primaryActiveOrder.items.map((item) => {
                  const p = getProduct(item.productId);
                  return (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        {p?.image ? (
                          <img
                            src={p.image}
                            alt={item.name}
                            className="size-8 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <ShoppingBag className="size-3.5" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatETB(item.price)} × {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold">{formatETB(item.price * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fulfillment & Settlement action */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <span className="font-medium text-foreground">
                    {methodLabels[primaryActiveOrder.method]}
                  </span>
                </div>

                {primaryActiveOrder.customer.address && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Delivery to:</span>
                    <span className="font-medium text-foreground text-right">
                      {primaryActiveOrder.customer.address}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/60 pt-2 font-display text-base font-bold">
                  <span>Order Total:</span>
                  <span className="text-primary">{formatETB(primaryActiveOrder.total)}</span>
                </div>
              </div>

              {/* Payment status and instructions link */}
              {primaryActiveOrder.paymentStatus !== "paid" ? (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 font-medium">
                    <AlertCircle className="size-3.5" />
                    <span>
                      {primaryActiveOrder.transactionReference
                        ? "Details collected — awaiting cashier verification"
                        : "Payment awaiting settlement"}
                    </span>
                  </div>
                  <Button
                    asChild
                    className="w-full text-xs font-semibold gap-1.5"
                  >
                    <Link to="/order/$id" params={{ id: primaryActiveOrder.id }}>
                      <CreditCard className="size-3.5" />
                      <span>View Payment Instructions ({formatETB(primaryActiveOrder.total)})</span>
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-success font-medium pt-2 border-t border-border/60">
                  <CheckCircle2 className="size-3.5" />
                  <span>Payment verified via {primaryActiveOrder.paymentMethod}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MODAL / DRAWER FOR DASHBOARD PAYMENT SELECTION */}
      {payingOrderId &&
        (() => {
          const targetOrder = orders.find((o) => o.id === payingOrderId);
          if (!targetOrder) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div className="surface-card max-w-md w-full p-6 space-y-5 rounded-2xl shadow-xl border-primary/30 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-5 text-primary" />
                    <h3 className="font-display text-lg font-bold">
                      Payment for Order #{targetOrder.number}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPayingOrderId(null)}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center justify-between bg-secondary/40 p-3 rounded-xl text-sm">
                  <span className="text-muted-foreground">Amount due:</span>
                  <span className="font-display text-xl font-bold text-primary">
                    {formatETB(targetOrder.total)}
                  </span>
                </div>

                <div className="space-y-2.5">
                  <Label className="text-xs font-semibold">Select Payment Method</Label>
                  <div className="grid gap-2">
                    {[
                      {
                        id: "telebirr" as const,
                        name: "Telebirr Mobile",
                        detail: "Till: 0911 234 567 (Rekik Coffee Lounge)",
                        icon: Smartphone,
                      },
                      {
                        id: "cbe" as const,
                        name: "Bank Transfer (CBE)",
                        detail: "Account: 1000 2345 67890 (Rekik Coffee)",
                        icon: CreditCard,
                      },
                      {
                        id: "cash" as const,
                        name: "Cash / In-Person",
                        detail: "Pay with server or delivery courier",
                        icon: Banknote,
                      },
                    ].map((m) => (
                      <label
                        key={m.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all",
                          payMethod === m.id
                            ? "border-primary bg-accent/60 ring-1 ring-primary"
                            : "border-border hover:bg-secondary/40",
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="dash-pay"
                            checked={payMethod === m.id}
                            onChange={() => setPayMethod(m.id)}
                            className="accent-[var(--primary)]"
                          />
                          <div>
                            <p className="font-semibold text-foreground">{m.name}</p>
                            <p className="text-[11px] text-muted-foreground">{m.detail}</p>
                          </div>
                        </div>
                        <m.icon className="size-4 text-primary" />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Waiter-Verified Settlement</p>
                  <p className="text-[11px] leading-relaxed">
                    Your assigned waiter ({targetOrder.waiterName || "Floor Staff"}) will collect and record your payment reference on floor / upon delivery to submit to the cashier.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="ghost" size="sm" onClick={() => setPayingOrderId(null)}>
                    Close
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleUpdatePaymentMethod(targetOrder)}
                    disabled={submittingPayment}
                    className="font-semibold"
                  >
                    <CheckCircle2 className="size-3.5 mr-1.5" />
                    {submittingPayment ? "Saving…" : "Save Payment Preference"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* 3. ORDER HISTORY & FILTER TABS */}
      <section aria-labelledby="history-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="history-title" className="font-display text-2xl font-bold">
              Order History
            </h2>
            <p className="text-xs text-muted-foreground">
              Complete log of all orders placed with Rekik Coffee.
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border p-1 bg-secondary/30 text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "px-3 py-1 rounded-md font-medium transition-colors",
                filter === "all"
                  ? "bg-background shadow-xs text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("active")}
              className={cn(
                "px-3 py-1 rounded-md font-medium transition-colors",
                filter === "active"
                  ? "bg-background shadow-xs text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Active ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("completed")}
              className={cn(
                "px-3 py-1 rounded-md font-medium transition-colors",
                filter === "completed"
                  ? "bg-background shadow-xs text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Past ({pastOrders.length})
            </button>
          </div>
        </div>

        {loadingOrders ? (
          <div className="surface-card py-16 text-center">
            <p className="text-sm text-muted-foreground animate-pulse">
              Syncing orders with persistent database…
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-8" />}
            title="No orders found"
            description={
              filter === "active"
                ? "You have no active orders in progress."
                : filter === "completed"
                  ? "You have no past completed orders."
                  : "You haven't placed any orders yet. Explore our fresh menu to order."
            }
            action={
              <Button asChild>
                <Link to="/menu">Explore Menu</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const isPaid = order.paymentStatus === "paid";
              return (
                <article
                  key={order.id}
                  className="surface-card p-5 transition-all hover:border-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold text-base text-foreground">
                        Order {order.number}
                      </span>
                      <Badge variant="outline" className="gap-1 text-xs py-0.5">
                        <MethodIcon method={order.method} />
                        <span>{methodLabels[order.method]}</span>
                      </Badge>
                      <Badge
                        variant={order.status === "completed" ? "secondary" : "default"}
                        className={cn(
                          "text-xs py-0.5",
                          order.status !== "completed" && "bg-primary text-primary-foreground",
                        )}
                      >
                        {statusLabels[order.status]}
                      </Badge>
                      <Badge
                        variant={isPaid ? "outline" : "secondary"}
                        className={cn(
                          "text-xs py-0.5",
                          isPaid
                            ? "border-success/40 text-success bg-success/10"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
                        )}
                      >
                        {isPaid ? "Paid" : "Pending Payment"}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {order.items.reduce((s, i) => s + i.quantity, 0)} item(s):{" "}
                      <span className="text-foreground/80">
                        {order.items.map((i) => `${i.name} (×${i.quantity})`).join(", ")}
                      </span>
                    </p>

                    {order.customer.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="size-3 text-primary shrink-0" />
                        <span>{order.customer.address}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-border pt-3 sm:pt-0">
                    <span className="font-display text-lg font-bold text-foreground">
                      {formatETB(order.total)}
                    </span>

                    <div className="flex items-center gap-2">
                      {!isPaid && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPayingOrderId(order.id)}
                          className="text-xs font-semibold"
                        >
                          Pay Now
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm" className="gap-1 text-xs">
                        <Link to="/order/$id" params={{ id: order.id }}>
                          <span>Details</span>
                          <ExternalLink className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. SAVED LOCATIONS & PROFILE INFO */}
      <section
        aria-labelledby="profile-details-title"
        className="grid gap-6 md:grid-cols-2 pt-4 border-t border-border"
      >
        <div className="surface-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <User className="size-4" />
            <h3 id="profile-details-title" className="font-display text-base">
              Customer Details
            </h3>
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Name: </span>
            <strong className="text-foreground">{profile?.name || "Guest diner"}</strong>
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Phone: </span>
            <strong className="text-foreground">{profile?.phone || "No phone linked"}</strong>
          </p>
          <p className="text-xs text-muted-foreground pt-1">
            Details are automatically preserved during checkout for faster dining and delivery
            orders.
          </p>
        </div>

        <div className="surface-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-primary font-semibold">
            <MapPin className="size-4" />
            <h3 className="font-display text-base">Saved Delivery Locations</h3>
          </div>
          {savedAddresses.length > 0 ? (
            <ul className="space-y-1.5 text-xs text-foreground">
              {savedAddresses.map((addr, idx) => (
                <li key={idx} className="flex items-start gap-1.5 bg-secondary/40 p-2 rounded-lg">
                  <MapPin className="size-3 text-primary shrink-0 mt-0.5" />
                  <span>{addr}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No saved addresses yet. When you place delivery orders, your locations will be
              recorded here.
            </p>
          )}
        </div>
      </section>
    </Section>
  );
}
