import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatETB } from "@/lib/menu-data";
import { WaiterPaymentDialog } from "@/components/waiter/WaiterPaymentDialog";
import {
  fetchWaiterMetrics,
  fetchWaiterOrders,
  formatTimeAgo,
  getMethodLabel,
  getOrderPaymentStatus,
  getOrderStatusBadge,
} from "@/lib/waiter";
import type { WaiterMetrics, WaiterOrder } from "@/types/waiter";

export const Route = createFileRoute("/waiter/")({
  head: () => ({
    meta: [
      { title: "Waiter Dashboard — Rekik Café" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterDashboardOverview,
});

export function WaiterDashboardOverview() {
  const [metrics, setMetrics] = useState<WaiterMetrics | null>(null);
  const [activeOrders, setActiveOrders] = useState<WaiterOrder[]>([]);
  const [recentOrders, setRecentOrders] = useState<WaiterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<WaiterOrder | null>(null);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [m, active, recent] = await Promise.all([
        fetchWaiterMetrics().catch(() => null),
        fetchWaiterOrders({ status: "active" }).catch(() => []),
        fetchWaiterOrders().catch(() => []),
      ]);

      if (m) setMetrics(m);
      setActiveOrders(active || []);
      setRecentOrders(recent || []);
    } catch (err) {
      console.warn("Failed to load waiter dashboard overview:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();

    // Listen for realtime events dispatched by WaiterLayout
    const handleUpdate = () => void loadData();
    window.addEventListener("neba:waiter-order-update", handleUpdate);

    // 15s polling fallback
    const interval = setInterval(() => void loadData(), 15000);

    return () => {
      window.removeEventListener("neba:waiter-order-update", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const metricCards = [
    {
      label: "Active Orders",
      value: String(activeOrders.length),
      highlight: activeOrders.length > 0,
      icon: ShoppingBag,
      color: "text-amber-600 bg-amber-500/10",
      link: "/waiter/orders",
    },
    {
      label: "In Preparation",
      value: String(activeOrders.filter((o) => o.status === "preparing").length),
      highlight: false,
      icon: Clock,
      color: "text-purple-600 bg-purple-500/10",
      link: "/waiter/orders?status=preparing",
    },
    {
      label: "Ready for Service",
      value: String(activeOrders.filter((o) => o.status === "ready").length),
      highlight: activeOrders.some((o) => o.status === "ready"),
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-500/10",
      link: "/waiter/orders?status=ready",
    },
    {
      label: "Cashier Review",
      value: metrics ? String(metrics.underCashierReview) : "0",
      highlight: false,
      icon: Sparkles,
      color: "text-blue-600 bg-blue-500/10",
      link: "/waiter/history",
    },
    {
      label: "Completed Today",
      value: metrics ? String(metrics.completedToday) : "0",
      highlight: false,
      icon: Utensils,
      color: "text-teal-600 bg-teal-500/10",
      link: "/waiter/history",
    },
    {
      label: "Today's Revenue",
      value: formatETB(metrics?.todayTotalRevenue ?? 0),
      highlight: false,
      icon: CreditCard,
      color: "text-primary bg-primary/10",
      link: "/waiter/history",
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Waiter Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Real-time table orders, service status, and settlement station.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="h-9 gap-2 text-xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild size="sm" className="h-9 gap-2 text-xs">
            <Link to="/waiter/orders">View All Current Orders</Link>
          </Button>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
        {metricCards.map((card) => (
          <Link
            key={card.label}
            to={card.link}
            className={`surface-card p-4 transition-all hover:shadow-md hover:border-primary/40 block ${
              card.highlight ? "ring-2 ring-primary/30 bg-primary/5" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`flex size-8 items-center justify-center rounded-lg ${card.color}`}>
                <card.icon className="size-4" />
              </span>
              {card.highlight && (
                <Badge variant="outline" className="border-primary text-primary text-[10px] px-1.5 py-0">
                  Active
                </Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground font-medium truncate">{card.label}</p>
            <p className="mt-1 font-display text-xl sm:text-2xl font-bold tracking-tight">
              {card.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Current Active Orders */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg sm:text-xl font-semibold">
              Current Active Orders
            </h2>
            <Badge variant="secondary" className="text-xs font-semibold">
              {activeOrders.length}
            </Badge>
          </div>
          {activeOrders.length > 0 && (
            <Link
              to="/waiter/orders"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              Open Full Orders Tab <ArrowRight className="size-3" />
            </Link>
          )}
        </div>

        {loading ? (
          <div className="surface-card p-10 text-center text-sm text-muted-foreground animate-pulse">
            Loading active orders…
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="surface-card p-8 text-center space-y-2 border-dashed">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="font-medium text-sm">No active orders right now</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Newly submitted orders assigned to you will automatically appear here instantly.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeOrders.map((order) => {
              const method = getMethodLabel(order.method);
              const statusBadge = getOrderStatusBadge(order.status);
              const paymentStatus = getOrderPaymentStatus(order);
              const isPaid = paymentStatus.status === "Paid";

              return (
                <div
                  key={order.id}
                  className="surface-card p-4 flex flex-col justify-between border-border hover:border-primary/50 transition-colors shadow-sm space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-bold text-base">
                            #{order.orderNumber}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {order.orderReference}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {order.customerName}
                          {order.tableNumber && (
                            <span className="ml-2 inline-flex items-center gap-1 font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-[11px]">
                              <QrCode className="size-3" />
                              Table #{order.tableNumber}
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${method.color}`}>
                        {method.label}
                      </Badge>
                    </div>

                    {/* Status & Payment Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
                        {statusBadge.label}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${paymentStatus.className}`}>
                        {paymentStatus.label}
                      </Badge>
                    </div>

                    {/* Order items preview */}
                    <div className="rounded bg-secondary/50 p-2 text-xs space-y-1">
                      {order.items.slice(0, 3).map((it, idx) => (
                        <div key={idx} className="flex justify-between text-muted-foreground">
                          <span className="truncate pr-2">
                            {it.quantity}x {it.name}
                          </span>
                          <span className="font-medium text-foreground shrink-0">
                            {formatETB(it.lineTotal)}
                          </span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-[10px] text-muted-foreground pt-0.5 italic">
                          +{order.items.length - 3} more items…
                        </p>
                      )}
                    </div>

                    {order.customerNotes && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-1.5 rounded text-[11px]">
                        Note: {order.customerNotes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" /> {formatTimeAgo(order.createdAt)}
                      </span>
                      <span className="font-display font-bold text-base text-primary">
                        {formatETB(order.totalAmount)}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="h-8 flex-1 text-xs"
                      >
                        <Link to="/waiter/orders">View Details</Link>
                      </Button>
                      {!isPaid && (
                        <Button
                          size="sm"
                          className="h-8 flex-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => setPaymentOrder(order)}
                        >
                          Record Payment
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg sm:text-xl font-semibold">
            Recent Assigned Orders
          </h2>
          <Link
            to="/waiter/history"
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Order History <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Customer / Table</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Order State</th>
                  <th className="p-3">Payment Status</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No order activity recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentOrders.slice(0, 8).map((o) => {
                    const statusBadge = getOrderStatusBadge(o.status);
                    const paymentStatus = getOrderPaymentStatus(o);
                    const method = getMethodLabel(o.method);

                    return (
                      <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          <Link to="/waiter/orders" className="hover:underline">
                            #{o.orderNumber}
                          </Link>
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-foreground">{o.customerName}</span>
                          {o.tableNumber && (
                            <span className="ml-1 text-[11px] text-primary font-semibold">
                              (T-{o.tableNumber})
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {method.label}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
                            {statusBadge.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={`text-[10px] ${paymentStatus.className}`}>
                            {paymentStatus.label}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-semibold text-foreground">
                          {formatETB(o.totalAmount)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground text-[11px]">
                          {formatTimeAgo(o.createdAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Waiter Payment Dialog for fast recording */}
      {paymentOrder && (
        <WaiterPaymentDialog
          order={paymentOrder}
          open={Boolean(paymentOrder)}
          onOpenChange={(open) => !open && setPaymentOrder(null)}
          onSuccess={() => {
            setPaymentOrder(null);
            void loadData(true);
          }}
        />
      )}
    </div>
  );
}
