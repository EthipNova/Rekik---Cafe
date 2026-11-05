/**
 * ============================================================================
 * Rekik Café — Expense Management Module
 * File: src/routes/admin.expenses.tsx
 * ============================================================================
 * Enables the designated administrator to record, categorize, monitor, and
 * manage café expenditures with real-time totals, date filters, and search.
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
  Edit2,
  ExternalLink,
  Filter,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/site/Section";
import { formatETB } from "@/lib/menu-data";
import { cn } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseRecord,
  type ExpenseSummary,
} from "@/types/expenses";
import {
  createExpenseRecord,
  deleteExpenseRecord,
  fetchExpenses,
  updateExpenseRecord,
} from "@/services/expenses";

export const Route = createFileRoute("/admin/expenses")({
  head: () => ({
    meta: [
      { title: "Expense Management — Rekik Café Admin" },
      {
        name: "description",
        content:
          "Authoritative café expense recording, categorization, receipts, and financial monitoring.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminExpensesPage,
});

type DatePreset = "all" | "today" | "yesterday" | "7days" | "month" | "custom";

const PAYMENT_METHODS = [
  "Cash",
  "Telebirr",
  "CBE Birr",
  "Bank Transfer",
  "Check",
  "Other",
] as const;

function getCategoryColor(category: string): string {
  switch (category) {
    case "Ingredients & Raw Materials":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "Staff Salaries":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "Rent":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
    case "Utilities":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "Maintenance":
      return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function AdminExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<ExpenseRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<ExpenseCategory>("Ingredients & Raw Materials");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formPaymentMethod, setFormPaymentMethod] = useState("Cash");
  const [formReceiptUrl, setFormReceiptUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Compute date filter bounds
  const filterBounds = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (datePreset === "today") {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (datePreset === "yesterday") {
      const yest = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 10);
      return { startDate: yest, endDate: yest };
    }
    if (datePreset === "7days") {
      const start = new Date(now.getTime() - 7 * 24 * 3600000).toISOString().slice(0, 10);
      return { startDate: start, endDate: todayStr };
    }
    if (datePreset === "month") {
      const monthPrefix = todayStr.slice(0, 7);
      return { startDate: `${monthPrefix}-01`, endDate: todayStr };
    }
    if (datePreset === "custom" && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    return { startDate: undefined, endDate: undefined };
  }, [datePreset, customStart, customEnd]);

  const loadData = async () => {
    setLoading(true);
    const res = await fetchExpenses({
      startDate: filterBounds.startDate,
      endDate: filterBounds.endDate,
      category: selectedCategory !== "all" ? selectedCategory : undefined,
      search: search.trim() || undefined,
    });

    if (res.success) {
      setExpenses(res.expenses);
      if (res.summary) setSummary(res.summary);
    } else {
      toast.error(res.error || "Failed to load expenses");
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [filterBounds.startDate, filterBounds.endDate, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadData();
  };

  const resetForm = () => {
    setFormDescription("");
    setFormCategory("Ingredients & Raw Materials");
    setFormAmount("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormPaymentMethod("Cash");
    setFormReceiptUrl("");
    setFormNotes("");
  };

  const openAddDialog = () => {
    resetForm();
    setAddDialogOpen(true);
  };

  const openEditDialog = (exp: ExpenseRecord) => {
    setEditingExpense(exp);
    setFormDescription(exp.description);
    setFormCategory(exp.category);
    setFormAmount(String(exp.amount));
    setFormDate(exp.expenseDate);
    setFormPaymentMethod(exp.paymentMethod || "Cash");
    setFormReceiptUrl(exp.receiptUrl || "");
    setFormNotes(exp.notes || "");
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (!formDescription.trim()) {
      toast.error("Please enter a valid expense description.");
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid positive expense amount.");
      return;
    }

    setSubmitting(true);
    if (editingExpense) {
      // Update
      const res = await updateExpenseRecord(editingExpense.id, {
        description: formDescription.trim(),
        category: formCategory,
        amount: amt,
        expenseDate: formDate,
        paymentMethod: formPaymentMethod,
        receiptUrl: formReceiptUrl.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });

      if (res.success) {
        toast.success("Expense updated successfully");
        setEditingExpense(null);
        void loadData();
      } else {
        toast.error(res.error || "Failed to update expense");
      }
    } else {
      // Create
      const res = await createExpenseRecord({
        description: formDescription.trim(),
        category: formCategory,
        amount: amt,
        expenseDate: formDate,
        paymentMethod: formPaymentMethod,
        receiptUrl: formReceiptUrl.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });

      if (res.success) {
        toast.success("Expense recorded successfully");
        setAddDialogOpen(false);
        resetForm();
        void loadData();
      } else {
        toast.error(res.error || "Failed to record expense");
      }
    }
    setSubmitting(false);
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    setSubmitting(true);
    const res = await deleteExpenseRecord(deletingExpense.id);
    if (res.success) {
      toast.success("Expense deleted successfully");
      setDeletingExpense(null);
      void loadData();
    } else {
      toast.error(res.error || "Failed to delete expense");
    }
    setSubmitting(false);
  };

  // Top category
  const topCategory = useMemo(() => {
    if (!summary?.categoryBreakdown) return null;
    const entries = Object.entries(summary.categoryBreakdown);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const first = entries[0];
    if (!first) return null;
    const total = summary.totalAmount || 1;
    return {
      category: first[0],
      amount: first[1],
      percentage: (first[1] / total) * 100,
    };
  }, [summary]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Receipt className="size-6 text-primary" />
            Expense Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authoritative tracking, categorization, and reporting of café operational costs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>

          <Button
            onClick={openAddDialog}
            size="sm"
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            <Plus className="size-4" />
            Record Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Expenses */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Total Recorded</span>
              <Wallet className="size-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-foreground mt-1">
              {formatETB(summary?.totalAmount || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {expenses.length} expense transactions in period
            </p>
          </CardContent>
        </Card>

        {/* This Month's Expenses */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>This Month</span>
              <Calendar className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-foreground mt-1">
              {formatETB(summary?.monthAmount || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Current calendar month expenditures</p>
          </CardContent>
        </Card>

        {/* Today's Expenses */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Today's Expenses</span>
              <DollarSign className="size-4 text-amber-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-foreground mt-1">
              {formatETB(summary?.todayAmount || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Spent today (UTC+3 / EAT)</p>
          </CardContent>
        </Card>

        {/* Top Expense Category */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Top Category</span>
              <Tag className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-xl font-bold font-display text-foreground mt-1 truncate">
              {topCategory ? topCategory.category : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground truncate">
              {topCategory
                ? `${formatETB(topCategory.amount)} (${topCategory.percentage.toFixed(1)}%)`
                : "No expenses recorded"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="surface-card shadow-xs">
        <CardContent className="p-4 space-y-4">
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-col md:flex-row items-stretch md:items-center gap-3"
          >
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by description, payment method, or notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Category Filter */}
            <div className="w-full md:w-56">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Preset */}
            <div className="w-full md:w-44">
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" size="sm" className="h-9 gap-1.5 px-4 text-xs font-medium">
              <Filter className="size-3.5" />
              Filter
            </Button>
          </form>

          {/* Custom Date Range Row */}
          {datePreset === "custom" && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Label htmlFor="custom-start" className="text-xs text-muted-foreground">
                  From:
                </Label>
                <Input
                  id="custom-start"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="custom-end" className="text-xs text-muted-foreground">
                  To:
                </Label>
                <Input
                  id="custom-end"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadData()}
                className="h-8 text-xs"
              >
                Apply Range
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expenses History Table */}
      <Card className="surface-card shadow-xs overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-border flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Expense Records ({expenses.length})
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Detailed chronological history of café operational expenditures
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="size-4 animate-spin text-primary" />
              Loading expenses from database...
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState
                icon={<Receipt className="size-8 text-muted-foreground" />}
                title="No expenses recorded"
                description={
                  search || selectedCategory !== "all" || datePreset !== "all"
                    ? "No expenses match your active filter criteria. Try adjusting or clearing your filters."
                    : "No café expenses have been recorded yet. Click 'Record Expense' to log your first expenditure."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-semibold py-3">Date</TableHead>
                    <TableHead className="text-xs font-semibold">Description</TableHead>
                    <TableHead className="text-xs font-semibold">Category</TableHead>
                    <TableHead className="text-xs font-semibold">Payment Method</TableHead>
                    <TableHead className="text-xs font-semibold">Receipt / Notes</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Amount (ETB)</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-xs text-foreground font-medium whitespace-nowrap">
                        {new Date(exp.expenseDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>

                      <TableCell className="text-xs font-medium text-foreground max-w-xs truncate">
                        {exp.description}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[11px] font-medium border", getCategoryColor(exp.category))}
                        >
                          {exp.category}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {exp.paymentMethod || "Cash"}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground max-w-xs">
                        {exp.receiptUrl ? (
                          <a
                            href={exp.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                          >
                            <span>Receipt</span>
                            <ExternalLink className="size-3" />
                          </a>
                        ) : exp.notes ? (
                          <span className="truncate block" title={exp.notes}>
                            {exp.notes}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-xs font-bold text-foreground text-right whitespace-nowrap">
                        {formatETB(exp.amount)}
                      </TableCell>

                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditDialog(exp)}
                            title="Edit Expense"
                          >
                            <Edit2 className="size-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingExpense(exp)}
                            title="Delete Expense"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Expense Dialog */}
      <Dialog
        open={addDialogOpen || Boolean(editingExpense)}
        onOpenChange={(open) => {
          if (!open) {
            setAddDialogOpen(false);
            setEditingExpense(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <form onSubmit={handleSaveExpense}>
            <DialogHeader>
              <DialogTitle className="font-display text-lg">
                {editingExpense ? "Edit Expense" : "Record New Expense"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {editingExpense
                  ? "Update the details for this recorded café expenditure."
                  : "Enter the expenditure details below to save to authoritative financial records."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="exp-desc">Description *</Label>
                <Input
                  id="exp-desc"
                  placeholder="e.g. Arabica Coffee Beans 25kg, Milk Crates, Electric Bill"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                  disabled={submitting}
                  className="text-xs"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="exp-category">Expense Category *</Label>
                <Select
                  value={formCategory}
                  onValueChange={(val) => setFormCategory(val as ExpenseCategory)}
                  disabled={submitting}
                >
                  <SelectTrigger id="exp-category" className="text-xs">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="exp-amount">Amount (ETB) *</Label>
                  <Input
                    id="exp-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    required
                    disabled={submitting}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="exp-date">Date *</Label>
                  <Input
                    id="exp-date"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    disabled={submitting}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <Label htmlFor="exp-method">Payment Method</Label>
                <Select
                  value={formPaymentMethod}
                  onValueChange={setFormPaymentMethod}
                  disabled={submitting}
                >
                  <SelectTrigger id="exp-method" className="text-xs">
                    <SelectValue placeholder="Select Method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Receipt URL / Reference */}
              <div className="space-y-1.5">
                <Label htmlFor="exp-receipt">Receipt URL or Document Link (Optional)</Label>
                <Input
                  id="exp-receipt"
                  placeholder="https://... or invoice reference number"
                  value={formReceiptUrl}
                  onChange={(e) => setFormReceiptUrl(e.target.value)}
                  disabled={submitting}
                  className="text-xs"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="exp-notes">Notes / Vendor Details (Optional)</Label>
                <Textarea
                  id="exp-notes"
                  placeholder="Vendor name, receipt notes, or purpose..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  disabled={submitting}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddDialogOpen(false);
                  setEditingExpense(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="bg-primary text-primary-foreground font-medium"
              >
                {submitting ? "Saving..." : editingExpense ? "Update Expense" : "Record Expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingExpense)}
        onOpenChange={(open) => {
          if (!open) setDeletingExpense(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-base text-destructive flex items-center gap-2">
              <AlertCircle className="size-5" />
              Delete Expense Record?
            </DialogTitle>
            <DialogDescription className="text-xs mt-2">
              Are you sure you want to delete the expense{" "}
              <strong className="text-foreground">"{deletingExpense?.description}"</strong> for{" "}
              <strong className="text-foreground">
                {formatETB(deletingExpense?.amount || 0)}
              </strong>
              ? This action will remove the record from financial reports.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingExpense(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteExpense}
              disabled={submitting}
            >
              {submitting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
