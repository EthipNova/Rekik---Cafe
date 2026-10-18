import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Section } from "@/components/site/Section";
import { OrderTimeline } from "@/components/site/OrderTimeline";
import { formatETB, getProduct } from "@/lib/menu-data";
import { findOrder, methodLabels, statusLabels, type Order } from "@/lib/orders";
import { fetchOrderById, updateOrderPayment } from "@/services/api";
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
  const [paymentMethod, setPaymentMethod] = useState<"telebirr" | "cbe" | "cash">("telebirr");
  const [txRef, setTxRef] = useState("");
  const [paying, setPaying] = useState(false);

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

    // Set up Realtime Supabase channel
    const channel = supabase
      .channel(`order-page-realtime-${id}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "orders" }, () => {
        void load();
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "payments" }, () => {
        void load();
      })
      .subscribe();

    // Multi-tab storage sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "neba.orders.v1") {
        void load();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Active polling interval every 8s
    const pollInterval = setInterval(() => {
      void load();
    }, 8000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.removeEventListener("storage", handleStorage);
      clearInterval(pollInterval);
    };
  }, [id]);

  const handleCompletePayment = async () => {
    if (!state.order) return;
    setPaying(true);
    try {
      const methodName =
        paymentMethod === "telebirr"
          ? "Telebirr Mobile"
          : paymentMethod === "cbe"
            ? "CBE Birr"
            : "Cash / In-Person";

      const updated = await updateOrderPayment(state.order.id, {
        paymentStatus: "paid",
        paymentMethod: methodName,
        transactionReference: txRef.trim() || undefined,
      });

      setState((prev) => ({ ...prev, order: updated }));
      toast.success("Payment confirmed! Kitchen notified.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to confirm payment. Please try again.");
    } finally {
      setPaying(false);
    }
  };

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

  const MethodIcon = isDelivery ? Truck : isTakeaway ? Store : Utensils;
  const totalItemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Section className="max-w-5xl">
      {/* 1. TOP SUCCESS BANNER & CONFIRMATION HEADER */}
      <header className="rise-in surface-card overflow-hidden p-6 sm:p-10 text-center relative border-primary/20">
        <div
          className={cn(
            "mx-auto flex size-16 sm:size-20 items-center justify-center rounded-full ring-8",
            order.paymentStatus === "paid"
              ? "bg-success/15 text-success ring-success/5"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/5",
          )}
        >
          {order.paymentStatus === "paid" ? (
            <CheckCircle2 className="size-10 sm:size-12" aria-hidden />
          ) : (
            <Clock className="size-10 sm:size-12 animate-pulse" aria-hidden />
          )}
        </div>

        <div className="mt-5">
          <Badge
            variant={order.paymentStatus === "paid" ? "secondary" : "outline"}
            className={cn(
              "rounded-full px-3 py-1 text-xs uppercase tracking-wider font-semibold",
              order.paymentStatus === "paid"
                ? "bg-success/15 text-success border-success/30"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
            )}
          >
            {order.paymentStatus === "paid"
              ? "Order Placed & Paid"
              : "Order Received — Payment Pending"}
          </Badge>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-semibold">
            {order.paymentStatus === "paid"
              ? "Thank you for your order!"
              : "Order Received — Settle Payment"}
          </h1>
          <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-muted-foreground">
            {order.paymentStatus === "paid"
              ? "Your order has been recorded in the café database and is actively being processed by the kitchen."
              : "Your order details have been saved to the persistent database. Please authorize your payment below to finalize fulfillment."}
          </p>
        </div>

        {/* Quick info summary strip */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border bg-secondary/30 p-4 text-left">
          <div>
            <span className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Order number
            </span>
            <span className="font-display text-lg sm:text-xl font-bold text-foreground">
              {order.number}
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
              {statusLabels[order.status]}
            </span>
          </div>

          <div>
            <span className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Payment ({order.paymentStatus})
            </span>
            <span
              className={cn(
                "font-display text-lg sm:text-xl font-bold",
                order.paymentStatus === "paid"
                  ? "text-success"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
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
                  Follow your order from kitchen receipt to completion.
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

            <div className="mt-2 rounded-lg bg-muted/40 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-medium text-foreground">Notice:</span>
              <span>
                Status updates reflect kitchen operations. You can refresh or revisit this link at
                any time to check your status.
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

              {isDineIn && (
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Utensils className="size-5" aria-hidden />
                  </span>
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Table assignment</dt>
                    <dd className="font-display text-base font-semibold text-foreground">
                      Table #{order.customer.table || "Not specified"}
                    </dd>
                  </div>
                </div>
              )}

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

        {/* RIGHT COLUMN: ITEMS SUMMARY & PAYMENT */}
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

          {/* Card: Payment Information & Interactive Settlement */}
          <section aria-labelledby="payment-heading" className="surface-card p-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" aria-hidden />
                <h3 id="payment-heading" className="font-display text-base font-semibold">
                  Payment details
                </h3>
              </div>
              <Badge
                variant={order.paymentStatus === "paid" ? "default" : "outline"}
                className={cn(
                  order.paymentStatus === "paid"
                    ? "bg-success text-success-foreground hover:bg-success"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                )}
              >
                {order.paymentStatus === "paid" ? "Paid" : "Payment Pending"}
              </Badge>
            </div>

            {/* If Payment is Pending: Show interactive settlement panel */}
            {order.paymentStatus !== "paid" ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <p className="font-semibold">Action required: Complete your payment</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Your order is pending settlement of{" "}
                      <strong className="text-foreground">{formatETB(order.total)}</strong>. Select
                      a method below to finalize.
                    </p>
                  </div>
                </div>

                {/* Method selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-foreground">
                    Choose Payment Method
                  </Label>
                  <div className="grid gap-2">
                    {[
                      {
                        id: "telebirr" as const,
                        name: "Telebirr Mobile Payment",
                        info: "Till: 0911 234 567 (Rekik Café)",
                        icon: Smartphone,
                      },
                      {
                        id: "cbe" as const,
                        name: "CBE Birr / Mobile Banking",
                        info: "Account: 1000 2345 67890 · Shortcode: 123456",
                        icon: CreditCard,
                      },
                      {
                        id: "cash" as const,
                        name: "In-Person (Cash / Card at Table / Delivery)",
                        info: "Settle in cash with server or delivery courier",
                        icon: Banknote,
                      },
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border p-2.5 text-xs cursor-pointer transition-all",
                          paymentMethod === opt.id
                            ? "border-primary bg-accent/60 ring-1 ring-primary"
                            : "border-border hover:bg-secondary/40",
                        )}
                      >
                        <input
                          type="radio"
                          name="order-pay-method"
                          value={opt.id}
                          checked={paymentMethod === opt.id}
                          onChange={() => setPaymentMethod(opt.id)}
                          className="mt-0.5 size-3.5 accent-[var(--primary)]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <opt.icon className="size-3.5 text-primary" />
                            <span>{opt.name}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                            {opt.info}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {paymentMethod !== "cash" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="order-txref" className="text-xs font-medium text-foreground">
                      Transaction Confirmation Reference{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="order-txref"
                      value={txRef}
                      onChange={(e) => setTxRef(e.target.value)}
                      placeholder="e.g. TXN-9281034"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}

                <Button
                  onClick={handleCompletePayment}
                  disabled={paying}
                  className="w-full font-semibold"
                >
                  <CreditCard className="size-4 mr-2" />
                  {paying ? "Confirming Payment…" : `Confirm Payment (${formatETB(order.total)})`}
                </Button>
              </div>
            ) : (
              /* If Payment is Paid: Show verified card */
              <dl className="mt-4 space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Payment method</dt>
                  <dd className="font-medium text-foreground">
                    {order.paymentMethod || "Mobile Payment"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Amount settled</dt>
                  <dd className="font-bold text-success">{formatETB(order.total)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Payment status</dt>
                  <dd>
                    <Badge
                      variant="default"
                      className="bg-success text-success-foreground hover:bg-success text-xs"
                    >
                      Paid & Verified
                    </Badge>
                  </dd>
                </div>
              </dl>
            )}

            <div className="mt-4 rounded-lg bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-primary shrink-0" />
              <span>
                Payment details are updated live in the café database and synchronized across your
                account dashboard.
              </span>
            </div>
          </section>

          {/* Primary Action Buttons */}
          <div className="space-y-3">
            <Button asChild size="lg" className="w-full">
              <Link to="/menu">
                <ShoppingBag className="size-4 mr-2" />
                Continue Shopping
                <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>

            <Button asChild variant="outline" className="w-full">
              <Link to="/orders">
                <Receipt className="size-4 mr-2" />
                View All Past Orders
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
