/**
 * ============================================================================
 * Rekik Café — Category 4: Physical Inventory & Stock Monitoring Console
 * File: src/routes/admin.inventory.tsx
 * ============================================================================
 * Implements the Business Owner Inventory & Stock Monitoring console adhering
 * strictly to the Rekik Café Database Workflow & Table Usage Guide:
 * - Authoritative Menu Availability metrics (Available vs Unavailable)
 * - Strict separation between Menu Availability (is_available) and physical stock
 * - Zero fabricated stock numbers, movement histories, or fake starting counts
 * - Physical stock tracking states: Untracked, Uninitialized, Healthy, Low, Out
 * - Real, atomic stock adjustments: Opening Count, Purchase Receipt, Adjustment, Waste
 * - Append-only stock movement ledger tracking previous & resulting quantities
 * - Multi-criteria product catalog filtering and sorting
 * - Schema Readiness Assessment & copyable DDL migration blueprint
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Database,
  Eye,
  FileCheck2,
  FolderTree,
  History,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { formatETB } from "@/lib/menu-data";
import {
  configureProductInventoryTracking,
  filterInventoryProducts,
  loadInventoryMonitoringData,
  recordStockMutation,
  toggleAdminProductAvailability,
  type InventoryFilterOptions,
  type InventoryMonitoringData,
  type InventoryProductRecord,
  type InventorySortOption,
  type InventoryStockFilter,
  type PhysicalStockStatus,
  type StockMovementRecord,
  type StockMovementType,
} from "@/lib/inventory-monitoring";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/inventory")({
  head: () => ({
    meta: [
      { title: "Physical Inventory & Stock Monitoring — Rekik Café" },
      {
        name: "description",
        content:
          "Authoritative physical inventory tracking, stock movement ledger, and menu availability monitoring for Rekik Café.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RekikInventoryMonitoringPage,
});

function ProductThumbnail({ image, name }: { image?: string | undefined; name: string }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [image]);

  if (!image || !image.trim() || hasError) {
    return (
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0 border border-border/50">
        <UtensilsCrossed className="size-5" />
      </div>
    );
  }

  return (
    <img
      src={image.trim()}
      alt={name}
      loading="lazy"
      width={40}
      height={40}
      className="size-10 rounded-md object-cover bg-muted shrink-0 border border-border/50"
      onError={() => setHasError(true)}
    />
  );
}

function StockStatusBadge({
  status,
  quantity,
  unit,
}: {
  status: PhysicalStockStatus;
  quantity: number | null;
  unit: string;
}) {
  switch (status) {
    case "untracked":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-normal text-muted-foreground bg-muted/40 border-dashed"
        >
          Untracked
        </Badge>
      );
    case "uninitialized":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30"
        >
          Count Required
        </Badge>
      );
    case "out_of_stock":
      return (
        <Badge variant="destructive" className="text-[11px] font-medium">
          0 {unit} (Out of Stock)
        </Badge>
      );
    case "low_stock":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30"
        >
          {quantity} {unit} (Low Stock)
        </Badge>
      );
    case "healthy":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
        >
          {quantity} {unit}
        </Badge>
      );
  }
}

function MovementTypeBadge({ type }: { type: StockMovementType }) {
  switch (type) {
    case "opening":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium bg-blue-500/10 text-blue-600 border-blue-500/30"
        >
          Opening Count
        </Badge>
      );
    case "purchase":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
        >
          Purchase Receipt
        </Badge>
      );
    case "adjustment":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium bg-purple-500/10 text-purple-600 border-purple-500/30"
        >
          Audit Adjustment
        </Badge>
      );
    case "waste":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium bg-rose-500/10 text-rose-600 border-rose-500/30"
        >
          Waste / Disposal
        </Badge>
      );
    case "order_consumption":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium bg-amber-500/10 text-amber-600 border-amber-500/30"
        >
          Order Consumption
        </Badge>
      );
    case "order_cancellation_restoration":
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-medium bg-cyan-500/10 text-cyan-600 border-cyan-500/30"
        >
          Order Restored
        </Badge>
      );
  }
}

function RekikInventoryMonitoringPage() {
  const [data, setData] = useState<InventoryMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "unavailable">(
    "all",
  );
  const [stockFilter, setStockFilter] = useState<InventoryStockFilter>("all");
  const [sortBy, setSortBy] = useState<InventorySortOption>("name_asc");

  // Inspection Drawer
  const [selectedProduct, setSelectedProduct] = useState<InventoryProductRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modals
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [openingProduct, setOpeningProduct] = useState<InventoryProductRecord | null>(null);
  const [openingQuantity, setOpeningQuantity] = useState<string>("");
  const [openingUnit, setOpeningUnit] = useState<string>("portion");
  const [openingNotes, setOpeningNotes] = useState<string>("Initial opening inventory count");
  const [submittingMutation, setSubmittingMutation] = useState(false);

  // Manual Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<InventoryProductRecord | null>(null);
  const [adjustType, setAdjustType] = useState<"purchase" | "adjustment" | "waste">("purchase");
  const [adjustQtyChange, setAdjustQtyChange] = useState<string>("");
  const [adjustNotes, setAdjustNotes] = useState<string>("");

  // Tracking Configuration Modal
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configProduct, setConfigProduct] = useState<InventoryProductRecord | null>(null);
  const [configTrack, setConfigTrack] = useState<boolean>(true);
  const [configUnit, setConfigUnit] = useState<string>("portion");
  const [configThreshold, setConfigThreshold] = useState<string>("");

  // DDL Copy
  const [copied, setCopied] = useState(false);

  // Movement Ledger Filter
  const [movementFilter, setMovementFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await loadInventoryMonitoringData();
    if (res.error) {
      setError(res.error.message);
    } else if (res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Optimistic Menu Availability Toggle with Rollback
  const handleToggleAvailability = async (productId: string, currentAvailable: boolean) => {
    if (!data) return;
    const newStatus = !currentAvailable;

    // Optimistic UI update
    setData((prev) => {
      if (!prev) return prev;
      const updatedProducts = prev.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              available: newStatus,
              menuAvailabilityStatus: newStatus ? ("available" as const) : ("unavailable" as const),
            }
          : p,
      );

      const total = updatedProducts.length;
      const avail = updatedProducts.filter((p) => p.available).length;
      return {
        ...prev,
        products: updatedProducts,
        metrics: {
          ...prev.metrics,
          availableProducts: avail,
          unavailableProducts: total - avail,
        },
      };
    });

    const targetProd = data.products.find((p) => p.id === productId);

    try {
      const result = await toggleAdminProductAvailability(productId, newStatus);
      if (!result.success) {
        throw result.error instanceof Error
          ? result.error
          : new Error(String(result.error || "Failed to update availability"));
      }
      toast.success(
        newStatus
          ? `"${targetProd?.name ?? "Item"}" marked available for diner ordering.`
          : `"${targetProd?.name ?? "Item"}" marked unavailable (86'd).`,
      );
    } catch (err: unknown) {
      // Rollback on error
      setData((prev) => {
        if (!prev) return prev;
        const rolledBack = prev.products.map((p) =>
          p.id === productId
            ? {
                ...p,
                available: currentAvailable,
                menuAvailabilityStatus: currentAvailable
                  ? ("available" as const)
                  : ("unavailable" as const),
              }
            : p,
        );
        const total = rolledBack.length;
        const avail = rolledBack.filter((p) => p.available).length;
        return {
          ...prev,
          products: rolledBack,
          metrics: {
            ...prev.metrics,
            availableProducts: avail,
            unavailableProducts: total - avail,
          },
        };
      });

      const message = err instanceof Error ? err.message : "Database update failed";
      toast.error(`Could not toggle availability: ${message}`);
    }
  };

  // Open Opening Count Modal
  const openOpeningModal = (product: InventoryProductRecord) => {
    setOpeningProduct(product);
    setOpeningQuantity("");
    setOpeningUnit(product.stockUnit || "portion");
    setOpeningNotes("Initial opening stock verification");
    setOpeningModalOpen(true);
  };

  // Submit Opening Count
  const handleSubmitOpeningStock = async () => {
    if (!openingProduct) return;
    const qty = Number(openingQuantity);
    if (isNaN(qty) || qty < 0) {
      toast.error("Please enter a valid non-negative opening quantity.");
      return;
    }

    setSubmittingMutation(true);
    const res = await recordStockMutation({
      productId: openingProduct.id,
      productName: openingProduct.name,
      movementType: "opening",
      quantityChange: qty,
      notes: openingNotes.trim() || "Opening balance",
      currentProduct: openingProduct,
    });
    setSubmittingMutation(false);

    if (res.success) {
      toast.success(
        `Opening balance of ${qty} ${openingUnit} recorded for "${openingProduct.name}".`,
      );
      setOpeningModalOpen(false);
      loadData();
    } else {
      toast.error(res.error || "Failed to record opening stock.");
    }
  };

  // Open Adjustment Modal
  const openAdjustModal = (product: InventoryProductRecord) => {
    setAdjustProduct(product);
    setAdjustType("purchase");
    setAdjustQtyChange("");
    setAdjustNotes("");
    setAdjustModalOpen(true);
  };

  // Submit Adjustment
  const handleSubmitAdjustment = async () => {
    if (!adjustProduct) return;
    const rawVal = Number(adjustQtyChange);
    if (isNaN(rawVal) || rawVal === 0) {
      toast.error("Quantity change must be a non-zero number.");
      return;
    }

    // Purchase adds (+), Waste subtracts (-), Adjustment takes signed value
    let signedChange = rawVal;
    if (adjustType === "purchase") {
      signedChange = Math.abs(rawVal);
    } else if (adjustType === "waste") {
      signedChange = -Math.abs(rawVal);
    }

    if (!adjustNotes.trim()) {
      toast.error("Audit reason/notes are required for manual stock adjustments.");
      return;
    }

    setSubmittingMutation(true);
    const res = await recordStockMutation({
      productId: adjustProduct.id,
      productName: adjustProduct.name,
      movementType: adjustType,
      quantityChange: signedChange,
      notes: adjustNotes.trim(),
      currentProduct: adjustProduct,
    });
    setSubmittingMutation(false);

    if (res.success) {
      toast.success(
        `Stock mutation successfully applied to "${adjustProduct.name}". Resulting stock: ${res.newQuantity}.`,
      );
      setAdjustModalOpen(false);
      loadData();
    } else {
      toast.error(res.error || "Failed to record stock adjustment.");
    }
  };

  // Open Config Modal
  const openConfigModal = (product: InventoryProductRecord) => {
    setConfigProduct(product);
    setConfigTrack(product.trackInventory);
    setConfigUnit(product.stockUnit || "portion");
    setConfigThreshold(product.minStockThreshold !== null ? String(product.minStockThreshold) : "");
    setConfigModalOpen(true);
  };

  // Submit Tracking Config
  const handleSubmitConfig = async () => {
    if (!configProduct) return;
    const thresholdNum = configThreshold.trim() !== "" ? Number(configThreshold) : null;
    if (thresholdNum !== null && (isNaN(thresholdNum) || thresholdNum < 0)) {
      toast.error("Low stock threshold must be a non-negative number.");
      return;
    }

    setSubmittingMutation(true);
    const res = await configureProductInventoryTracking({
      productId: configProduct.id,
      trackInventory: configTrack,
      stockUnit: configUnit,
      minStockThreshold: thresholdNum,
    });
    setSubmittingMutation(false);

    if (res.success) {
      toast.success(`Inventory configuration updated for "${configProduct.name}".`);
      setConfigModalOpen(false);
      loadData();
    } else {
      toast.error(res.error || "Failed to update configuration.");
    }
  };

  const copyMigrationSql = () => {
    if (!data?.proposedMigrationSql) return;
    navigator.clipboard.writeText(data.proposedMigrationSql);
    setCopied(true);
    toast.success("Safe migration SQL copied to clipboard.");
    setTimeout(() => setCopied(false), 2500);
  };

  // Filtered Products
  const filterOptions: InventoryFilterOptions = useMemo(
    () => ({
      searchQuery,
      categorySlug: categoryFilter,
      availability: availabilityFilter,
      stockFilter,
      sortBy,
    }),
    [searchQuery, categoryFilter, availabilityFilter, stockFilter, sortBy],
  );

  const filteredProducts = useMemo(() => {
    if (!data?.products) return [];
    return filterInventoryProducts(data.products, filterOptions);
  }, [data?.products, filterOptions]);

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    if (!data?.recentMovements) return [];
    if (movementFilter === "all") return data.recentMovements;
    return data.recentMovements.filter((m) => m.movementType === movementFilter);
  }, [data?.recentMovements, movementFilter]);

  const categoriesList = useMemo(() => {
    if (!data?.metrics.categoryDistribution) return [];
    return data.metrics.categoryDistribution;
  }, [data?.metrics.categoryDistribution]);

  return (
    <div className="space-y-6 pb-12" id="owner-inventory-container">
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Inventory & Physical Stock Monitoring
            </h1>
            <Badge
              variant="outline"
              className="text-[11px] font-medium bg-primary/10 text-primary border-primary/30"
            >
              Category 4
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            Authoritative physical stock tracking, on-hand balances, immutable movement ledger, and
            diner-facing menu availability controls for Rekik Café.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => startTransition(loadData)}
            disabled={loading}
            className="text-xs gap-1.5 h-8.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── Error Banner ───────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 text-destructive p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-sm">Failed to load live database inventory data</p>
              <p className="mt-0.5 opacity-90">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 text-xs h-7"
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* ── Physical Stock vs Menu Availability Disclaimer Banner ────────────── */}
      <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <Layers className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs space-y-1">
            <p className="font-semibold text-sm text-blue-900 dark:text-blue-200">
              Two-Layer Inventory Architecture
            </p>
            <p className="text-blue-800/90 dark:text-blue-300/90 leading-relaxed">
              <strong>
                1. Menu Availability (
                <code className="text-[11px] font-mono bg-blue-100 dark:bg-blue-900/40 px-1 py-0.5 rounded">
                  is_available
                </code>
                ):
              </strong>{" "}
              Controls diner ordering. Toggling an item to &ldquo;Unavailable&rdquo; (86&apos;d)
              immediately prevents checkout.
              <br />
              <strong>2. Physical Stock:</strong> On-hand verified counts and immutable ledger.
              Items with tracking enabled require an explicit <em>Opening Count</em> before stock
              adjustments can be made. Uninitialized products are never assigned fictitious zero
              counts.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Top Metric Cards (Authoritative Data Only) ──────────────────────── */}
      <section aria-labelledby="inventory-overview-heading">
        <h2 id="inventory-overview-heading" className="sr-only">
          Inventory Overview
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* 1. Total Menu Products */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Catalog Items</span>
                <Package className="size-3.5 text-foreground/70" aria-hidden />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <div className="flex items-baseline gap-2 mt-1.5">
                  <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                    {data?.metrics.totalProducts ?? 0}
                  </p>
                  <span className="text-xs text-muted-foreground font-normal">items</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span>Categories</span>
              <span className="font-medium text-foreground">
                {data?.metrics.categoriesCount ?? 0} active
              </span>
            </div>
          </Card>

          {/* 2. Tracked Products */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Tracked Inventory</span>
                <Boxes className="size-3.5 text-blue-600 dark:text-blue-400" aria-hidden />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <div className="flex items-baseline gap-2 mt-1.5">
                  <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-blue-600 dark:text-blue-400">
                    {data?.metrics.trackedProductsCount ?? 0}
                  </p>
                  <span className="text-xs text-muted-foreground font-normal">
                    / {data?.metrics.totalProducts ?? 0}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span>Uninitialized</span>
              <span
                className={cn(
                  "font-medium",
                  (data?.metrics.uninitializedTrackedCount ?? 0) > 0
                    ? "text-amber-600"
                    : "text-muted-foreground",
                )}
              >
                {data?.metrics.uninitializedTrackedCount ?? 0} pending count
              </span>
            </div>
          </Card>

          {/* 3. Healthy In-Stock */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Healthy Stock</span>
                <CheckCircle2
                  className="size-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <div className="flex items-baseline gap-2 mt-1.5">
                  <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {data?.metrics.healthyStockCount ?? 0}
                  </p>
                  <span className="text-xs text-muted-foreground font-normal">items</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span>Available for order</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {data?.metrics.availableProducts ?? 0}
              </span>
            </div>
          </Card>

          {/* 4. Low & Out of Stock Alerts */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Attention Needed</span>
                <AlertTriangle
                  className="size-3.5 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <div className="flex items-baseline gap-2 mt-1.5">
                  <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-amber-600 dark:text-amber-400">
                    {(data?.metrics.physicalLowStockCount ?? 0) +
                      (data?.metrics.physicalOutOfStockCount ?? 0)}
                  </p>
                  <span className="text-xs text-muted-foreground font-normal">alerts</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span>Out of stock</span>
              <span
                className={cn(
                  "font-medium",
                  (data?.metrics.physicalOutOfStockCount ?? 0) > 0
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {data?.metrics.physicalOutOfStockCount ?? 0} items
              </span>
            </div>
          </Card>

          {/* 5. Movement Ledger Trail */}
          <Card className="p-3.5 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border/80 transition-colors col-span-2 lg:col-span-1">
            <div>
              <div className="flex items-center justify-between gap-1 text-muted-foreground">
                <span className="text-xs font-medium">Stock Ledger</span>
                <History className="size-3.5 text-foreground/70" aria-hidden />
              </div>
              {loading && !data ? (
                <Skeleton className="h-8 w-16 mt-2" />
              ) : (
                <div className="flex items-baseline gap-2 mt-1.5">
                  <p className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                    {data?.metrics.recentMovementsCount ?? 0}
                  </p>
                  <span className="text-xs text-muted-foreground font-normal">records</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
              <span>Audit Trail</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Append-only
              </span>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Main Tabbed Console ─────────────────────────────────────────────── */}
      <Tabs defaultValue="directory" className="space-y-4" id="inventory-tabs">
        <TabsList className="bg-secondary/40 border border-border/60 p-1">
          <TabsTrigger value="directory" className="text-xs gap-1.5">
            <Package className="size-3.5" />
            <span>Catalog & Stock</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono">
              {data?.products.length ?? 0}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="movements" className="text-xs gap-1.5">
            <History className="size-3.5" />
            <span>Stock Movements Ledger</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono">
              {data?.recentMovements.length ?? 0}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="categories" className="text-xs gap-1.5">
            <FolderTree className="size-3.5" />
            <span>Category Distribution</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono">
              {data?.metrics.categoriesCount ?? 0}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="schema" className="text-xs gap-1.5">
            <Database className="size-3.5" />
            <span>Schema & DDL Migration</span>
            <Badge
              variant="outline"
              className="ml-1 text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
            >
              Ready
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Product Catalog & Physical Stock Table ───────────────────── */}
        <TabsContent value="directory" className="space-y-4">
          {/* Filters Bar */}
          <Card className="p-3.5 sm:p-4 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search */}
              <div className="lg:col-span-2 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, description, ingredients…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-9"
                />
              </div>

              {/* Category Filter */}
              <div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All Categories ({data?.products.length ?? 0})
                    </SelectItem>
                    {categoriesList.map((cat) => (
                      <SelectItem key={cat.categorySlug} value={cat.categorySlug}>
                        {cat.categoryName} ({cat.totalProducts})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stock Filter */}
              <div>
                <Select
                  value={stockFilter}
                  onValueChange={(v) => setStockFilter(v as InventoryStockFilter)}
                >
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Physical Stock State" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock States</SelectItem>
                    <SelectItem value="tracked">Tracked Items Only</SelectItem>
                    <SelectItem value="untracked">Untracked Items</SelectItem>
                    <SelectItem value="uninitialized">Count Required (Uninitialized)</SelectItem>
                    <SelectItem value="healthy">Healthy In-Stock</SelectItem>
                    <SelectItem value="low_stock">Low Stock Warning</SelectItem>
                    <SelectItem value="out_of_stock">Out of Stock (0 On-Hand)</SelectItem>
                    <SelectItem value="menu_available">Menu Available</SelectItem>
                    <SelectItem value="menu_unavailable">Menu 86&apos;d (Unavailable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as InventorySortOption)}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name_asc">Name (A → Z)</SelectItem>
                    <SelectItem value="name_desc">Name (Z → A)</SelectItem>
                    <SelectItem value="price_asc">Price (Lowest first)</SelectItem>
                    <SelectItem value="price_desc">Price (Highest first)</SelectItem>
                    <SelectItem value="stock_asc">Stock (Lowest first)</SelectItem>
                    <SelectItem value="stock_desc">Stock (Highest first)</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="availability">Menu Availability</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active Filters Summary */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>
                  Showing <strong>{filteredProducts.length}</strong> of{" "}
                  <strong>{data?.products.length ?? 0}</strong> products
                </span>
                {(searchQuery ||
                  categoryFilter !== "all" ||
                  availabilityFilter !== "all" ||
                  stockFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setCategoryFilter("all");
                      setAvailabilityFilter("all");
                      setStockFilter("all");
                    }}
                    className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Available: {data?.metrics.availableProducts ?? 0}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  86&apos;d: {data?.metrics.unavailableProducts ?? 0}
                </span>
              </div>
            </div>
          </Card>

          {/* Catalog & Physical Stock Table */}
          <Card className="shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="w-12">Item</TableHead>
                    <TableHead className="min-w-[180px]">Product Name</TableHead>
                    <TableHead className="min-w-[120px]">Category</TableHead>
                    <TableHead className="text-right min-w-[90px]">Price</TableHead>
                    <TableHead className="min-w-[140px]">Menu Availability</TableHead>
                    <TableHead className="min-w-[160px]">Physical Stock</TableHead>
                    <TableHead className="text-right min-w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && !data ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="size-10 rounded-md" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="h-4 w-16 ml-auto" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-28" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Skeleton className="h-8 w-24 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-48 text-center">
                        <EmptyState
                          title="No products match your criteria"
                          description="Try clearing search keywords or resetting category and stock state filters."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map((product) => (
                      <TableRow
                        key={product.id}
                        className={cn(
                          "transition-colors text-xs hover:bg-muted/40",
                          !product.available && "bg-muted/15 opacity-90",
                        )}
                      >
                        {/* Thumbnail */}
                        <TableCell className="py-2.5">
                          <ProductThumbnail image={product.image} name={product.name} />
                        </TableCell>

                        {/* Name & Ingredients */}
                        <TableCell className="py-2.5">
                          <div className="flex flex-col">
                            <span
                              className="font-medium text-foreground hover:underline cursor-pointer"
                              onClick={() => {
                                setSelectedProduct(product);
                                setDrawerOpen(true);
                              }}
                            >
                              {product.name}
                            </span>
                            {product.description && (
                              <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                {product.description}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Category */}
                        <TableCell className="py-2.5">
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {product.categoryName}
                          </Badge>
                        </TableCell>

                        {/* Price */}
                        <TableCell className="py-2.5 text-right font-medium">
                          {formatETB(product.price)}
                        </TableCell>

                        {/* Menu Availability Switch */}
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={product.available}
                              onCheckedChange={() =>
                                handleToggleAvailability(product.id, product.available)
                              }
                              aria-label={`Toggle availability for ${product.name}`}
                              className="scale-85"
                            />
                            <span
                              className={cn(
                                "text-[11px] font-medium",
                                product.available
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-destructive",
                              )}
                            >
                              {product.available ? "Available" : "86'd (Unavailable)"}
                            </span>
                          </div>
                        </TableCell>

                        {/* Physical Stock Badge */}
                        <TableCell className="py-2.5">
                          <StockStatusBadge
                            status={product.stockTrackingStatus}
                            quantity={product.stockQuantity}
                            unit={product.stockUnit}
                          />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {product.trackInventory && product.stockQuantity === null ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openOpeningModal(product)}
                                className="h-7 text-[11px] px-2 text-amber-600 border-amber-500/30 hover:bg-amber-500/10 gap-1"
                              >
                                <Plus className="size-3" />
                                <span>Set Opening</span>
                              </Button>
                            ) : product.trackInventory ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAdjustModal(product)}
                                className="h-7 text-[11px] px-2 gap-1"
                              >
                                <ArrowUpDown className="size-3" />
                                <span>Adjust</span>
                              </Button>
                            ) : null}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openConfigModal(product)}
                              title="Configure stock tracking"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            >
                              <Settings2 className="size-3.5" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedProduct(product);
                                setDrawerOpen(true);
                              }}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Stock Movements Ledger ───────────────────────────────────── */}
        <TabsContent value="movements" className="space-y-4">
          <Card className="p-3.5 sm:p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm text-foreground">Immutable Stock Ledger</h3>
                <p className="text-xs text-muted-foreground">
                  Auditable history of all receipts, adjustments, consumptions, and spoilage
                  entries.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Select value={movementFilter} onValueChange={setMovementFilter}>
                  <SelectTrigger className="text-xs h-8.5 w-[180px]">
                    <SelectValue placeholder="All Movement Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Movements</SelectItem>
                    <SelectItem value="opening">Opening Balances</SelectItem>
                    <SelectItem value="purchase">Purchase Receipts</SelectItem>
                    <SelectItem value="adjustment">Manual Adjustments</SelectItem>
                    <SelectItem value="waste">Waste / Damaged</SelectItem>
                    <SelectItem value="order_consumption">Order Consumption</SelectItem>
                    <SelectItem value="order_cancellation_restoration">
                      Order Restorations
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 text-xs">
                    <TableHead className="min-w-[140px]">Timestamp</TableHead>
                    <TableHead className="min-w-[160px]">Product</TableHead>
                    <TableHead className="min-w-[130px]">Movement Type</TableHead>
                    <TableHead className="text-right min-w-[110px]">Change</TableHead>
                    <TableHead className="text-right min-w-[120px]">Resulting Stock</TableHead>
                    <TableHead className="min-w-[140px]">Reference / Order</TableHead>
                    <TableHead className="min-w-[200px]">Notes & Audit Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-40 text-center">
                        <EmptyState
                          title="No stock movements recorded"
                          description="Recorded opening balances, purchases, adjustments, and waste movements will appear here automatically."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMovements.map((mov) => (
                      <TableRow key={mov.id} className="text-xs hover:bg-muted/30">
                        {/* Timestamp */}
                        <TableCell className="py-2.5 text-muted-foreground whitespace-nowrap">
                          {new Date(mov.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>

                        {/* Product */}
                        <TableCell className="py-2.5 font-medium text-foreground">
                          {mov.productName}
                        </TableCell>

                        {/* Movement Type */}
                        <TableCell className="py-2.5">
                          <MovementTypeBadge type={mov.movementType} />
                        </TableCell>

                        {/* Signed Change */}
                        <TableCell className="py-2.5 text-right font-mono font-medium">
                          <span
                            className={cn(
                              mov.quantityChange > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400",
                            )}
                          >
                            {mov.quantityChange > 0 ? `+${mov.quantityChange}` : mov.quantityChange}
                          </span>
                        </TableCell>

                        {/* Resulting Stock */}
                        <TableCell className="py-2.5 text-right font-mono text-foreground font-semibold">
                          {mov.newQuantity}
                        </TableCell>

                        {/* Reference Order */}
                        <TableCell className="py-2.5 text-muted-foreground font-mono text-[11px]">
                          {mov.referenceOrderId ? (
                            <span className="bg-muted px-1.5 py-0.5 rounded border border-border/50">
                              #{mov.referenceOrderId.slice(0, 8)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        {/* Notes */}
                        <TableCell className="py-2.5 text-muted-foreground">
                          {mov.notes || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Category Distribution ────────────────────────────────────── */}
        <TabsContent value="categories" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoriesList.map((cat) => (
              <Card key={cat.categoryId} className="p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground">{cat.categoryName}</h3>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {cat.totalProducts} items
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <div className="bg-muted/40 p-2 rounded">
                      <span className="text-muted-foreground block text-[10px]">Available</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {cat.availableProducts}
                      </span>
                    </div>
                    <div className="bg-muted/40 p-2 rounded">
                      <span className="text-muted-foreground block text-[10px]">86&apos;d</span>
                      <span className="font-semibold text-destructive">
                        {cat.unavailableProducts}
                      </span>
                    </div>
                    <div className="bg-muted/40 p-2 rounded">
                      <span className="text-muted-foreground block text-[10px]">Tracked Items</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {cat.trackedProducts}
                      </span>
                    </div>
                    <div className="bg-muted/40 p-2 rounded">
                      <span className="text-muted-foreground block text-[10px]">
                        Low / Out Alerts
                      </span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {cat.lowStockCount + cat.outOfStockCount}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Average Price:</span>
                  <span className="font-medium text-foreground">{formatETB(cat.avgPrice)}</span>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 4: Physical Schema Readiness & Migration Blueprint ──────────── */}
        <TabsContent value="schema" className="space-y-4">
          <Card className="p-4 sm:p-5 shadow-xs border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm text-emerald-900 dark:text-emerald-200">
                  Migration Blueprint Ready: 20261018170000_physical_inventory_tracking.sql
                </h3>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-0.5">
                  Safe, non-destructive migration file created in repository. Adds nullable physical
                  stock columns, append-only stock movement ledger, serialized mutation RPC, and
                  least-privilege security policies.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={copyMigrationSql}
                className="gap-1.5 text-xs h-8.5 shrink-0 bg-background text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/10"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <ClipboardCopy className="size-3.5" />
                )}
                <span>{copied ? "Copied DDL" : "Copy Migration SQL"}</span>
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.schemaGaps.map((item) => (
              <Card key={item.id} className="p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-xs text-foreground">{item.title}</h4>
                    <Badge
                      variant={
                        item.status === "supported"
                          ? "outline"
                          : item.status === "migration_ready"
                            ? "outline"
                            : "secondary"
                      }
                      className={cn(
                        "text-[10px] font-medium capitalize",
                        item.status === "supported" &&
                          "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                        item.status === "migration_ready" &&
                          "bg-blue-500/10 text-blue-600 border-blue-500/30",
                        item.status === "architectural_gap" &&
                          "bg-amber-500/10 text-amber-600 border-amber-500/30",
                      )}
                    >
                      {item.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground font-mono bg-muted/30 p-2 rounded">
                  <strong>Impact:</strong> {item.impact}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialog 1: Record Opening Stock Count ─────────────────────────────── */}
      <Dialog open={openingModalOpen} onOpenChange={setOpeningModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Record Opening Stock Count
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter the verified on-hand physical stock for <strong>{openingProduct?.name}</strong>.
              This sets the authoritative starting balance and enables subsequent adjustments.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="opening-qty" className="text-xs">
                Verified On-Hand Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="opening-qty"
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 50"
                value={openingQuantity}
                onChange={(e) => setOpeningQuantity(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="opening-unit" className="text-xs">
                Unit of Measure
              </Label>
              <Select value={openingUnit} onValueChange={setOpeningUnit}>
                <SelectTrigger id="opening-unit" className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portion">portion</SelectItem>
                  <SelectItem value="bottle">bottle</SelectItem>
                  <SelectItem value="can">can</SelectItem>
                  <SelectItem value="unit">unit</SelectItem>
                  <SelectItem value="cup">cup</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="liter">liter</SelectItem>
                  <SelectItem value="pack">pack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="opening-notes" className="text-xs">
                Audit Notes / Source
              </Label>
              <Input
                id="opening-notes"
                placeholder="e.g. Physical inventory count verified by Owner"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpeningModalOpen(false)}
              disabled={submittingMutation}
              className="text-xs h-8.5"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitOpeningStock}
              disabled={submittingMutation || !openingQuantity}
              className="text-xs h-8.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submittingMutation ? "Recording…" : "Save Opening Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 2: Record Manual Stock Adjustment ─────────────────────────── */}
      <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Adjust Physical Stock: {adjustProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Current on-hand:{" "}
              <strong>
                {adjustProduct?.stockQuantity ?? 0} {adjustProduct?.stockUnit}
              </strong>
              . All adjustments are written to the append-only audit ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="adjust-type" className="text-xs">
                Adjustment Reason / Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={adjustType}
                onValueChange={(v) => setAdjustType(v as "purchase" | "adjustment" | "waste")}
              >
                <SelectTrigger id="adjust-type" className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">
                    Purchase Receipt (Restock / Delivery receipt)
                  </SelectItem>
                  <SelectItem value="adjustment">
                    Audit Reconciliation (Physical count correction)
                  </SelectItem>
                  <SelectItem value="waste">
                    Waste / Spoilage (Damaged, expired, dropped)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adjust-qty" className="text-xs">
                {adjustType === "purchase"
                  ? "Quantity Received (+)"
                  : adjustType === "waste"
                    ? "Quantity Damaged / Spoiled (-)"
                    : "Quantity Change (+ / -)"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adjust-qty"
                type="number"
                step="any"
                placeholder={adjustType === "waste" ? "e.g. 5" : "e.g. 24"}
                value={adjustQtyChange}
                onChange={(e) => setAdjustQtyChange(e.target.value)}
                className="text-xs h-9"
              />
              <span className="text-[11px] text-muted-foreground block">
                Resulting on-hand will be calculated atomically inside the database. Negative stock
                is rejected.
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adjust-notes" className="text-xs">
                Audit Justification / Invoice Ref <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adjust-notes"
                placeholder="e.g. Supplier Invoice #INV-8821 or Spilled batch in kitchen"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustModalOpen(false)}
              disabled={submittingMutation}
              className="text-xs h-8.5"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitAdjustment}
              disabled={submittingMutation || !adjustQtyChange || !adjustNotes.trim()}
              className="text-xs h-8.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submittingMutation ? "Applying…" : "Apply Mutation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 3: Configure Tracking & Thresholds ────────────────────────── */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Stock Tracking Settings</DialogTitle>
            <DialogDescription className="text-xs">
              Configure inventory tracking parameters for <strong>{configProduct?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 border border-border/50">
              <div className="space-y-0.5">
                <Label htmlFor="config-track" className="text-xs font-medium">
                  Track Physical Inventory
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Enable on-hand balance and movement logging.
                </p>
              </div>
              <Switch id="config-track" checked={configTrack} onCheckedChange={setConfigTrack} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="config-unit" className="text-xs">
                Standard Unit of Measure
              </Label>
              <Select value={configUnit} onValueChange={setConfigUnit}>
                <SelectTrigger id="config-unit" className="text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portion">portion</SelectItem>
                  <SelectItem value="bottle">bottle</SelectItem>
                  <SelectItem value="can">can</SelectItem>
                  <SelectItem value="unit">unit</SelectItem>
                  <SelectItem value="cup">cup</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="liter">liter</SelectItem>
                  <SelectItem value="pack">pack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="config-threshold" className="text-xs">
                Low Stock Alert Threshold
              </Label>
              <Input
                id="config-threshold"
                type="number"
                min="0"
                placeholder="e.g. 10 (Leave blank for store default)"
                value={configThreshold}
                onChange={(e) => setConfigThreshold(e.target.value)}
                className="text-xs h-9"
              />
              <span className="text-[11px] text-muted-foreground block">
                When stock falls to or below this count, item is flagged for restock.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigModalOpen(false)}
              disabled={submittingMutation}
              className="text-xs h-8.5"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitConfig}
              disabled={submittingMutation}
              className="text-xs h-8.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {submittingMutation ? "Saving…" : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Item Detail Inspection Sheet ────────────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center gap-3">
              <ProductThumbnail image={selectedProduct?.image} name={selectedProduct?.name ?? ""} />
              <div>
                <SheetTitle className="text-base font-bold text-foreground">
                  {selectedProduct?.name}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  {selectedProduct?.categoryName} • {formatETB(selectedProduct?.price ?? 0)}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {selectedProduct && (
            <div className="space-y-5 pt-4 text-xs">
              {/* Menu Availability Section */}
              <div className="p-3 rounded-md border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Menu Availability Status</span>
                  <Badge
                    variant={selectedProduct.available ? "outline" : "destructive"}
                    className={cn(
                      "text-[10px]",
                      selectedProduct.available &&
                        "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
                    )}
                  >
                    {selectedProduct.available ? "Available" : "Unavailable (86'd)"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Controls whether customers can add this item to their cart and checkout.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleToggleAvailability(selectedProduct.id, selectedProduct.available)
                  }
                  className="w-full text-xs h-8 mt-2"
                >
                  {selectedProduct.available ? "Mark Unavailable (86)" : "Mark Available"}
                </Button>
              </div>

              {/* Physical Inventory Section */}
              <div className="p-3 rounded-md border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Physical Stock Status</span>
                  <StockStatusBadge
                    status={selectedProduct.stockTrackingStatus}
                    quantity={selectedProduct.stockQuantity}
                    unit={selectedProduct.stockUnit}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block">On-Hand Quantity:</span>
                    <span className="font-semibold text-foreground">
                      {selectedProduct.stockQuantity !== null
                        ? `${selectedProduct.stockQuantity} ${selectedProduct.stockUnit}`
                        : "Uninitialized (Count Required)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Low Stock Alert:</span>
                    <span className="font-semibold text-foreground">
                      {selectedProduct.minStockThreshold !== null
                        ? `≤ ${selectedProduct.minStockThreshold} ${selectedProduct.stockUnit}`
                        : "Global default (≤ 10)"}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  {selectedProduct.trackInventory && selectedProduct.stockQuantity === null ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDrawerOpen(false);
                        openOpeningModal(selectedProduct);
                      }}
                      className="w-full text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      Record Opening Count
                    </Button>
                  ) : selectedProduct.trackInventory ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDrawerOpen(false);
                        openAdjustModal(selectedProduct);
                      }}
                      className="w-full text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      Record Stock Movement
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* Recipe Ingredients (Culinary Reference) */}
              <div className="space-y-2">
                <span className="font-medium text-foreground block">
                  Culinary Ingredients (Display List)
                </span>
                {selectedProduct.ingredients && selectedProduct.ingredients.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProduct.ingredients.map((ing, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[11px] font-normal">
                        {ing}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-[11px]">No ingredients listed.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
