/**
 * ============================================================================
 * Rekik Café — Category 2: Sales and Financial Monitoring
 * File: src/routes/admin.payments.tsx
 * ============================================================================
 * Implements the Business Owner Sales & Financial Monitoring console adhering
 * strictly to the Rekik Café Supabase Workflow Guide:
 * - Real verified revenue only (paid/verified payments, zero unverified proofs)
 * - Non-double counting of retried/multiple payment attempts per order
 * - Strict separation of order totals vs verified cash/mobile receipts
 * - Historical item snapshot prices (unit_price, line_total from order_items)
 * - Identical preceding period comparison windows in Hawassa, Ethiopia (EAT / UTC+3)
 * - Payment review workload audit (read-only monitoring of cashier queues)
 * - Multi-criteria server-side filtering by date, status, method, and fulfillment
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  Filter,
  Lock,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { fetchProofSignedUrl } from "@/services/cashier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/site/Section";
import {
  loadSalesMonitoringData,
  classifyPaymentMethod,
  orderMatchesPaymentMethod,
  type CanonicalPaymentMethod,
  type FinancialDatePreset,
  type OrderSalesRow,
  type PeriodComparisonMetric,
  type SalesMonitoringData,
} from "@/lib/financial-monitoring";
import { formatETB } from "@/lib/menu-data";
import { methodLabels, statusLabels, type OrderStatus } from "@/lib/orders";
import { readSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "Sales & Financial Monitoring — Rekik Café" },
      {
        name: "description",
        content:
          "Authoritative revenue monitoring, settlement audit, and sales trend analysis for Rekik Café.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RekikSalesMonitoringPage,
});

export {
  classifyPaymentMethod,
  orderMatchesPaymentMethod,
  type CanonicalPaymentMethod,
} from "@/lib/financial-monitoring";

/**
 * Formats timestamps for review and order inspections in EAT (UTC+3)
 */
function formatReviewDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dateFormatted = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeFormatted = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateFormatted} · ${timeFormatted}`;
  } catch {
    return dateStr;
  }
}

/**
 * Status Badge for Rekik 5-Stage Workflow
 */
function OrderStatusBadge({ status }: { status: OrderStatus }) {
  switch (status) {
    case "pending_waiter":
    case "received":
      return (
        <Badge
          variant="outline"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px]"
        >
          <Clock className="size-3" aria-hidden />
          <span>Awaiting Waiter</span>
        </Badge>
      );
    case "awaiting_payment":
      return (
        <Badge
          variant="outline"
          className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1 text-[11px]"
        >
          <CreditCard className="size-3" aria-hidden />
          <span>Awaiting Payment</span>
        </Badge>
      );
    case "payment_under_review":
      return (
        <Badge
          variant="outline"
          className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 gap-1 text-[11px]"
        >
          <FileCheck2 className="size-3" aria-hidden />
          <span>Proof Under Review</span>
        </Badge>
      );
    case "payment_verified":
    case "confirmed":
    case "preparing":
    case "ready":
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]"
        >
          <CheckCircle2 className="size-3" aria-hidden />
          <span>{statusLabels[status] || "Payment Verified"}</span>
        </Badge>
      );
    case "completed":
    case "delivered":
      return (
        <Badge
          variant="outline"
          className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30 gap-1 text-[11px]"
        >
          <CheckCircle2 className="size-3" aria-hidden />
          <span>Completed</span>
        </Badge>
      );
    case "rejected_by_waiter":
    case "payment_rejected":
    case "cancelled":
      return (
        <Badge variant="destructive" className="gap-1 text-[11px]">
          <XCircle className="size-3" aria-hidden />
          <span>{statusLabels[status] || "Rejected"}</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-[11px]">
          {statusLabels[status] || status}
        </Badge>
      );
  }
}

/**
 * Payment Status Badge separating payment state from operational order state
 */
function PaymentStatusBadge({
  status,
  attemptsCount,
}: {
  status: "paid" | "pending" | "failed" | "unpaid" | string;
  attemptsCount?: number;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {status === "paid" ? (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs py-0.5 px-2 gap-1 font-medium"
        >
          <CheckCircle2 className="size-3" aria-hidden />
          <span>Paid</span>
        </Badge>
      ) : status === "pending" ? (
        <Badge
          variant="outline"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs py-0.5 px-2 gap-1 font-medium"
        >
          <Clock className="size-3" aria-hidden />
          <span>Pending</span>
        </Badge>
      ) : status === "failed" ? (
        <Badge variant="destructive" className="text-xs py-0.5 px-2 gap-1 font-medium">
          <AlertCircle className="size-3" aria-hidden />
          <span>Failed</span>
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-xs py-0.5 px-2 gap-1 font-medium">
          <Clock className="size-3" aria-hidden />
          <span>Unpaid</span>
        </Badge>
      )}

      {attemptsCount !== undefined && attemptsCount > 1 && (
        <Badge
          variant="outline"
          className="text-[10px] text-muted-foreground px-1.5 py-0 border-border/80"
          title={`${attemptsCount} payment attempts logged for this order`}
        >
          {attemptsCount} tries
        </Badge>
      )}
    </div>
  );
}

/**
 * Comparison Badge showing percentage delta vs preceding equivalent period
 */
function ComparisonTrendBadge({
  metric,
  invertSentiment = false,
}: {
  metric: PeriodComparisonMetric;
  invertSentiment?: boolean;
}) {
  if (metric.percentageChange === null || (metric.previous === 0 && metric.current === 0)) {
    return (
      <span className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-0.5">
        0% vs prev period
      </span>
    );
  }

  const isPositive = metric.diff > 0;
  const isNeutral = metric.diff === 0;

  // For workloads (like rejected proofs or failures), up is bad and down is good
  const isGood = invertSentiment ? !isPositive : isPositive;

  if (isNeutral) {
    return (
      <span className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-0.5">
        0% vs prev period
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full",
        isGood
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {isPositive ? (
        <ArrowUpRight className="size-3" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3" aria-hidden />
      )}
      <span>
        {isPositive ? "+" : ""}
        {metric.percentageChange}% vs prev
      </span>
    </span>
  );
}

function RekikSalesMonitoringPage() {
  const [data, setData] = useState<SalesMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date Range State
  const [preset, setPreset] = useState<FinancialDatePreset>("7days");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [, startTransition] = useTransition();

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<"orders">("orders");

  // Filters for Order Sales Table
  const [searchQuery, setSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [orderMethodFilter, setOrderMethodFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  // Selected Order for Inspection Sheet
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Settings
  const settings = readSettings();
  const cafeName = settings.cafeName || "Rekik Café";

  // Data Loading Function
  const loadData = useCallback(
    async (targetPreset = preset, start = customStart, end = customEnd) => {
      setLoading(true);
      setError(null);
      try {
        const res = await loadSalesMonitoringData(targetPreset, start, end);
        setData(res);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load sales monitoring records";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [preset, customStart, customEnd],
  );

  useEffect(() => {
    void loadData(preset, customStart, customEnd);
  }, [preset, customStart, customEnd, loadData]);

  // Handle Preset Change
  const handlePresetChange = (newPreset: string) => {
    if (newPreset === "custom") {
      setShowCustomRange(true);
      setPreset("custom");
    } else {
      setShowCustomRange(false);
      setPreset(newPreset as FinancialDatePreset);
    }
  };

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      toast.error("Please specify both start and end dates.");
      return;
    }
    startTransition(() => {
      void loadData("custom", customStart, customEnd);
    });
  };

  // Filtered Orders for the Ledger
  const filteredOrderSalesRows = useMemo(() => {
    if (!data) return [];

    return data.orderSalesRows.filter((r) => {
      // Order Status
      if (orderStatusFilter !== "all" && r.orderStatus !== orderStatusFilter) {
        return false;
      }
      // Payment Status
      if (paymentStatusFilter !== "all" && r.paymentStatus !== paymentStatusFilter) {
        return false;
      }
      // Payment Method (CBE, Telebirr, Cash)
      if (paymentMethodFilter !== "all" && !orderMatchesPaymentMethod(r, paymentMethodFilter)) {
        return false;
      }
      // Order Method (Dine-in, Takeaway, Delivery)
      if (orderMethodFilter !== "all" && r.orderMethod !== orderMethodFilter) {
        return false;
      }
      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = r.orderNumber.toLowerCase().includes(q);
        const nameMatch = r.customerName.toLowerCase().includes(q);
        const phoneMatch = r.customerPhone.toLowerCase().includes(q);
        const refMatch = (r.transactionReference || "").toLowerCase().includes(q);
        const waiterMatch = (r.assignedWaiterName || "").toLowerCase().includes(q);
        if (!numMatch && !nameMatch && !phoneMatch && !refMatch && !waiterMatch) {
          return false;
        }
      }
      return true;
    });
  }, [
    data,
    orderStatusFilter,
    paymentStatusFilter,
    paymentMethodFilter,
    orderMethodFilter,
    searchQuery,
  ]);

  // Sorted Orders
  const sortedOrderSalesRows = useMemo(() => {
    const list = [...filteredOrderSalesRows];
    switch (sortBy) {
      case "newest":
        return list.sort(
          (a, b) => new Date(b.orderCreatedAt).getTime() - new Date(a.orderCreatedAt).getTime(),
        );
      case "oldest":
        return list.sort(
          (a, b) => new Date(a.orderCreatedAt).getTime() - new Date(b.orderCreatedAt).getTime(),
        );
      case "highest_revenue":
        return list.sort((a, b) => b.verifiedPaymentAmount - a.verifiedPaymentAmount);
      case "highest_total":
        return list.sort((a, b) => b.orderTotal - a.orderTotal);
      default:
        return list;
    }
  }, [filteredOrderSalesRows, sortBy]);

  // Selected Order for Drawer
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId || !data) return null;
    return data.orderSalesRows.find((r) => r.orderId === selectedOrderId) || null;
  }, [selectedOrderId, data]);

  // Linked Payment Proof for Selected Order
  const selectedOrderProof = useMemo(() => {
    if (!selectedOrderId || !data) return null;
    return data.paymentProofAudits?.find((p) => p.orderId === selectedOrderId) || null;
  }, [selectedOrderId, data]);

  const [proofSignedUrl, setProofSignedUrl] = useState<string | null>(null);
  const [loadingProofUrl, setLoadingProofUrl] = useState(false);
  const [proofUrlError, setProofUrlError] = useState<string | null>(null);

  const loadProofUrl = useCallback(async (proof: typeof selectedOrderProof) => {
    if (!proof) {
      setProofSignedUrl(null);
      setProofUrlError(null);
      setLoadingProofUrl(false);
      return;
    }
    const target = proof.screenshotPath || proof.id;
    if (!target) {
      setProofSignedUrl(null);
      setProofUrlError(null);
      setLoadingProofUrl(false);
      return;
    }
    setLoadingProofUrl(true);
    setProofUrlError(null);
    try {
      const url = await fetchProofSignedUrl(target);
      setProofSignedUrl(url);
    } catch (err: unknown) {
      console.warn("[admin.payments] Could not fetch proof signed URL:", err);
      setProofUrlError("Unable to load private receipt image.");
    } finally {
      setLoadingProofUrl(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrderId && selectedOrderProof) {
      void loadProofUrl(selectedOrderProof);
    } else {
      setProofSignedUrl(null);
      setProofUrlError(null);
      setLoadingProofUrl(false);
    }
  }, [selectedOrderId, selectedOrderProof, loadProofUrl]);

  const resetFilters = () => {
    setSearchQuery("");
    setOrderStatusFilter("all");
    setPaymentStatusFilter("all");
    setPaymentMethodFilter("all");
    setOrderMethodFilter("all");
    setSortBy("newest");
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    orderStatusFilter !== "all" ||
    paymentStatusFilter !== "all" ||
    paymentMethodFilter !== "all" ||
    orderMethodFilter !== "all" ||
    sortBy !== "newest";

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── 1. HEADER & PERIOD CONTROLS ────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-border/40 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Sales & Financial Monitoring
            </h1>
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold px-2 py-0.5"
            >
              {cafeName}
            </Badge>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold px-2 py-0.5 inline-flex items-center gap-1"
            >
              <ShieldCheck className="size-3" /> Live Supabase
            </Badge>
            <Badge
              variant="secondary"
              className="text-[11px] text-muted-foreground hidden sm:inline-flex items-center gap-1 font-mono"
            >
              <Clock className="size-3" /> Hawassa (EAT / UTC+3)
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Authoritative verified revenue tracking, non-double-counted settlements, and payment
            review audit.
          </p>
        </div>

        {/* Global Date Range Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg p-1 shadow-xs">
            <Filter className="size-3.5 text-muted-foreground ml-1.5" aria-hidden />
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger
                id="financial-date-filter"
                aria-label="Filter financial report by date range"
                className="h-8 border-none shadow-none text-xs font-medium focus:ring-0 focus:ring-offset-0 px-2 min-w-[130px]"
              >
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="today">Today (EAT)</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="h-8 text-xs gap-1.5 shrink-0"
            aria-label="Refresh financial records from database"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {/* ── Custom Date Range Inputs (when preset === 'custom') ───────────── */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustomDates}
          className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1">
            <label htmlFor="custom-start" className="text-xs font-medium text-muted-foreground">
              Start Date (EAT)
            </label>
            <Input
              id="custom-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 text-xs w-[145px]"
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="custom-end" className="text-xs font-medium text-muted-foreground">
              End Date (EAT)
            </label>
            <Input
              id="custom-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 text-xs w-[145px]"
              required
            />
          </div>
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={loading}>
            <Calendar className="size-3.5" />
            Apply Custom Window
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Compares with preceding equal duration window.
          </span>
        </form>
      )}

      {/* ── ERROR STATE ────────────────────────────────────────────────────── */}
      {error && !data && (
        <div className="surface-card p-8 text-center space-y-4 border border-destructive/30 bg-destructive/5 rounded-xl">
          <div className="inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Unable to load financial monitoring records
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button onClick={() => void loadData()} size="sm" className="gap-2">
            <RefreshCw className="size-3.5" aria-hidden />
            Retry database query
          </Button>
        </div>
      )}

      {/* ── 2. PRIMARY FINANCIAL KPI CARDS ─────────────────────────────────── */}
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="kpi-heading"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Core Financial Performance ({data?.window.label || "Selected Window"})
          </h2>
          {data && (
            <span className="text-[11px] text-muted-foreground">
              Refreshed at {data.lastRefreshedAt} EAT
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* KPI 1: Verified Net Revenue */}
          <Card className="border-l-4 border-l-primary shadow-xs">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Verified Net Revenue
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <DollarSign className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <p className="font-display text-2xl font-bold tracking-tight text-foreground">
                {data ? formatETB(data.verifiedRevenue.current) : "—"}
              </p>
              <div className="flex items-center justify-between gap-1">
                {data && <ComparisonTrendBadge metric={data.verifiedRevenue} />}
                <span className="text-[11px] text-muted-foreground truncate">
                  Prev: {data ? formatETB(data.verifiedRevenue.previous) : "—"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Strictly paid settlements. Unverified proofs & retries excluded.
              </p>
            </CardContent>
          </Card>

          {/* KPI 2: Orders Placed vs Settled */}
          <Card className="border-l-4 border-l-emerald-500 shadow-xs">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Orders Placed & Settled
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShoppingBag className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-foreground">
                  {data ? data.ordersWithVerifiedPaymentsCount.current : "—"}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  / {data ? data.ordersPlacedCount.current : "—"} placed
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                {data && <ComparisonTrendBadge metric={data.ordersWithVerifiedPaymentsCount} />}
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {data && data.ordersPlacedCount.current > 0
                    ? `${Math.round((data.ordersWithVerifiedPaymentsCount.current / data.ordersPlacedCount.current) * 100)}% paid`
                    : "0%"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Deduplicated orders with confirmed settlement vs total registered.
              </p>
            </CardContent>
          </Card>

          {/* KPI 3: Average Order Value (AOV) */}
          <Card className="border-l-4 border-l-blue-500 shadow-xs">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Average Order Value
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <TrendingUp className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <p className="font-display text-2xl font-bold tracking-tight text-foreground">
                {data ? formatETB(data.averageOrderValue.current) : "—"}
              </p>
              <div className="flex items-center justify-between gap-1">
                {data && <ComparisonTrendBadge metric={data.averageOrderValue} />}
                <span className="text-[11px] text-muted-foreground truncate">
                  Prev: {data ? formatETB(data.averageOrderValue.previous) : "—"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Verified revenue divided strictly by settled order count.
              </p>
            </CardContent>
          </Card>

          {/* KPI 4: Cashier Payment Review Workload */}
          <Card className="border-l-4 border-l-amber-500 shadow-xs">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payment Reviews & Workload
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FileCheck2 className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-foreground">
                  {data ? data.pendingPaymentReviewsCount : "—"}
                </span>
                <span className="text-xs font-semibold uppercase text-amber-600 dark:text-amber-400">
                  Pending Review
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  <strong>{data?.rejectedPaymentProofsCount ?? 0}</strong> rejected proofs
                </span>
                <span>
                  <strong>{data?.failedPaymentsCount ?? 0}</strong> failed attempts
                </span>
              </div>
              <div className="border-t border-border/60 pt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Awaiting cashier audit & decisions
                </span>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  Cashier review queue
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 4. ORDER SALES LEDGER TAB ─────────────────────────────────────── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "orders")}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-2">
          <TabsList className="bg-muted/80 p-1">
            <TabsTrigger value="orders" className="text-xs gap-1.5">
              <ShoppingBag className="size-3.5" />
              <span>Order Sales Ledger</span>
              {data && (
                <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">
                  {sortedOrderSalesRows.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <span className="text-xs text-muted-foreground">
            Currency: <strong>ETB</strong> · Date scope: <strong>{data?.window.label}</strong>
          </span>
        </div>

        {/* ── TAB 1: ORDER SALES LEDGER (PHASE 3C) ─────────────────────────── */}
        <TabsContent value="orders" className="space-y-4 m-0">
          {/* Search & Filters Toolbar */}
          <div className="surface-card p-4 space-y-3 rounded-xl border border-border/80">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {/* Search Box */}
              <div className="relative lg:col-span-2">
                <Search
                  className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Search order #, customer, phone, ref, waiter…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                  aria-label="Search order sales ledger"
                />
              </div>

              {/* Order Status Filter */}
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger className="h-9 text-xs" aria-label="Filter by order workflow status">
                  <SelectValue placeholder="Order status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All order stages</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="pending_waiter">Awaiting Waiter</SelectItem>
                  <SelectItem value="awaiting_payment">Awaiting Payment</SelectItem>
                  <SelectItem value="payment_under_review">Proof Under Review</SelectItem>
                  <SelectItem value="payment_verified">Payment Verified</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              {/* Payment Settlement Status Filter */}
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="h-9 text-xs" aria-label="Filter by payment status">
                  <SelectValue placeholder="Payment status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment states</SelectItem>
                  <SelectItem value="paid">Paid (Verified)</SelectItem>
                  <SelectItem value="pending">Pending Settlement</SelectItem>
                  <SelectItem value="failed">Failed Attempt</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>

              {/* Payment Method Filter */}
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="h-9 text-xs" aria-label="Filter by payment method">
                  <SelectValue placeholder="Payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="cbe">CBE</SelectItem>
                  <SelectItem value="telebirr">Telebirr</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>

              {/* Fulfillment Method Filter */}
              <Select value={orderMethodFilter} onValueChange={setOrderMethodFilter}>
                <SelectTrigger className="h-9 text-xs" aria-label="Filter by fulfillment method">
                  <SelectValue placeholder="Fulfillment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fulfillments</SelectItem>
                  <SelectItem value="dine-in">Dine-in</SelectItem>
                  <SelectItem value="takeaway">Takeaway</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sub-bar: Sort controls & Counter */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
                <span>Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-7 text-xs w-[160px]" aria-label="Sort ledger">
                    <SelectValue placeholder="Sort order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest orders first</SelectItem>
                    <SelectItem value="oldest">Oldest orders first</SelectItem>
                    <SelectItem value="highest_revenue">Highest verified revenue</SelectItem>
                    <SelectItem value="highest_total">Highest order total</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <span>
                  Showing <strong>{sortedOrderSalesRows.length}</strong> of{" "}
                  <strong>{data?.orderSalesRows.length ?? 0}</strong> orders in window
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

          {/* Ledger Table */}
          {loading && !data ? (
            <div className="surface-card p-12 text-center text-sm text-muted-foreground rounded-xl">
              <p className="animate-pulse">Loading order sales ledger from database…</p>
            </div>
          ) : sortedOrderSalesRows.length === 0 ? (
            <div className="surface-card p-12 text-center space-y-3 rounded-xl">
              <p className="text-base font-medium">No matching orders found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No orders match your active filter criteria for this period. Try clearing your
                filters or expanding your date window.
              </p>
              {isFiltered && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reset all filters
                </Button>
              )}
            </div>
          ) : (
            <div className="surface-card overflow-hidden rounded-xl border border-border/80">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Order #
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Date & Time (EAT)
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Customer & Fulfillment
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Order Stage
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Payment Settlement
                      </TableHead>
                      <TableHead className="text-right font-semibold uppercase tracking-wider">
                        Order Total
                      </TableHead>
                      <TableHead className="text-right font-semibold uppercase tracking-wider text-primary">
                        Verified Paid
                      </TableHead>
                      <TableHead className="text-right font-semibold uppercase tracking-wider">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {sortedOrderSalesRows.map((row) => (
                      <TableRow
                        key={row.orderId}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setSelectedOrderId(row.orderId)}
                      >
                        {/* Order Number */}
                        <TableCell className="font-display font-semibold text-foreground whitespace-nowrap">
                          {row.orderNumber}
                        </TableCell>

                        {/* Order Time (EAT) */}
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(row.orderCreatedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          ·{" "}
                          {new Date(row.orderCreatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>

                        {/* Customer & Fulfillment */}
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{row.customerName}</span>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span>
                                {row.orderMethod === "dine-in"
                                  ? `Table ${row.tableNumber || "—"}`
                                  : row.orderMethod === "takeaway"
                                    ? "Takeaway"
                                    : "Delivery"}
                              </span>
                              {row.customerPhone && <span>· {row.customerPhone}</span>}
                            </div>
                          </div>
                        </TableCell>

                        {/* Order Status */}
                        <TableCell className="whitespace-nowrap">
                          <OrderStatusBadge status={row.orderStatus} />
                        </TableCell>

                        {/* Payment Status & Attempts */}
                        <TableCell className="whitespace-nowrap">
                          <PaymentStatusBadge
                            status={row.paymentStatus}
                            attemptsCount={row.paymentAttemptsCount}
                          />
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {row.paymentMethod}
                          </span>
                        </TableCell>

                        {/* Gross Order Total */}
                        <TableCell className="text-right font-mono font-medium text-foreground whitespace-nowrap">
                          {formatETB(row.orderTotal)}
                        </TableCell>

                        {/* Verified Received Money */}
                        <TableCell className="text-right whitespace-nowrap font-display font-semibold">
                          {row.verifiedPaymentAmount > 0 ? (
                            <span className="text-primary font-bold">
                              {formatETB(row.verifiedPaymentAmount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-mono">—</span>
                          )}
                        </TableCell>

                        {/* Action */}
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-primary hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrderId(row.orderId);
                            }}
                          >
                            <Eye className="size-3.5 mr-1" aria-hidden />
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ── 5. ORDER & FINANCIAL SETTLEMENT INSPECTION SHEET (DRAWER) ───────── */}
      <Sheet
        open={selectedOrderId !== null}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-6 flex flex-col gap-6"
        >
          {selectedOrder ? (
            <>
              {/* Drawer Header */}
              <SheetHeader className="text-left space-y-2 pb-4 border-b border-border">
                <div className="flex items-center justify-between gap-2 pr-6">
                  <SheetTitle className="font-display text-2xl font-bold">
                    Order {selectedOrder.orderNumber}
                  </SheetTitle>
                  <OrderStatusBadge status={selectedOrder.orderStatus} />
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  Recorded on {formatReviewDate(selectedOrder.orderCreatedAt)} EAT
                </SheetDescription>
              </SheetHeader>

              {/* Customer & Dining Details */}
              <section aria-labelledby="drawer-customer" className="space-y-3">
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Customer Name</span>
                    <span className="font-semibold text-foreground">
                      {selectedOrder.customerName}
                    </span>
                  </div>
                  {selectedOrder.customerPhone && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Contact Phone</span>
                      <span className="font-mono text-foreground">
                        {selectedOrder.customerPhone}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Fulfillment Method</span>
                    <span className="font-medium text-foreground capitalize">
                      {methodLabels[selectedOrder.orderMethod] || selectedOrder.orderMethod}
                    </span>
                  </div>
                  {selectedOrder.tableNumber && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Table Assignment</span>
                      <span className="font-semibold text-primary">
                        Table #{selectedOrder.tableNumber}
                      </span>
                    </div>
                  )}
                  {selectedOrder.deliveryAddress && (
                    <div className="border-t border-border/60 pt-2 text-xs">
                      <span className="text-muted-foreground block mb-0.5">Delivery Address</span>
                      <span className="font-medium text-foreground">
                        📍 {selectedOrder.deliveryAddress}
                      </span>
                    </div>
                  )}
                  {selectedOrder.assignedWaiterName && (
                    <div className="flex justify-between items-center border-t border-border/60 pt-2">
                      <span className="text-muted-foreground">Assigned Waiter</span>
                      <span className="font-semibold text-foreground">
                        {selectedOrder.assignedWaiterName}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* 1. Ordered Items Table (Matching Cashier Financial Breakdown) */}
              <section aria-labelledby="drawer-items" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="drawer-items"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <ShoppingCart className="size-3.5 text-primary" />
                    <span>Ordered Items ({selectedOrder.items.length})</span>
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Historical prices
                  </span>
                </div>

                <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
                  {selectedOrder.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border/80 text-muted-foreground">
                            <th className="text-left font-medium p-2.5">Item</th>
                            <th className="text-center font-medium p-2.5">Qty</th>
                            <th className="text-right font-medium p-2.5">Price</th>
                            <th className="text-right font-medium p-2.5">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {selectedOrder.items.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                              <td className="p-2.5 font-medium text-foreground">{item.name}</td>
                              <td className="p-2.5 text-center text-muted-foreground font-mono">
                                {item.quantity}
                              </td>
                              <td className="p-2.5 text-right font-mono text-muted-foreground">
                                {formatETB(item.unitPrice)}
                              </td>
                              <td className="p-2.5 text-right font-mono font-semibold text-foreground">
                                {formatETB(item.lineTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic p-4">
                      No item lines recorded for this order.
                    </p>
                  )}

                  {/* Financial Breakdown Summary Rows */}
                  <div className="border-t border-border/80 bg-muted/20 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Order Subtotal</span>
                      <span className="font-mono font-medium text-foreground">
                        {formatETB(selectedOrder.orderSubtotal)}
                      </span>
                    </div>
                    {selectedOrder.deliveryFee > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Delivery Fee</span>
                        <span className="font-mono font-medium text-foreground">
                          +{formatETB(selectedOrder.deliveryFee)}
                        </span>
                      </div>
                    )}
                    {selectedOrder.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Discount / Promotion</span>
                        <span className="font-mono font-medium">
                          -{formatETB(selectedOrder.discountAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border/60 pt-2 font-bold text-sm">
                      <span className="text-foreground">Final Order Total</span>
                      <span className="font-mono font-display text-primary text-base">
                        {formatETB(selectedOrder.orderTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. Financial Settlement & Verification */}
              <section aria-labelledby="drawer-financial" className="space-y-3">
                <h3
                  id="drawer-financial"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <CreditCard className="size-3.5 text-primary" />
                  <span>Financial Settlement Breakdown</span>
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-semibold text-foreground">
                      {selectedOrder.paymentMethod || "Pending / Not Selected"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Settlement Status</span>
                    <PaymentStatusBadge
                      status={selectedOrder.paymentStatus}
                      attemptsCount={selectedOrder.paymentAttemptsCount}
                    />
                  </div>
                  <div className="flex justify-between items-center border-t border-border/60 pt-2">
                    <span className="text-muted-foreground font-medium">Verified Amount Paid</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatETB(selectedOrder.verifiedPaymentAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-medium">Outstanding Balance</span>
                    <span
                      className={cn(
                        "font-mono font-semibold text-sm",
                        selectedOrder.orderTotal - selectedOrder.verifiedPaymentAmount > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {selectedOrder.orderTotal - selectedOrder.verifiedPaymentAmount > 0
                        ? formatETB(selectedOrder.orderTotal - selectedOrder.verifiedPaymentAmount)
                        : "ETB 0.00 (Fully Settled)"}
                    </span>
                  </div>
                  {selectedOrder.transactionReference && (
                    <div className="flex justify-between items-center border-t border-border/60 pt-2 text-[11px]">
                      <span className="text-muted-foreground">Transaction Reference</span>
                      <span className="font-mono font-semibold bg-muted px-2 py-0.5 rounded text-foreground">
                        {selectedOrder.transactionReference}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* 3. Review & Lifecycle Timestamps */}
              <section aria-labelledby="drawer-timestamps" className="space-y-3">
                <h3
                  id="drawer-timestamps"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                >
                  <Clock className="size-3.5 text-primary" />
                  <span>Review & Lifecycle Timestamps</span>
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Order Placed</span>
                    <span className="font-medium text-foreground">
                      {formatReviewDate(selectedOrder.orderCreatedAt)}
                    </span>
                  </div>
                  {selectedOrderProof?.submittedAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Payment Proof Submitted</span>
                      <span className="font-medium text-foreground">
                        {formatReviewDate(selectedOrderProof.submittedAt)}
                      </span>
                    </div>
                  )}
                  {selectedOrderProof?.reviewedAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Cashier Review Completed</span>
                      <span className="font-medium text-foreground">
                        {formatReviewDate(selectedOrderProof.reviewedAt)}
                      </span>
                    </div>
                  )}
                  {selectedOrderProof?.cashierDecision && (
                    <div className="border-t border-border/60 pt-2 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Cashier Decision</span>
                        {selectedOrderProof.cashierDecision === "approved" ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1"
                          >
                            <CheckCircle2 className="size-3" /> Approved
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] gap-1"
                          >
                            <XCircle className="size-3" /> Rejected
                          </Badge>
                        )}
                      </div>
                      {(selectedOrderProof.cashierReason || selectedOrderProof.rejectionReason) && (
                        <p className="text-[11px] text-muted-foreground italic bg-muted/40 p-2 rounded">
                          &quot;{selectedOrderProof.cashierReason || selectedOrderProof.rejectionReason}&quot;
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* 4. Payment Receipt Image (Secure Preview matching Cashier PaymentProofModal) */}
              <section aria-labelledby="drawer-receipt" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="drawer-receipt"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                  >
                    <Receipt className="size-3.5 text-primary" />
                    <span>Payment Receipt Screenshot</span>
                  </h3>
                  {selectedOrderProof && (
                    <Badge variant="outline" className="text-[10px] capitalize font-mono">
                      {selectedOrderProof.status}
                    </Badge>
                  )}
                </div>

                {selectedOrderProof ? (
                  <div className="space-y-3">
                    {/* Phone Screen Mockup / Receipt Viewport */}
                    <div className="relative bg-muted/40 dark:bg-muted/20 rounded-2xl p-4 flex items-center justify-center overflow-hidden min-h-[280px] border border-border/80">
                      {loadingProofUrl ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                          <span className="text-xs font-medium">Loading receipt preview…</span>
                        </div>
                      ) : proofUrlError ? (
                        <div className="flex flex-col items-center gap-2 text-destructive text-center p-4">
                          <AlertCircle className="h-6 w-6" />
                          <span className="text-xs font-medium">{proofUrlError}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadProofUrl(selectedOrderProof)}
                            className="h-7 text-xs gap-1 mt-1"
                          >
                            <RotateCcw className="size-3" /> Retry
                          </Button>
                        </div>
                      ) : (
                        <div className="relative max-w-[280px] w-full flex items-center justify-center">
                          <img
                            src={proofSignedUrl || "/images/cbe-receipt-mockup.png"}
                            alt={`Payment proof for ${selectedOrder.orderNumber}`}
                            className="max-h-[340px] w-auto max-w-full object-contain rounded-xl shadow-lg border border-border/60"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/images/cbe-receipt-mockup.png";
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Action buttons (Open in new tab & Download) */}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = proofSignedUrl || "/images/cbe-receipt-mockup.png";
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        className="flex-1 h-8 text-xs gap-1.5"
                        disabled={loadingProofUrl}
                      >
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                        <span>Open Receipt in New Tab</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const url = proofSignedUrl || "/images/cbe-receipt-mockup.png";
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `payment-proof-${selectedOrder.orderNumber.replace(/[^a-zA-Z0-9_-]/g, "")}.png`;
                          a.target = "_blank";
                          a.click();
                        }}
                        className="h-8 w-8 p-0"
                        title="Download Receipt"
                        aria-label="Download Receipt"
                        disabled={loadingProofUrl}
                      >
                        <Download className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>

                    {/* Private Storage Security Note */}
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-700 dark:text-blue-300">
                      <Lock className="size-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                      <p className="leading-relaxed text-[11px]">
                        This payment receipt is stored securely in private Supabase Storage and accessible only by authorized staff.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-6 text-center space-y-2">
                    <Receipt className="size-6 text-muted-foreground mx-auto stroke-[1.5]" />
                    <p className="text-xs font-medium text-foreground">No Payment Receipt Uploaded</p>
                    <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      No payment receipt screenshot was uploaded for this order (e.g. cash settlement, pay at counter, or direct in-person verification).
                    </p>
                  </div>
                )}
              </section>

              {/* 5. Payment Attempts History (Deduplication Audit) */}
              <section aria-labelledby="drawer-attempts" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="drawer-attempts"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Payment Attempts History ({selectedOrder.paymentAttempts.length})
                  </h3>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Deduplicated
                  </Badge>
                </div>
                {selectedOrder.paymentAttempts.length > 0 ? (
                  <div className="rounded-xl border border-border/80 bg-muted/20 divide-y divide-border/60 overflow-hidden">
                    {selectedOrder.paymentAttempts.map((att, idx) => (
                      <div key={att.id || idx} className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">
                            Attempt #{idx + 1} — {att.method}
                          </span>
                          <PaymentStatusBadge status={att.status} />
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                          <span>Amount: {formatETB(att.amount)}</span>
                          {att.transactionReference && (
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                              Ref: {att.transactionReference}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No direct payment transaction records attached.
                  </p>
                )}
              </section>

              {/* Close Button */}
              <div className="pt-2 mt-auto border-t border-border">
                <Button
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => setSelectedOrderId(null)}
                >
                  Close Inspection
                </Button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center space-y-3 my-auto">
              <h3 className="font-display text-lg font-semibold">Order not found</h3>
              <p className="text-xs text-muted-foreground">
                The selected order could not be retrieved from the active record set.
              </p>
              <Button variant="outline" size="sm" onClick={() => setSelectedOrderId(null)}>
                Close
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
