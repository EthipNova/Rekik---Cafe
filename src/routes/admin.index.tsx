/**
 * ============================================================================
 * Rekik Café — Admin Dashboard: Financial Management Center
 * File: src/routes/admin.index.tsx
 * ============================================================================
 * Clean, authoritative, and understandable financial performance center for
 * the café owner. Prioritizes:
 * 1. Money Collected (Revenue: Total, Today, Week, Month)
 * 2. Money Spent (Expenses: Total, Today, Month, Category breakdown)
 * 3. Estimated Profit (Net operating profit based on verified revenue & expenses)
 * 4. Outstanding Payments (Pending, rejected, awaiting verification)
 * 5. Visualizations: Revenue vs. Expenses over time with date filters & category breakdown
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Eye,
  Filter,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
      { title: "Financial Dashboard — Rekik Café Admin" },
      {
        name: "description",
        content:
          "Authoritative financial performance center: revenue collected, café expenses, net operating profit, and payment settlement for Rekik Café.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RekikFinancialDashboard,
});

const CATEGORY_COLORS: Record<string, string> = {
  "Ingredients & Raw Materials": "#d97706", // amber-600
  "Staff Salaries": "#2563eb", // blue-600
  Rent: "#9333ea", // purple-600
  Utilities: "#059669", // emerald-600
  Maintenance: "#ea580c", // orange-600
  "Other Expenses": "#64748b", // slate-500
};

export function RekikFinancialDashboard() {
  const [data, setData] = useState<OwnerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<DateRangePreset>("7days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [isPending, startTransition] = useTransition();

  const cafeName = readSettings().cafeName || "Rekik Café";

  const refreshData = useCallback(
    async (targetPreset: DateRangePreset, cStart?: string, cEnd?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await loadOwnerDashboardData(targetPreset, cStart, cEnd);
        setData(result);
        if (result.ordersError) {
          setError(result.ordersError);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load financial records from database.";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refreshData(preset);
  }, [refreshData, preset]);

  const handlePresetChange = (val: string) => {
    const nextPreset = val as DateRangePreset;
    setPreset(nextPreset);
    if (nextPreset === "custom") {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
      startTransition(() => {
        void refreshData(nextPreset);
      });
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

  // Top category
  const topExpenseCategory = useMemo(() => {
    if (!data?.expenseCategories || data.expenseCategories.length === 0) return null;
    return data.expenseCategories[0];
  }, [data]);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-10">
      {/* ── Top Header & Global Controls ─────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Financial Management
            </h1>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold px-2 py-0.5"
            >
              Authoritative Records
            </Badge>
            <Badge
              variant="secondary"
              className="text-[11px] text-muted-foreground hidden lg:inline-flex items-center gap-1 font-mono"
            >
              <Clock className="size-3" /> Hawassa (UTC+3)
            </Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Authoritative financial performance center for {cafeName}: revenue collected, operational expenses, and net profit.
          </p>
        </div>

        {/* Global Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg p-1 shadow-xs">
            <Filter className="size-3.5 text-muted-foreground ml-1.5" aria-hidden />
            <Select value={preset} onValueChange={handlePresetChange}>
              <SelectTrigger
                id="admin-date-filter"
                aria-label="Filter financial dashboard by date range"
                className="h-8 border-none shadow-none text-xs font-medium focus:ring-0 focus:ring-offset-0 px-2 min-w-[130px]"
              >
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
                <SelectItem value="custom">Custom Range…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshData(preset, customStart, customEnd)}
            disabled={loading}
            aria-label="Refresh financial records"
            className="h-8 gap-1.5 text-xs shadow-xs"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin text-primary")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button asChild size="sm" className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground font-medium">
            <Link to="/admin/expenses">
              <Plus className="size-3.5" />
              <span>Record Expense</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Custom Date Range Inputs ─────────────────────────────────────── */}
      {showCustomRange && (
        <form
          onSubmit={handleApplyCustomDates}
          className="surface-card flex flex-wrap items-end gap-3 p-3.5 sm:p-4 text-xs animate-in fade-in rounded-lg border border-border bg-card"
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

      {/* ── Error Banner ─────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Notice regarding data connection</p>
              <p className="text-xs opacity-90">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshData(preset, customStart, customEnd)}
            className="h-8 text-xs border-destructive/30 hover:bg-destructive/15 text-destructive"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ── PART 1: THE 4 CORE FINANCIAL OVERVIEW CARDS ──────────────────── */}
      <section aria-labelledby="financial-overview-heading" className="space-y-3">
        <h2 id="financial-overview-heading" className="sr-only">
          Core Financial Performance
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Money Collected (Revenue) */}
          <Card className="surface-card border-emerald-500/30 shadow-xs flex flex-col justify-between">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Money Collected
                </span>
                <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <Banknote className="size-4" />
                </div>
              </div>

              {loading && !data ? (
                <Skeleton className="h-8 w-28 mt-2" />
              ) : (
                <div className="mt-1">
                  <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    {formatETB(data?.periodRevenue ?? 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data?.range.label} Verified Revenue
                  </p>
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-2 border-t border-border/50 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Today:</span>
                <span className="font-semibold text-foreground">
                  {formatETB(data?.todayRevenue ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>This Week:</span>
                <span className="font-semibold text-foreground">
                  {formatETB(data?.weekRevenue ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>This Month:</span>
                <span className="font-semibold text-foreground">
                  {formatETB(data?.monthRevenue ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/40">
                <span className="font-medium">All-Time Total:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatETB(data?.totalRevenue ?? 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Money Spent (Expenses) */}
          <Card className="surface-card border-amber-500/30 shadow-xs flex flex-col justify-between">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Expenses Recorded
                </span>
                <div className="size-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Receipt className="size-4" />
                </div>
              </div>

              {loading && !data ? (
                <Skeleton className="h-8 w-28 mt-2" />
              ) : (
                <div className="mt-1">
                  <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    {formatETB(data?.periodExpenses ?? 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data?.range.label} Café Expenditures
                  </p>
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-2 border-t border-border/50 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Today:</span>
                <span className="font-semibold text-foreground">
                  {formatETB(data?.todayExpenses ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>This Month:</span>
                <span className="font-semibold text-foreground">
                  {formatETB(data?.monthExpenses ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Top Category:</span>
                <span className="font-semibold text-foreground truncate max-w-[120px]">
                  {topExpenseCategory ? topExpenseCategory.category : "—"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/40">
                <span className="font-medium">All-Time Expenses:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {formatETB(data?.totalExpenses ?? 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Estimated Operating Profit */}
          <Card
            className={cn(
              "surface-card shadow-xs flex flex-col justify-between border",
              data && data.periodNetProfit >= 0
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-destructive/30 bg-destructive/5",
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span
                  className={cn(
                    "text-xs font-bold uppercase tracking-wider",
                    data && data.periodNetProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                  )}
                >
                  Estimated Profit
                </span>
                <div
                  className={cn(
                    "size-8 rounded-full flex items-center justify-center",
                    data && data.periodNetProfit >= 0
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {data && data.periodNetProfit >= 0 ? (
                    <TrendingUp className="size-4" />
                  ) : (
                    <TrendingDown className="size-4" />
                  )}
                </div>
              </div>

              {loading && !data ? (
                <Skeleton className="h-8 w-28 mt-2" />
              ) : (
                <div className="mt-1">
                  <p
                    className={cn(
                      "font-display text-2xl sm:text-3xl font-bold tracking-tight",
                      data && data.periodNetProfit >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {formatETB(data?.periodNetProfit ?? 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data?.range.label} Net Operating Profit
                  </p>
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-2 border-t border-border/50 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Profit Margin:</span>
                <span className="font-semibold text-foreground">
                  {data?.profitMargin.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Period Status:</span>
                <span
                  className={cn(
                    "font-semibold",
                    data && data.periodNetProfit >= 0 ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  {data && data.periodNetProfit >= 0 ? "Profitable" : "Operating Deficit"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Calculation Basis:</span>
                <span className="text-[10px] text-muted-foreground">Revenue − Expenses</span>
              </div>
              <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/40">
                <span className="font-medium">All-Time Profit:</span>
                <span className="font-bold text-foreground">
                  {formatETB(data?.totalNetProfit ?? 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Outstanding & Pending Payments */}
          <Card className="surface-card border-blue-500/30 shadow-xs flex flex-col justify-between">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  Pending Payments
                </span>
                <div className="size-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
                  <CreditCard className="size-4" />
                </div>
              </div>

              {loading && !data ? (
                <Skeleton className="h-8 w-28 mt-2" />
              ) : (
                <div className="mt-1">
                  <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    {formatETB(data?.pendingPaymentsAmount ?? 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data?.pendingPaymentsCount ?? 0} orders awaiting settlement
                  </p>
                </div>
              )}
            </CardHeader>

            <CardContent className="pt-2 border-t border-border/50 text-xs space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Under Cashier Review:</span>
                <span className="font-semibold text-foreground">
                  {data?.awaitingVerificationCount ?? 0} proof(s)
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Proof Value:</span>
                <span className="font-semibold text-foreground">
                  {formatETB(data?.awaitingVerificationAmount ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Rejected / Declined:</span>
                <span className="font-semibold text-destructive">
                  {data?.rejectedPaymentsCount ?? 0} ({formatETB(data?.rejectedPaymentsAmount ?? 0)})
                </span>
              </div>
              <div className="pt-1 border-t border-border/40 text-right">
                <Link
                  to="/admin/orders"
                  className="text-[11px] text-primary hover:underline font-semibold inline-flex items-center gap-1"
                >
                  <span>Resolve in Order & Payment</span>
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── PART 2: FINANCIAL CHARTS (Revenue vs. Expenses & Expense Breakdown) ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Revenue vs Expenses Over Time */}
        <Card className="surface-card shadow-xs lg:col-span-2">
          <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                <span>Revenue vs. Expenses Comparison</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Daily comparison of money collected (verified payments) vs. expenses recorded.
              </CardDescription>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-center">
              <Badge variant="outline" className="text-[11px] font-mono">
                {data?.range.label}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-6">
            {loading && !data ? (
              <div className="h-72 flex items-center justify-center">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : !data?.financialTimeline || data.financialTimeline.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-xs text-muted-foreground">
                No financial transactions recorded for this period.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.financialTimeline}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        formatETB(Number(val) || 0),
                        name === "revenue"
                          ? "Money Collected"
                          : name === "expenses"
                            ? "Expenses Recorded"
                            : "Estimated Profit",
                      ]}
                      contentStyle={{
                        backgroundColor: "var(--background)",
                        borderColor: "var(--border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(value) =>
                        value === "revenue"
                          ? "Money Collected (Revenue)"
                          : value === "expenses"
                            ? "Expenses Recorded"
                            : "Net Operating Profit"
                      }
                    />
                    <Bar
                      dataKey="revenue"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                    <Bar
                      dataKey="expenses"
                      fill="#d97706"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={30}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Expense Breakdown by Category */}
        <Card className="surface-card shadow-xs flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Tag className="size-4 text-primary" />
                  <span>Expense Breakdown</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Distribution across operational categories
                </CardDescription>
              </div>

              <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
                <Link to="/admin/expenses">
                  <span>Manage</span>
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {loading && !data ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : !data?.expenseCategories || data.expenseCategories.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  <Receipt className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p>No expenses recorded yet.</p>
                  <Button asChild size="sm" variant="outline" className="mt-3 text-xs">
                    <Link to="/admin/expenses">Record First Expense</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {data.expenseCategories.map((cat) => (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <span
                            className="size-2.5 rounded-full"
                            style={{
                              backgroundColor: CATEGORY_COLORS[cat.category] || "#64748b",
                            }}
                          />
                          {cat.category}
                        </span>
                        <div className="text-right">
                          <span className="font-semibold text-foreground mr-1.5">
                            {formatETB(cat.amount)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            ({cat.percentage.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <Progress
                        value={cat.percentage}
                        className="h-1.5"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </div>

          <div className="p-4 border-t border-border/50 bg-muted/10">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">Total Recorded Expenses:</span>
              <span className="font-bold text-foreground">
                {formatETB(data?.totalExpenses ?? 0)}
              </span>
            </div>
          </div>
        </Card>
      </section>

      {/* ── PART 3: UNIFIED RECENT TRANSACTIONS & SETTLEMENT CHANNELS ────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Transactions (Order & Payment) */}
        <Card className="surface-card shadow-xs lg:col-span-2">
          <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <ShoppingBag className="size-4 text-primary" />
                <span>Recent Orders & Settlements</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Latest customer orders and associated payment statuses
              </CardDescription>
            </div>

            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1">
              <Link to="/admin/orders">
                <span>View Order & Payment Board</span>
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="py-2.5">Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {loading && !data ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : !data?.recentOrders || data.recentOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                        No orders recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.recentOrders.slice(0, 5).map((order) => (
                      <TableRow key={order.id} className="hover:bg-muted/20">
                        <TableCell className="font-mono font-semibold text-foreground whitespace-nowrap">
                          <Link to="/admin/orders" className="hover:text-primary">
                            #{order.number}
                          </Link>
                          <span className="block text-[10px] text-muted-foreground">
                            {new Date(order.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <p className="font-medium text-foreground">
                            {order.customer.name || "Guest Diner"}
                          </p>
                          {order.customer.table && (
                            <span className="text-[10px] text-primary font-semibold">
                              Table #{order.customer.table}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-nowrap capitalize text-muted-foreground">
                          {order.method}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <span className="font-medium text-foreground">
                            {order.paymentMethod || "Cash"}
                          </span>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          {order.paymentStatus === "paid" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            >
                              Paid
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                            >
                              Pending
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-bold text-foreground whitespace-nowrap">
                          {formatETB(order.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Right: Payment Method Breakdown */}
        <Card className="surface-card shadow-xs flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <span>Payment Settlement Channels</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Distribution across cash and digital channels
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {data?.paymentOverview.methods.map((pm) => {
                const isCash = pm.method.toLowerCase().includes("cash");
                const isTelebirr = pm.method.toLowerCase().includes("telebirr");
                const isCbe = pm.method.toLowerCase().includes("cbe");

                return (
                  <div
                    key={pm.method}
                    className="p-3 rounded-lg border border-border/80 bg-card flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCash ? (
                        <Banknote className="size-4 text-emerald-600" />
                      ) : isTelebirr ? (
                        <CreditCard className="size-4 text-blue-600" />
                      ) : isCbe ? (
                        <CreditCard className="size-4 text-purple-600" />
                      ) : (
                        <CreditCard className="size-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-semibold text-foreground">{pm.method}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {pm.count} transaction{pm.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-foreground">{formatETB(pm.totalAmount)}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </div>

          <div className="p-4 border-t border-border/50 bg-muted/10">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">Verified Paid Volume:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatETB(data?.paymentOverview.paidAmount ?? 0)}
              </span>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
