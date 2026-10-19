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
  FileCheck2,
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
  UploadCloud,
  UserCheck,
  Utensils,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [paymentMethod, setPaymentMethod] = useState<"telebirr" | "cbe" | "cash">("telebirr");
  const [txRef, setTxRef] = useState("");
  const [paying, setPaying] = useState(false);
  const [proofImageBase64, setProofImageBase64] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [proofFileSize, setProofFileSize] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [zoomTitle, setZoomTitle] = useState<string>("Payment Receipt");

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

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, or WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Receipt image must be smaller than 5MB.");
      return;
    }

    setProofFileName(file.name);
    setProofFileSize((file.size / (1024 * 1024)).toFixed(2) + " MB");

    const reader = new FileReader();
    reader.onload = (event) => {
      setProofImageBase64(event.target?.result as string);
      toast.success("Receipt image loaded! Preview is ready.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProof = () => {
    setProofImageBase64(null);
    setProofFileName(null);
    setProofFileSize(null);
  };

  const handleSubmitProof = async () => {
    if (!state.order) return;
    if (!proofImageBase64 && !txRef.trim()) {
      toast.error("Please upload a receipt screenshot or enter a transaction reference number.");
      return;
    }

    setSubmittingProof(true);
    try {
      const result = await submitPaymentProof({
        orderId: state.order.id,
        proofImageBase64: proofImageBase64 || undefined,
        transactionReference: txRef.trim() || undefined,
      });
      if (result.order) {
        setState((prev) => ({ ...prev, order: result.order }));
      }
      setProofImageBase64(null);
      setProofFileName(null);
      setProofFileSize(null);
      setTxRef("");
      toast.success("Payment proof submitted! Cashier verification pending.");
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Failed to submit payment proof";
      toast.error(errMsg);
    } finally {
      setSubmittingProof(false);
    }
  };

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
              : order.paymentProof?.status === "rejected"
                ? "bg-destructive/15 text-destructive ring-destructive/5"
                : order.paymentProof?.status === "pending"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/5"
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
                  : order.paymentProof?.status === "pending"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
            )}
          >
            {order.paymentStatus === "paid"
              ? "Order Placed & Payment Verified"
              : order.paymentProof?.status === "rejected"
                ? "Payment Proof Rejected — Action Needed"
                : order.paymentProof?.status === "pending"
                  ? "Payment Proof Submitted — Pending Verification"
                  : "Order Received — Payment Pending"}
          </Badge>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-semibold">
            {order.paymentStatus === "paid"
              ? "Thank you for your order!"
              : order.paymentProof?.status === "rejected"
                ? "Payment Proof Rejected"
                : order.paymentProof?.status === "pending"
                  ? "Verifying Your Payment"
                  : "Order Received — Settle Payment"}
          </h1>
          <p className="mt-3 max-w-xl mx-auto text-sm sm:text-base text-muted-foreground">
            {order.paymentStatus === "paid"
              ? "Your payment is verified and your order is actively being prepared by our baristas and kitchen."
              : order.paymentProof?.status === "rejected"
                ? "Our cashier reviewed your submitted receipt and could not verify it. Please check the reason below and submit a valid proof."
                : order.paymentProof?.status === "pending"
                  ? "Our cashier is verifying your payment with the bank. Status will update here automatically upon approval."
                  : "Your order details have been saved to the café database. Please submit your payment proof below to finalize fulfillment."}
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
            ) : order.paymentProof && order.paymentProof.status === "pending" ? (
              /* CASE 2: PAYMENT PROOF SUBMITTED & PENDING CASHIER REVIEW */
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="font-display text-base font-bold text-foreground">
                        Payment Submitted Successfully!
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold text-xs">
                      Under Review
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Your payment proof has been received and sent to our cashier for verification. Your order is awaiting approval.
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    We will notify you when your payment has been reviewed. If your payment is rejected, you can upload a corrected screenshot or enter the correct transfer ID.
                  </p>
                  <div className="pt-1 text-[11px] font-mono text-muted-foreground border-t border-border/40 flex items-center justify-between">
                    <span>Order #{order.number}</span>
                    <span>Status: <strong className="text-amber-600 dark:text-amber-400 font-semibold">Under Review</strong></span>
                  </div>
                </div>

                {/* Submitted proof preview card */}
                <div className="rounded-xl border border-border bg-background/80 p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground border-b border-border/60 pb-2">
                    <span>Submitted Information</span>
                    <span className="text-muted-foreground font-normal">
                      {new Date(
                        order.paymentProof.submittedAt || order.paymentProof.createdAt || Date.now(),
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {order.paymentProof.screenshotUrl ? (
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() => {
                          setZoomImageUrl(order.paymentProof!.screenshotUrl!);
                          setZoomTitle("Submitted Payment Receipt");
                          setZoomModalOpen(true);
                        }}
                        className="relative size-16 shrink-0 rounded-lg overflow-hidden border border-border cursor-pointer group bg-muted/40"
                        title="Click to view full preview"
                      >
                        <img
                          src={order.paymentProof.screenshotUrl}
                          alt="Submitted receipt proof"
                          className="size-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                          <Eye className="size-4" />
                        </div>
                      </div>
                      <div className="text-xs space-y-1">
                        <span className="font-medium text-foreground block">Receipt Screenshot</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2 gap-1"
                          onClick={() => {
                            setZoomImageUrl(order.paymentProof!.screenshotUrl!);
                            setZoomTitle("Submitted Payment Receipt");
                            setZoomModalOpen(true);
                          }}
                        >
                          <ZoomIn className="size-3" />
                          View Full Image
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">
                      No receipt screenshot attached (reference-only submission)
                    </div>
                  )}

                  {(order.transactionReference || order.paymentProof.transactionReference) && (
                    <div className="rounded bg-muted/40 p-2 text-xs flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-muted-foreground block">Transaction Reference:</span>
                        <span className="font-mono font-bold text-foreground">
                          {order.transactionReference || order.paymentProof.transactionReference}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const ref = order.transactionReference || order.paymentProof?.transactionReference || "";
                          void navigator.clipboard.writeText(ref);
                          toast.success("Reference copied!");
                        }}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                      >
                        <Copy className="size-3" />
                        Copy
                      </button>
                    </div>
                  )}
                </div>

                {/* Option to re-upload / replace if customer made an error */}
                <details className="rounded-lg border border-border/70 p-3 text-xs group">
                  <summary className="font-medium text-primary cursor-pointer hover:underline">
                    Need to update or replace your receipt?
                  </summary>
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                    <p className="text-muted-foreground">
                      Upload a new screenshot or enter a corrected transaction code below:
                    </p>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-foreground">
                        Upload Corrected Receipt
                      </Label>
                      {!proofImageBase64 ? (
                        <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border/80 bg-background/50 hover:bg-background/80 hover:border-primary/60 p-3 cursor-pointer text-center">
                          <UploadCloud className="size-4 text-primary" />
                          <span className="text-xs font-medium text-foreground">Choose new image</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleProofFileChange}
                            className="hidden"
                          />
                        </label>
                      ) : (
                        <div className="flex items-center justify-between rounded-lg border border-border bg-background p-2">
                          <span className="text-xs font-medium truncate max-w-[180px]">{proofFileName}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] text-destructive hover:text-destructive"
                            onClick={handleRemoveProof}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="replace-txref" className="text-xs font-medium text-foreground">
                        Corrected Transaction Reference
                      </Label>
                      <Input
                        id="replace-txref"
                        value={txRef}
                        onChange={(e) => setTxRef(e.target.value)}
                        placeholder="e.g. TXN-9281034"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <Button
                      onClick={handleSubmitProof}
                      disabled={submittingProof || (!proofImageBase64 && !txRef.trim())}
                      size="sm"
                      className="w-full text-xs font-semibold"
                    >
                      {submittingProof ? "Updating Proof…" : "Submit Updated Proof"}
                    </Button>
                  </div>
                </details>
              </div>
            ) : order.paymentProof && order.paymentProof.status === "rejected" ? (
              /* CASE 3: PAYMENT PROOF REJECTED BY CASHIER - ACTION REQUIRED */
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2.5">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                  <div>
                    <p className="font-semibold text-sm">Payment Proof Rejected by Cashier</p>
                    <p className="mt-1 font-medium text-foreground">
                      Reason:{" "}
                      <span className="text-destructive font-semibold">
                        {order.paymentProof.rejectionReason || "Payment could not be verified with the bank."}
                      </span>
                    </p>
                    <p className="mt-1 text-muted-foreground text-[11px]">
                      Please review your transfer, upload a clear receipt screenshot or provide the correct transaction ID.
                    </p>
                  </div>
                </div>

                {/* Resubmission form */}
                <div className="rounded-xl border border-border bg-background/80 p-4 space-y-3.5">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Resubmit Proof for Order #{order.number}
                  </h4>

                  {/* Transfer instruction reminder */}
                  <div className="rounded-lg bg-muted/40 p-2.5 text-xs space-y-1 border border-border/50">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount Due:</span>
                      <strong className="text-primary">{formatETB(order.total)}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Merchant / Till:</span>
                      <span className="font-mono font-medium text-foreground flex items-center gap-1">
                        0911 234 567
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText("0911234567");
                            toast.success("Merchant till copied!");
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="size-3" />
                        </button>
                      </span>
                    </div>
                  </div>

                  {/* Image uploader */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Upload New Receipt Photo</span>
                      <span className="text-[11px] font-normal text-muted-foreground">Max 5MB</span>
                    </Label>
                    {!proofImageBase64 ? (
                      <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border/80 bg-background/50 hover:bg-background/80 hover:border-primary/60 p-3.5 cursor-pointer text-center">
                        <UploadCloud className="size-5 text-primary" />
                        <span className="text-xs font-medium text-foreground">Select receipt screenshot</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProofFileChange}
                          className="hidden"
                        />
                      </label>
                    ) : (
                      <div className="rounded-lg border border-border bg-background p-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <img
                            src={proofImageBase64}
                            alt="Receipt preview"
                            className="size-10 rounded object-cover border border-border"
                          />
                          <span className="text-xs font-medium truncate">{proofFileName}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] text-destructive hover:text-destructive"
                          onClick={handleRemoveProof}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Transaction ID */}
                  <div className="space-y-1">
                    <Label htmlFor="resubmit-txref" className="text-xs font-medium text-foreground">
                      Transaction Reference / Confirmation Code
                    </Label>
                    <Input
                      id="resubmit-txref"
                      value={txRef}
                      onChange={(e) => setTxRef(e.target.value)}
                      placeholder="e.g. TXN-84729103"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  <Button
                    onClick={handleSubmitProof}
                    disabled={submittingProof || (!proofImageBase64 && !txRef.trim())}
                    className="w-full font-semibold"
                  >
                    <RefreshCw className={cn("size-4 mr-2", submittingProof && "animate-spin")} />
                    {submittingProof ? "Submitting Proof…" : `Resubmit Proof (${formatETB(order.total)})`}
                  </Button>
                </div>
              </div>
            ) : (
              /* CASE 4: PENDING PAYMENT (NO PROOF SUBMITTED YET) */
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <p className="font-semibold">Action required: Submit payment proof</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Total due is <strong className="text-foreground">{formatETB(order.total)}</strong>.
                      Transfer using Telebirr or CBE Birr and upload receipt proof below.
                    </p>
                  </div>
                </div>

                {/* Transfer options instructions */}
                <div className="rounded-lg border border-border bg-background/80 p-3 space-y-2 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Receipt className="size-3.5 text-primary" />
                    Rekik Coffee Payment Accounts
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                    <div className="rounded bg-muted/40 p-2">
                      <span className="text-[11px] block font-semibold text-foreground">Telebirr Till:</span>
                      <span className="font-mono text-xs font-bold text-primary flex items-center justify-between">
                        0911 234 567
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText("0911234567");
                            toast.success("Telebirr number copied!");
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copy"
                        >
                          <Copy className="size-3" />
                        </button>
                      </span>
                    </div>
                    <div className="rounded bg-muted/40 p-2">
                      <span className="text-[11px] block font-semibold text-foreground">CBE Account:</span>
                      <span className="font-mono text-xs font-bold text-primary flex items-center justify-between">
                        1000 2345 67890
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText("1000234567890");
                            toast.success("CBE Account copied!");
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copy"
                        >
                          <Copy className="size-3" />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Screenshot uploader */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Upload Payment Receipt Screenshot</span>
                    <span className="text-[11px] font-normal text-muted-foreground">Max 5MB</span>
                  </Label>
                  {!proofImageBase64 ? (
                    <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border/80 bg-background/50 hover:bg-background/80 hover:border-primary/60 p-3.5 cursor-pointer text-center">
                      <UploadCloud className="size-5 text-primary" />
                      <span className="text-xs font-medium text-foreground">Click to upload receipt photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProofFileChange}
                        className="hidden"
                      />
                    </label>
                  ) : (
                    <div className="rounded-lg border border-border bg-background p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <img
                          src={proofImageBase64}
                          alt="Receipt preview"
                          className="size-10 rounded object-cover border border-border"
                        />
                        <span className="text-xs font-medium truncate">{proofFileName}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-destructive hover:text-destructive"
                        onClick={handleRemoveProof}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                {/* Transaction reference */}
                <div className="space-y-1">
                  <Label htmlFor="order-txref" className="text-xs font-medium text-foreground flex items-center justify-between">
                    <span>Transaction Reference Number</span>
                    <span className="text-[11px] text-muted-foreground">Optional if image uploaded</span>
                  </Label>
                  <Input
                    id="order-txref"
                    value={txRef}
                    onChange={(e) => setTxRef(e.target.value)}
                    placeholder="e.g. TXN-84729103"
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <Button
                  onClick={handleSubmitProof}
                  disabled={submittingProof || (!proofImageBase64 && !txRef.trim())}
                  className="w-full font-semibold"
                >
                  <FileCheck2 className="size-4 mr-2" />
                  {submittingProof ? "Submitting Proof…" : `Submit Proof for Verification`}
                </Button>
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
