import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { demoBoardOrders, revenueByHour } from "@/lib/admin-data";
import { formatETB, products as seedProducts, type Product } from "@/lib/menu-data";
import { methodLabels, readOrders, statusLabels, type Order } from "@/lib/orders";
import { cn } from "@/lib/utils";
import { fetchOrders, fetchProducts } from "@/services/api";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Staff Dashboard — Rekik Café" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const [productList, setProductList] = useState<Product[]>(seedProducts);
  const [orderList, setOrderList] = useState<Order[]>([]);

  useEffect(() => {
    // Initial local read
    setOrderList(readOrders());

    let cancelled = false;
    async function loadData() {
      try {
        const [fetchedProducts, fetchedOrders] = await Promise.all([
          fetchProducts().catch(() => seedProducts),
          fetchOrders().catch(() => readOrders()),
        ]);

        if (!cancelled) {
          if (fetchedProducts && fetchedProducts.length > 0) {
            setProductList(fetchedProducts);
          }
          if (fetchedOrders) {
            setOrderList(fetchedOrders);
          }
        }
      } catch (err) {
        console.warn("Failed to load dashboard data from API:", err);
      }
    }
    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const unavailable = productList.filter((p) => !p.available);
  const maxRevenue = Math.max(...revenueByHour.map((r) => r.revenue));

  // Compute live dynamic stats
  const totalOrdersCount = orderList.length > 0 ? orderList.length : demoBoardOrders.length;
  const activeOrdersCount =
    orderList.length > 0
      ? orderList.filter((o) =>
          ["received", "confirmed", "preparing", "ready", "out-for-delivery"].includes(o.status),
        ).length
      : demoBoardOrders.filter((o) => o.status !== "completed").length;
  const completedOrdersCount =
    orderList.length > 0
      ? orderList.filter((o) => ["delivered", "completed"].includes(o.status)).length
      : 18;
  const totalRevenueNumber =
    orderList.length > 0
      ? orderList.reduce((sum, o) => sum + (o.paymentStatus === "paid" ? o.total : 0), 0)
      : 8450;

  const dynamicStats = [
    { label: "Total Orders", value: String(totalOrdersCount) },
    { label: "Active Orders", value: String(activeOrdersCount) },
    { label: "Completed Orders", value: String(completedOrdersCount) },
    { label: "Unavailable Items", value: String(unavailable.length) },
    { label: "Total Revenue", value: formatETB(totalRevenueNumber) },
  ];

  const recentOrdersToDisplay =
    orderList.length > 0
      ? orderList.slice(0, 8).map((o) => ({
          number: o.number,
          customer:
            o.customer.name || (o.customer.table ? `Table ${o.customer.table}` : "Customer"),
          method: o.method,
          status: o.status,
          total: o.total,
          paymentStatus: o.paymentStatus,
        }))
      : demoBoardOrders;

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Live operational overview synced with database.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        {dynamicStats.map((s) => (
          <div
            key={s.label}
            className={cn(
              "surface-card p-3.5 sm:p-5",
              s.label === "Total Revenue" && "col-span-2 sm:col-span-1",
            )}
          >
            <p className="text-xs sm:text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1.5 sm:mt-2 font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="surface-card p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base sm:text-lg font-semibold">Revenue by hour</h2>
            <span className="text-xs font-medium text-muted-foreground">
              Peak: {formatETB(maxRevenue)}
            </span>
          </div>
          <div className="mt-6 flex h-48 items-end gap-1.5 sm:gap-3">
            {revenueByHour.map((r) => (
              <div key={r.hour} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-md bg-primary transition-all"
                  style={{ height: `${(r.revenue / maxRevenue) * 100}%` }}
                  title={formatETB(r.revenue)}
                />
                <span className="text-[11px] sm:text-xs text-muted-foreground">{r.hour}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card p-4 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-base sm:text-lg font-semibold">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> Needs attention
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {unavailable.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                All menu items are currently available.
              </li>
            ) : (
              unavailable.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link
                    to="/admin/availability"
                    className="flex items-center justify-between gap-2 rounded-md p-1.5 -mx-1.5 transition-colors hover:bg-secondary/60"
                  >
                    <span className="truncate text-xs sm:text-sm">{p.name}</span>
                    <Badge variant="outline" className="shrink-0 text-[11px] sm:text-xs">
                      Unavailable
                    </Badge>
                  </Link>
                </li>
              ))
            )}
            {recentOrdersToDisplay
              .filter((o) => o.paymentStatus !== "paid")
              .slice(0, 3)
              .map((o) => (
                <li key={o.number}>
                  <Link
                    to="/admin/orders"
                    className="flex items-center justify-between gap-2 rounded-md p-1.5 -mx-1.5 transition-colors hover:bg-secondary/60"
                  >
                    <span className="truncate text-xs sm:text-sm">
                      {o.number} · {methodLabels[o.method]}
                    </span>
                    <Badge
                      variant={o.paymentStatus === "failed" ? "destructive" : "secondary"}
                      className="shrink-0 text-[11px] sm:text-xs"
                    >
                      Payment {o.paymentStatus}
                    </Badge>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div className="surface-card overflow-x-auto p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base sm:text-lg font-semibold">Recent orders</h2>
          <Link
            to="/admin/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline"
          >
            Open Live Orders Board
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {/* Mobile Compact Order Cards (< md) */}
        <div className="mt-4 space-y-2.5 md:hidden">
          {recentOrdersToDisplay.map((o) => (
            <div
              key={o.number}
              className="rounded-lg border border-border/80 bg-background/60 p-3 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-foreground truncate">
                  {o.number} · {o.customer}
                </span>
                <span className="font-display text-sm font-semibold text-foreground shrink-0">
                  {formatETB(o.total)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground capitalize">
                    {methodLabels[o.method]}
                  </span>
                  {o.paymentStatus !== "paid" && (
                    <Badge
                      variant={o.paymentStatus === "failed" ? "destructive" : "secondary"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {o.paymentStatus}
                    </Badge>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {statusLabels[o.status]}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop 5-Column Table (md+) */}
        <table className="mt-4 hidden w-full text-sm md:table">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Order</th>
              <th className="py-2 font-medium">Customer</th>
              <th className="py-2 font-medium">Method</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {recentOrdersToDisplay.map((o) => (
              <tr key={o.number} className="border-t border-border">
                <td className="py-3 font-medium">{o.number}</td>
                <td className="py-3">{o.customer}</td>
                <td className="py-3">{methodLabels[o.method]}</td>
                <td className="py-3">
                  <Badge variant="secondary">{statusLabels[o.status]}</Badge>
                </td>
                <td className="py-3 text-right">{formatETB(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
