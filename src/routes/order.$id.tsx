import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  MapPin,
  Phone,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  Upload,
  Utensils,
  X,
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
import { fetchOrderById, submitPaymentProof, updateOrderPayment } from "@/services/api";
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
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);

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
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "payment_proofs" },
        () => {
          void load();
        },
      )
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
      if (e.key === "neba.orders.v1") {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit. Please upload a smaller screenshot.");
      return;
    }
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setProofPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = () => {
    setProofFile(null);
    setProofPreview(null);
  };

  const handleSubmitProof = async () => {
    if (!state.order) return;
    if (!proofPreview || !proofFile) {
      toast.error("Please select a payment screenshot image to upload.");
      return;
    }
    setSubmittingProof(true);
    try {
      const base64Data: string = proofPreview.includes(",")
        ? (proofPreview.split(",")[1] ?? "")
        : proofPreview;

      const methodName =
        paymentMethod === "telebirr"
          ? "Telebirr Mobile Payment"
          : paymentMethod === "cbe"
            ? "CBE Birr / Mobile Banking"
            : "Mobile Transfer";

      const updated = await submitPaymentProof(state.order.id, {
        imageBase64: base64Data,
        mimeType: proofFile.type,
        transactionReference: txRef.trim() || undefined,
        paymentMethod: methodName,
      });

      setState((prev) => ({ ...prev, order: updated }));
      toast.success("Payment screenshot uploaded! Awaiting cashier review.");
      setProofFile(null);
      setProofPreview(null);
      setTxRef("");
    } catch (err: unknown) {
      console.error("Payment proof submission error:", err);
      const msg = err instanceof Error ? err.message : "Failed to upload payment proof.";
      toast.error(msg);
    } finally {
      setSubmittingProof(false);
    }
  };

  const handleConfirmCashAtTable = async () => {
    if (!state.order) return;
    setPaying(true);
    try {
      const updated = await updateOrderPayment(state.order.id, {
        paymentStatus: "pending",
        paymentMethod: "Cash at Table",
        transactionReference: "Cash Settlement with Server",
      });
      setState((prev) => ({ ...prev, order: updated }));
      toast.success("Cash payment recorded! Your server will collect at your table.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update payment method.");
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

  const isWaitingForWaiter = isDineIn && order.waiterDecision === "pending";
  const isRejectedByWaiter = order.waiterDecision === "rejected";
  const isUnderCashierReview = order.paymentProof?.status === "pending";
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
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/5",
          )}
        >
          {isRejectedByWaiter ? (
            <AlertCircle className="size-10 sm:size-12" aria-hidden />
          ) : isPaid ? (
            <CheckCircle2 className="size-10 sm:size-12" aria-hidden />
          ) : (
            <Clock className="size-10 sm:size-12 animate-pulse" aria-hidden />
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
                  : isUnderCashierReview
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    : isPaid
                      ? "bg-success/15 text-success border-success/30"
                      : "bg-primary/10 text-primary border-primary/30",
            )}
          >
            {isRejectedByWaiter
              ? "Order Rejected by Server"
              : isWaitingForWaiter
                ? "Waiting for waiter approval"
                : isUnderCashierReview
                  ? "Payment submitted — awaiting cashier review"
                  : isPaid
                    ? "Order Placed & Paid"
                    : isDineIn
                      ? "Server Approved — Settle Payment"
                      : "Order Received — Payment Pending"}
          </Badge>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-semibold">
            {isRejectedByWaiter
              ? "Order Rejected by Server"
              : isWaitingForWaiter
                ? "Waiting for waiter approval"
                : isUnderCashierReview
                  ? "Payment submitted — awaiting cashier review"
                  : isPaid
                    ? "Thank you for your order!"
                    : isDineIn
                      ? "Order Approved — Complete Payment"
                      : "Order Received — Settle Payment"}
          </h1>
          <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-muted-foreground">
            {isRejectedByWaiter
              ? `Your assigned server was unable to accept this order${order.customer.table ? ` at Table #${order.customer.table}` : ""}. Please browse our menu to place a new order.`
              : isWaitingForWaiter
                ? `Your order${order.customer.table ? ` at Table #${order.customer.table}` : ""} has been assigned to server ${order.waiterName || "assigned staff"}. Please wait for your server to confirm your items before proceeding to payment.`
                : isUnderCashierReview
                  ? "Your payment screenshot has been submitted and is currently in the cashier review queue. You will be notified once verified."
                  : isPaid
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
              {isWaitingForWaiter
                ? "Awaiting Waiter Review"
                : isUnderCashierReview
                  ? "Under Cashier Review"
                  : statusLabels[order.status]}
            </span>
          </div>

          <div>
            <span className="block text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Payment ({order.paymentStatus})
            </span>
            <span
              className={cn(
                "font-display text-lg sm:text-xl font-bold",
                isPaid ? "text-success" : "text-amber-600 dark:text-amber-400",
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
                <>
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Utensils className="size-5" aria-hidden />
                    </span>
                    <div>
                      <dt className="text-xs text-muted-foreground font-medium">Service Type</dt>
                      <dd className="font-display text-base font-semibold text-foreground">
                        {order.customer.table ? `Table #${order.customer.table}` : "Dine-in Floor Service"}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Receipt className="size-5" aria-hidden />
                    </span>
                    <div>
                      <dt className="text-xs text-muted-foreground font-medium">Assigned Server</dt>
                      <dd className="font-medium text-foreground">
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
                            ? "Approved by Server"
                            : order.waiterDecision === "rejected"
                              ? "Rejected by Server"
                              : "Pending Server Review"}
                        </Badge>
                      </span>
                    </div>
                  </div>
                </>
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

            {/* CASE 1: Rejected by Waiter */}
            {isRejectedByWaiter ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-3">
                  <AlertCircle className="size-5 shrink-0 mt-0.5 text-destructive" />
                  <div className="space-y-1.5 flex-1">
                    <p className="font-semibold text-sm">Order Rejected by Assigned Server</p>
                    <p className="text-muted-foreground leading-relaxed">
                      Your server was unable to accept this order{order.customer.table ? ` at Table #${order.customer.table}` : ""}. Payment is disabled.
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
            ) : isWaitingForWaiter ? (
              /* CASE 2: Dine-In Waiting for Waiter Approval */
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
                  <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300 font-semibold text-sm">
                    <Clock className="size-5 animate-pulse text-amber-600" />
                    <span>Waiting for waiter approval</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your order has been routed to{" "}
                    <strong className="text-foreground">{order.waiterName || "your assigned server"}</strong> for confirmation. Payment options will unlock here automatically as soon as your server approves.
                  </p>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3 text-xs space-y-2">
                    {order.customer.table && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Table:</span>
                        <span className="font-semibold text-foreground">Table #{order.customer.table}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Assigned Server:</span>
                      <span className="font-semibold text-primary">{order.waiterName || "Pending floor assignment"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Server Decision:</span>
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-semibold uppercase tracking-wider"
                      >
                        Pending Review
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Payment Status:</span>
                      <span className="font-mono text-muted-foreground text-[11px]">Locked until waiter approval</span>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <span>Live realtime connection active — this page updates instantly.</span>
                  </div>
                </div>
              </div>
            ) : isUnderCashierReview ? (
              /* CASE 3: Screenshot Submitted, Awaiting Cashier Review */
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
                    <Clock className="size-5 animate-pulse text-amber-600" />
                    <span>Payment submitted — awaiting cashier review</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your payment transfer proof has been recorded and queued. Our cashier is reviewing the transaction details.
                  </p>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-bold text-foreground">{formatETB(order.total)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Payment Method:</span>
                      <span className="font-medium text-foreground">{order.paymentMethod || "Mobile Transfer"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Transaction Ref:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {order.paymentProof?.transactionReference || (
                          <span className="text-muted-foreground italic font-sans font-normal text-xs">
                            Not provided
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Review Status:</span>
                      <Badge
                        variant="outline"
                        className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] uppercase font-semibold"
                      >
                        Pending Cashier Review
                      </Badge>
                    </div>
                    {order.paymentProof?.screenshotPath && (
                      <div className="pt-2 border-t border-border/40">
                        <span className="text-muted-foreground block text-[11px] mb-1">Submitted Proof:</span>
                        <a
                          href={
                            order.paymentProof.screenshotPath.startsWith("http")
                              ? order.paymentProof.screenshotPath
                              : supabase.storage
                                  .from("payment-proofs")
                                  .getPublicUrl(order.paymentProof.screenshotPath).data.publicUrl
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold"
                        >
                          <Eye className="size-3.5" />
                          <span>View Uploaded Screenshot</span>
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="rounded-md bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <span>Listening for cashier verification. Once verified, status will update to Paid automatically.</span>
                  </div>
                </div>
              </div>
            ) : isPaid ? (
              /* CASE 4: Payment Paid & Verified */
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
            ) : (
              /* CASE 5: Waiter has approved — Customer selects payment method and submits proof */
              <div className="mt-4 space-y-4">
                {isDineIn && (
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success-800 dark:text-success-200 flex items-start gap-2">
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-success" />
                    <div>
                      <p className="font-semibold">Order Approved by {order.waiterName || "Server"}</p>
                      <p className="text-muted-foreground">
                        Your server has confirmed your order{order.customer.table ? ` at Table #${order.customer.table}` : ""}. Please select your payment method below.
                      </p>
                    </div>
                  </div>
                )}

                {order.paymentProof?.status === "rejected" && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <div>
                      <p className="font-semibold">Previous Payment Proof Rejected</p>
                      <p className="text-muted-foreground">
                        {order.paymentProof.rejectionReason || "The uploaded screenshot could not be verified by the cashier."} Please re-upload a valid payment screenshot.
                      </p>
                    </div>
                  </div>
                )}

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
                        name: isDineIn
                          ? "Pay at Table with Server (Cash / Card)"
                          : isDelivery
                            ? "Cash on Delivery"
                            : "Pay at Pickup Counter",
                        info: isDineIn
                          ? (order.customer.table ? `Server will settle payment at Table #${order.customer.table}` : "Server will settle payment at your table")
                          : "Pay in person upon receipt",
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

                {paymentMethod !== "cash" ? (
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    <div className="space-y-1.5">
                      <Label htmlFor="order-txref" className="text-xs font-medium text-foreground">
                        Transaction Reference Number <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="order-txref"
                        value={txRef}
                        onChange={(e) => setTxRef(e.target.value)}
                        placeholder="e.g. TXN-9281034"
                        className="h-8 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-foreground">
                        Payment Proof Screenshot <span className="text-destructive">*</span>
                      </Label>

                      {proofPreview ? (
                        <div className="relative rounded-lg border border-border bg-secondary/30 p-2">
                          <img
                            src={proofPreview}
                            alt="Payment Proof Preview"
                            className="max-h-40 mx-auto rounded object-contain"
                          />
                          <div className="mt-2 flex items-center justify-between text-xs px-1">
                            <span className="truncate max-w-[200px] text-muted-foreground">
                              {proofFile?.name}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleClearFile}
                              className="h-6 px-2 text-destructive hover:text-destructive"
                            >
                              <X className="size-3.5 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-4 cursor-pointer hover:bg-secondary/40 transition-colors">
                          <Upload className="size-6 text-muted-foreground mb-1" />
                          <span className="text-xs font-semibold text-foreground">Upload screenshot</span>
                          <span className="text-[10px] text-muted-foreground">PNG, JPG or WebP up to 5MB</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    <Button
                      onClick={handleSubmitProof}
                      disabled={submittingProof || !proofFile}
                      className="w-full font-semibold"
                    >
                      <Upload className="size-4 mr-2" />
                      {submittingProof
                        ? "Uploading Proof…"
                        : `Submit Payment Proof (${formatETB(order.total)})`}
                    </Button>
                    <p className="text-[11px] text-center text-muted-foreground">
                      Proof is sent to cashier for review. Order will be marked paid upon cashier verification.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground">In-Person Settlement</p>
                      <p>
                        {isDineIn
                          ? `Your server (${order.waiterName || "assigned staff"}) will collect cash or card directly at your table${order.customer.table ? ` (Table #${order.customer.table})` : ""}.`
                          : "Pay in person upon pickup or delivery."}
                      </p>
                    </div>
                    <Button
                      onClick={handleConfirmCashAtTable}
                      disabled={paying}
                      className="w-full font-semibold"
                    >
                      <Banknote className="size-4 mr-2" />
                      {paying ? "Recording…" : `Confirm Cash Settlement (${formatETB(order.total)})`}
                    </Button>
                  </div>
                )}
              </div>
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
