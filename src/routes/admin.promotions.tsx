import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/site/Section";
import {
  createAdminPromotion,
  deleteAdminPromotion,
  derivePromotionStatus,
  fetchAdminPromotions,
  fetchPromotionProductsList,
  formatDiscount,
  formatETB,
  resolvePromotionTargetType,
  updateAdminPromotion,
  type CreatePromotionInput,
  type DiscountType,
  type Promotion,
  type PromotionProductItem,
  type PromotionStatus,
  type PromotionTargetType,
} from "@/lib/promotions";
import { fetchCategories } from "@/services/api";
import type { Category } from "@/lib/menu-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/promotions")({
  head: () => ({
    meta: [
      { title: "Promotions Management — Rekik Café" },
      { name: "description", content: "Create and manage café promotional offers and discounts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPromotions,
});

function StatusBadge({ status }: { status: PromotionStatus }) {
  if (status === "active") {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1.5 bg-success/15 text-success border-success/30 text-xs py-0.5 px-2 font-medium"
      >
        <span className="size-1.5 rounded-full bg-success animate-pulse" aria-hidden />
        <span>Active</span>
      </Badge>
    );
  }
  if (status === "scheduled") {
    return (
      <Badge
        variant="secondary"
        className="inline-flex items-center gap-1 text-primary text-xs py-0.5 px-2 font-medium"
      >
        <Calendar className="size-3" aria-hidden />
        <span>Scheduled</span>
      </Badge>
    );
  }
  if (status === "expired") {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1 text-muted-foreground text-xs py-0.5 px-2 font-medium"
      >
        <Clock className="size-3" aria-hidden />
        <span>Expired</span>
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs uppercase font-medium">
      Draft
    </Badge>
  );
}

type FormErrors = {
  name?: string;
  discountValue?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  products?: string;
  minOrderAmount?: string;
};

function AdminPromotions() {
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);
  const [availableProducts, setAvailableProducts] = useState<PromotionProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [discountTypeFilter, setDiscountTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  // Dialog & Drawer states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [selectedDetailsId, setSelectedDetailsId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form Draft State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState<string>("15");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusMode, setStatusMode] = useState<"auto" | "draft">("auto");
  const [targetType, setTargetType] = useState<PromotionTargetType>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [minOrderAmount, setMinOrderAmount] = useState<string>("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [promosRes, productsRes, categoriesRes] = await Promise.all([
        fetchAdminPromotions(),
        fetchPromotionProductsList(),
        fetchCategories().catch(() => []),
      ]);

      if (promosRes.error) {
        setError(promosRes.error.message || "Failed to load promotions from database.");
        setPromotions([]);
      } else {
        setPromotions(promosRes.data ?? []);
      }

      if (productsRes.data) {
        setAvailableProducts(productsRes.data);
      }

      if (categoriesRes) {
        setCategoriesList(categoriesRes);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load promotions data.");
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const safePromos = promotions ?? [];

  const productMap = useMemo(
    () => new Map(availableProducts.map((p) => [p.id, p])),
    [availableProducts],
  );

  const categoryMap = useMemo(
    () => new Map(categoriesList.map((c) => [c.id, c])),
    [categoriesList],
  );

  // Summary Metrics derived from current promotion state
  const activeCount = safePromos.filter((p) => derivePromotionStatus(p) === "active").length;
  const scheduledCount = safePromos.filter((p) => derivePromotionStatus(p) === "scheduled").length;
  const expiredCount = safePromos.filter((p) => derivePromotionStatus(p) === "expired").length;

  // Count distinct products on active or scheduled promotions
  const activeOrScheduled = safePromos.filter((p) => {
    const s = derivePromotionStatus(p);
    return s === "active" || s === "scheduled";
  });
  const targetedProductIds = new Set<string>();
  activeOrScheduled.forEach((p) => {
    const type = resolvePromotionTargetType(p);
    if (type === "all") {
      availableProducts.forEach((prod) => targetedProductIds.add(prod.id));
    } else if (type === "category" && p.categoryId) {
      availableProducts.forEach((prod) => {
        if (prod.categoryId === p.categoryId) {
          targetedProductIds.add(prod.id);
        }
      });
    } else {
      p.applicableProductIds.forEach((id) => {
        if (id !== "*") targetedProductIds.add(id);
      });
    }
  });
  const productsOnPromotionCount = targetedProductIds.size;

  // Filter promotions
  const filteredPromotions = safePromos.filter((p) => {
    const status = derivePromotionStatus(p);

    if (statusFilter !== "all" && status !== statusFilter) {
      return false;
    }

    if (discountTypeFilter !== "all" && p.discountType !== discountTypeFilter) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = p.name.toLowerCase().includes(q);
      const descMatch = (p.description || "").toLowerCase().includes(q);
      const catName = p.categoryId
        ? categoryMap.get(p.categoryId)?.name || p.applicableCategorySlug || ""
        : p.applicableCategorySlug || "";
      const catMatch = catName.toLowerCase().includes(q);
      const productMatch = p.applicableProductIds.some((id) => {
        if (id === "*") return "all products".includes(q) || "all menu products".includes(q);
        const prod = productMap.get(id);
        return prod?.name.toLowerCase().includes(q);
      });

      if (!nameMatch && !descMatch && !productMatch && !catMatch) {
        return false;
      }
    }

    return true;
  });

  // Sort promotions
  const sortedPromotions = [...filteredPromotions].sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    if (sortBy === "oldest") {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
    if (sortBy === "name-asc") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "name-desc") {
      return b.name.localeCompare(a.name);
    }
    if (sortBy === "start-date") {
      return (a.startDate || "").localeCompare(b.startDate || "");
    }
    if (sortBy === "end-date") {
      return (a.endDate || "").localeCompare(b.endDate || "");
    }
    return 0;
  });

  // Form Management
  const openCreateDialog = () => {
    const today = new Date().toISOString().split("T")[0]!;
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]!;

    setEditingPromotion(null);
    setName("");
    setDescription("");
    setDiscountType("percentage");
    setDiscountValue("15");
    setStartDate(today);
    setEndDate(nextWeek);
    setStatusMode("auto");
    setTargetType("all");
    setSelectedCategoryId("");
    setSelectedProductIds([]);
    setMinOrderAmount("");
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEditDialog = (promo: Promotion) => {
    setEditingPromotion(promo);
    setName(promo.name);
    setDescription(promo.description || "");
    setDiscountType(promo.discountType);
    setDiscountValue(String(promo.discountValue));
    setStartDate(promo.startDate);
    setEndDate(promo.endDate);
    setStatusMode(promo.status === "draft" ? "draft" : "auto");
    const derivedTarget = resolvePromotionTargetType(promo);
    setTargetType(derivedTarget);
    setSelectedCategoryId(promo.categoryId || "");
    setSelectedProductIds(promo.applicableProductIds.filter((id) => id !== "*"));
    setMinOrderAmount(promo.minOrderAmount ? String(promo.minOrderAmount) : "");
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!name.trim()) {
      errors.name = "Promotion name is required.";
    }

    const val = Number(discountValue);
    if (!discountValue || isNaN(val) || val <= 0) {
      errors.discountValue = "Enter a valid positive discount number.";
    } else if (discountType === "percentage" && val > 100) {
      errors.discountValue = "Percentage discount cannot exceed 100%.";
    }

    if (!startDate) {
      errors.startDate = "Start date is required.";
    }

    if (!endDate) {
      errors.endDate = "End date is required.";
    } else if (startDate && endDate < startDate) {
      errors.endDate = "End date must be on or after start date.";
    }

    if (targetType === "category" && !selectedCategoryId) {
      errors.category = "Please select a category.";
    }

    if (targetType === "products" && selectedProductIds.length === 0) {
      errors.products = "Select at least one product.";
    }

    if (minOrderAmount.trim()) {
      const minVal = Number(minOrderAmount);
      if (isNaN(minVal) || minVal < 0) {
        errors.minOrderAmount = "Minimum order must be a valid non-negative number.";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSavePromotion = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    const todayStr = new Date().toISOString().split("T")[0]!;
    const computedStatus: PromotionStatus =
      statusMode === "draft"
        ? "draft"
        : startDate > todayStr
          ? "scheduled"
          : endDate < todayStr
            ? "expired"
            : "active";

    const payload: CreatePromotionInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      discountType,
      discountValue: Number(discountValue),
      startDate,
      endDate,
      status: computedStatus,
      minOrderAmount: minOrderAmount.trim() ? Number(minOrderAmount) : null,
      categoryId: targetType === "category" ? selectedCategoryId : null,
    };

    const targetIds =
      targetType === "all" ? [] : targetType === "category" ? [] : selectedProductIds;

    try {
      if (editingPromotion) {
        const { error: updateErr } = await updateAdminPromotion(
          editingPromotion.id,
          payload,
          targetIds,
          targetType,
        );
        if (updateErr) {
          toast.error(updateErr.message);
          setIsSubmitting(false);
          return;
        }
        toast.success(`Promotion "${payload.name}" updated`);
      } else {
        const { error: createErr } = await createAdminPromotion(payload, targetIds, targetType);
        if (createErr) {
          toast.error(createErr.message);
          setIsSubmitting(false);
          return;
        }
        toast.success(`Promotion "${payload.name}" created`);
      }

      setIsFormOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save promotion");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    const target = safePromos.find((p) => p.id === deletingId);
    try {
      const { error: delErr } = await deleteAdminPromotion(deletingId);
      if (delErr) {
        toast.error(delErr.message);
        return;
      }
      toast.success(`Promotion "${target?.name || "Offer"}" removed`);
      if (selectedDetailsId === deletingId) {
        setSelectedDetailsId(null);
      }
      setDeletingId(null);
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete promotion");
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDiscountTypeFilter("all");
    setSortBy("newest");
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    statusFilter !== "all" ||
    discountTypeFilter !== "all" ||
    sortBy !== "newest";

  const selectedDetailsPromo = safePromos.find((p) => p.id === selectedDetailsId) ?? null;

  return (
    <div className="space-y-8">
      {/* 1. HEADER & OVERVIEW */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Promotions management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create, schedule, and oversee café discount campaigns and menu promotions.
          </p>
        </div>

        <Button
          onClick={openCreateDialog}
          className="w-full sm:w-auto h-11 sm:h-9 gap-1.5 shadow-sm"
        >
          <Plus className="size-4" aria-hidden />
          <span>Create Promotion</span>
        </Button>
      </header>

      {/* 2. SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {/* Active Promotions */}
        <div className="surface-card p-3.5 sm:p-5 space-y-1 sm:space-y-1.5 border-l-4 border-l-success">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Active Promos
            </span>
            <div className="flex size-7 sm:size-8 items-center justify-center rounded-lg bg-success/10 text-success shrink-0">
              <CheckCircle2 className="size-3.5 sm:size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-foreground">
            {activeCount}
          </p>
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Currently running</p>
        </div>

        {/* Scheduled */}
        <div className="surface-card p-3.5 sm:p-5 space-y-1 sm:space-y-1.5 border-l-4 border-l-primary">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Scheduled
            </span>
            <div className="flex size-7 sm:size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <Calendar className="size-3.5 sm:size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-foreground">
            {scheduledCount}
          </p>
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Upcoming offers</p>
        </div>

        {/* Expired */}
        <div className="surface-card p-3.5 sm:p-5 space-y-1 sm:space-y-1.5 border-l-4 border-l-muted">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              Expired
            </span>
            <div className="flex size-7 sm:size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
              <Clock className="size-3.5 sm:size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-foreground">
            {expiredCount}
          </p>
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Past campaigns</p>
        </div>

        {/* Products on Promotion */}
        <div className="surface-card p-3.5 sm:p-5 space-y-1 sm:space-y-1.5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              On Offer
            </span>
            <div className="flex size-7 sm:size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <ShoppingBag className="size-3.5 sm:size-4" aria-hidden />
            </div>
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-foreground">
            {productsOnPromotionCount}
          </p>
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Products targeted</p>
        </div>
      </div>

      {/* 3. SEARCH & FILTERS */}
      <div className="surface-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search by promotion name, description, or product…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
              aria-label="Search promotions"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by promotion status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>

          {/* Discount Type Filter */}
          <Select value={discountTypeFilter} onValueChange={setDiscountTypeFilter}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by discount type">
              <SelectValue placeholder="Discount type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All discount types</SelectItem>
              <SelectItem value="percentage">Percentage discount (%)</SelectItem>
              <SelectItem value="fixed">Fixed amount (ETB)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Secondary controls row: Sorting & Reset */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="size-3.5 text-muted-foreground" aria-hidden />
              <span>Sort by:</span>
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger
                className="h-8 text-xs w-[140px] sm:w-[150px]"
                aria-label="Sort promotions"
              >
                <SelectValue placeholder="Sort order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name A–Z</SelectItem>
                <SelectItem value="name-desc">Name Z–A</SelectItem>
                <SelectItem value="start-date">Start date</SelectItem>
                <SelectItem value="end-date">End date</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <span>
              Showing <strong>{sortedPromotions.length}</strong> of{" "}
              <strong>{safePromos.length}</strong> promotions
            </span>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2.5 gap-1 text-primary hover:text-primary shrink-0"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 4. ERROR STATE */}
      {error && (
        <div className="surface-card p-8 text-center space-y-4 border border-destructive/30 bg-destructive/5">
          <div className="inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
            <AlertCircle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Unable to load promotions
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button onClick={loadData} size="sm" className="gap-2">
            <RotateCcw className="size-3.5" aria-hidden />
            Retry connection
          </Button>
        </div>
      )}

      {/* 5. PROMOTION CARDS LIST / STATES */}
      {loading && promotions === null ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Loading promotions from database…</p>
        </div>
      ) : safePromos.length === 0 ? (
        <EmptyState
          icon={<Tag className="size-8 text-muted-foreground" />}
          title="No promotions yet"
          description="Create your first café promotion or discount campaign to engage your customers."
          action={
            <Button onClick={openCreateDialog} className="mt-4 gap-1.5">
              <Plus className="size-4" aria-hidden />
              <span>Create Promotion</span>
            </Button>
          }
        />
      ) : sortedPromotions.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-3">
          <p className="text-base font-medium">No matching promotions found</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No promotions match your search criteria. Try clearing or adjusting your filters.
          </p>
          <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            Reset all filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedPromotions.map((promo) => {
            const status = derivePromotionStatus(promo);
            const isAll = promo.applicableProductIds.includes("*");

            return (
              <div
                key={promo.id}
                className="surface-card p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-display font-semibold text-lg text-foreground truncate">
                        {promo.name}
                      </h2>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {promo.description || "No description provided."}
                      </p>
                    </div>
                    <StatusBadge status={status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default" className="font-bold text-xs py-1 px-2.5 bg-primary">
                      {formatDiscount(promo)}
                    </Badge>
                    {promo.minOrderAmount && (
                      <Badge variant="outline" className="text-[11px] font-normal">
                        Min. order: {formatETB(promo.minOrderAmount)}
                      </Badge>
                    )}
                  </div>

                  <div className="rounded-lg bg-secondary/30 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Schedule:</span>
                      <span className="font-medium text-foreground">
                        {promo.startDate} → {promo.endDate}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Targeting:</span>
                      <span className="font-medium text-foreground truncate max-w-[170px]">
                        {(() => {
                          const type = resolvePromotionTargetType(promo);
                          if (type === "all") return "All Products";
                          if (type === "category") {
                            const catName =
                              (promo.categoryId && categoryMap.get(promo.categoryId)?.name) ||
                              promo.applicableCategorySlug ||
                              "Category";
                            return `Category: ${catName}`;
                          }
                          return `${promo.applicableProductIds.length} selected product(s)`;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs px-3 font-medium flex-1"
                    onClick={() => setSelectedDetailsId(promo.id)}
                  >
                    <Eye className="size-3.5 mr-1.5" aria-hidden />
                    Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => openEditDialog(promo)}
                    aria-label={`Edit ${promo.name}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => setDeletingId(promo.id)}
                    aria-label={`Delete ${promo.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. CREATE / EDIT PROMOTION DIALOG */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingPromotion ? "Edit Promotion" : "Create New Promotion"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define the campaign schedule, discount value, and targeted menu items.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Promotion Name */}
            <div className="space-y-1.5">
              <Label htmlFor="promo-name">Promotion Name *</Label>
              <Input
                id="promo-name"
                placeholder="e.g. Afternoon Coffee Hours, Ramadan Special"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 sm:h-9 text-sm"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3" /> {formErrors.name}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="promo-desc">Description</Label>
              <Textarea
                id="promo-desc"
                placeholder="Short customer-facing explanation of this offer…"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Discount Type & Value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Discount Type</Label>
                <Select
                  value={discountType}
                  onValueChange={(val) => setDiscountType(val as DiscountType)}
                >
                  <SelectTrigger className="h-10 sm:h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (ETB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="promo-discount-val">
                  Value ({discountType === "percentage" ? "%" : "ETB"}) *
                </Label>
                <Input
                  id="promo-discount-val"
                  type="number"
                  min="1"
                  max={discountType === "percentage" ? "100" : undefined}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="h-10 sm:h-9 text-sm"
                />
                {formErrors.discountValue && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3" /> {formErrors.discountValue}
                  </p>
                )}
              </div>
            </div>

            {/* Start & End Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="promo-start-date">Start Date *</Label>
                <Input
                  id="promo-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 sm:h-9 text-sm"
                />
                {formErrors.startDate && (
                  <p className="text-xs text-destructive">{formErrors.startDate}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="promo-end-date">End Date *</Label>
                <Input
                  id="promo-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 sm:h-9 text-sm"
                />
                {formErrors.endDate && (
                  <p className="text-xs text-destructive">{formErrors.endDate}</p>
                )}
              </div>
            </div>

            {/* Status Mode */}
            <div className="space-y-1.5">
              <Label>Publication Mode</Label>
              <Select
                value={statusMode}
                onValueChange={(val) => setStatusMode(val as "auto" | "draft")}
              >
                <SelectTrigger className="h-10 sm:h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic (Derived from start & end dates)</SelectItem>
                  <SelectItem value="draft">Save as Draft (Inactive)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Minimum Order Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="promo-min-order">Minimum Order Amount (Optional, ETB)</Label>
              <Input
                id="promo-min-order"
                type="number"
                placeholder="e.g. 250"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
                className="h-10 sm:h-9 text-sm"
              />
              {formErrors.minOrderAmount && (
                <p className="text-xs text-destructive">{formErrors.minOrderAmount}</p>
              )}
            </div>

            {/* Target Products Scope */}
            <div className="space-y-3 border-t border-border/60 pt-3">
              <Label>Apply To *</Label>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("all");
                    setSelectedCategoryId("");
                    setSelectedProductIds([]);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center p-2 sm:p-2.5 min-h-[44px] sm:min-h-[40px] rounded-xl border text-center transition-all cursor-pointer",
                    targetType === "all"
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                      : "border-border bg-card hover:bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span className="text-[11px] sm:text-xs leading-tight">All Products</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("category");
                    setSelectedProductIds([]);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center p-2 sm:p-2.5 min-h-[44px] sm:min-h-[40px] rounded-xl border text-center transition-all cursor-pointer",
                    targetType === "category"
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                      : "border-border bg-card hover:bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span className="text-[11px] sm:text-xs leading-tight">Category</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTargetType("products");
                    setSelectedCategoryId("");
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center p-2 sm:p-2.5 min-h-[44px] sm:min-h-[40px] rounded-xl border text-center transition-all cursor-pointer",
                    targetType === "products"
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                      : "border-border bg-card hover:bg-muted/40 text-muted-foreground",
                  )}
                >
                  <span className="text-[11px] sm:text-xs leading-tight">Specific Products</span>
                </button>
              </div>

              {/* Case A: All Products */}
              {targetType === "all" && (
                <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">All Menu Products</p>
                  <p className="mt-0.5">
                    This promotion applies to every eligible café product across all menu
                    categories.
                  </p>
                </div>
              )}

              {/* Case B: Category */}
              {targetType === "category" && (
                <div className="space-y-1.5">
                  <Label htmlFor="promo-category-select">Select Category *</Label>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={(val) => setSelectedCategoryId(val)}
                  >
                    <SelectTrigger id="promo-category-select" className="h-10 sm:h-9 text-sm">
                      <SelectValue placeholder="Choose a menu category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesList
                        .filter((c) => c.active !== false)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {formErrors.category && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" /> {formErrors.category}
                    </p>
                  )}
                  {selectedCategoryId && (
                    <p className="text-xs text-muted-foreground">
                      Promotion applies to all available items under{" "}
                      <strong>{categoryMap.get(selectedCategoryId)?.name}</strong>.
                    </p>
                  )}
                </div>
              )}

              {/* Case C: Specific Products */}
              {targetType === "products" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Select the products that qualify for this discount:
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-1.5 sm:p-2 space-y-1 bg-card">
                    {availableProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2 text-center">
                        No menu items found in database.
                      </p>
                    ) : (
                      availableProducts.map((p) => {
                        const checked = selectedProductIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2.5 px-2.5 py-2 min-h-[36px] text-xs rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProductIds((prev) => [...prev, p.id]);
                                } else {
                                  setSelectedProductIds((prev) => prev.filter((id) => id !== p.id));
                                }
                              }}
                              className="size-4 shrink-0 rounded border-border"
                            />
                            <span className="font-medium text-foreground truncate min-w-0">
                              {p.name}
                            </span>
                            <span className="text-muted-foreground ml-auto shrink-0 pl-2 font-medium">
                              {formatETB(p.price)}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {formErrors.products && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="size-3" /> {formErrors.products}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setIsFormOpen(false)}
              className="w-full sm:w-auto h-11 sm:h-9"
            >
              Cancel
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={handleSavePromotion}
              className="w-full sm:w-auto h-11 sm:h-9"
            >
              {isSubmitting ? "Saving…" : editingPromotion ? "Save Changes" : "Create Promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. PROMOTION DETAILS DRAWER */}
      <Sheet
        open={selectedDetailsId !== null}
        onOpenChange={(open) => !open && setSelectedDetailsId(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-md md:max-w-lg overflow-y-auto p-5 sm:p-6 flex flex-col gap-6"
        >
          {selectedDetailsPromo ? (
            <>
              {/* Header */}
              <SheetHeader className="text-left space-y-2 pb-4 border-b border-border pr-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SheetTitle className="font-display text-xl sm:text-2xl font-bold break-words">
                    {selectedDetailsPromo.name}
                  </SheetTitle>
                  <StatusBadge status={derivePromotionStatus(selectedDetailsPromo)} />
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  {selectedDetailsPromo.description || "No description provided."}
                </SheetDescription>
              </SheetHeader>

              {/* Discount Value */}
              <section aria-labelledby="details-discount" className="space-y-2">
                <h3
                  id="details-discount"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Offer Terms
                </h3>
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs">Discount Value</span>
                    <Badge variant="default" className="font-bold text-sm bg-primary px-3 py-1">
                      {formatDiscount(selectedDetailsPromo)}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Discount Mode</span>
                    <span className="font-medium text-foreground">
                      {selectedDetailsPromo.discountType === "percentage"
                        ? "Percentage Rate (%)"
                        : "Fixed Deductible (ETB)"}
                    </span>
                  </div>
                  {selectedDetailsPromo.minOrderAmount && (
                    <div className="flex justify-between text-xs border-t border-border/50 pt-2">
                      <span className="text-muted-foreground">Minimum Order</span>
                      <span className="font-semibold text-foreground">
                        {formatETB(selectedDetailsPromo.minOrderAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* Campaign Schedule */}
              <section aria-labelledby="details-schedule" className="space-y-2">
                <h3
                  id="details-schedule"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Schedule Duration
                </h3>
                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Date</span>
                    <span className="font-semibold text-foreground">
                      {selectedDetailsPromo.startDate}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Date</span>
                    <span className="font-semibold text-foreground">
                      {selectedDetailsPromo.endDate}
                    </span>
                  </div>
                </div>
              </section>

              {/* Targeted Products / Scope */}
              {(() => {
                const detailsTargetType = resolvePromotionTargetType(selectedDetailsPromo);
                const detailsCategory = selectedDetailsPromo.categoryId
                  ? categoryMap.get(selectedDetailsPromo.categoryId)
                  : undefined;
                const categoryProducts = selectedDetailsPromo.categoryId
                  ? availableProducts.filter(
                      (p: PromotionProductItem) => p.categoryId === selectedDetailsPromo.categoryId,
                    )
                  : [];

                return (
                  <section aria-labelledby="details-products" className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3
                        id="details-products"
                        className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                      >
                        Target
                      </h3>
                      <span className="text-xs text-muted-foreground font-medium">
                        {detailsTargetType === "all"
                          ? "All Products"
                          : detailsTargetType === "category"
                            ? `Category: ${detailsCategory?.name || selectedDetailsPromo.categoryId || "Selected Category"}`
                            : `${selectedDetailsPromo.applicableProductIds.length} selected products`}
                      </span>
                    </div>

                    {detailsTargetType === "all" ? (
                      <div className="rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">All Products</p>
                        <p className="mt-0.5">
                          This offer applies to all eligible products across the entire Rekik Café
                          menu.
                        </p>
                      </div>
                    ) : detailsTargetType === "category" ? (
                      <div className="rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground space-y-2">
                        <div>
                          <p className="font-medium text-foreground">
                            Category: {detailsCategory?.name || "Selected Category"}
                          </p>
                          <p className="mt-0.5">
                            This offer applies to every eligible product inside the{" "}
                            <strong className="text-foreground">
                              {detailsCategory?.name || "selected"}
                            </strong>{" "}
                            category.
                          </p>
                        </div>
                        {categoryProducts.length > 0 && (
                          <div className="pt-2 border-t border-border/50">
                            <p className="text-[11px] font-medium text-foreground mb-1.5">
                              Category Items ({categoryProducts.length})
                            </p>
                            <ul className="divide-y divide-border/50 max-h-48 overflow-y-auto">
                              {categoryProducts.map((prod) => (
                                <li
                                  key={prod.id}
                                  className="flex items-center justify-between py-1.5 text-xs"
                                >
                                  <span className="text-foreground truncate">{prod.name}</span>
                                  <span className="text-muted-foreground font-medium">
                                    {formatETB(prod.price)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card/60 px-4 max-h-56 overflow-y-auto">
                        {selectedDetailsPromo.applicableProductIds.map((id) => {
                          const prod =
                            selectedDetailsPromo.products?.find((p) => p.id === id) ||
                            productMap.get(id);

                          if (!prod) {
                            return (
                              <li key={id} className="py-2.5 text-xs text-muted-foreground">
                                Product #{id} (not currently active in menu)
                              </li>
                            );
                          }
                          return (
                            <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {prod.imageUrl ? (
                                  <img
                                    src={prod.imageUrl}
                                    alt={prod.name}
                                    className="size-9 rounded-md object-cover bg-muted shrink-0"
                                    width={36}
                                    height={36}
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
                                    <ShoppingBag className="size-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground text-xs truncate">
                                    {prod.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {prod.isAvailable ? "Available" : "Unavailable"}
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                                {formatETB(prod.price)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })()}

              {/* Actions Footer */}
              <div className="pt-2 mt-auto border-t border-border flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-10 sm:h-9 gap-1.5"
                  onClick={() => {
                    openEditDialog(selectedDetailsPromo);
                    setSelectedDetailsId(null);
                  }}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  <span>Edit</span>
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 h-10 sm:h-9 gap-1.5"
                  onClick={() => setDeletingId(selectedDetailsPromo.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  <span>Delete</span>
                </Button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center space-y-3 my-auto">
              <h3 className="font-display text-lg font-semibold">Promotion not found</h3>
              <p className="text-xs text-muted-foreground">
                The selected promotion could not be retrieved from the database.
              </p>
              <Button variant="outline" size="sm" onClick={() => setSelectedDetailsId(null)}>
                Close
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 8. DELETE CONFIRMATION ALERT DIALOG */}
      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete promotion?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Are you sure you want to delete this promotion? This action permanently removes the
              promotional campaign from the café database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Promotion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
