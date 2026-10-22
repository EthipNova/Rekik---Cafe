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
  Eye,
  FileCheck2,
  Filter,
  HelpCircle,
  Info,
  Layers,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCheck,
  UtensilsCrossed,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  type FinancialDatePreset,
  type OrderSalesRow,
  type PaymentProofAuditItem,
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

// Chart theme configuration using Rekik Café visual palette
const revenueChartConfig: ChartConfig = {
  verifiedRevenue: {
    label: "Verified Sales (ETB)",
    color: "#4E342E", // Primary Dark Brown
  },
  paidOrdersCount: {
    label: "Paid Orders",
    color: "#16a34a", // Success Green
  },
};

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
  const [activeTab, setActiveTab] = useState<"orders" | "proofs" | "governance">("orders");

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

  // Distinct payment methods from loaded data
  const availableMethods = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.orderSalesRows.forEach((r) => {
      if (r.paymentMethod) set.add(r.paymentMethod);
    });
    return Array.from(set);
  }, [data]);

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
      // Payment Method
      if (paymentMethodFilter !== "all" && r.paymentMethod !== paymentMethodFilter) {
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
                <button
                  type="button"
                  onClick={() => setActiveTab("proofs")}
                  className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  Audit queue →
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 3. VISUAL REPORTS & TRENDS (PHASE 3A & 3B) ──────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* 3A. Revenue Trend Chart (2 columns on large screens) */}
        <Card className="lg:col-span-2 shadow-xs">
          <CardHeader className="p-5 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="font-display text-base font-semibold">
                  Verified Revenue & Settlement Trend
                </CardTitle>
                <CardDescription className="text-xs">
                  Daily verified sales (ETB) and settled orders across the selected period (
                  {data?.window.label}).
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs gap-1 font-mono">
                <Calendar className="size-3" /> {data?.dailySalesTrend.length || 0} Days
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            {data && data.dailySalesTrend.length > 0 ? (
              <ChartContainer config={revenueChartConfig} className="h-[260px] w-full">
                <AreaChart
                  data={data.dailySalesTrend}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4E342E" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4E342E" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === "verifiedRevenue") {
                            return (
                              <span className="font-display font-bold text-primary">
                                {formatETB(Number(value))}
                              </span>
                            );
                          }
                          return (
                            <span className="font-medium text-foreground">{value} orders</span>
                          );
                        }}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="verifiedRevenue"
                    stroke="#4E342E"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#revenueGrad)"
                    name="verifiedRevenue"
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
                No verified sales recorded for this date window.
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3B. Channels & Payment Methods Distribution (1 column) */}
        <div className="space-y-6">
          {/* Payment Methods */}
          <Card className="shadow-xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                <span>Payment Channels</span>
                <Wallet className="size-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription className="text-xs">
                Verified revenue distribution by payment method
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              {data && data.paymentMethodBreakdown.length > 0 ? (
                data.paymentMethodBreakdown.map((m) => (
                  <div key={m.method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{m.method}</span>
                      <span className="font-semibold text-primary">
                        {formatETB(m.amount)}{" "}
                        <span className="text-muted-foreground font-normal">({m.percentage}%)</span>
                      </span>
                    </div>
                    <Progress value={m.percentage} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground">
                      {m.count} settled {m.count === 1 ? "order" : "orders"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  No settled payments in this period.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Fulfillment Channels */}
          <Card className="shadow-xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="font-display text-sm font-semibold flex items-center justify-between">
                <span>Fulfillment Channels</span>
                <UtensilsCrossed className="size-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription className="text-xs">
                Sales by dining preference (Dine-in, Takeaway, Delivery)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              {data && data.orderMethodBreakdown.length > 0 ? (
                data.orderMethodBreakdown.map((m) => (
                  <div key={m.method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground capitalize">
                        {m.method === "dine-in"
                          ? "🍽️ Dine-in"
                          : m.method === "takeaway"
                            ? "🛍️ Takeaway"
                            : "🛵 Delivery"}
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatETB(m.amount)}{" "}
                        <span className="text-muted-foreground font-normal">({m.percentage}%)</span>
                      </span>
                    </div>
                    <Progress value={m.percentage} className="h-1.5 bg-secondary" />
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  No orders recorded for this period.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 4. MAIN WORKSPACE TABS (LEDGER, PROOF AUDIT, GOVERNANCE) ───────── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "orders" | "proofs" | "governance")}
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
            <TabsTrigger value="proofs" className="text-xs gap-1.5">
              <FileCheck2 className="size-3.5" />
              <span>Payment Review Workload</span>
              {data && data.pendingPaymentReviewsCount > 0 && (
                <Badge variant="destructive" className="text-[10px] ml-1 px-1.5 py-0">
                  {data.pendingPaymentReviewsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="governance" className="text-xs gap-1.5">
              <Info className="size-3.5" />
              <span>Accounting Rules & KPIs</span>
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
                  {availableMethods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
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

        {/* ── TAB 2: PAYMENT REVIEW WORKLOAD (PHASE 3D) ────────────────────── */}
        <TabsContent value="proofs" className="space-y-4 m-0">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
            <Info className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                Monitoring View Only — Payment Proof Review Queue
              </p>
              <p>
                This monitoring interface provides business owners with full visibility into cashier
                review workloads and customer payment proof submissions. Cashier approvals and
                rejections are strictly managed through authorized cashier stations to uphold
                operational segregation of duties.
              </p>
            </div>
          </div>

          {data && data.paymentProofAudits.length === 0 ? (
            <EmptyState
              icon={<FileCheck2 className="size-8 text-muted-foreground" />}
              title="No payment proofs submitted yet"
              description="Customer mobile payment proof uploads will appear here for audit and cashier review."
            />
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
                        Customer
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Submitted Amount
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Transaction Ref
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Review Status
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Cashier Decision / Reason
                      </TableHead>
                      <TableHead className="font-semibold uppercase tracking-wider">
                        Submitted At
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {data?.paymentProofAudits.map((proof: PaymentProofAuditItem) => (
                      <TableRow key={proof.id} className="hover:bg-muted/30">
                        <TableCell className="font-display font-semibold text-foreground">
                          {proof.orderNumber}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {proof.customerName}
                        </TableCell>
                        <TableCell className="font-display font-semibold text-primary">
                          {formatETB(proof.submittedAmount)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {proof.transactionReference || "—"}
                        </TableCell>
                        <TableCell>
                          {proof.status === "approved" ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]"
                            >
                              <CheckCircle2 className="size-3" /> Approved
                            </Badge>
                          ) : proof.status === "rejected" ? (
                            <Badge variant="destructive" className="gap-1 text-[11px]">
                              <XCircle className="size-3" /> Rejected
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px]"
                            >
                              <Clock className="size-3" /> Pending Review
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          {proof.rejectionReason || proof.cashierReason ? (
                            <span className="text-destructive font-medium block truncate">
                              ⚠️ {proof.rejectionReason || proof.cashierReason}
                            </span>
                          ) : proof.status === "approved" ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Verified by Cashier
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">
                              Awaiting cashier review
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(proof.submittedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── TAB 3: ACCOUNTING RULES & KPI DEFINITIONS ─────────────────────── */}
        <TabsContent value="governance" className="space-y-4 m-0">
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                Financial Calculation Rules & Accounting Integrity
              </CardTitle>
              <CardDescription className="text-xs">
                Authoritative definitions and database-backed rules implemented for Rekik Café
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4 text-xs leading-relaxed text-muted-foreground divide-y divide-border/60">
              <div className="pt-2 space-y-1">
                <h4 className="font-semibold text-foreground text-sm">
                  1. Verified Net Revenue Definition
                </h4>
                <p>
                  Revenue is computed strictly from payments identified by the database as
                  successfully settled (`status IN ('paid', 'payment_verified', 'verified')`).
                  Payment proof uploads and screenshot submissions are <strong>never</strong>{" "}
                  counted as received cash until formally approved by an authorized cashier.
                </p>
              </div>

              <div className="pt-3 space-y-1">
                <h4 className="font-semibold text-foreground text-sm">
                  2. Payment Attempt Deduplication
                </h4>
                <p>
                  If an order has multiple payment attempts (e.g., initial failed mobile payment
                  followed by a successful CBE Birr retry), only the single verified settlement
                  amount is counted. The order is never counted multiple times in revenue or order
                  volume metrics.
                </p>
              </div>

              <div className="pt-3 space-y-1">
                <h4 className="font-semibold text-foreground text-sm">
                  3. Order Gross Total vs Verified Payment Separation
                </h4>
                <p>
                  The gross order total (`orders.total_amount`) represents customer cart billing.
                  The verified payment amount (`payments.amount`) represents actual collected funds.
                  These values are maintained distinctly across all tables to prevent phantom
                  balances.
                </p>
              </div>

              <div className="pt-3 space-y-1">
                <h4 className="font-semibold text-foreground text-sm">
                  4. Historical Price Snapshot Integrity
                </h4>
                <p>
                  Historical item-level reporting utilizes snapshot fields from `order_items`
                  (`unit_price` and `line_total` captured at checkout time). Future café menu price
                  updates will never rewrite or distort past accounting records.
                </p>
              </div>

              <div className="pt-3 space-y-1">
                <h4 className="font-semibold text-foreground text-sm">
                  5. Preceding Period Comparison & Timezone Standard
                </h4>
                <p>
                  All date filters and aggregations operate strictly under East Africa Time (EAT /
                  UTC+3, Hawassa, Ethiopia). Preceding comparison periods are computed using exact
                  identical time durations (e.g., 7 Days compares against the preceding 7 Days)
                  rather than naive calendar offsets.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── 5. ORDER & FINANCIAL SETTLEMENT INSPECTION SHEET (DRAWER) ───────── */}
      <Sheet
        open={selectedOrderId !== null}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-md md:max-w-lg overflow-y-auto p-6 flex flex-col gap-6"
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
                  Recorded on{" "}
                  {new Date(selectedOrder.orderCreatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  at{" "}
                  {new Date(selectedOrder.orderCreatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  EAT
                </SheetDescription>
              </SheetHeader>

              {/* Financial Settlement Overview */}
              <section aria-labelledby="drawer-financial" className="space-y-3">
                <h3
                  id="drawer-financial"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Financial Settlement Breakdown
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order Subtotal</span>
                    <span className="font-medium text-foreground">
                      {formatETB(selectedOrder.orderSubtotal)}
                    </span>
                  </div>
                  {selectedOrder.deliveryFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span className="font-medium text-foreground">
                        {formatETB(selectedOrder.deliveryFee)}
                      </span>
                    </div>
                  )}
                  {selectedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Discount</span>
                      <span>-{formatETB(selectedOrder.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border/60 pt-2 font-semibold text-sm">
                    <span>Order Total</span>
                    <span className="text-foreground">{formatETB(selectedOrder.orderTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/60 pt-2 items-center">
                    <span className="font-medium text-muted-foreground">Verified Received</span>
                    <span className="font-display text-lg font-bold text-primary">
                      {formatETB(selectedOrder.verifiedPaymentAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] pt-1 text-muted-foreground">
                    <span>Settlement Status</span>
                    <PaymentStatusBadge
                      status={selectedOrder.paymentStatus}
                      attemptsCount={selectedOrder.paymentAttemptsCount}
                    />
                  </div>
                </div>
              </section>

              {/* Payment Attempts History (Deduplication Audit) */}
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

              {/* Customer & Dining Details */}
              <section aria-labelledby="drawer-customer" className="space-y-3">
                <h3
                  id="drawer-customer"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Dining & Customer Details
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer Name</span>
                    <span className="font-medium text-foreground">
                      {selectedOrder.customerName}
                    </span>
                  </div>
                  {selectedOrder.customerPhone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="font-medium text-foreground">
                        {selectedOrder.customerPhone}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fulfillment</span>
                    <span className="font-medium text-foreground capitalize">
                      {selectedOrder.orderMethod}
                    </span>
                  </div>
                  {selectedOrder.tableNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Table</span>
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
                    <div className="flex justify-between border-t border-border/60 pt-2">
                      <span className="text-muted-foreground">Assigned Waiter</span>
                      <span className="font-semibold text-foreground">
                        {selectedOrder.assignedWaiterName}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Historical Order Items Snapshot */}
              <section aria-labelledby="drawer-items" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="drawer-items"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Historical Items Snapshot ({selectedOrder.items.length})
                  </h3>
                  <span className="text-[10px] text-muted-foreground">Price at order time</span>
                </div>

                {selectedOrder.items.length > 0 ? (
                  <div className="rounded-xl border border-border/80 bg-card/60 divide-y divide-border/60 overflow-hidden">
                    {selectedOrder.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 text-xs flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.quantity} × {formatETB(item.unitPrice)}
                          </p>
                        </div>
                        <span className="font-display font-semibold text-foreground shrink-0">
                          {formatETB(item.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No historical items recorded for this order.
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
