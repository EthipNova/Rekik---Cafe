/**
 * ============================================================================
 * Rekik Café — Category 1: Business Owner Overview Dashboard
 * File: src/routes/admin.index.tsx
 * ============================================================================
 * Implements the Business Owner Overview Dashboard adhering strictly to the
 * Rekik Café Supabase Workflow Guide:
 * - Real verified sales revenue (only paid/verified payments, zero fake data)
 * - 5-Stage Rekik Operational Workflow Tracking (Waiter -> Payment -> Cashier -> Fulfillment)
 * - Live Staff on Duty attendance monitoring (from staff_profiles)
 * - Responsive Recharts revenue trend with EAT (UTC+3) timezone date boundaries
 * - Recent orders with assigned waiter information and operational alert routing
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Eye,
  FileCheck2,
  Filter,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ToggleLeft,
  TrendingUp,
  UserCheck,
  Users,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatETB } from "@/lib/menu-data";
import { methodLabels, statusLabels, type Order, type OrderStatus } from "@/lib/orders";
import {
  loadOwnerDashboardData,
  type DateRangePreset,
  type OwnerDashboardData,
} from "@/lib/owner-dashboard";
import { readSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Owner Overview — Rekik Café" },
      {
        name: "description",
        content:
          "Authoritative business owner overview, verified revenue, and operational monitoring for Rekik Café.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RekikOwnerDashboard,
});

const chartConfig: ChartConfig = {
  revenue: {
    label: "Verified Sales (ETB)",
    color: "var(--primary)",
  },
};

function StatusWorkflowBadge({ status }: { status: OrderStatus }) {
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
          <span>{statusLabels[status] || "Verified"}</span>
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

function PaymentStatusPill({ status }: { status: "paid" | "pending" | "failed" | string }) {
  if (status === "paid") {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-semibold uppercase tracking-wider"
      >
        Paid
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold uppercase tracking-wider"
      >
        Pending
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px] font-semibold uppercase tracking-wider">
      Failed
    </Badge>
  );
}

function RekikOwnerDashboard() {
  const [data, setData] = useState<OwnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<DateRangePreset>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [, startTransition] = useTransition();

  // Read centralized store settings
  const settings = readSettings();
  const cafeName = settings.cafeName || "Rekik Café";

  const refreshData = useCallback(
    async (targetPreset = preset, start = customStart, end = customEnd) => {
      setLoading(true);
      setError(null);
      try {
        const res = await loadOwnerDashboardData(targetPreset, start, end);
        setData(res);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load dashboard metrics";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [preset, customStart, customEnd],
  );

  useEffect(() => {
    void refreshData(preset, customStart, customEnd);
  }, [preset, customStart, customEnd, refreshData]);

  const handlePresetChange = (newPreset: string) => {
    if (newPreset === "custom") {
      setShowCustomRange(true);
      setPreset("custom");
    } else {
      setShowCustomRange(false);
      setPreset(newPreset as DateRangePreset);
    }
  };

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      toast.error("Please specify both start and end dates.");
      return;
    }
    startTransition(() => {
      void refreshData("custom", customStart, customEnd);
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Top Header & Global Date Filters ─────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Rekik Café
            </h1>
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold px-2 py-0.5"
            >
              Owner Overview
            </Badge>
            <Badge
              variant="secondary"
              className="text-[11px] text-muted-foreground hidden lg:inline-flex items-center gap-1 font-mono"
            >
              <Clock className="size-3" /> Hawassa (EAT / UTC+3)
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Authoritative financial metrics, operational workflow tracking, and staff duty monitor.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg p-1 shadow-xs">
            <Filter className="size-3.5 text-muted-foreground ml-1.5" aria-hidden />
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger
                id="owner-date-filter"
                aria-label="Filter dashboard by date range"
                className="h-8 border-none shadow-none text-xs font-medium focus:ring-0 focus:ring-offset-0 px-2 min-w-[130px]"
              >
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshData(preset, customStart, customEnd)}
            disabled={loading}
            aria-label="Refresh dashboard data"
            className="h-8 gap-1.5 text-xs shadow-xs"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin text-primary")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {/* ── Custom Date Range Inputs (when 'custom' preset is selected) ───── */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustomDates}
          className="surface-card flex flex-wrap items-end gap-3 p-3.5 sm:p-4 text-xs animate-in fade-in"
        >
          <div className="space-y-1">
            <Label htmlFor="custom-start" className="text-xs text-muted-foreground">
              From Date
            </Label>
            <Input
              id="custom-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 text-xs w-36"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-end" className="text-xs text-muted-foreground">
              To Date
            </Label>
            <Input
              id="custom-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 text-xs w-36"
              required
            />
          </div>
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={loading}>
            Apply Range
          </Button>
        </form>
      )}

      {/* ── Error Banner & Retry ─────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Unable to load live dashboard records</p>
              <p className="text-xs opacity-90">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshData(preset, customStart, customEnd)}
            className="h-8 text-xs border-destructive/30 hover:bg-destructive/15 text-destructive"
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* ── Primary Business KPI Cards ───────────────────────────────────── */}
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">
          Business Performance Key Metrics
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {/* 1. Verified Sales Revenue */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between border-primary/20 shadow-xs relative overflow-hidden group hover:border-primary/40 transition-colors">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Verified Sales</span>
                <DollarSign className="size-3.5 text-primary" aria-hidden />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1.5 text-foreground">
                  {formatETB(data?.periodSalesRevenue ?? 0)}
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span className="truncate">{data?.range.label || "Period"}</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {data?.paidOrdersCount ?? 0} paid
              </span>
            </div>
          </Card>

          {/* 2. Today's Revenue */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Today&apos;s Revenue</span>
                <Calendar className="size-3.5" aria-hidden />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-24 mt-2" />
              ) : (
                <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1.5 text-foreground">
                  {formatETB(data?.todaySalesRevenue ?? 0)}
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span>Today&apos;s Orders</span>
              <span className="font-medium text-foreground">{data?.todayOrdersCount ?? 0}</span>
            </div>
          </Card>

          {/* 3. Orders in Period */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Total Orders</span>
                <ShoppingBag className="size-3.5" aria-hidden />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1.5 text-foreground">
                  {data?.periodOrdersCount ?? 0}
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span>Avg Value (AOV)</span>
              <span className="font-medium text-foreground">
                {formatETB(data?.averageOrderValue ?? 0)}
              </span>
            </div>
          </Card>

          {/* 4. Staff On Duty */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Staff On Duty</span>
                <UserCheck className="size-3.5 text-emerald-600" aria-hidden />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <div className="flex items-baseline gap-2 mt-1.5">
                  <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                    {data?.staffOnDutyCount ?? 0}
                  </p>
                  <span className="text-xs text-muted-foreground">available</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              {data && data.totalStaffProfiles > 0 ? (
                <>
                  <span>{data.staffOnDutyRoles.waiters} Waiter(s)</span>
                  <span>{data.staffOnDutyRoles.cashiers} Cashier(s)</span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">
                  Shift tracking live in staff_profiles
                </span>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* ── Rekik 5-Stage Operational Workflow Tracker ───────────────────── */}
      <section aria-labelledby="workflow-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2
              id="workflow-heading"
              className="font-display text-base sm:text-lg font-semibold tracking-tight"
            >
              Rekik Operational Workflow Stages
            </h2>
            <p className="text-xs text-muted-foreground">
              End-to-end order progression from customer placement through waiter review, payment
              verification, and completion.
            </p>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
          >
            <span>Live Kitchen Board</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {data?.workflowStages.map((stage) => (
            <Card
              key={stage.id}
              className={cn(
                "p-3.5 sm:p-4 flex flex-col justify-between border transition-all hover:shadow-xs",
                stage.count > 0 ? "border-border/80" : "opacity-80 border-border/40",
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <h3 className="font-semibold text-xs sm:text-sm text-foreground line-clamp-1">
                    {stage.title}
                  </h3>
                  <Badge
                    variant={
                      stage.statusCategory === "issues" && stage.count > 0
                        ? "destructive"
                        : stage.count > 0
                          ? "outline"
                          : "secondary"
                    }
                    className="text-xs shrink-0 font-mono"
                  >
                    {stage.count}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {stage.description}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="text-[11px] text-muted-foreground">Pipeline Value</span>
                <span className="font-medium text-foreground font-mono">
                  {formatETB(stage.totalValue)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Sales Overview Chart & Operational Alerts (2-Column Grid) ────── */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Left: Verified Revenue Trend Chart */}
        <Card className="p-4 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="font-display text-base sm:text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" aria-hidden />
                  <span>Verified Sales Trend</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Daily revenue based strictly on approved and verified payments for{" "}
                  {data?.range.label.toLowerCase() || "selected period"}.
                </CardDescription>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-muted-foreground block">Peak Day Sales</span>
                <span className="font-mono text-xs sm:text-sm font-semibold text-foreground">
                  {formatETB(data?.peakDayRevenue ?? 0)}
                </span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="mt-6">
              {loading && !data ? (
                <div className="h-56 flex items-center justify-center">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : !data || data.salesTrend.length === 0 || data.periodSalesRevenue === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
                  <DollarSign className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-semibold text-foreground">
                    No verified sales in this range
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5">
                    No orders reached paid or verified status within{" "}
                    {data?.range.label.toLowerCase() || "the selected period"}.
                  </p>
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-56 w-full">
                  <AreaChart
                    data={data.salesTrend}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                      tickFormatter={(val) =>
                        `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                      }
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => `Date: ${label}`}
                          formatter={(value) => [formatETB(Number(value)), "Verified Sales"]}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#revenueFill)"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Aggregated Period Total:{" "}
              <strong className="text-foreground font-mono">
                {formatETB(data?.periodSalesRevenue ?? 0)}
              </strong>
            </span>
            <span className="text-[11px]">Updated at {data?.lastUpdated || "—"}</span>
          </div>
        </Card>

        {/* Right: Operational Summary & Alerts — Showing Only Rejected Orders (Task 3) */}
        <Card className="p-4 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-base sm:text-lg font-semibold flex items-center gap-2">
                <AlertCircle className="size-4 text-destructive" aria-hidden />
                <span>Operational Alerts</span>
              </CardTitle>
              <Badge
                variant={data && data.rejectedOrdersCount > 0 ? "destructive" : "outline"}
                className="text-xs font-mono"
              >
                {data?.rejectedOrdersCount ?? 0} rejected
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Live rejected orders requiring staff review or cancellation inspection.
            </CardDescription>

            <div className="mt-4 space-y-2.5">
              {loading && !data ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : data?.ordersError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
                  <AlertCircle className="size-5 text-destructive mx-auto" />
                  <p className="text-xs font-semibold text-destructive">
                    Unable to load rejected orders
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                    {data.ordersError}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => void refreshData(preset, customStart, customEnd)}
                  >
                    <RefreshCw className="size-3" /> Retry
                  </Button>
                </div>
              ) : !data || data.rejectedOrdersCount === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-emerald-500/5 p-6 text-center">
                  <CheckCircle2 className="size-7 text-emerald-600 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-foreground">
                    All operational pipelines clear
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    No rejected orders requiring attention at this moment.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {data.rejectedOrders.map((order) => {
                    const reason =
                      order.waiterRejectionReason ||
                      order.paymentProof?.rejectionReason ||
                      "Order was rejected";
                    return (
                      <Link
                        key={order.id}
                        to="/admin/orders"
                        className="flex items-start justify-between gap-3 p-3 rounded-lg border border-destructive/25 bg-card hover:bg-destructive/5 transition-colors group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              Order #{order.number} — {order.customer.name || "Guest Diner"}
                            </p>
                            <p className="text-[11px] text-muted-foreground line-clamp-1">
                              Reason: {reason}
                            </p>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(order.createdAt).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              • {formatETB(order.total)}
                            </span>
                          </div>
                        </div>
                        <Badge variant="destructive" className="shrink-0 text-xs font-mono">
                          Rejected
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <Link
              to="/admin/orders"
              className="text-primary font-medium hover:underline inline-flex items-center gap-1"
            >
              <span>View all in Orders Board</span>
              <ArrowRight className="size-3" />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
              onClick={() => void refreshData(preset, customStart, customEnd)}
              disabled={loading}
            >
              <RefreshCw className={cn("size-3", loading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Recent Orders Table (Authoritative Real Records) ─────────────── */}
      <section aria-labelledby="recent-orders-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              id="recent-orders-heading"
              className="font-display text-base sm:text-lg font-semibold tracking-tight"
            >
              Recent Orders
            </h2>
            <p className="text-xs text-muted-foreground">
              Real orders synchronized with Supabase database records.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
            <Link to="/admin/orders">
              <span>Open Orders Board</span>
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>

        <Card className="overflow-hidden shadow-xs border-border/80">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-secondary/30">
                <TableRow className="text-xs">
                  <TableHead className="w-[110px]">Order #</TableHead>
                  <TableHead className="min-w-[140px]">Customer / Table</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Assigned Waiter</TableHead>
                  <TableHead>Workflow Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[80px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-4 w-16 ml-auto" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-7 w-12 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : !data || data.recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-12 text-sm text-muted-foreground"
                    >
                      <div className="max-w-sm mx-auto space-y-2">
                        <ShoppingBag className="size-8 text-muted-foreground/40 mx-auto" />
                        <p className="font-semibold text-foreground">No orders in database</p>
                        <p className="text-xs text-muted-foreground">
                          As new orders are placed by customers, they will appear here in real-time.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.recentOrders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="text-xs hover:bg-secondary/20 transition-colors"
                    >
                      <TableCell className="font-mono font-semibold text-foreground">
                        {order.number}
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          {new Date(order.createdAt).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {order.customer.name || "Guest Diner"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {order.customer.table
                            ? `Table ${order.customer.table}`
                            : order.customer.address
                              ? "Delivery Order"
                              : order.customer.phone || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="capitalize text-muted-foreground">
                          {methodLabels[order.method] || order.method}
                        </span>
                      </TableCell>
                      <TableCell>
                        {order.waiterName ? (
                          <Badge variant="outline" className="text-[11px] font-normal gap-1">
                            <UtensilsCrossed className="size-2.5 text-muted-foreground" />
                            <span>{order.waiterName}</span>
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusWorkflowBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <PaymentStatusPill status={order.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-foreground">
                        {formatETB(order.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <Link to="/admin/orders">
                            <Eye className="size-3.5" />
                            <span className="sr-only">View order {order.number}</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>
    </div>
  );
}
