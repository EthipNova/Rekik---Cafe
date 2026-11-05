import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  MapPin,
  Phone,
  QrCode,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  User,
  Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/site/Section";
import { OrderTimeline } from "@/components/site/OrderTimeline";
import { formatETB, getProduct } from "@/lib/menu-data";
import { findOrder, methodLabels, statusLabels, type Order } from "@/lib/orders";
import { fetchOrderById } from "@/services/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/order/$id")({
  loader: async ({ params }) => {
    try {
      const order = await fetchOrderById(params.id);
      return { order };
    } catch {
      return { order: null };
    }
  },
  head: ({ loaderData, params }) => {
    const title = loaderData?.order
      ? `Order ${loaderData.order.number} — Rekik Café`
      : `Order ${params.id} — Rekik Café`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: "Confirmation details and live tracking for your Rekik Café order.",
        },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: "Your Rekik Café order has been confirmed." },
      ],
    };
  },
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const [state, setState] = useState<{ loading: boolean; order: Order | null }>({
    loading: !loaderData?.order,
    order: loaderData?.order || null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const remote = await fetchOrderById(id);
        if (!cancelled && remote) {
          setState({ loading: false, order: remote });
          return;
        }
      } catch {
        // Fall back to local storage
      }
      if (!cancelled) {
        const found = findOrder(id) ?? null;
        setState({ loading: false, order: found });
      }
    }
    void load();

    // Set up Realtime Supabase channel for live kitchen and waiter status updates
    const channel = supabase
      .channel(`order-page-realtime-${id}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "orders" }, () => {
        void load();
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "payments" }, () => {
        void load();
      })
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "order_approvals" },
        () => {
          void load();
        },
      )
      .subscribe();

    // Multi-tab storage sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "rekik.orders.v1" || e.key === "neba.orders.v1") {
        void load();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Active polling interval every 5s for snappy live status feedback
    const pollInterval = setInterval(() => {
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.removeEventListener("storage", handleStorage);
      clearInterval(pollInterval);
    };
  }, [id]);

  if (state.loading) {
    return (
      <Section className="max-w-4xl py-20 text-center">
        <p className="text-muted-foreground animate-pulse">Loading order details…</p>
      </Section>
    );
  }

  if (!state.order) {
    return (
      <Section className="max-w-2xl py-20">
        <EmptyState
          icon={<Receipt className="size-10 text-muted-foreground" />}
          title="Order Not Found"
          description={`We couldn't find an order with identifier "${id}" on this device. Please verify your order number or browse our menu.`}
          action={
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/menu">Back to Menu</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/orders">View Order History</Link>
              </Button>
            </div>
          }
        />
      </Section>
    );
  }

  const order = state.order;
  const isDelivery = order.method === "delivery";
  const isDineIn = order.method === "dine-in";
  const isTakeaway = order.method === "takeaway";

  const isWaitingForWaiter = order.waiterDecision === "pending";
  const isRejectedByWaiter = order.waiterDecision === "rejected";
  const isPaid = order.paymentStatus === "paid";

  const MethodIcon = isDelivery ? Truck : isTakeaway ? Store : Utensils;
  const totalItemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Section className="max-w-5xl">
      {/* 1. TOP SUCCESS BANNER & CONFIRMATION HEADER */}
      <header className="rise-in surface-card overflow-hidden p-6 sm:p-10 text-center relative border-primary/20">
        <div
          className={cn(
            "mx-auto flex size-16 sm:size-20 items-center justify-center rounded-full ring-8",
            isRejectedByWaiter
              ? "bg-destructive/15 text-destructive ring-destructive/5"
              : isPaid
                ? "bg-success/15 text-success ring-success/5"
                : "bg-primary/15 text-primary ring-primary/5",
          )}
        >
          {isRejectedByWaiter ? (
            <AlertCircle className="size-10 sm:size-12" aria-hidden />
          ) : isPaid ? (
            <CheckCircle2 className="size-10 sm:size-12" aria-hidden />
          ) : (
            <CheckCircle2 className="size-10 sm:size-12 text-primary" aria-hidden />
          )}
        </div>

        <div className="mt-5">
          <Badge
            variant={isPaid ? "secondary" : "outline"}
            className={cn(
              "rounded-full px-3 py-1 text-xs uppercase tracking-wider font-semibold",
              isRejectedByWaiter
                ? "bg-destructive/15 text-destructive border-destructive/30"
                : isWaitingForWaiter
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                  : isPaid
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-primary/10 text-primary border-primary/30",
            )}
          >
            {isRejectedByWaiter
              ? "Order Rejected by Staff"
              : isWaitingForWaiter
                ? "Waiting for Waiter Review"
                : isPaid
                  ? "Order Confirmed & Paid"
                  : "Order Confirmed by Waiter"}
          </Badge>

          <h1 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-semibold">
            {isRejectedByWaiter
              ? "Order Rejected by Staff"
              : isPaid
                ? "Thank you for your order!"
                : "Order Placed Successfully!"}
          </h1>

          <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-muted-foreground leading-relaxed">
            {isRejectedByWaiter
              ? `Your assigned server was unable to accept this order${order.customer.table ? ` for Table #${order.customer.table}` : ""}. Please speak with floor staff or place a new order.`
              : isDineIn
                ? `Your order for Table #${order.customer.table || "Dine-in"} has been transferred to your assigned waiter, ${order.waiterName || "assigned staff"}. Your waiter will review your order and collect payment at your table.`
                : `Your ${methodLabels[order.method]} order has been transferred to your assigned waiter, ${order.waiterName || "assigned staff"}. Payment will be handled upon pickup/delivery.`}
          </p>
        </div>

        {/* Quick info summary strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border bg-secondary/30 p-4 text-left">
          <div>
            <span className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Order number
            </span>
            <span className="font-display text-lg sm:text-xl font-bold text-foreground">
              #{order.number}
            </span>
          </div>

          <div>
            <span className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Placed at
            </span>
            <span className="text-sm sm:text-base font-medium text-foreground">
              {new Date(order.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <div>
            <span className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Current status
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm sm:text-base font-medium text-primary">
              <span className="size-2 rounded-full bg-primary animate-pulse" aria-hidden />
              {isWaitingForWaiter
                ? "Awaiting Waiter Review"
                : statusLabels[order.status] || order.status}
            </span>
          </div>

          <div>
            <span className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Total Amount
            </span>
            <span className="font-display text-lg sm:text-xl font-bold text-primary">
              {formatETB(order.total)}
            </span>
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT GRID: PROGRESS/DETAILS & SUMMARY */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.25fr_1fr] items-start">
        {/* LEFT COLUMN: LIVE TRACKING & DETAILS */}
        <div className="space-y-8">
          {/* Card: Order Status / Tracking Timeline */}
          <section aria-labelledby="tracking-heading" className="surface-card p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h2 id="tracking-heading" className="font-display text-xl font-semibold">
                  Live order progress
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Follow your order from waiter review to preparation and fulfillment.
                </p>
              </div>
              <Badge variant="outline" className="gap-1.5 py-1 px-3">
                <Clock className="size-3.5 text-primary" aria-hidden />
                <span>Est. 15–25 mins</span>
              </Badge>
            </div>

            <div className="mt-6">
              <OrderTimeline order={order} />
            </div>

            <div className="mt-4 rounded-lg bg-muted/40 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-medium text-foreground">Notice:</span>
              <span>
                Status updates in real time. You can refresh or revisit this link at any time to
                track your order progress.
              </span>
            </div>
          </section>

          {/* Card: Order & Customer Details */}
          <section aria-labelledby="details-heading" className="surface-card p-6 sm:p-8">
            <h2
              id="details-heading"
              className="font-display text-xl font-semibold border-b border-border pb-4"
            >
              Order & fulfillment details
            </h2>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2 text-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <MethodIcon className="size-5" aria-hidden />
                </span>
                <div>
                  <dt className="text-xs text-muted-foreground font-medium">Ordering method</dt>
                  <dd className="font-medium text-foreground text-base">
                    {methodLabels[order.method]}
                  </dd>
                </div>
              </div>

              {/* DINE-IN TABLE IDENTIFICATION */}
              {isDineIn && (
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <QrCode className="size-5" aria-hidden />
                  </span>
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Table (from QR Code)</dt>
                    <dd className="font-display text-base font-bold text-foreground">
                      {order.customer.table ? `Table #${order.customer.table}` : "Dine-in Floor"}
                    </dd>
                  </div>
                </div>
              )}

              {/* ASSIGNED WAITER */}
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <User className="size-5" aria-hidden />
                </span>
                <div>
                  <dt className="text-xs text-muted-foreground font-medium">Assigned Waiter</dt>
                  <dd className="font-semibold text-primary capitalize">
                    {order.waiterName || "Pending Server Assignment"}
                  </dd>
                  <span className="mt-1 inline-flex">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-2 py-0.5 font-semibold uppercase",
                        order.waiterDecision === "approved"
                          ? "bg-success/10 text-success border-success/30"
                          : order.waiterDecision === "rejected"
                            ? "bg-destructive/10 text-destructive border-destructive/30"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
                      )}
                    >
                      {order.waiterDecision === "approved"
                        ? "Confirmed by Waiter"
                        : order.waiterDecision === "rejected"
                          ? "Rejected by Waiter"
                          : "Pending Waiter Review"}
                    </Badge>
                  </span>
                </div>
              </div>

              {order.customer.name && order.customer.name !== "Dine-in guest" && (
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Receipt className="size-5" aria-hidden />
                  </span>
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Customer name</dt>
                    <dd className="font-medium text-foreground">{order.customer.name}</dd>
                  </div>
                </div>
              )}

              {order.customer.phone && (
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Phone className="size-5" aria-hidden />
                  </span>
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Contact phone</dt>
                    <dd className="font-medium text-foreground">{order.customer.phone}</dd>
                  </div>
                </div>
              )}

              {isDelivery && (
                <div className="sm:col-span-2 flex items-start justify-between gap-3 border-t border-border/50 pt-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <MapPin className="size-5" aria-hidden />
                    </span>
                    <div>
                      <dt className="text-xs text-muted-foreground font-medium">
                        Delivery address
                      </dt>
                      <dd className="font-medium text-foreground">
                        {order.customer.address || "Standard delivery"}
                      </dd>
                      {order.distanceKm !== null && order.distanceKm !== undefined && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Delivery distance:{" "}
                          <strong className="text-foreground">
                            {order.distanceKm.toFixed(1)} KM
                          </strong>
                          {" • "}
                          Delivery fee:{" "}
                          <strong className="text-foreground">{formatETB(order.delivery)}</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  {order.customer.latitude !== null &&
                    order.customer.latitude !== undefined &&
                    order.customer.longitude !== null &&
                    order.customer.longitude !== undefined && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${order.customer.latitude},${order.customer.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0 bg-primary/10 px-2.5 py-1.5 rounded-md transition-colors"
                      >
                        <ExternalLink className="size-3.5" />
                        <span>View Map</span>
                      </a>
                    )}
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* RIGHT COLUMN: ITEMS SUMMARY & WAITER PAYMENT INFO */}
        <div className="space-y-8">
          {/* Card: Order Summary & Line Items */}
          <section aria-labelledby="summary-heading" className="surface-card p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 id="summary-heading" className="font-display text-xl font-semibold">
                Items ordered
              </h2>
              <span className="text-xs font-medium text-muted-foreground">
                {totalItemsCount} {totalItemsCount === 1 ? "item" : "items"}
              </span>
            </div>

            {/* List of ordered products with images */}
            <ul className="mt-4 divide-y divide-border">
              {order.items.map((item) => {
                const product = getProduct(item.productId);
                return (
                  <li
                    key={item.productId}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {product?.image ? (
                        <img
                          src={product.image}
                          alt={item.name}
                          loading="lazy"
                          width={48}
                          height={48}
                          className="size-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <ShoppingBag className="size-5" aria-hidden />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatETB(item.price)} × {item.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="font-semibold text-foreground whitespace-nowrap">
                      {formatETB(item.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Cost Breakdown */}
            <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium text-foreground">{formatETB(order.subtotal)}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery fee</dt>
                <dd className="font-medium text-foreground">
                  {order.delivery > 0
                    ? `${formatETB(order.delivery)}${order.distanceKm !== null && order.distanceKm !== undefined ? ` (${order.distanceKm.toFixed(1)} KM)` : ""}`
                    : "0 ETB (Free)"}
                </dd>
              </div>

              {order.discount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>Discount</dt>
                  <dd className="font-medium">-{formatETB(order.discount)}</dd>
                </div>
              )}

              <div className="flex justify-between border-t border-border pt-3 font-display text-xl font-semibold">
                <dt>Order Total</dt>
                <dd className="text-primary">{formatETB(order.total)}</dd>
              </div>
            </dl>
          </section>

          {/* Card: Payment Information (Managed By Waiter) */}
          <section aria-labelledby="payment-heading" className="surface-card p-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" aria-hidden />
                <h3 id="payment-heading" className="font-display text-base font-semibold">
                  Payment Status
                </h3>
              </div>
              <Badge
                variant={isPaid ? "default" : "outline"}
                className={cn(
                  isPaid
                    ? "bg-success text-success-foreground hover:bg-success"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                )}
              >
                {isPaid ? "Paid & Verified" : "Settlement with Waiter"}
              </Badge>
            </div>

            {isRejectedByWaiter ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-3">
                  <AlertCircle className="size-5 shrink-0 mt-0.5 text-destructive" />
                  <div className="space-y-1.5 flex-1">
                    <p className="font-semibold text-sm">Order Rejected by Assigned Server</p>
                    <p className="text-muted-foreground leading-relaxed">
                      Your server was unable to accept this order{order.customer.table ? ` for Table #${order.customer.table}` : ""}.
                    </p>
                    {order.waiterRejectionReason && (
                      <div className="mt-2 rounded-md bg-background/80 p-2.5 border border-destructive/20 text-xs">
                        <span className="font-semibold text-destructive block">Reason provided:</span>
                        <p className="text-foreground italic mt-0.5">"{order.waiterRejectionReason}"</p>
                      </div>
                    )}
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/menu">Browse Menu & Start New Order</Link>
                </Button>
              </div>
            ) : isPaid ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-xs text-success-900 dark:text-success-200 flex items-start gap-3">
                  <CheckCircle2 className="size-5 shrink-0 mt-0.5 text-success" />
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">Payment Verified & Settled</p>
                    <p className="text-muted-foreground leading-relaxed">
                      Your payment of <strong className="text-foreground">{formatETB(order.total)}</strong> has been verified by the café cashier. Your order is being prepared!
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-3">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <ShieldCheck className="size-4 text-primary shrink-0" />
                    <span>Payment Handled Directly by Floor Staff</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    You do not need to make payments online or upload receipts. Your assigned floor server (
                    <strong className="text-foreground capitalize">
                      {order.waiterName || "assigned staff"}
                    </strong>
                    ) will collect and settle payment with you directly{isDineIn && order.customer.table ? ` at Table #${order.customer.table}` : ""}.
                  </p>
                  <div className="rounded-lg bg-background/80 border border-border/60 p-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount to Settle:</span>
                      <span className="font-bold text-foreground text-xs">{formatETB(order.total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Accepted Methods:</span>
                      <span className="font-medium text-foreground">Cash, Telebirr Mobile, or CBE Birr</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assigned Server:</span>
                      <span className="font-semibold text-primary capitalize">{order.waiterName || "Floor Staff"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  <span>Realtime status active: this page updates automatically as your server confirms.</span>
                </div>
              </div>
            )}
          </section>

          {/* Primary Navigation Actions */}
          <div className="space-y-3">
            <Button asChild size="lg" className="w-full">
              <Link to="/menu">
                <ShoppingBag className="size-4 mr-2" />
                Continue Browsing Menu
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>

            <Button asChild variant="outline" className="w-full">
              <Link to="/orders">
                <Receipt className="size-4 mr-2" />
                View Order History
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
