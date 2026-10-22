import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, LogIn, Receipt, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Section } from "@/components/site/Section";
import { formatETB } from "@/lib/menu-data";
import { methodLabels, statusLabels, type Order } from "@/lib/orders";
import { fetchOrders } from "@/services/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { OrderTimeline } from "@/components/site/OrderTimeline";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My Orders — NEBA Café" },
      {
        name: "description",
        content: "View your NEBA Café order history and track current orders in real-time.",
      },
      { property: "og:title", content: "My Orders — NEBA Café" },
      { property: "og:description", content: "Your NEBA Café order history." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [guestLookupId, setGuestLookupId] = useState("");

  const loadData = async (options?: { token?: string; isManual?: boolean } | boolean) => {
    const isManual = typeof options === "boolean" ? options : (options?.isManual ?? false);
    const tokenOverride = typeof options === "object" ? options?.token : undefined;
    if (isManual) setRefreshing(true);
    const token = tokenOverride || session?.access_token;
    if (!token) {
      setOrders([]);
      if (isManual) setRefreshing(false);
      return;
    }
    try {
      const remote = await fetchOrders({ token });
      setOrders(remote);
    } catch {
      setOrders([]);
    } finally {
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Check existing session
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      if (!mounted) return;
      setSession(activeSession);
      setAuthChecked(true);
      if (activeSession?.access_token) {
        void loadData({ token: activeSession.access_token });
      }
    });

    // 2. Listen to auth state transitions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setAuthChecked(true);
      if (newSession?.access_token) {
        void loadData({ token: newSession.access_token });
      } else {
        setOrders(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 3. Realtime updates & periodic polling ONLY when authenticated
  useEffect(() => {
    if (!session?.access_token) return;

    const token = session.access_token;
    const channel = supabase
      .channel("customer-orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void loadData({ token });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        void loadData({ token });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_logs" }, () => {
        void loadData({ token });
      })
      .subscribe();

    const poll = setInterval(() => {
      void loadData({ token });
    }, 10000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [session]);

  const handleGuestLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = guestLookupId.trim();
    if (!cleanId) return;
    void navigate({ to: "/order/$id", params: { id: cleanId } });
  };

  return (
    <Section className="max-w-4xl py-8 sm:py-12 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold">My Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session
              ? "View live status updates and your complete order history."
              : "Sign in to view your order history or track a recent guest order."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {session && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              <span>Sync</span>
            </Button>
          )}
          <Button asChild size="sm">
            <Link to="/account">{session ? "Customer Dashboard" : "Sign In / Register"}</Link>
          </Button>
        </div>
      </div>

      {/* Loading Auth State */}
      {!authChecked && (
        <div className="surface-card py-16 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">Checking authentication…</p>
        </div>
      )}

      {/* Unauthenticated View */}
      {authChecked && !session && (
        <div className="space-y-6">
          <div className="surface-card p-8 sm:p-12 text-center space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LogIn className="size-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h2 className="text-xl font-display font-bold">Sign in to view your order history</h2>
              <p className="text-sm text-muted-foreground">
                To protect your privacy and view all orders placed with your NEBA Café account,
                please sign in.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/account">
                  <span>Sign In to Account</span>
                  <ArrowRight className="size-4 ml-1.5" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/menu">Browse Menu</Link>
              </Button>
            </div>
          </div>

          {/* Guest Order Lookup Card */}
          <div className="surface-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <Search className="size-5" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-base font-display font-semibold">Track a Guest Order</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Placed an order as a guest without signing in? Enter your Order ID to view
                    real-time kitchen progress.
                  </p>
                </div>
                <form
                  onSubmit={handleGuestLookup}
                  className="flex flex-col sm:flex-row gap-2 max-w-md"
                >
                  <div className="flex-1">
                    <Label htmlFor="guestOrderId" className="sr-only">
                      Order ID
                    </Label>
                    <Input
                      id="guestOrderId"
                      value={guestLookupId}
                      onChange={(e) => setGuestLookupId(e.target.value)}
                      placeholder="e.g. ord_m0k... or UUID"
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                  <Button type="submit" size="sm" className="gap-1.5">
                    <span>Track</span>
                    <ExternalLink className="size-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Authenticated View: Orders List */}
      {authChecked && session && (
        <div className="space-y-4">
          {orders === null && (
            <div className="surface-card py-16 text-center">
              <p className="text-sm text-muted-foreground animate-pulse">Loading your orders…</p>
            </div>
          )}

          {orders !== null && orders.length === 0 && (
            <EmptyState
              icon={<Receipt className="size-8" />}
              title="No orders found"
              description="You have not placed any orders with this account yet. Browse our delicious menu and place your first order!"
              action={
                <Button asChild>
                  <Link to="/menu">Explore Menu</Link>
                </Button>
              }
            />
          )}

          {orders?.map((order) => {
            const isPaid = order.paymentStatus === "paid";
            const isActive = order.status !== "completed";
            return (
              <article
                key={order.id}
                className="surface-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 transition-all hover:border-primary/40"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold">Order {order.number}</h2>
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className={cn(
                        "text-xs py-0.5",
                        isActive && "bg-primary text-primary-foreground",
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
                      {isPaid ? "Paid" : "Payment Pending"}
                    </Badge>
                    <Badge variant="outline" className="text-xs py-0.5 text-muted-foreground">
                      {methodLabels[order.method]}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {order.items.reduce((s, i) => s + i.quantity, 0)} item(s):{" "}
                    <span className="text-foreground/80 font-medium">
                      {order.items.map((i) => `${i.name} (×${i.quantity})`).join(", ")}
                    </span>
                  </p>

                  {order.customer.table && (
                    <p className="text-xs text-muted-foreground">
                      Table: <strong className="text-foreground">#{order.customer.table}</strong>
                    </p>
                  )}
                  {order.customer.address && (
                    <p className="text-xs text-muted-foreground">
                      Delivery Address:{" "}
                      <strong className="text-foreground">{order.customer.address}</strong>
                    </p>
                  )}

                  {/* Visual Order Progress Timeline */}
                  <div className="pt-3 mt-2 border-t border-border/40">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Live Order Progress
                    </p>
                    <div className="bg-secondary/20 rounded-lg p-3 sm:p-4">
                      <OrderTimeline order={order} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-border pt-3 sm:pt-0">
                  <span className="font-display text-xl font-bold text-foreground">
                    {formatETB(order.total)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                      <Link to="/order/$id" params={{ id: order.id }}>
                        <span>Track Order</span>
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
    </Section>
  );
}
