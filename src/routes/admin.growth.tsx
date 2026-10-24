/**
 * ============================================================================
 * Rekik Café — Category 5: Business Performance & Growth Console
 * File: src/routes/admin.growth.tsx
 * ============================================================================
 * Implements the Business Owner Performance & Growth console:
 * - Multi-period sales comparisons (Today, 7 Days, 30 Days, Custom) in EAT (UTC+3)
 * - Verified sales revenue reusing deduplicated Category 2 payment logic
 * - Order volume, AOV, and fulfillment vs cancellation friction rates
 * - Best-selling menu items by volume and revenue, with rising/declining trends
 * - Category performance breakdowns with top item highlights
 * - Customer dynamics: new vs returning patrons, frequency distribution, privacy-masked loyalty table
 * - Menu availability vs physical inventory alignment (Category 4 integration)
 * - Transparent schema gap disclosure for promotion attribution and recipe BOM
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Award,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Flame,
  HelpCircle,
  Info,
  Layers,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/site/Section";
import { cn } from "@/lib/utils";
import { formatETB } from "@/lib/customers";
import {
  loadBusinessGrowthData,
  type BusinessGrowthData,
  type FinancialDatePreset,
  type PeriodComparisonMetric,
  type ProductPerformanceItem,
} from "@/lib/business-growth";
import { readSettings } from "@/lib/settings";

export const Route = createFileRoute("/admin/growth")({
  head: () => ({
    meta: [
      { title: "Business Performance & Growth — Rekik Café Admin" },
      {
        name: "description",
        content:
          "Authoritative business performance, revenue trends, top-selling items, customer retention, and growth analytics for Rekik Café.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminGrowthPage,
});

/**
 * Visual badge showing percentage delta vs equivalent preceding period
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
        <ArrowUpRight className="size-3 shrink-0" aria-hidden />
      ) : (
        <ArrowDownRight className="size-3 shrink-0" aria-hidden />
      )}
      {metric.percentageChange > 0 ? `+${metric.percentageChange}%` : `${metric.percentageChange}%`}
    </span>
  );
}

function AdminGrowthPage() {
  const [data, setData] = useState<BusinessGrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Date filters
  const [preset, setPreset] = useState<FinancialDatePreset>("7days");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [showCustomRange, setShowCustomRange] = useState(false);

  // Search & sorting on products
  const [productSearch, setProductSearch] = useState("");
  const [productSortBy, setProductSortBy] = useState<"revenue" | "volume" | "trend" | "name">(
    "revenue",
  );
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");

  // Read cafe name from settings
  const cafeName = useMemo(() => {
    try {
      const s = readSettings();
      return s.cafeName || "Rekik Café";
    } catch {
      return "Rekik Café";
    }
  }, []);

  const loadData = useCallback(
    async (selectedPreset: FinancialDatePreset = preset, cStart?: string, cEnd?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await loadBusinessGrowthData(selectedPreset, cStart, cEnd);
        startTransition(() => {
          setData(result);
          setLoading(false);
        });
      } catch (err: unknown) {
        console.error("[growth] Error loading business growth data:", err);
        setError(err instanceof Error ? err.message : "Failed to query business performance data.");
        setLoading(false);
        toast.error("Failed to refresh growth records.");
      }
    },
    [preset],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePresetChange = (newVal: string) => {
    const p = newVal as FinancialDatePreset;
    setPreset(p);
    if (p === "custom") {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
      void loadData(p);
    }
  };

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      toast.error("Please specify both start and end dates.");
      return;
    }
    if (new Date(customStart) > new Date(customEnd)) {
      toast.error("Start date must be before or equal to end date.");
      return;
    }
    void loadData("custom", customStart, customEnd);
  };

  // Filtered & Sorted products list
  const filteredProducts = useMemo(() => {
    if (!data) return [];
    let list = [...data.productPerformance];

    if (productCategoryFilter !== "all") {
      list = list.filter((p) => p.categorySlug === productCategoryFilter);
    }

    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      if (productSortBy === "revenue") return b.totalRevenue - a.totalRevenue;
      if (productSortBy === "volume") return b.quantitySold - a.quantitySold;
      if (productSortBy === "name") return a.name.localeCompare(b.name);
      if (productSortBy === "trend") {
        return (b.trendDiffPct ?? 0) - (a.trendDiffPct ?? 0);
      }
      return 0;
    });

    return list;
  }, [data, productCategoryFilter, productSearch, productSortBy]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── 1. HEADER & PERIOD CONTROLS ────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-border/40 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Business Performance & Growth
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
            <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5">
              Category 5 Console
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Authoritative sales volume, category contributions, customer dynamics, and verified
            growth analytics.
          </p>
        </div>

        {/* Global Date Range Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg p-1 shadow-xs">
            <Filter className="size-3.5 text-muted-foreground ml-1.5" aria-hidden />
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger
                id="growth-date-filter"
                aria-label="Filter performance report by date range"
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
            aria-label="Refresh performance records from database"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {/* ── Custom Date Range Inputs ────────────────────────────────────────── */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustomDates}
          className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1">
            <label
              htmlFor="custom-growth-start"
              className="text-xs font-medium text-muted-foreground"
            >
              Start Date (EAT)
            </label>
            <Input
              id="custom-growth-start"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 text-xs w-[145px]"
              required
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="custom-growth-end"
              className="text-xs font-medium text-muted-foreground"
            >
              End Date (EAT)
            </label>
            <Input
              id="custom-growth-end"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 text-xs w-[145px]"
              required
            />
          </div>
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={loading}>
            <Calendar className="size-3.5" />
            Apply Window
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Compares against an equivalent preceding {preset === "custom" ? "window" : "duration"}.
          </span>
        </form>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <AlertCircle className="size-8 text-destructive mx-auto" />
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Unable to load business performance records
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button onClick={() => void loadData()} size="sm" className="gap-2">
            <RefreshCw className="size-3.5" aria-hidden />
            Retry database query
          </Button>
        </div>
      )}

      {/* ── 2. PRIMARY PERFORMANCE KPI CARDS ─────────────────────────────────── */}
      <section aria-labelledby="growth-kpi-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="growth-kpi-heading"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Performance Overview ({data?.window.label || "Selected Window"} vs.{" "}
            {data?.window.prevLabel || "Prior Window"})
          </h2>
          {data && (
            <span className="text-[11px] text-muted-foreground">Calculated in EAT (UTC+3)</span>
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
                {data ? formatETB(data.kpis.verifiedRevenue.current) : "—"}
              </p>
              <div className="flex items-center justify-between gap-1">
                {data && <ComparisonTrendBadge metric={data.kpis.verifiedRevenue} />}
                <span className="text-[11px] text-muted-foreground truncate">
                  Prev: {data ? formatETB(data.kpis.verifiedRevenue.previous) : "—"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Strictly paid settlements. Unverified proofs & retries excluded.
              </p>
            </CardContent>
          </Card>

          {/* KPI 2: Order Fulfillment & Rejection */}
          <Card className="border-l-4 border-l-emerald-500 shadow-xs">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed Orders
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShoppingBag className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-foreground">
                  {data ? data.kpis.completedOrders.current : "—"}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  / {data ? data.kpis.totalOrdersPlaced.current : "—"} placed
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                {data && <ComparisonTrendBadge metric={data.kpis.completedOrders} />}
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {data ? `${data.kpis.completionRatePct.current}% fulfilled` : "—"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug flex items-center justify-between">
                <span>Completed transactions</span>
                {data && data.kpis.cancelledOrRejectedOrders.current > 0 && (
                  <span className="text-destructive font-medium">
                    {data.kpis.cancelledOrRejectedOrders.current} cancelled
                  </span>
                )}
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
                <Coins className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <p className="font-display text-2xl font-bold tracking-tight text-foreground">
                {data ? formatETB(data.kpis.averageOrderValue.current) : "—"}
              </p>
              <div className="flex items-center justify-between gap-1">
                {data && <ComparisonTrendBadge metric={data.kpis.averageOrderValue} />}
                <span className="text-[11px] text-muted-foreground truncate">
                  Prev: {data ? formatETB(data.kpis.averageOrderValue.previous) : "—"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug">
                Verified revenue divided strictly by completed orders.
              </p>
            </CardContent>
          </Card>

          {/* KPI 4: Customer Retention & Dynamics */}
          <Card className="border-l-4 border-l-amber-500 shadow-xs">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer Dynamics
              </span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Users className="size-4" aria-hidden />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold text-foreground">
                  {data ? `${data.customerDynamics.returningCustomerRatePct}%` : "—"}
                </span>
                <span className="text-xs font-medium text-muted-foreground">repeat rate</span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {data?.customerDynamics.newCustomersCount.current ?? 0} new
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  {data?.customerDynamics.returningCustomersCount.current ?? 0} returning
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-1.5 leading-snug truncate">
                {data?.customerDynamics.unidentifiedDinersCount.current ?? 0} unrecorded phone
                walk-ins
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 3. DAILY REVENUE & ORDER TREND CHART ─────────────────────────────── */}
      <section aria-labelledby="trend-heading" className="space-y-3">
        <Card className="shadow-xs">
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle id="trend-heading" className="text-base font-semibold">
                  Verified Daily Sales Trend
                </CardTitle>
                <CardDescription className="text-xs">
                  Daily net receipts (ETB) and order volume across the selected window.
                </CardDescription>
              </div>
              {data && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-primary" />
                    <span className="text-muted-foreground">Net Revenue (ETB)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">Orders Placed</span>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <RefreshCw className="size-6 text-muted-foreground animate-spin" />
              </div>
            ) : data && data.dailyTrends.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.dailyTrends}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="growthRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4E342E" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4E342E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
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
                      tickFormatter={(val) => (val >= 1000 ? `${val / 1000}k` : `${val}`)}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const p = payload[0]?.payload;
                          return (
                            <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1">
                              <p className="font-semibold text-popover-foreground">{p.label}</p>
                              <div className="flex items-center justify-between gap-4 text-primary font-medium">
                                <span>Verified Revenue:</span>
                                <span>{formatETB(p.verifiedRevenue)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                                <span>Completed Orders:</span>
                                <span>
                                  {p.completedOrdersCount} / {p.ordersCount} total
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="verifiedRevenue"
                      stroke="#4E342E"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#growthRevenueGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                No orders recorded during this timeframe.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── 4. DETAILED TABS: INSIGHTS, PRODUCTS, CUSTOMERS, INVENTORY ──────── */}
      <Tabs defaultValue="insights" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1 bg-muted/60">
          <TabsTrigger value="insights" className="text-xs py-2 gap-1.5">
            <Sparkles className="size-3.5" />
            <span>Growth Insights</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="text-xs py-2 gap-1.5">
            <UtensilsCrossed className="size-3.5" />
            <span>Products & Categories</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="text-xs py-2 gap-1.5">
            <Users className="size-3.5" />
            <span>Customer Dynamics</span>
          </TabsTrigger>
          <TabsTrigger value="operations" className="text-xs py-2 gap-1.5">
            <Boxes className="size-3.5" />
            <span>Inventory Alignment & Gaps</span>
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: OVERVIEW & GROWTH INSIGHTS ────────────────────────────── */}
        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Left: Dynamic Factual Growth Insights */}
            <Card className="shadow-xs">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span>Authoritative Growth Observations</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Derived directly from recorded settlements and menu activity.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-3">
                {data && data.insights.length > 0 ? (
                  data.insights.map((ins) => (
                    <div
                      key={ins.id}
                      className={cn(
                        "rounded-lg border p-3 text-xs space-y-1 transition-colors",
                        ins.type === "growth" && "border-emerald-500/20 bg-emerald-500/5",
                        ins.type === "warning" && "border-destructive/20 bg-destructive/5",
                        ins.type === "opportunity" && "border-blue-500/20 bg-blue-500/5",
                        ins.type === "info" && "border-border/60 bg-card",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          {ins.type === "growth" && (
                            <TrendingUp className="size-3.5 text-emerald-600" />
                          )}
                          {ins.type === "warning" && (
                            <AlertTriangle className="size-3.5 text-destructive" />
                          )}
                          {ins.type === "opportunity" && (
                            <Flame className="size-3.5 text-blue-600" />
                          )}
                          {ins.type === "info" && (
                            <Info className="size-3.5 text-muted-foreground" />
                          )}
                          {ins.title}
                        </span>
                        {ins.metricBadge && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold px-1.5 py-0"
                          >
                            {ins.metricBadge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{ins.description}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No significant variance detected for this period.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Right: Hero Performers & Health Checklist */}
            <div className="space-y-4">
              <Card className="shadow-xs">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Award className="size-4 text-amber-500" />
                    <span>Top Revenue Generator</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Leading product contribution in selected period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  {data && data.topProductsByRevenue[0] ? (
                    <div className="rounded-lg border border-border/80 bg-card p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-display font-semibold text-base text-foreground">
                            {data.topProductsByRevenue[0].name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {data.topProductsByRevenue[0].categoryName} ·{" "}
                            {formatETB(data.topProductsByRevenue[0].unitPrice)}
                          </p>
                        </div>
                        <Badge className="bg-primary text-primary-foreground font-semibold text-xs">
                          {data.topProductsByRevenue[0].percentOfTotalRevenue}% of Sales
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                        <div>
                          <span className="text-muted-foreground">Volume Sold:</span>
                          <p className="font-semibold text-foreground">
                            {data.topProductsByRevenue[0].quantitySold} units
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Revenue:</span>
                          <p className="font-semibold text-primary">
                            {formatETB(data.topProductsByRevenue[0].totalRevenue)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">
                      No sales recorded for this period.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Quick Operational Status */}
              <Card className="shadow-xs">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="size-4 text-blue-500" />
                    <span>Operational Alignment Checklist</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">Active Menu Items</span>
                    <span className="font-semibold text-foreground">
                      {data?.operationalAlignment.availableMenuProducts ?? 0} /{" "}
                      {data?.operationalAlignment.totalMenuProducts ?? 0} available
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">Tracked Inventory Units</span>
                    <span className="font-semibold text-foreground">
                      {data?.operationalAlignment.trackedProductsCount ?? 0} products monitored
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">Uninitialized Opening Stock</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {data?.operationalAlignment.uninitializedStockCount ?? 0} items pending count
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground">Physical Out-of-Stock</span>
                    <span className="font-semibold text-foreground">
                      {data?.operationalAlignment.physicalOutOfStockCount ?? 0} items
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 2: PRODUCT & CATEGORY PERFORMANCE ────────────────────────── */}
        <TabsContent value="products" className="space-y-4">
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Menu Product Sales & Growth Trajectory
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ranks items by revenue, volume sold, and period-over-period trend.
                  </CardDescription>
                </div>

                {/* Filter & Search Bar */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search product…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="h-8 pl-8 text-xs w-[160px] sm:w-[200px]"
                    />
                  </div>

                  <Select value={productCategoryFilter} onValueChange={setProductCategoryFilter}>
                    <SelectTrigger className="h-8 text-xs w-[130px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {data?.categoryPerformance.map((c) => (
                        <SelectItem key={c.categoryId} value={c.categorySlug}>
                          {c.categoryName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={productSortBy}
                    onValueChange={(val: "revenue" | "volume" | "trend" | "name") =>
                      setProductSortBy(val)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs w-[130px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Highest Revenue</SelectItem>
                      <SelectItem value="volume">Highest Volume</SelectItem>
                      <SelectItem value="trend">Top Growth Trend</SelectItem>
                      <SelectItem value="name">Product Name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs hover:bg-transparent">
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-center">Trend vs Prev</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                      <TableHead className="w-[120px]">Revenue Share</TableHead>
                      <TableHead className="text-center">Catalog Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((p, idx) => (
                        <TableRow key={p.productId} className="text-xs hover:bg-muted/40">
                          <TableCell className="font-mono text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                          <TableCell className="text-muted-foreground">{p.categoryName}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatETB(p.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right font-semibold font-mono">
                            {p.quantitySold}
                          </TableCell>
                          <TableCell className="text-center">
                            {p.trendDirection === "rising" && (
                              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none text-[10px] gap-0.5">
                                <ArrowUpRight className="size-3" />
                                {p.trendDiffPct !== null ? `+${p.trendDiffPct}%` : "Rising"}
                              </Badge>
                            )}
                            {p.trendDirection === "declining" && (
                              <Badge className="bg-destructive/10 text-destructive border-none text-[10px] gap-0.5">
                                <ArrowDownRight className="size-3" />
                                {p.trendDiffPct !== null ? `${p.trendDiffPct}%` : "Down"}
                              </Badge>
                            )}
                            {p.trendDirection === "new" && (
                              <Badge
                                variant="outline"
                                className="border-blue-500 text-blue-600 text-[10px]"
                              >
                                New in period
                              </Badge>
                            )}
                            {p.trendDirection === "steady" && (
                              <span className="text-muted-foreground text-[10px]">Steady</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary font-mono">
                            {formatETB(p.totalRevenue)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Progress value={p.percentOfTotalRevenue} className="h-1.5" />
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {p.percentOfTotalRevenue}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={p.isAvailable ? "outline" : "secondary"}
                              className={cn(
                                "text-[10px] font-medium",
                                p.isAvailable
                                  ? "border-emerald-500/40 text-emerald-600"
                                  : "text-muted-foreground bg-muted",
                              )}
                            >
                              {p.isAvailable ? "Available" : "Unavailable"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                          No matching product sales recorded.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Category Performance Breakdown */}
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-semibold">
                Category Sales & Contribution Distribution
              </CardTitle>
              <CardDescription className="text-xs">
                Aggregate performance across menu departments.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs hover:bg-transparent">
                      <TableHead>Category Name</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Total Units Sold</TableHead>
                      <TableHead className="text-right">Total Sales (ETB)</TableHead>
                      <TableHead className="w-[140px]">Sales Share</TableHead>
                      <TableHead>Top Selling Item</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.categoryPerformance.map((c) => (
                      <TableRow key={c.categoryId} className="text-xs hover:bg-muted/40">
                        <TableCell className="font-medium text-foreground">
                          {c.categoryName}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono">
                          {c.productCount}
                        </TableCell>
                        <TableCell className="text-right font-semibold font-mono">
                          {c.quantitySold}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary font-mono">
                          {formatETB(c.totalRevenue)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Progress value={c.percentOfTotalRevenue} className="h-1.5" />
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {c.percentOfTotalRevenue}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.topProduct ? (
                            <span>
                              <strong className="text-foreground">{c.topProduct.name}</strong> (
                              {c.topProduct.quantity} sold · {formatETB(c.topProduct.revenue)})
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: CUSTOMER DYNAMICS ─────────────────────────────────────── */}
        <TabsContent value="customers" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Metric 1: Identified Customers */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Identified Diners
                </span>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-1">
                <p className="font-display text-2xl font-bold text-foreground">
                  {data?.customerDynamics.totalCustomersIdentified.current ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Customers with authenticated ID or verified phone.
                </p>
              </CardContent>
            </Card>

            {/* Metric 2: New Patrons */}
            <Card className="shadow-xs border-l-4 border-l-emerald-500">
              <CardHeader className="p-4 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  New Customers
                </span>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-1">
                <p className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {data?.customerDynamics.newCustomersCount.current ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  First-ever recorded order placed in selected window.
                </p>
              </CardContent>
            </Card>

            {/* Metric 3: Returning Patrons */}
            <Card className="shadow-xs border-l-4 border-l-blue-500">
              <CardHeader className="p-4 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Returning Patrons
                </span>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-1">
                <p className="font-display text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {data?.customerDynamics.returningCustomersCount.current ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Ordered in period and had previous lifetime visits.
                </p>
              </CardContent>
            </Card>

            {/* Metric 4: Unidentified Diners */}
            <Card className="shadow-xs">
              <CardHeader className="p-4 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Unidentified Walk-ins
                </span>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-1">
                <p className="font-display text-2xl font-bold text-muted-foreground">
                  {data?.customerDynamics.unidentifiedDinersCount.current ?? 0}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Transactions without phone or customer profile link.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Visit Frequency Distribution */}
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-semibold">
                Customer Dining Frequency Distribution
              </CardTitle>
              <CardDescription className="text-xs">
                How often identified customers ordered during this reporting window.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {data?.customerDynamics.frequencyDistribution.map((b) => (
                  <div
                    key={b.bracket}
                    className="rounded-lg border border-border/80 bg-card p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground">{b.bracket}</span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {b.customerCount} diners ({b.percentage}%)
                      </Badge>
                    </div>
                    <Progress value={b.percentage} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {b.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Loyal Customers Table */}
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Top Loyal Customers in Period
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Privacy-masked telephone records and verified transaction spend.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild className="h-7 text-xs gap-1">
                  <Link to="/admin/customers">
                    <span>Full Customer CRM</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs hover:bg-transparent">
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Phone (Masked)</TableHead>
                      <TableHead className="text-right">Orders in Period</TableHead>
                      <TableHead className="text-right">Period Spend</TableHead>
                      <TableHead className="text-right">Lifetime Orders</TableHead>
                      <TableHead className="text-right">Lifetime Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data && data.customerDynamics.topLoyalCustomers.length > 0 ? (
                      data.customerDynamics.topLoyalCustomers.map((cust) => (
                        <TableRow key={cust.customerId} className="text-xs hover:bg-muted/40">
                          <TableCell className="font-medium text-foreground">{cust.name}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {cust.maskedPhone}
                          </TableCell>
                          <TableCell className="text-right font-semibold font-mono">
                            {cust.orderCountInPeriod}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary font-mono">
                            {formatETB(cust.totalSpentInPeriod)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground font-mono">
                            {cust.lifetimeOrderCount}
                          </TableCell>
                          <TableCell className="text-right font-mono text-foreground">
                            {formatETB(cust.lifetimeSpent)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          No identified customer orders in this window.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 4: INVENTORY ALIGNMENT & SCHEMA GAPS ──────────────────────── */}
        <TabsContent value="operations" className="space-y-4">
          {/* Inventory Alignment Integration */}
          <Card className="shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Boxes className="size-4 text-primary" />
                    <span>Inventory Alignment & Stock Readiness</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Cross-verification between menu product availability and physical stock
                    tracking.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-7 text-xs gap-1 self-start sm:self-auto"
                >
                  <Link to="/admin/inventory">
                    <span>Manage Stock Ledger</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded-lg border border-border/70 p-3 bg-card space-y-1">
                  <span className="text-muted-foreground">Menu Availability</span>
                  <p className="text-lg font-bold text-foreground">
                    {data?.operationalAlignment.availableMenuProducts} /{" "}
                    {data?.operationalAlignment.totalMenuProducts}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-medium">
                    Available to diners
                  </span>
                </div>

                <div className="rounded-lg border border-border/70 p-3 bg-card space-y-1">
                  <span className="text-muted-foreground">Physical Stock Tracked</span>
                  <p className="text-lg font-bold text-foreground">
                    {data?.operationalAlignment.trackedProductsCount} items
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    Active inventory tracking
                  </span>
                </div>

                <div className="rounded-lg border border-border/70 p-3 bg-card space-y-1">
                  <span className="text-muted-foreground">Uninitialized Balances</span>
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {data?.operationalAlignment.uninitializedStockCount} items
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    Null quantity (opening count pending)
                  </span>
                </div>

                <div className="rounded-lg border border-border/70 p-3 bg-card space-y-1">
                  <span className="text-muted-foreground">Physical Stockouts</span>
                  <p className="text-lg font-bold text-destructive">
                    {data?.operationalAlignment.physicalOutOfStockCount} items
                  </p>
                  <span className="text-[10px] text-muted-foreground">Physical quantity is 0</span>
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs space-y-1">
                <p className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Info className="size-3.5" />
                  Physical Stock Invariant Rule
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  In Rekik Café, a product without an opening stock count remains strictly{" "}
                  <strong>null (unknown)</strong> and is never fabricated as zero. This ensures menu
                  items are not erroneously marked as depleted when stock has simply not yet been
                  audited.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Transparent Schema Gap Disclosures */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Transparent Schema Architecture & Data Gaps
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Gap 1: Promotion Attribution */}
              <Card className="border-amber-500/30 bg-amber-500/5 shadow-xs">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <ShieldAlert className="size-4 text-amber-600 shrink-0" />
                      <span>{data?.schemaGaps.promotionAttribution.title}</span>
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="border-amber-500 text-amber-600 text-[10px] uppercase font-bold shrink-0"
                    >
                      Unavailable
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2 text-xs">
                  <div className="space-y-1">
                    <span className="font-medium text-foreground">Schema Limitation:</span>
                    <p className="text-muted-foreground leading-relaxed">
                      {data?.schemaGaps.promotionAttribution.technicalDetails}
                    </p>
                  </div>
                  <div className="rounded bg-background/80 p-2.5 border border-border/60 space-y-1">
                    <span className="font-semibold text-primary text-[11px]">
                      Recommended Architecture:
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {data?.schemaGaps.promotionAttribution.recommendedAction}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Gap 2: Recipe BOM & COGS */}
              <Card className="border-amber-500/30 bg-amber-500/5 shadow-xs">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                      <ShieldAlert className="size-4 text-amber-600 shrink-0" />
                      <span>{data?.schemaGaps.recipeBOMAndCOGS.title}</span>
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="border-amber-500 text-amber-600 text-[10px] uppercase font-bold shrink-0"
                    >
                      Unavailable
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2 text-xs">
                  <div className="space-y-1">
                    <span className="font-medium text-foreground">Schema Limitation:</span>
                    <p className="text-muted-foreground leading-relaxed">
                      {data?.schemaGaps.recipeBOMAndCOGS.technicalDetails}
                    </p>
                  </div>
                  <div className="rounded bg-background/80 p-2.5 border border-border/60 space-y-1">
                    <span className="font-semibold text-primary text-[11px]">
                      Recommended Architecture:
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {data?.schemaGaps.recipeBOMAndCOGS.recommendedAction}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
