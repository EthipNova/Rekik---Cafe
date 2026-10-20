import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  UserCheck,
  Utensils,
  ZoomIn,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Section } from "@/components/site/Section";
import { OrderTimeline } from "@/components/site/OrderTimeline";
import { formatETB, getProduct } from "@/lib/menu-data";
import { findOrder, methodLabels, statusLabels, type Order } from "@/lib/orders";
import { fetchOrderById, updateOrderPaymentMethod } from "@/services/api";
import { DEFAULT_SETTINGS, fetchStoreSettings, type NebaSettings } from "@/lib/settings";
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
      ? `Order ${loaderData.order.number} — Rekik Coffee`
      : `Order ${params.id} — Rekik Coffee`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: "Confirmation details and live tracking for your Rekik Coffee order.",
        },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: "Your Rekik Coffee order has been confirmed." },
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
  const [settings, setSettings] = useState<NebaSettings>(DEFAULT_SETTINGS);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"telebirr" | "cbe" | "cash" | null>(() => {
    const m = (loaderData?.order?.paymentMethod || "").toLowerCase();
    if (m.includes("telebirr")) return "telebirr";
    if (m.includes("cbe") || m.includes("bank")) return "cbe";
    if (m.includes("cash")) return "cash";
    return null;
  });
  const [updatingMethod, setUpdatingMethod] = useState(false);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [zoomTitle, setZoomTitle] = useState<string>("Payment Receipt");

  useEffect(() => {
    void fetchStoreSettings().then(({ data }) => {
      if (data) setSettings(data);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const remote = await fetchOrderById(id);
        if (!cancelled && remote) {
          setState({ loading: false, order: remote });
          if (remote.paymentMethod) {
            const m = remote.paymentMethod.toLowerCase();
            if (m.includes("telebirr")) setSelectedPaymentMethod("telebirr");
            else if (m.includes("cbe") || m.includes("bank")) setSelectedPaymentMethod("cbe");
            else if (m.includes("cash")) setSelectedPaymentMethod("cash");
          }
          return;
        }
      } catch {
        // Fall back to local storage
      }
      if (!cancelled) {
        const found = findOrder(id) ?? null;
        setState({ loading: false, order: found });
        if (found?.paymentMethod) {
          const m = found.paymentMethod.toLowerCase();
          if (m.includes("telebirr")) setSelectedPaymentMethod("telebirr");
          else if (m.includes("cbe") || m.includes("bank")) setSelectedPaymentMethod("cbe");
          else if (m.includes("cash")) setSelectedPaymentMethod("cash");
        }
      }
    }
    void load();

    // Set up Realtime Supabase channel for orders, payments, and payment_proofs
    const channel = supabase
      .channel(`order-page-realtime-${id}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "orders" }, () => {
        void load();
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "payments" }, () => {
        void load();
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "payment_proofs" }, () => {
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

  const handleSelectPaymentMethod = async (method: "telebirr" | "cbe" | "cash") => {
    setSelectedPaymentMethod(method);
    if (!state.order) return;
    const label =
      method === "telebirr"
        ? "Telebirr Mobile"
        : method === "cbe"
          ? "Bank Transfer (CBE)"
          : "Cash / In-Person";

    setUpdatingMethod(true);
    try {
      const updated = await updateOrderPaymentMethod({
        orderId: state.order.id,
        paymentMethod: label,
      });
      setState((prev) => ({ ...prev, order: updated }));
      toast.success(`${label} selected. Follow instructions below.`);
    } catch (err) {
      console.warn("Could not save payment method remotely:", err);
    } finally {
      setUpdatingMethod(false);
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
              : order.paymentProof?.status === "rejected"
                ? "bg-destructive/15 text-destructive ring-destructive/5"
                : order.transactionReference
                  ? "bg-primary/15 text-primary ring-primary/5"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/5",
          )}
        >
          {order.paymentStatus === "paid" ? (
            <CheckCircle2 className="size-10 sm:size-12" aria-hidden />
          ) : order.paymentProof?.status === "rejected" ? (
            <AlertTriangle className="size-10 sm:size-12" aria-hidden />
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
                : order.paymentProof?.status === "rejected"
                  ? "bg-destructive/15 text-destructive border-destructive/30"
                  : order.transactionReference
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
            )}
          >
            {order.paymentStatus === "paid"
              ? "Order Placed & Payment Verified"
              : order.paymentProof?.status === "rejected"
                ? "Payment Notice — Verification Needed"
                : order.transactionReference
                  ? "Details Collected — Awaiting Verification"
                  : "Order Received — Awaiting Payment"}
          </Badge>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-semibold">
            {order.paymentStatus === "paid"
              ? "Thank you for your order!"
              : order.paymentProof?.status === "rejected"
                ? "Payment Needs Review"
                : order.transactionReference
                  ? "Payment Details Collected"
                  : "Order Received — Payment Instructions"}
          </h1>
          <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-muted-foreground">
            {order.paymentStatus === "paid"
              ? "Your payment is verified and your order is actively being prepared by our baristas and kitchen."
              : order.paymentProof?.status === "rejected"
                ? "Our cashier was unable to verify the transaction reference with the bank. Please review details with your waiter."
                : order.transactionReference
                  ? `Your assigned waiter (${order.waiterName || "Floor Staff"}) recorded reference ${order.transactionReference}. Cashier verification is in progress.`
                  : `Please select your preferred payment method below to view payment instructions. Total due: ${formatETB(order.total)}.`}
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

              {order.waiterName && (
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <UserCheck className="size-5" aria-hidden />
                  </span>
                  <div>
                    <dt className="text-xs text-muted-foreground font-medium">Assigned Waiter</dt>
                    <dd className="font-medium text-foreground flex items-center gap-2">
                      <span>{order.waiterName}</span>
                      {order.waiterDecision === "approved" && (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Order Approved
                        </span>
                      )}
                      {order.waiterDecision === "rejected" && (
                        <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          Declined
                        </span>
                      )}
                      {(!order.waiterDecision || order.waiterDecision === "pending") && (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          Awaiting Review
                        </span>
                      )}
                    </dd>
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

          {/* Card: Payment Information & Verification Workflow */}
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
                    : order.paymentProof?.status === "rejected"
                      ? "bg-destructive/15 text-destructive border-destructive/30"
                      : order.paymentProof?.status === "pending"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                )}
              >
                {order.paymentStatus === "paid"
                  ? "Payment Approved"
                  : order.paymentProof?.status === "rejected"
                    ? "Payment Rejected"
                    : order.paymentProof?.status === "pending"
                      ? "Under Review"
                      : "Payment Pending"}
              </Badge>
            </div>

            {/* CASE 1: PAYMENT IS FULLY PAID & VERIFIED */}
            {order.paymentStatus === "paid" ? (
              <div className="mt-4 space-y-3">
                <dl className="space-y-2.5 text-xs sm:text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Payment method</dt>
                    <dd className="font-medium text-foreground">
                      {order.paymentMethod || "Electronic Wallet"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Amount settled</dt>
                    <dd className="font-bold text-success text-sm">{formatETB(order.total)}</dd>
                  </div>
                  {(order.transactionReference || order.paymentProof?.transactionReference) && (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Transaction reference</dt>
                      <dd className="font-mono text-xs font-medium text-foreground flex items-center gap-1.5">
                        {order.transactionReference || order.paymentProof?.transactionReference}
                        <button
                          type="button"
                          onClick={() => {
                            const ref = order.transactionReference || order.paymentProof?.transactionReference || "";
                            void navigator.clipboard.writeText(ref);
                            toast.success("Reference copied!");
                          }}
                          className="text-muted-foreground hover:text-foreground inline-flex items-center"
                          title="Copy reference"
                        >
                          <Copy className="size-3" />
                        </button>
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Verification status</dt>
                    <dd>
                      <Badge variant="default" className="bg-success text-success-foreground hover:bg-success text-xs">
                        Verified by Cashier
                      </Badge>
                    </dd>
                  </div>
                </dl>

                {/* If there was a receipt proof image, customer can view it */}
                {order.paymentProof?.screenshotUrl && (
                  <div className="mt-3 rounded-lg border border-border/80 bg-background/50 p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={order.paymentProof.screenshotUrl}
                        alt="Verified receipt"
                        className="size-10 rounded object-cover border border-border"
                      />
                      <div className="text-xs">
                        <span className="font-medium text-foreground block">Verified Receipt</span>
                        <span className="text-[11px] text-muted-foreground">Archived in order record</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setZoomImageUrl(order.paymentProof!.screenshotUrl!);
                        setZoomTitle("Verified Receipt Proof");
                        setZoomModalOpen(true);
                      }}
                    >
                      <ZoomIn className="size-3.5" />
                      View
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* CASE 2: PAYMENT AWAITING SETTLEMENT / WAITER COLLECTION */
              <div className="mt-4 space-y-4">
                {/* Cashier Rejection Alert (if previously rejected) */}
                {order.paymentProof && order.paymentProof.status === "rejected" && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2.5">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <div>
                      <p className="font-semibold text-sm">Payment Verification Notice</p>
                      <p className="mt-0.5 font-medium text-foreground">
                        Cashier Reason:{" "}
                        <span className="text-destructive font-semibold">
                          {order.paymentProof.rejectionReason || "Payment could not be verified with the bank."}
                        </span>
                      </p>
                      <p className="mt-1 text-muted-foreground text-[11px]">
                        Please confirm your transfer and present the confirmation SMS to your assigned waiter ({order.waiterName || "Floor Staff"}).
                      </p>
                    </div>
                  </div>
                )}

                {/* Waiter Collected Details Banner */}
                {order.transactionReference ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-primary" />
                        <span className="font-semibold text-foreground">
                          Payment Details Collected by Waiter
                        </span>
                      </div>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                        Under Review
                      </Badge>
                    </div>
                    <div className="rounded bg-background/80 p-2.5 border border-border/60 flex items-center justify-between font-mono">
                      <div>
                        <span className="text-[11px] text-muted-foreground block font-sans">
                          Collected Reference Code:
                        </span>
                        <strong className="text-foreground text-sm">
                          {order.transactionReference}
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(order.transactionReference!);
                          toast.success("Reference copied!");
                        }}
                        className="text-muted-foreground hover:text-foreground text-xs p-1"
                        title="Copy"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Collected by {order.waiterName || "Floor Staff"} and submitted to the cashier. Order preparation proceeds while verification completes.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                    <Clock className="size-4 shrink-0 mt-0.5 text-amber-600 animate-pulse" />
                    <div>
                      <p className="font-semibold">Awaiting Payment Collection</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Total amount due: <strong className="text-foreground">{formatETB(order.total)}</strong>.
                        Select your preferred payment method below. Your assigned waiter ({order.waiterName || "Floor Staff"}) will collect your payment reference upon service.
                      </p>
                    </div>
                  </div>
                )}

                {/* PAYMENT METHOD SELECTION INTERFACE */}
                <div className="space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    Choose Payment Method
                  </span>

                  <div className="grid gap-2.5">
                    {[
                      {
                        id: "telebirr" as const,
                        label: "Telebirr Mobile Payment",
                        desc: "Instant transfer via Telebirr app or *127#",
                        icon: Smartphone,
                        accountName: "Rekik Coffee Lounge",
                        accountNumber: settings.phone || "0911 234 567",
                      },
                      {
                        id: "cbe" as const,
                        label: "Bank Transfer (CBE)",
                        desc: "Transfer via CBE Mobile Banking or CBE Birr",
                        icon: CreditCard,
                        bankName: "Commercial Bank of Ethiopia (CBE)",
                        accountName: "Rekik Coffee & Roastery",
                        accountNumber: "1000 2345 67890",
                      },
                      {
                        id: "cash" as const,
                        label: isDelivery ? "Cash on Delivery" : "Pay to Waiter / Cashier",
                        desc: isDelivery ? "Pay cash directly to the courier" : "Settle cash or card with your floor server",
                        icon: Banknote,
                        accountName: "In-Person",
                        accountNumber: "Cash or Card Terminal",
                      },
                    ].map((option) => {
                      const isSelected = selectedPaymentMethod === option.id;
                      return (
                        <div
                          key={option.id}
                          onClick={() => void handleSelectPaymentMethod(option.id)}
                          className={cn(
                            "cursor-pointer rounded-xl border p-3.5 transition-all",
                            isSelected
                              ? "border-primary bg-accent/40 ring-1 ring-primary shadow-xs"
                              : "border-border hover:bg-secondary/40",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="order-payment-method"
                              checked={isSelected}
                              onChange={() => void handleSelectPaymentMethod(option.id)}
                              className="mt-0.5 size-4 accent-[var(--primary)]"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <option.icon className="size-4 text-primary" />
                                  <span className="font-semibold text-foreground text-xs sm:text-sm">
                                    {option.label}
                                  </span>
                                </div>
                                {isSelected && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    Selected
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {option.desc}
                              </p>

                              {/* METHOD-SPECIFIC INSTRUCTIONS: ONLY DISPLAYED AFTER SELECTION */}
                              {isSelected && (
                                <div
                                  className="mt-3 pt-3 border-t border-border/60 space-y-2.5 text-xs animate-in fade-in-50"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {option.id === "telebirr" && (
                                    <div className="rounded-lg bg-background/80 border border-border/80 p-3 space-y-2">
                                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                                          <Receipt className="size-3.5 text-primary" />
                                          Telebirr Merchant Information
                                        </span>
                                        <span className="font-bold text-primary text-xs">
                                          Amount: {formatETB(order.total)}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                                        <div>
                                          <span className="text-[10px] block uppercase font-medium">Merchant Name:</span>
                                          <span className="font-semibold text-foreground">{option.accountName}</span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] block uppercase font-medium">Telebirr Till / Phone:</span>
                                          <span className="font-mono font-bold text-primary flex items-center gap-1">
                                            {option.accountNumber}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                void navigator.clipboard.writeText(option.accountNumber.replace(/\s+/g, ""));
                                                toast.success("Telebirr number copied!");
                                              }}
                                              className="text-muted-foreground hover:text-foreground"
                                              title="Copy"
                                            >
                                              <Copy className="size-3" />
                                            </button>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-1">
                                        <p className="font-medium text-foreground">How to pay:</p>
                                        <ol className="list-decimal list-inside space-y-0.5">
                                          <li>Open your Telebirr App or dial *127#</li>
                                          <li>Send <strong>{formatETB(order.total)}</strong> to the merchant number above</li>
                                          <li>Keep your confirmation SMS handy for your waiter to record</li>
                                        </ol>
                                      </div>
                                    </div>
                                  )}

                                  {option.id === "cbe" && (
                                    <div className="rounded-lg bg-background/80 border border-border/80 p-3 space-y-2">
                                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                                          <Receipt className="size-3.5 text-primary" />
                                          CBE Bank Transfer Details
                                        </span>
                                        <span className="font-bold text-primary text-xs">
                                          Amount: {formatETB(order.total)}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                                        <div>
                                          <span className="text-[10px] block uppercase font-medium">Bank Name:</span>
                                          <span className="font-semibold text-foreground">{option.bankName}</span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] block uppercase font-medium">Account Holder:</span>
                                          <span className="font-semibold text-foreground">{option.accountName}</span>
                                        </div>
                                        <div className="sm:col-span-2">
                                          <span className="text-[10px] block uppercase font-medium">Account Number:</span>
                                          <span className="font-mono font-bold text-primary flex items-center gap-1.5 text-sm">
                                            {option.accountNumber}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                void navigator.clipboard.writeText(option.accountNumber.replace(/\s+/g, ""));
                                                toast.success("Account number copied!");
                                              }}
                                              className="text-muted-foreground hover:text-foreground"
                                              title="Copy"
                                            >
                                              <Copy className="size-3.5" />
                                            </button>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-1">
                                        <p className="font-medium text-foreground">How to transfer:</p>
                                        <ol className="list-decimal list-inside space-y-0.5">
                                          <li>Transfer <strong>{formatETB(order.total)}</strong> using CBE Mobile Banking or CBE Birr</li>
                                          <li>Save or note your transaction reference number</li>
                                          <li>Provide the reference number to your waiter upon order service</li>
                                        </ol>
                                      </div>
                                    </div>
                                  )}

                                  {option.id === "cash" && (
                                    <div className="rounded-lg bg-background/80 border border-border/80 p-3 text-xs text-muted-foreground">
                                      <p className="font-medium text-foreground">In-Person Settlement</p>
                                      <p className="mt-1 text-[11px]">
                                        Please have <strong>{formatETB(order.total)}</strong> ready to pay with your assigned waiter ({order.waiterName || "Floor Staff"}) or courier.
                                      </p>
                                    </div>
                                  )}

                                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                                    <ShieldCheck className="size-4 text-primary shrink-0" />
                                    <span>
                                      Your waiter will collect your payment reference on floor and submit it directly to the cashier for official verification.
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* RECEIPT ZOOM DIALOG */}
            <Dialog open={zoomModalOpen} onOpenChange={setZoomModalOpen}>
              <DialogContent className="max-w-lg p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="text-base flex items-center gap-2">
                    <Receipt className="size-4 text-primary" />
                    {zoomTitle}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-2 flex flex-col items-center justify-center">
                  {zoomImageUrl ? (
                    <div className="w-full max-h-[75vh] overflow-auto rounded-lg border border-border bg-black/5 flex items-center justify-center p-2">
                      <img
                        src={zoomImageUrl}
                        alt="Enlarged receipt"
                        className="max-h-[70vh] w-auto object-contain rounded"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No image to display.</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="mt-4 rounded-lg bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-primary shrink-0" />
              <span>
                Payment details are updated live in the café database and verified by reception staff.
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
