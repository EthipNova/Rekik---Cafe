import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUpDown,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  FileCheck2,
  FileText,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingBag,
  TrendingUp,
  Wallet,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/site/Section";
import { formatETB, getProduct } from "@/lib/menu-data";
import { methodLabels, statusLabels } from "@/lib/orders";
import {
  approveCashierPayment,
  calculatePaymentMetrics,
  fetchAdminPayments,
  rejectCashierPayment,
  settleCashPayment,
  type PaymentRecord,
} from "@/lib/payments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payments Management — Rekik Coffee" },
      { name: "description", content: "View and manage customer payment records and revenue." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPayments,
});

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1 bg-success/15 text-success border-success/30 font-medium text-xs py-0.5 px-2"
      >
        <CheckCircle2 className="size-3" aria-hidden />
        <span>Paid</span>
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge
        variant="secondary"
        className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium text-xs py-0.5 px-2"
      >
        <Clock className="size-3" aria-hidden />
        <span>Pending</span>
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        variant="destructive"
        className="inline-flex items-center gap-1 font-medium text-xs py-0.5 px-2"
      >
        <AlertCircle className="size-3" aria-hidden />
        <span>Failed</span>
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs uppercase">
      {status}
    </Badge>
  );
}

function getItemCount(payment: PaymentRecord): number {
  const items = Array.isArray(payment.orders?.order_items) ? payment.orders!.order_items : [];
  return items.reduce((sum, item) => sum + (item.quantity || 1), 0);
}

function AdminPayments() {
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  // Cashier action states
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [zoomDialogOpen, setZoomDialogOpen] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAdminPayments();
    if (err) {
      setError(err.message || "Failed to load payments from Supabase.");
      setPayments(null);
    } else {
      setPayments(data || []);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  const handleApprove = async (payment: PaymentRecord) => {
    setActionLoading(true);
    try {
      const proofId = payment.payment_proofs?.[0]?.id;
      await approveCashierPayment({
        paymentId: payment.id,
        orderId: payment.order_id,
        ...(proofId ? { paymentProofId: proofId } : {}),
        note: "Approved and verified by cashier",
      });
      toast.success("Payment approved & verified successfully!");
      await loadPayments();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to approve payment";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenRejectDialog = () => {
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async (payment: PaymentRecord) => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    setActionLoading(true);
    try {
      const proofId = payment.payment_proofs?.[0]?.id;
      await rejectCashierPayment({
        paymentId: payment.id,
        orderId: payment.order_id,
        ...(proofId ? { paymentProofId: proofId } : {}),
        reason: rejectionReason.trim(),
      });
      toast.success("Payment rejected. Rejection reason recorded.");
      setRejectDialogOpen(false);
      await loadPayments();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reject payment";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettleCash = async (payment: PaymentRecord) => {
    setActionLoading(true);
    try {
      await settleCashPayment({
        paymentId: payment.id,
        orderId: payment.order_id,
        note: "Settled in cash at café / delivery handoff",
      });
      toast.success("Cash payment marked as settled!");
      await loadPayments();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to settle cash payment";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const safePayments = payments ?? [];

  // Summary Metrics derived directly from payment transaction records
  const metrics = calculatePaymentMetrics(safePayments);

  // Distinct payment methods available in actual database data
  const availablePaymentMethods = Array.from(
    new Set(safePayments.map((p) => p.method).filter(Boolean)),
  );

  // Filter payments
  const filteredPayments = safePayments.filter((p) => {
    if (statusFilter !== "all") {
      if (statusFilter === "pending_proof") {
        const hasPendingProof = p.payment_proofs?.some((pf) => pf.status === "pending");
        if (!hasPendingProof) return false;
      } else if (p.status !== statusFilter) {
        return false;
      }
    }

    if (methodFilter !== "all" && p.method !== methodFilter) {
      return false;
    }

    if (orderTypeFilter !== "all" && p.orders?.method !== orderTypeFilter) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const numMatch = (p.orders?.order_number || p.order_id || "").toLowerCase().includes(q);
      const nameMatch = (p.orders?.customer_name || "").toLowerCase().includes(q);
      const phoneMatch = (p.orders?.customer_phone || "").toLowerCase().includes(q);
      const methodMatch = (p.method || "").toLowerCase().includes(q);
      const refMatch = (p.transaction_reference || "").toLowerCase().includes(q);
      if (!numMatch && !nameMatch && !phoneMatch && !methodMatch && !refMatch) {
        return false;
      }
    }

    return true;
  });

  // Sort payments
  const sortedPayments = [...filteredPayments].sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    }
    if (sortBy === "highest") {
      return (b.amount || 0) - (a.amount || 0);
    }
    if (sortBy === "lowest") {
      return (a.amount || 0) - (b.amount || 0);
    }
    return 0;
  });

  const selectedPayment = safePayments.find((p) => p.id === selectedPaymentId) ?? null;

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setMethodFilter("all");
    setOrderTypeFilter("all");
    setSortBy("newest");
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    methodFilter !== "all" ||
    orderTypeFilter !== "all" ||
    sortBy !== "newest";

  return (
    <div className="space-y-8">
      {/* 1. HEADER & OVERVIEW */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Payments management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor customer transactions, settlement states, and café revenue.
          </p>
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground inline-flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] uppercase font-semibold text-primary border-primary/30"
            >
              Supabase Live
            </Badge>
            <span>Live settlement and transaction records verified from production database.</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadPayments}
          disabled={loading}
          className="gap-2 text-xs"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh data
        </Button>
      </header>

      {/* 2. SUMMARY METRIC CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Revenue */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-primary">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Revenue
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {formatETB(metrics.totalRevenue)}
          </p>
          <p className="text-xs text-muted-foreground">
            {metrics.paidCount} settled {metrics.paidCount === 1 ? "payment" : "payments"}
          </p>
        </div>

        {/* Paid Payments */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-success">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Paid Transactions
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-success/10 text-success">
              <CheckCircle2 className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {formatETB(metrics.totalRevenue)}
          </p>
          <p className="text-xs text-muted-foreground">
            {metrics.paidCount} verified {metrics.paidCount === 1 ? "settlement" : "settlements"}
          </p>
        </div>

        {/* Pending Verification (Proofs) */}
        <div
          onClick={() => setStatusFilter(statusFilter === "pending_proof" ? "all" : "pending_proof")}
          className={cn(
            "surface-card p-5 space-y-1.5 border-l-4 border-l-amber-500 cursor-pointer transition-all hover:shadow-md",
            statusFilter === "pending_proof" && "ring-2 ring-amber-500 bg-amber-500/5",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Pending Proofs
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="size-4 animate-pulse" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
            {metrics.pendingProofCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {metrics.pendingProofCount === 1 ? "1 proof awaiting review" : `${metrics.pendingProofCount} proofs awaiting review`}
          </p>
        </div>

        {/* Pending Payments */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-muted-foreground">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pending Total
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Clock className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {formatETB(metrics.pendingAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {metrics.pendingCount} awaiting settlement
          </p>
        </div>

        {/* Failed Payments */}
        <div className="surface-card p-5 space-y-1.5 border-l-4 border-l-destructive">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Failed Transactions
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-2xl font-bold text-foreground">
            {formatETB(metrics.failedAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {metrics.failedCount} rejected {metrics.failedCount === 1 ? "attempt" : "attempts"}
          </p>
        </div>
      </div>

      {/* 3. SEARCH & FILTER CONTROLS */}
      <div className="surface-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search by order #, customer, phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              aria-label="Search payment records"
            />
          </div>

          {/* Payment Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by payment status">
              <SelectValue placeholder="Payment status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending_proof">Pending Review (Proofs)</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          {/* Payment Method Filter */}
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by payment method">
              <SelectValue placeholder="Payment method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment methods</SelectItem>
              {availablePaymentMethods.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Order Method Filter */}
          <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by fulfillment method">
              <SelectValue placeholder="Order method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All order methods</SelectItem>
              <SelectItem value="dine-in">Dine-in</SelectItem>
              <SelectItem value="takeaway">Takeaway</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Secondary controls row: Sorting & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
            <span>Sort by:</span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-7 text-xs w-[140px]" aria-label="Sort transactions">
                <SelectValue placeholder="Sort order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="highest">Highest amount</SelectItem>
                <SelectItem value="lowest">Lowest amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Showing <strong>{sortedPayments.length}</strong> of{" "}
              <strong>{safePayments.length}</strong> transactions
            </span>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3" aria-hidden />
                Reset filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 4. ERROR STATE */}
      {error && payments === null && (
        <div className="surface-card p-8 text-center space-y-4 border border-destructive/30 bg-destructive/5">
          <div className="inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Unable to load payment records
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button onClick={loadPayments} size="sm" className="gap-2">
            <RefreshCw className="size-3.5" aria-hidden />
            Retry connection
          </Button>
        </div>
      )}

      {/* 5. TRANSACTIONS TABLE / STATES */}
      {loading && payments === null ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Loading payment records from database…</p>
        </div>
      ) : safePayments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="size-8 text-muted-foreground" />}
          title="No payment records yet"
          description="Transactions will appear here once customer orders are placed through checkout."
        />
      ) : sortedPayments.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-3">
          <p className="text-base font-medium">No matching payments found</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No transaction records match your current filter and search query. Try adjusting your
            criteria.
          </p>
          <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            Reset all filters
          </Button>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">
                    Order
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">
                    Date & Time
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">
                    Customer
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">
                    Fulfillment
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">
                    Payment Method
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                    Amount
                  </TableHead>
                  <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((p) => {
                  const order = p.orders;
                  const orderDisplay = order?.order_number || `#${p.order_id.slice(0, 4)}`;
                  const customerName = order?.customer_name || "Guest diner";
                  const customerPhone = order?.customer_phone;
                  const methodText = order ? methodLabels[order.method] || order.method : "Dine-in";

                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedPaymentId(p.id)}
                    >
                      <TableCell className="font-display font-semibold text-foreground whitespace-nowrap">
                        {orderDisplay}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        ·{" "}
                        {new Date(p.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {customerName}
                        {customerPhone && (
                          <span className="block text-xs text-muted-foreground font-normal">
                            {customerPhone}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {methodText}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Wallet className="size-3.5 text-muted-foreground" aria-hidden />
                          {p.method}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap space-y-1">
                        <PaymentStatusBadge status={p.status} />
                        {p.payment_proofs && p.payment_proofs.length > 0 && (
                          <div>
                            {p.payment_proofs[0]?.status === "pending" && (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] py-0 px-1.5 font-normal">
                                Proof Pending
                              </Badge>
                            )}
                            {p.payment_proofs[0]?.status === "approved" && (
                              <Badge className="bg-success/15 text-success border-success/30 text-[10px] py-0 px-1.5 font-normal">
                                Proof Approved
                              </Badge>
                            )}
                            {p.payment_proofs[0]?.status === "rejected" && (
                              <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] py-0 px-1.5 font-normal">
                                Proof Rejected
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-display font-semibold text-foreground whitespace-nowrap">
                        {formatETB(p.amount)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-primary hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPaymentId(p.id);
                          }}
                        >
                          <Eye className="size-3.5 mr-1" aria-hidden />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* 6. PAYMENT DETAILS DRAWER */}
      <Sheet
        open={selectedPaymentId !== null}
        onOpenChange={(open) => !open && setSelectedPaymentId(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-md md:max-w-lg overflow-y-auto p-6 flex flex-col gap-6"
        >
          {selectedPayment ? (
            <>
              {/* Header */}
              <SheetHeader className="text-left space-y-2 pb-4 border-b border-border">
                <div className="flex items-center justify-between gap-2 pr-6">
                  <SheetTitle className="font-display text-2xl font-bold">
                    Payment #
                    {selectedPayment.orders?.order_number || selectedPayment.id.slice(0, 8)}
                  </SheetTitle>
                  <PaymentStatusBadge status={selectedPayment.status} />
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  Recorded on{" "}
                  {new Date(selectedPayment.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  at{" "}
                  {new Date(selectedPayment.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </SheetDescription>
              </SheetHeader>

              {/* Payment Summary Box */}
              <section aria-labelledby="drawer-payment-summary" className="space-y-3">
                <h3
                  id="drawer-payment-summary"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Payment Breakdown
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Payment Method</span>
                    <span className="font-medium text-foreground">{selectedPayment.method}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Payment Status</span>
                    <PaymentStatusBadge status={selectedPayment.status} />
                  </div>
                  {selectedPayment.transaction_reference && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Transaction Ref</span>
                      <span className="font-mono text-xs text-foreground bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                        {selectedPayment.transaction_reference}
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(selectedPayment.transaction_reference!);
                            toast.success("Transaction reference copied!");
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copy"
                        >
                          <Copy className="size-3" />
                        </button>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Settled At</span>
                    <span className="text-xs text-foreground">
                      {selectedPayment.paid_at
                        ? new Date(selectedPayment.paid_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : selectedPayment.status === "paid"
                          ? "Verified"
                          : "Pending settlement"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground text-xs font-medium">Amount Due / Paid</span>
                    <span className="font-display text-xl font-bold text-primary">
                      {formatETB(selectedPayment.amount)}
                    </span>
                  </div>
                </div>
              </section>

              {/* CUSTOMER PAYMENT PROOF & CASHIER VERIFICATION SECTION */}
              <section aria-labelledby="drawer-payment-proof" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="drawer-payment-proof"
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    Customer Payment Proof
                  </h3>
                  {(() => {
                    const firstProof = selectedPayment.payment_proofs?.[0];
                    if (!firstProof) return null;
                    return (
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 font-medium",
                          firstProof.status === "approved"
                            ? "bg-success/15 text-success border-success/30"
                            : firstProof.status === "rejected"
                              ? "bg-destructive/15 text-destructive border-destructive/30"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                        )}
                      >
                        {firstProof.status === "approved"
                          ? "Proof Approved"
                          : firstProof.status === "rejected"
                            ? "Proof Rejected"
                            : "Verification Needed"}
                      </Badge>
                    );
                  })()}
                </div>

                {(() => {
                  const firstProof = selectedPayment.payment_proofs?.[0];
                  if (!firstProof) {
                    if (selectedPayment.transaction_reference) {
                      return (
                        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-sm">
                          <div className="flex items-center justify-between border-b border-border/60 pb-2">
                            <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle2 className="size-4" /> Waiter-Collected Reference
                            </span>
                            <Badge variant="outline" className="text-[10px] bg-background">
                              Awaiting Cashier Review
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Transaction Reference:</span>
                            <span className="font-mono font-bold text-foreground text-sm flex items-center gap-1.5">
                              {selectedPayment.transaction_reference}
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(selectedPayment.transaction_reference!);
                                  toast.success("Reference copied!");
                                }}
                                className="text-muted-foreground hover:text-foreground p-1"
                                title="Copy"
                              >
                                <Copy className="size-3.5" />
                              </button>
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Recorded by assigned waiter upon service. Verify this transaction code in your merchant portal before approving.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                        {selectedPayment.method.toLowerCase().includes("cash")
                          ? "Cash transaction. Confirm in-person receipt with customer."
                          : "Awaiting waiter payment collection for this order."}
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3 text-sm">
                      {/* Receipt image */}
                      {firstProof.signed_url ? (
                        <div className="space-y-2">
                          <span className="text-xs text-muted-foreground block">
                            Uploaded Receipt Screenshot
                          </span>
                          <div className="relative rounded-lg overflow-hidden border border-border bg-black/5 group max-h-56 flex items-center justify-center">
                            <img
                              src={firstProof.signed_url}
                              alt="Receipt proof"
                              className="max-h-52 w-auto object-contain cursor-pointer transition-transform group-hover:scale-[1.02]"
                              onClick={() => {
                                setZoomImageUrl(firstProof.signed_url!);
                                setZoomDialogOpen(true);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setZoomImageUrl(firstProof.signed_url!);
                                setZoomDialogOpen(true);
                              }}
                              className="absolute top-2 right-2 rounded bg-black/70 text-white p-1.5 opacity-80 hover:opacity-100 transition-opacity flex items-center gap-1 text-xs"
                            >
                              <ZoomIn className="size-3.5" />
                              Zoom
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground italic">
                          Reference-only submission (no receipt screenshot attached).
                        </div>
                      )}

                      {/* Transaction Reference */}
                      {firstProof.transaction_reference && (
                        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                          <span className="text-muted-foreground">Transfer ID:</span>
                          <span className="font-mono font-bold text-foreground flex items-center gap-1">
                            {firstProof.transaction_reference}
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(firstProof.transaction_reference!);
                                toast.success("Transfer ID copied!");
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="size-3" />
                            </button>
                          </span>
                        </div>
                      )}

                      {/* Submission time */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Submitted at:</span>
                        <span>
                          {new Date(firstProof.submitted_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Rejection reason if rejected */}
                      {firstProof.rejection_reason && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                          <span className="font-semibold block">Rejection Reason:</span>
                          <p className="mt-0.5">{firstProof.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* CASHIER ACTIONS BAR */}
                {selectedPayment.status === "pending" && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary block">
                      Cashier Verification Actions
                    </span>

                    {/* If electronic payment proof submitted or waiter-collected reference present */}
                    {(selectedPayment.payment_proofs && selectedPayment.payment_proofs.length > 0) ||
                    selectedPayment.transaction_reference ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          className="bg-success text-success-foreground hover:bg-success/90 font-semibold text-xs h-9"
                          onClick={() => void handleApprove(selectedPayment)}
                          disabled={actionLoading}
                        >
                          <Check className="size-3.5 mr-1.5" />
                          {actionLoading ? "Processing…" : "Approve Payment"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="font-semibold text-xs h-9"
                          onClick={handleOpenRejectDialog}
                          disabled={actionLoading}
                        >
                          <X className="size-3.5 mr-1.5" />
                          Reject Payment
                        </Button>
                      </div>
                    ) : selectedPayment.method.toLowerCase().includes("cash") ? (
                      /* If Cash payment pending */
                      <Button
                        type="button"
                        className="w-full font-semibold text-xs h-9"
                        onClick={() => void handleSettleCash(selectedPayment)}
                        disabled={actionLoading}
                      >
                        <Banknote className="size-4 mr-2" />
                        {actionLoading ? "Processing…" : `Mark Cash Settled (${formatETB(selectedPayment.amount)})`}
                      </Button>
                    ) : (
                      /* Mobile payment with no proof submitted yet */
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          className="bg-success text-success-foreground hover:bg-success/90 font-semibold text-xs h-9"
                          onClick={() => void handleApprove(selectedPayment)}
                          disabled={actionLoading}
                        >
                          <Check className="size-3.5 mr-1.5" />
                          Approve Anyway
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="font-semibold text-xs h-9"
                          onClick={handleOpenRejectDialog}
                          disabled={actionLoading}
                        >
                          <X className="size-3.5 mr-1.5" />
                          Cancel / Reject
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Related Order Information */}
              <section aria-labelledby="drawer-order-details" className="space-y-3">
                <h3
                  id="drawer-order-details"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Order Details
                </h3>
                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Order Number</span>
                    <span className="font-semibold text-foreground">
                      {selectedPayment.orders?.order_number || selectedPayment.order_id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Fulfillment Method</span>
                    <span className="font-medium text-foreground">
                      {selectedPayment.orders
                        ? methodLabels[selectedPayment.orders.method] ||
                          selectedPayment.orders.method
                        : "Dine-in"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Order Stage</span>
                    <Badge variant="outline" className="text-xs font-medium">
                      {selectedPayment.orders
                        ? statusLabels[selectedPayment.orders.status] ||
                          selectedPayment.orders.status
                        : "Recorded"}
                    </Badge>
                  </div>
                </div>
              </section>

              {/* Customer Information */}
              <section aria-labelledby="drawer-customer-info" className="space-y-3">
                <h3
                  id="drawer-customer-info"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Customer Information
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Name</span>
                    <span className="font-medium text-foreground">
                      {selectedPayment.orders?.customer_name || "Guest diner"}
                    </span>
                  </div>

                  {selectedPayment.orders?.customer_phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Phone</span>
                      <span className="font-medium text-foreground">
                        {selectedPayment.orders.customer_phone}
                      </span>
                    </div>
                  )}

                  {selectedPayment.orders?.customers?.email && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Email</span>
                      <span className="font-medium text-foreground text-xs">
                        {selectedPayment.orders.customers.email}
                      </span>
                    </div>
                  )}



                  {selectedPayment.orders?.method === "delivery" &&
                    selectedPayment.orders?.delivery_address && (
                      <div className="border-t border-border/50 pt-2 text-xs">
                        <span className="text-muted-foreground block mb-1">Delivery Address</span>
                        <span className="font-medium text-foreground leading-relaxed">
                          📍 {selectedPayment.orders.delivery_address}
                        </span>
                      </div>
                    )}
                </div>
              </section>

              {/* Itemized Order List */}
              <section aria-labelledby="drawer-items-list" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="drawer-items-list"
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    Items In Order
                  </h3>
                  <span className="text-xs text-muted-foreground font-medium">
                    {getItemCount(selectedPayment)}{" "}
                    {getItemCount(selectedPayment) === 1 ? "item" : "items"}
                  </span>
                </div>

                {selectedPayment.orders?.order_items &&
                selectedPayment.orders.order_items.length > 0 ? (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card/60 px-4">
                    {selectedPayment.orders.order_items.map((item, idx) => {
                      const localProduct = getProduct(item.product_id);
                      const imageSrc = item.products?.image_url || localProduct?.image;
                      const unitPrice = item.unit_price || 0;
                      const quantity = item.quantity || 1;
                      const lineTotal = item.line_total || unitPrice * quantity;

                      return (
                        <li
                          key={item.id || item.product_id || idx}
                          className="flex items-center justify-between gap-3 py-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt={item.name || "Product image"}
                                className="size-11 rounded-lg object-cover shrink-0 bg-muted"
                                loading="lazy"
                                width={44}
                                height={44}
                              />
                            ) : (
                              <div className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                                <ShoppingBag className="size-5" aria-hidden />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-foreground text-sm truncate">
                                {item.name || "Unknown item"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {quantity} × {formatETB(unitPrice)}
                              </p>
                            </div>
                          </div>
                          <span className="font-semibold text-foreground text-sm whitespace-nowrap">
                            {formatETB(lineTotal)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-border bg-card/60 p-4 text-center text-xs text-muted-foreground">
                    No itemized order lines recorded for this transaction.
                  </div>
                )}
              </section>

              {/* Financial Calculation */}
              <section aria-labelledby="drawer-financial-calc" className="space-y-3">
                <h3
                  id="drawer-financial-calc"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Financial Summary
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium text-foreground">
                      {formatETB(selectedPayment.orders?.subtotal || 0)}
                    </span>
                  </div>

                  {(selectedPayment.orders?.delivery_fee || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery fee</span>
                      <span className="font-medium text-foreground">
                        {formatETB(selectedPayment.orders!.delivery_fee)}
                      </span>
                    </div>
                  )}

                  {(selectedPayment.orders?.discount_amount || 0) > 0 && (
                    <div className="flex justify-between text-success font-medium">
                      <span>Discount</span>
                      <span>-{formatETB(selectedPayment.orders!.discount_amount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-bold">
                    <span>Order Total</span>
                    <span className="text-foreground">
                      {formatETB(selectedPayment.orders?.total_amount || selectedPayment.amount)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Close button */}
              <div className="pt-2 mt-auto border-t border-border">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelectedPaymentId(null)}
                >
                  Close
                </Button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center space-y-3 my-auto">
              <h3 className="font-display text-lg font-semibold">Payment record not found</h3>
              <p className="text-xs text-muted-foreground">
                The selected payment could not be retrieved from the database.
              </p>
              <Button variant="outline" size="sm" onClick={() => setSelectedPaymentId(null)}>
                Close
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* REJECTION REASON DIALOG */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-4" />
              Reject Payment Proof
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please indicate the reason why this payment cannot be approved. This note will be displayed to the customer on their order tracking page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <span className="text-xs font-semibold text-foreground block mb-1.5">
                Quick Preset Reasons:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Incorrect transfer amount",
                  "Transaction reference not found",
                  "Receipt image unreadable / blurry",
                  "Duplicate payment proof",
                  "Payment not credited to account",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRejectionReason(preset)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors text-left",
                      rejectionReason === preset
                        ? "border-destructive bg-destructive/10 text-destructive font-medium"
                        : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="rejection-reason" className="text-xs font-medium text-foreground">
                Rejection Note <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. The amount transferred was 200 ETB, but order total is 245 ETB. Please complete transfer."
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRejectDialogOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={actionLoading || !rejectionReason.trim()}
              onClick={() => {
                if (selectedPayment) {
                  void handleConfirmReject(selectedPayment);
                }
              }}
            >
              {actionLoading ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECEIPT ZOOM DIALOG */}
      <Dialog open={zoomDialogOpen} onOpenChange={setZoomDialogOpen}>
        <DialogContent className="max-w-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center justify-between">
              <span>Customer Receipt Inspection</span>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex flex-col items-center justify-center">
            {zoomImageUrl ? (
              <div className="w-full max-h-[80vh] overflow-auto rounded-lg border border-border bg-black/5 flex items-center justify-center p-2">
                <img
                  src={zoomImageUrl}
                  alt="High resolution receipt"
                  className="max-h-[75vh] w-auto object-contain rounded"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No image to display.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
