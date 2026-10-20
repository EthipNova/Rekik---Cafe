import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  Filter,
  Kanban,
  List,
  MapPin,
  Phone,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Store,
  Truck,
  User,
  UserCheck,
  Utensils,
  XCircle,
  ZoomIn,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { OrderTimeline } from "@/components/site/OrderTimeline";
import { formatETB } from "@/lib/menu-data";
import {
  flowFor,
  methodLabels,
  statusLabels,
  type Order,
  type OrderMethod,
  type OrderStatus,
} from "@/lib/orders";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  approvePaymentProof,
  fetchOrders,
  markCashPaymentSettled,
  recordWaiterDecision,
  recordWaiterPaymentCollection,
  rejectPaymentProof,
  updateOrderStatus as apiUpdateOrderStatus,
} from "@/services/api";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({
    meta: [
      { title: "Live Orders & Kitchen Tracking — Rekik Coffee Admin" },
      {
        name: "description",
        content:
          "Real-time order management, kitchen tracking, and delivery fulfillment for Rekik Coffee.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOrdersPage,
});

type ViewMode = "board" | "table";

const STATUS_COLUMNS: { status: OrderStatus; label: string; description: string; color: string }[] =
  [
    {
      status: "received",
      label: "New / Received",
      description: "Orders awaiting kitchen acknowledgement",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    },
    {
      status: "confirmed",
      label: "Confirmed",
      description: "Accepted orders queued for cooking",
      color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
    },
    {
      status: "preparing",
      label: "In Kitchen",
      description: "Currently being prepared by the kitchen team",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    },
    {
      status: "ready",
      label: "Ready for Pickup",
      description: "Cooked and ready on the counter",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    },
    {
      status: "out-for-delivery",
      label: "Out for Delivery",
      description: "Assigned to courier / in transit",
      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    },
    {
      status: "completed",
      label: "Completed",
      description: "Delivered or served successfully",
      color: "bg-success/15 text-success border-success/30",
    },
  ];

function getNextStatus(order: Order): OrderStatus | null {
  const flow = flowFor(order.method);
  const index = flow.indexOf(order.status);
  if (index >= 0 && index < flow.length - 1) {
    return flow[index + 1]!;
  }
  return null;
}

function getNextActionLabel(order: Order): string {
  const next = getNextStatus(order);
  if (!next) return "Fulfilled";
  switch (next) {
    case "confirmed":
      return "Accept & Confirm";
    case "preparing":
      return "Start Kitchen Prep";
    case "ready":
      return "Mark as Ready";
    case "out-for-delivery":
      return "Dispatch Courier";
    case "delivered":
      return "Mark Delivered";
    case "completed":
      return order.method === "delivery" ? "Complete Delivery" : "Complete Order";
    default:
      return `Move to ${statusLabels[next]}`;
  }
}

function getNextShortActionLabel(order: Order): string {
  const next = getNextStatus(order);
  if (!next) return "Done";
  switch (next) {
    case "confirmed":
      return "Confirm";
    case "preparing":
      return "Prep";
    case "ready":
      return "Ready";
    case "out-for-delivery":
      return "Dispatch";
    case "delivered":
      return "Delivered";
    case "completed":
      return "Complete";
    default:
      return statusLabels[next] || "Next";
  }
}

function MethodBadge({ method }: { method: OrderMethod }) {
  if (method === "dine-in") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
      >
        <Utensils className="size-3" />
        <span>Dine-in</span>
      </Badge>
    );
  }
  if (method === "takeaway") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
      >
        <Store className="size-3" />
        <span>Takeaway</span>
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    >
      <Truck className="size-3" />
      <span>Delivery</span>
    </Badge>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const found = STATUS_COLUMNS.find((c) => c.status === status);
  const colorClass = found ? found.color : "bg-muted text-muted-foreground";

  return (
    <Badge variant="outline" className={cn("text-xs font-medium py-0.5 px-2", colorClass)}>
      {statusLabels[status] || status}
    </Badge>
  );
}

function formatElapsed(createdAt: string): string {
  try {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  } catch {
    return "";
  }
}

function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Waiter collection & decision states
  const [waiterRefInput, setWaiterRefInput] = useState("");
  const [waiterNoteInput, setWaiterNoteInput] = useState("");
  const [collectingPayment, setCollectingPayment] = useState(false);
  const [waiterDecisionLoading, setWaiterDecisionLoading] = useState(false);

  // Cashier verification states
  const [proofActionLoading, setProofActionLoading] = useState(false);
  const [rejectProofOpen, setRejectProofOpen] = useState(false);
  const [rejectProofReason, setRejectProofReason] = useState("");
  const [proofZoomOpen, setProofZoomOpen] = useState(false);
  const [proofZoomUrl, setProofZoomUrl] = useState<string | null>(null);

  const handleRecordWaiterCollection = async (orderId: string) => {
    if (!waiterRefInput.trim()) {
      toast.error("Please enter the collected transaction reference number.");
      return;
    }
    setCollectingPayment(true);
    try {
      await recordWaiterPaymentCollection({
        orderId,
        transactionReference: waiterRefInput.trim(),
        notes: waiterNoteInput.trim() || undefined,
      });
      toast.success("Payment details recorded and submitted for cashier verification!");
      setWaiterRefInput("");
      setWaiterNoteInput("");
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to record payment details";
      toast.error(msg);
    } finally {
      setCollectingPayment(false);
    }
  };

  const handleWaiterDecisionAction = async (
    orderId: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) => {
    setWaiterDecisionLoading(true);
    try {
      await recordWaiterDecision({
        orderId,
        decision,
        reason,
      });
      toast.success(
        decision === "approved" ? "Order approved by waiter!" : "Order declined by waiter.",
      );
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to record waiter decision";
      toast.error(msg);
    } finally {
      setWaiterDecisionLoading(false);
    }
  };

  const handleApproveProof = async (orderId: string) => {
    setProofActionLoading(true);
    try {
      await approvePaymentProof({ orderId, note: "Verified by staff in orders dashboard" });
      toast.success("Payment proof approved & order marked paid!");
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to approve payment";
      toast.error(msg);
    } finally {
      setProofActionLoading(false);
    }
  };

  const handleConfirmRejectProof = async (orderId: string) => {
    if (!rejectProofReason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    setProofActionLoading(true);
    try {
      await rejectPaymentProof({ orderId, reason: rejectProofReason.trim() });
      toast.success("Payment proof rejected.");
      setRejectProofOpen(false);
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reject payment";
      toast.error(msg);
    } finally {
      setProofActionLoading(false);
    }
  };

  const handleSettleCashOrder = async (orderId: string) => {
    setProofActionLoading(true);
    try {
      await markCashPaymentSettled({ orderId, note: "Settled in cash" });
      toast.success("Cash payment marked as settled!");
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to settle cash payment";
      toast.error(msg);
    } finally {
      setProofActionLoading(false);
    }
  };

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const fetched = await fetchOrders({ token });
      setOrders(fetched);
    } catch (err) {
      console.warn("Failed to load admin orders from database:", err);
      setOrders([]);
    } finally {
      setLoading(false);
      if (isManual) {
        setRefreshing(false);
        toast.success("Orders synced with database");
      }
    }
  };

  useEffect(() => {
    void loadData();

    // Set up Realtime Supabase updates
    const channel = supabase
      .channel("admin-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload: { eventType: string; new: { order_number?: string } }) => {
          if (payload.eventType === "INSERT") {
            toast.info(`New order placed: ${payload.new?.order_number || "Customer Order"}!`, {
              icon: "🔔",
            });
          }
          void loadData();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_status_logs" }, () => {
        void loadData();
      })
      .subscribe();

    // Storage event for fallback multi-tab sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "neba.orders.v1") {
        void loadData();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Periodic auto-sync
    const timer = setInterval(() => {
      void loadData();
    }, 25000);

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("storage", handleStorage);
      clearInterval(timer);
    };
  }, []);

  const handleAdvanceStatus = async (order: Order) => {
    const next = getNextStatus(order);
    if (!next) return;

    setUpdatingId(order.id);
    // Optimistic UI update
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));

    try {
      await apiUpdateOrderStatus(order.id, next);
      toast.success(`${order.number} moved to ${statusLabels[next]}`);
    } catch (err) {
      console.warn("Failed to update status through API:", err);
      toast.error("Failed to update status on server");
      void loadData();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSetExplicitStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingId(orderId);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));

    try {
      await apiUpdateOrderStatus(orderId, nextStatus);
      toast.success(`Order status updated to ${statusLabels[nextStatus]}`);
    } catch (err) {
      console.warn("Failed to update status:", err);
      toast.error("Failed to update status on server");
      void loadData();
    } finally {
      setUpdatingId(null);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return orders.filter((o) => {
      if (methodFilter !== "all" && o.method !== methodFilter) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;

      if (!q) return true;
      const matchesNum = (o.number || o.id).toLowerCase().includes(q);
      const matchesName = (o.customer?.name || "").toLowerCase().includes(q);
      const matchesPhone = (o.customer?.phone || "").toLowerCase().includes(q);
      const matchesAddress = (o.customer?.address || "").toLowerCase().includes(q);
      const matchesWaiter = (o.waiterName || "").toLowerCase().includes(q);
      const matchesItem = o.items.some((i) => i.name.toLowerCase().includes(q));

      return (
        matchesNum ||
        matchesName ||
        matchesPhone ||
        matchesAddress ||
        matchesWaiter ||
        matchesItem
      );
    });
  }, [orders, searchQuery, methodFilter, statusFilter]);

  // Key KPI metrics
  const activeCount = orders.filter((o) =>
    ["received", "confirmed", "preparing", "ready"].includes(o.status),
  ).length;
  const inDeliveryCount = orders.filter((o) => o.status === "out-for-delivery").length;
  const completedTodayCount = orders.filter((o) =>
    ["delivered", "completed"].includes(o.status),
  ).length;
  const todayRevenue = orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  const selectedOrder =
    orders.find((o) => o.id === selectedOrderId || o.number === selectedOrderId) ?? null;

  return (
    <div className="space-y-6">
      {/* Top Header & Real-time status */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              Order Management
            </h1>
            <Badge
              variant="outline"
              className="gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-medium"
            >
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Synced
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time kitchen order tracking, ticket status advancement, and customer fulfillment.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-lg border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "board"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Kanban className="size-3.5" />
              Board View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "table"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="size-3.5" />
              Table View
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </div>
      </header>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <div className="surface-card flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4">
          <div className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
            <Utensils className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">Active Kitchen</p>
            <p className="text-xl sm:text-2xl font-semibold font-display mt-0.5">{activeCount}</p>
          </div>
        </div>

        <div className="surface-card flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4">
          <div className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 shrink-0">
            <Truck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">In Delivery</p>
            <p className="text-xl sm:text-2xl font-semibold font-display mt-0.5">
              {inDeliveryCount}
            </p>
          </div>
        </div>

        <div className="surface-card flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4">
          <div className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">Completed Today</p>
            <p className="text-xl sm:text-2xl font-semibold font-display mt-0.5">
              {completedTodayCount}
            </p>
          </div>
        </div>

        <div className="surface-card flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4">
          <div className="flex size-10 sm:size-11 items-center justify-center rounded-xl bg-primary/15 text-primary shrink-0">
            <Receipt className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">Paid Volume</p>
            <p className="text-xl sm:text-2xl font-semibold font-display mt-0.5">
              {formatETB(todayRevenue)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, customer, phone, table..."
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:items-center sm:w-auto">
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="h-9 w-full sm:w-36 text-xs">
                <SelectValue placeholder="All Methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="dine-in">Dine-in</SelectItem>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-38 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="received">New / Received</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="preparing">In Kitchen</SelectItem>
                <SelectItem value="ready">Ready for Pickup</SelectItem>
                <SelectItem value="out-for-delivery">Out for Delivery</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(searchQuery || methodFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setMethodFilter("all");
                setStatusFilter("all");
              }}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground self-start sm:self-auto"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area: Kanban vs Table */}
      {loading ? (
        <div className="surface-card flex items-center justify-center p-16 text-sm text-muted-foreground">
          <RefreshCw className="mr-2.5 size-5 animate-spin text-primary" />
          Loading live orders from Supabase…
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-8 text-muted-foreground" />}
          title="No matching orders"
          description={
            orders.length === 0
              ? "New customer orders will appear here in real-time as they are placed."
              : "Try adjusting your search query or filter criteria."
          }
        />
      ) : viewMode === "board" ? (
        /* KANBAN BOARD VIEW */
        <div className="grid gap-4 overflow-x-auto pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {STATUS_COLUMNS.map((column) => {
            const colOrders = filteredOrders.filter((o) => {
              if (column.status === "completed") {
                return o.status === "completed" || o.status === "delivered";
              }
              return o.status === column.status;
            });

            return (
              <div
                key={column.status}
                className="flex flex-col rounded-xl border border-border bg-secondary/30 p-3 min-w-[280px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-foreground">
                      {column.label}
                    </h2>
                  </div>
                  <span className="flex size-5 items-center justify-center rounded-full bg-card text-xs font-semibold border border-border shadow-2xs">
                    {colOrders.length}
                  </span>
                </div>

                {/* Cards List */}
                <div className="space-y-3 flex-1 sm:overflow-y-auto sm:max-h-[calc(100vh-340px)] pr-0.5">
                  {colOrders.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border/80 text-xs text-muted-foreground">
                      No orders
                    </div>
                  ) : (
                    colOrders.map((order) => {
                      const next = getNextStatus(order);
                      const isUpdating = updatingId === order.id;

                      return (
                        <article
                          key={order.id}
                          className="surface-card relative flex flex-col gap-2.5 p-3.5 transition-all hover:border-primary/40 hover:shadow-sm"
                        >
                          {/* Card Header: Order # + Time */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display font-semibold text-sm text-foreground">
                              {order.number}
                            </span>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="size-3" />
                              {formatElapsed(order.createdAt)}
                            </span>
                          </div>

                          {/* Badges: Method + Payment */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <MethodBadge method={order.method} />
                            {order.waiterName && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-primary/10 text-primary border-primary/25 font-medium"
                              >
                                Waiter: {order.waiterName}
                              </Badge>
                            )}
                          </div>

                          {/* Customer Info */}
                          <div className="text-xs text-muted-foreground space-y-0.5 border-t border-border/40 pt-2">
                            <p className="font-medium text-foreground truncate">
                              {order.customer.name || "Guest Customer"}
                            </p>
                            {order.customer.phone && (
                              <p className="truncate flex items-center gap-1">
                                <Phone className="size-2.5" />
                                {order.customer.phone}
                              </p>
                            )}
                            {order.method === "delivery" && order.customer.address && (
                              <p className="truncate flex items-center gap-1 text-[11px]">
                                <MapPin className="size-2.5 text-primary shrink-0" />
                                {order.customer.address}
                              </p>
                            )}
                          </div>

                          {/* Line Items Summary */}
                          <div className="rounded-md bg-secondary/50 p-2 text-xs">
                            <p className="font-medium text-foreground text-[11px] mb-1">
                              {order.items.reduce((s, i) => s + i.quantity, 0)} items:
                            </p>
                            <ul className="space-y-0.5 text-muted-foreground line-clamp-3">
                              {order.items.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-[11px]">
                                  <span className="truncate pr-2">
                                    {item.quantity}× {item.name}
                                  </span>
                                  <span className="shrink-0 font-medium">
                                    {formatETB(item.price * item.quantity)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Footer: Price + Quick Advance Button */}
                          <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-muted-foreground uppercase">
                                Total
                              </span>
                              <span className="font-semibold text-sm text-primary">
                                {formatETB(order.total)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-9"
                                title="View order details"
                                aria-label={`View order ${order.number} details`}
                                onClick={() => setSelectedOrderId(order.id)}
                              >
                                <Eye className="size-4" />
                              </Button>

                              {next && (
                                <Button
                                  size="sm"
                                  className="h-9 text-xs px-3 gap-1.5"
                                  disabled={isUpdating}
                                  onClick={() => handleAdvanceStatus(order)}
                                >
                                  {isUpdating ? (
                                    <RefreshCw className="size-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      <span>{getNextShortActionLabel(order)}</span>
                                      <ArrowRight className="size-3.5" />
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE / LIST VIEW */
        <div className="space-y-3">
          {/* Mobile Order Cards (md:hidden) */}
          <div className="space-y-3 md:hidden">
            {filteredOrders.map((order) => {
              const next = getNextStatus(order);
              const isUpdating = updatingId === order.id;

              return (
                <article key={order.id} className="surface-card p-4 space-y-3 transition-colors">
                  {/* Top Row: Order #, Elapsed time, and Method/Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-base text-foreground">
                          {order.number}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="size-3" />
                        {formatElapsed(order.createdAt)}
                      </span>
                    </div>
                    <MethodBadge method={order.method} />
                  </div>

                  {/* Customer Info & Table / Address */}
                  <div className="text-xs text-muted-foreground border-t border-border/40 pt-2 space-y-0.5">
                    <p className="font-medium text-foreground">
                      {order.customer.name || "Guest Customer"}
                    </p>
                    {order.customer.phone && (
                      <p className="flex items-center gap-1 text-[11px]">
                        <Phone className="size-2.5 text-muted-foreground" />
                        <span>{order.customer.phone}</span>
                      </p>
                    )}

                    {order.waiterName && (
                      <p className="text-[11px] text-primary font-medium">
                        Waiter: <span className="font-semibold">{order.waiterName}</span>
                      </p>
                    )}
                    {order.method === "delivery" && order.customer.address && (
                      <p className="truncate flex items-center gap-1 text-[11px]">
                        <MapPin className="size-2.5 text-primary shrink-0" />
                        <span className="truncate">{order.customer.address}</span>
                      </p>
                    )}
                  </div>

                  {/* Items Summary & Financial Total */}
                  <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2">
                    <span className="text-muted-foreground">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} item(s)
                    </span>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground uppercase mr-1.5">
                        Total
                      </span>
                      <span className="font-semibold text-sm text-primary">
                        {formatETB(order.total)}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons: View Details & Advance Status */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-xs gap-1.5"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <Eye className="size-3.5" />
                      <span>View Details</span>
                    </Button>

                    {next && (
                      <Button
                        size="sm"
                        className="flex-1 h-9 text-xs gap-1.5"
                        disabled={isUpdating}
                        onClick={() => handleAdvanceStatus(order)}
                      >
                        {isUpdating ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <>
                            <span className="truncate">{getNextActionLabel(order)}</span>
                            <ArrowRight className="size-3.5 shrink-0" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop Table (hidden md:block) */}
          <div className="surface-card overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-xs">
                  <TableHead className="w-24">Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {filteredOrders.map((order) => {
                  const next = getNextStatus(order);
                  const isUpdating = updatingId === order.id;

                  return (
                    <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-display font-semibold text-foreground">
                        {order.number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">
                            {order.customer.name || "Guest Customer"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {order.customer.phone || ""}
                          </p>
                          {order.waiterName && (
                            <p className="text-[11px] text-primary font-medium mt-0.5">
                              Waiter: {order.waiterName}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <MethodBadge method={order.method} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          {order.items.reduce((s, i) => s + i.quantity, 0)} item(s)
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {formatETB(order.total)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatElapsed(order.createdAt)}
                      </TableCell>
                      <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <Eye className="size-3 mr-1" /> View
                        </Button>

                        {next && (
                          <Button
                            size="sm"
                            className="h-7 text-xs px-2.5"
                            disabled={isUpdating}
                            onClick={() => handleAdvanceStatus(order)}
                          >
                            {isUpdating ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : (
                              getNextActionLabel(order)
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ORDER DETAILS DRAWER (SHEET) */}
      <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        {selectedOrder && (
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader className="border-b border-border pb-4 text-left pr-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SheetTitle className="font-display text-xl font-bold">
                  Order {selectedOrder.number}
                </SheetTitle>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <SheetDescription className="text-xs flex items-center gap-2">
                <span>Placed {new Date(selectedOrder.createdAt).toLocaleString()}</span>
                <span>·</span>
                <span className="font-medium text-foreground capitalize">
                  {selectedOrder.method}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="py-6 space-y-6">
              {/* Order Status Advancement Control */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Current Stage
                  </span>
                  <Badge variant="outline" className="bg-background text-xs">
                    {statusLabels[selectedOrder.status]}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {getNextStatus(selectedOrder) && (
                    <Button
                      size="sm"
                      className="w-full h-10 sm:h-9 text-xs font-medium gap-1.5"
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => handleAdvanceStatus(selectedOrder)}
                    >
                      {updatingId === selectedOrder.id ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>Advance to: {getNextActionLabel(selectedOrder)}</span>
                          <ArrowRight className="size-3.5" />
                        </>
                      )}
                    </Button>
                  )}

                  {/* Explicit status override selector */}
                  <div className="flex items-center gap-2 w-full pt-1">
                    <span className="text-xs text-muted-foreground shrink-0">Override:</span>
                    <Select
                      value={selectedOrder.status}
                      onValueChange={(val) =>
                        handleSetExplicitStatus(selectedOrder.id, val as OrderStatus)
                      }
                    >
                      <SelectTrigger className="h-9 sm:h-8 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_COLUMNS.map((c) => (
                          <SelectItem key={c.status} value={c.status}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Progress Timeline */}
              <div className="surface-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Fulfillment Timeline
                </h3>
                <OrderTimeline order={selectedOrder} />
              </div>

              {/* Customer & Delivery Information */}
              <div className="surface-card p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Customer Details
                </h3>

                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium text-foreground mt-0.5">
                      {selectedOrder.customer.name || "Guest Customer"}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="font-medium text-foreground mt-0.5">
                      {selectedOrder.customer.phone ? (
                        <a
                          href={`tel:${selectedOrder.customer.phone}`}
                          className="text-primary hover:underline"
                        >
                          {selectedOrder.customer.phone}
                        </a>
                      ) : (
                        "Not provided"
                      )}
                    </dd>
                  </div>



                  {selectedOrder.waiterName && (
                    <div className="col-span-2 rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <dt className="text-[11px] font-medium text-muted-foreground uppercase">
                          Assigned Waiter
                        </dt>
                        <dd className="font-semibold text-foreground text-sm flex items-center gap-2 mt-0.5">
                          <span>{selectedOrder.waiterName}</span>
                          {selectedOrder.waiterDecision === "approved" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            >
                              Approved
                            </Badge>
                          )}
                          {selectedOrder.waiterDecision === "rejected" && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30"
                            >
                              Declined
                            </Badge>
                          )}
                          {(!selectedOrder.waiterDecision ||
                            selectedOrder.waiterDecision === "pending") && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                            >
                              Pending Review
                            </Badge>
                          )}
                        </dd>
                      </div>

                      {(!selectedOrder.waiterDecision ||
                        selectedOrder.waiterDecision === "pending") && (
                        <div className="flex items-center gap-1.5 self-start sm:self-center">
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5"
                            onClick={() => void handleWaiterDecisionAction(selectedOrder.id, "approved")}
                            disabled={waiterDecisionLoading}
                          >
                            <Check className="size-3 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-rose-600 hover:text-rose-700 border-rose-300 font-medium px-2.5"
                            onClick={() => void handleWaiterDecisionAction(selectedOrder.id, "rejected", "Declined by waiter")}
                            disabled={waiterDecisionLoading}
                          >
                            <XCircle className="size-3 mr-1" /> Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedOrder.method === "delivery" && (
                    <div className="col-span-2 space-y-1">
                      <dt className="text-muted-foreground">Delivery Destination & Distance</dt>
                      <dd className="font-medium text-foreground mt-0.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <MapPin className="size-3.5 text-primary shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="break-words">
                              {selectedOrder.customer.address || "No address specified"}
                            </p>
                            {selectedOrder.distanceKm !== null &&
                              selectedOrder.distanceKm !== undefined && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Distance:{" "}
                                  <strong className="text-foreground">
                                    {selectedOrder.distanceKm.toFixed(1)} KM
                                  </strong>
                                  {" • "}
                                  Fee:{" "}
                                  <strong className="text-foreground">
                                    {formatETB(selectedOrder.delivery)}
                                  </strong>
                                </p>
                              )}
                          </div>
                        </div>

                        {selectedOrder.customer.latitude !== null &&
                          selectedOrder.customer.latitude !== undefined &&
                          selectedOrder.customer.longitude !== null &&
                          selectedOrder.customer.longitude !== undefined && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.customer.latitude},${selectedOrder.customer.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline shrink-0 bg-primary/10 px-2.5 py-1.5 rounded-md self-start"
                            >
                              <ExternalLink className="size-3" />
                              <span>View Map</span>
                            </a>
                          )}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Payment & Proof Verification Card */}
              <div className="surface-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="size-3.5 text-primary" />
                    Payment & Verification
                  </span>
                  <Badge
                    variant={selectedOrder.paymentStatus === "paid" ? "default" : "outline"}
                    className={cn(
                      "text-[10px] font-semibold py-0 px-2",
                      selectedOrder.paymentStatus === "paid"
                        ? "bg-success text-success-foreground"
                        : selectedOrder.paymentProof?.status === "rejected"
                          ? "bg-destructive/15 text-destructive border-destructive/30"
                          : selectedOrder.paymentProof?.status === "pending"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                    )}
                  >
                    {selectedOrder.paymentStatus === "paid"
                      ? "Paid & Settled"
                      : selectedOrder.paymentProof?.status === "rejected"
                        ? "Proof Rejected"
                        : selectedOrder.paymentProof?.status === "pending"
                          ? "Proof Under Review"
                          : "Payment Pending"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Method</span>
                    <span className="font-medium text-foreground">{selectedOrder.paymentMethod || "Mobile Payment"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Amount</span>
                    <span className="font-bold text-primary">{formatETB(selectedOrder.total)}</span>
                  </div>
                </div>

                {/* Waiter Collection Interface */}
                {selectedOrder.paymentStatus !== "paid" && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <UserCheck className="size-3.5" /> Waiter Payment Collection
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-background">
                        {selectedOrder.paymentMethod || "Electronic"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Customer selected <strong className="text-foreground">{selectedOrder.paymentMethod || "Telebirr / Bank Transfer"}</strong>. Collect the customer's transfer confirmation code and record below to submit to the cashier.
                    </p>
                    <div className="space-y-1.5">
                      <Input
                        placeholder="e.g. TXN-84920193..."
                        value={waiterRefInput}
                        onChange={(e) => setWaiterRefInput(e.target.value)}
                        className="h-8 text-xs font-mono bg-background"
                      />
                      <Input
                        placeholder="Optional note (e.g. Verified Telebirr SMS at Table 2)..."
                        value={waiterNoteInput}
                        onChange={(e) => setWaiterNoteInput(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleRecordWaiterCollection(selectedOrder.id)}
                        disabled={collectingPayment || !waiterRefInput.trim()}
                        className="w-full h-8 text-xs font-semibold"
                      >
                        <Receipt className="size-3.5 mr-1.5" />
                        {collectingPayment ? "Recording Details…" : "Record Payment Details & Send to Cashier"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Submitted Proof / Screenshot / Reference Details */}
                {selectedOrder.paymentProof ? (
                  <div className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-2 text-xs">
                    {selectedOrder.paymentProof.screenshotUrl ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={selectedOrder.paymentProof.screenshotUrl}
                          alt="Receipt proof"
                          className="size-14 rounded object-cover border border-border cursor-pointer hover:opacity-90"
                          onClick={() => {
                            setProofZoomUrl(selectedOrder.paymentProof!.screenshotUrl!);
                            setProofZoomOpen(true);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground block text-xs truncate">Receipt Screenshot</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2 mt-1 gap-1"
                            onClick={() => {
                              setProofZoomUrl(selectedOrder.paymentProof!.screenshotUrl!);
                              setProofZoomOpen(true);
                            }}
                          >
                            <ZoomIn className="size-3" />
                            Zoom Receipt
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">Reference-only proof submitted</p>
                    )}

                    {(selectedOrder.transactionReference || selectedOrder.paymentProof.transactionReference) && (
                      <div className="flex items-center justify-between border-t border-border/40 pt-1.5 text-xs">
                        <span className="text-muted-foreground">Transfer ID:</span>
                        <span className="font-mono font-bold text-foreground flex items-center gap-1">
                          {selectedOrder.transactionReference || selectedOrder.paymentProof.transactionReference}
                          <button
                            type="button"
                            onClick={() => {
                              const ref = selectedOrder.transactionReference || selectedOrder.paymentProof?.transactionReference || "";
                              void navigator.clipboard.writeText(ref);
                              toast.success("Reference copied!");
                            }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="size-3" />
                          </button>
                        </span>
                      </div>
                    )}

                    {selectedOrder.paymentProof.rejectionReason && (
                      <p className="text-[11px] text-destructive border-t border-destructive/20 pt-1">
                        Reason: {selectedOrder.paymentProof.rejectionReason}
                      </p>
                    )}
                  </div>
                ) : selectedOrder.transactionReference ? (
                  <div className="rounded-lg border border-border/80 bg-background/60 p-2.5 text-xs flex items-center justify-between">
                    <span className="text-muted-foreground">Transaction Ref:</span>
                    <span className="font-mono font-bold text-foreground flex items-center gap-1">
                      {selectedOrder.transactionReference}
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(selectedOrder.transactionReference!);
                          toast.success("Reference copied!");
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="size-3" />
                      </button>
                    </span>
                  </div>
                ) : null}

                {/* Cashier Verification Action Buttons */}
                {selectedOrder.paymentStatus !== "paid" && (
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    {selectedOrder.paymentProof || selectedOrder.transactionReference ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          className="bg-success text-success-foreground hover:bg-success/90 h-8 text-xs font-semibold"
                          onClick={() => void handleApproveProof(selectedOrder.id)}
                          disabled={proofActionLoading}
                        >
                          <Check className="size-3 mr-1" />
                          Approve Payment
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs font-semibold"
                          onClick={() => {
                            setRejectProofReason("");
                            setRejectProofOpen(true);
                          }}
                          disabled={proofActionLoading}
                        >
                          <XCircle className="size-3 mr-1" />
                          Reject Proof
                        </Button>
                      </div>
                    ) : selectedOrder.paymentMethod.toLowerCase().includes("cash") ? (
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs font-semibold"
                        onClick={() => void handleSettleCashOrder(selectedOrder.id)}
                        disabled={proofActionLoading}
                      >
                        <Banknote className="size-3.5 mr-1.5" />
                        Mark Cash Settled ({formatETB(selectedOrder.total)})
                      </Button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          className="bg-success text-success-foreground hover:bg-success/90 h-8 text-xs font-semibold"
                          onClick={() => void handleApproveProof(selectedOrder.id)}
                          disabled={proofActionLoading}
                        >
                          <Check className="size-3 mr-1" />
                          Approve Payment
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs font-semibold"
                          onClick={() => {
                            setRejectProofReason("");
                            setRejectProofOpen(true);
                          }}
                          disabled={proofActionLoading}
                        >
                          <XCircle className="size-3 mr-1" />
                          Reject / Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ordered Line Items Breakdown */}
              <div className="surface-card p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Order Items ({selectedOrder.items.reduce((s, i) => s + i.quantity, 0)})
                </h3>

                <div className="divide-y divide-border">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-medium text-foreground">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatETB(item.price)} × {item.quantity}
                        </p>
                      </div>
                      <span className="font-semibold text-foreground">
                        {formatETB(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Financial Totals */}
                <dl className="border-t border-border pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <dt>Subtotal</dt>
                    <dd>{formatETB(selectedOrder.subtotal)}</dd>
                  </div>
                  {selectedOrder.delivery > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <dt>
                        Delivery Fee
                        {selectedOrder.distanceKm !== null && selectedOrder.distanceKm !== undefined
                          ? ` (${selectedOrder.distanceKm.toFixed(1)} KM)`
                          : ""}
                      </dt>
                      <dd>{formatETB(selectedOrder.delivery)}</dd>
                    </div>
                  )}
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-success">
                      <dt>Discount</dt>
                      <dd>-{formatETB(selectedOrder.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                    <dt>Total Amount</dt>
                    <dd className="text-primary">{formatETB(selectedOrder.total)}</dd>
                  </div>
                </dl>
              </div>

              {/* Print Receipt / Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="w-full text-xs gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer className="size-3.5" />
                  Print Kitchen Ticket
                </Button>
              </div>
            </div>
          </SheetContent>
        )}
      </Sheet>

      {/* REJECT PROOF DIALOG FOR ORDERS DRAWER */}
      <Dialog open={rejectProofOpen} onOpenChange={setRejectProofOpen}>
        <DialogContent className="max-w-md p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-4" />
              Reject Payment Proof
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Provide the reason why this payment proof cannot be approved. The customer will see this message.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {[
                "Incorrect transfer amount",
                "Transaction reference not found",
                "Receipt image blurry / unreadable",
                "Duplicate proof submission",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRejectProofReason(preset)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors text-left",
                    rejectProofReason === preset
                      ? "border-destructive bg-destructive/10 text-destructive font-medium"
                      : "border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label htmlFor="order-reject-reason" className="text-xs font-medium text-foreground">
                Rejection Note <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="order-reject-reason"
                value={rejectProofReason}
                onChange={(e) => setRejectProofReason(e.target.value)}
                placeholder="Explain what the customer needs to fix..."
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
              onClick={() => setRejectProofOpen(false)}
              disabled={proofActionLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={proofActionLoading || !rejectProofReason.trim()}
              onClick={() => {
                if (selectedOrder) {
                  void handleConfirmRejectProof(selectedOrder.id);
                }
              }}
            >
              {proofActionLoading ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECEIPT ZOOM DIALOG FOR ORDERS DRAWER */}
      <Dialog open={proofZoomOpen} onOpenChange={setProofZoomOpen}>
        <DialogContent className="max-w-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center justify-between">
              <span>Receipt Inspection</span>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex flex-col items-center justify-center">
            {proofZoomUrl ? (
              <div className="w-full max-h-[80vh] overflow-auto rounded-lg border border-border bg-black/5 flex items-center justify-center p-2">
                <img
                  src={proofZoomUrl}
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
