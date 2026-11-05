/**
 * ============================================================================
 * Rekik Café — Unified Order & Payment Management Console
 * File: src/routes/admin.orders.tsx
 * ============================================================================
 * Consolidates Order Operations and Payment Settlement into a single authoritative
 * management interface featuring:
 * - Complete order details, customer info, table numbers, items, and assigned waiters
 * - Associated payment methods, payment verification statuses, and amounts
 * - Electronic payment proof inspection (receipt previews, transaction references)
 * - Multi-criteria filters: Date presets (Today, Yesterday, 7 Days, 30 Days, All, Custom),
 *   Order Status, Payment Status, Payment Method, and Text Search
 * - Live real-time Supabase sync with manual refresh fallback
 */

import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FileCheck2,
  Filter,
  Image,
  MapPin,
  Phone,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  User,
  UserCheck,
  Utensils,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  fetchOrders,
  recordWaiterDecision,
  recordWaiterPaymentCollection,
  updateOrderStatus as apiUpdateOrderStatus,
} from "@/services/api";
import { fetchProofSignedUrl, submitPaymentApproval } from "@/services/cashier";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({
    meta: [
      { title: "Order & Payment Management — Rekik Café Admin" },
      {
        name: "description",
        content:
          "Unified order operations, table tracking, payment verification, and fulfillment management.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOrderAndPaymentPage,
});

type DatePreset = "all" | "today" | "yesterday" | "7days" | "30days" | "custom";

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

function MethodBadge({ method }: { method: OrderMethod }) {
  if (method === "dine-in") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 font-medium"
      >
        <Utensils className="size-3" />
        <span>Dine-In</span>
      </Badge>
    );
  }
  if (method === "takeaway") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 font-medium"
      >
        <Store className="size-3" />
        <span>Takeaway</span>
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 font-medium"
    >
      <Truck className="size-3" />
      <span>Delivery</span>
    </Badge>
  );
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const match = STATUS_COLUMNS.find((c) => c.status === status);
  if (match) {
    return (
      <Badge variant="outline" className={cn("text-[11px] font-medium border", match.color)}>
        {match.label}
      </Badge>
    );
  }

  if (status === "awaiting_payment" || (status as string) === "payment_under_review") {
    return (
      <Badge
        variant="outline"
        className="text-[11px] font-medium border bg-amber-500/10 text-amber-600 border-amber-500/30"
      >
        Payment Review
      </Badge>
    );
  }

  if (status === "cancelled" || status === "rejected_by_waiter" || status === "payment_rejected") {
    return (
      <Badge
        variant="outline"
        className="text-[11px] font-medium border bg-destructive/10 text-destructive border-destructive/30"
      >
        Rejected
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[11px] font-medium border">
      {statusLabels[status] || status}
    </Badge>
  );
}

function PaymentStatusBadge({
  status,
  isElectronic,
}: {
  status: "paid" | "pending" | "failed" | string;
  isElectronic?: boolean;
}) {
  if (status === "paid" || status === "payment_verified") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-medium"
      >
        <CheckCircle2 className="size-3" />
        <span>Paid</span>
      </Badge>
    );
  }

  if (status === "pending") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] font-medium"
      >
        <Clock className="size-3" />
        <span>{isElectronic ? "Under Review" : "Pending"}</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[11px] font-medium"
    >
      <XCircle className="size-3" />
      <span>Declined</span>
    </Badge>
  );
}

function formatElapsed(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AdminOrderAndPaymentPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Selected order details sheet
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  // Waiter collection / payment recording
  const [collectingPayment, setCollectingPayment] = useState(false);
  const [waiterRefInput, setWaiterRefInput] = useState("");
  const [waiterNoteInput, setWaiterNoteInput] = useState("");
  const [waiterDecisionLoading, setWaiterDecisionLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");

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
        toast.success("Orders and payments synced");
      }
    }
  };

  useEffect(() => {
    void loadData();

    // Supabase Realtime channel
    const channel = supabase
      .channel("admin-orders-payments-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        void loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_proofs" }, () => {
        void loadData();
      })
      .subscribe();

    const timer = setInterval(() => {
      void loadData();
    }, 25000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === selectedOrderId || o.number === selectedOrderId) ?? null;
  }, [orders, selectedOrderId]);

  // Load payment proof preview if available
  useEffect(() => {
    setProofPreviewUrl(null);
    if (!selectedOrder?.paymentProof?.id) return;

    let isMounted = true;
    setLoadingProof(true);
    fetchProofSignedUrl(selectedOrder.paymentProof.id)
      .then((url) => {
        if (isMounted && url) setProofPreviewUrl(url);
      })
      .catch(() => {
        if (isMounted) setProofPreviewUrl(null);
      })
      .finally(() => {
        if (isMounted) setLoadingProof(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedOrder?.paymentProof?.id]);

  const handleAdvanceStatus = async (order: Order) => {
    const next = getNextStatus(order);
    if (!next) return;

    setUpdatingId(order.id);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));

    try {
      await apiUpdateOrderStatus(order.id, next);
      toast.success(`${order.number} advanced to ${statusLabels[next]}`);
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

  const handleApproveProof = async (proofId: string) => {
    setUpdatingId(selectedOrder?.id || proofId);
    try {
      await submitPaymentApproval(proofId, "Approved by administrator");
      toast.success("Payment verified and approved!");
      void loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to verify payment";
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  // Filter Logic
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const q = searchQuery.toLowerCase().trim();

    return orders.filter((o) => {
      const orderDateStr = o.createdAt.slice(0, 10);

      // Date Range Filter
      if (datePreset === "today" && orderDateStr !== todayStr) return false;
      if (datePreset === "yesterday") {
        const yest = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 10);
        if (orderDateStr !== yest) return false;
      }
      if (datePreset === "7days") {
        const start = new Date(now.getTime() - 7 * 24 * 3600000).toISOString().slice(0, 10);
        if (orderDateStr < start || orderDateStr > todayStr) return false;
      }
      if (datePreset === "30days") {
        const start = new Date(now.getTime() - 30 * 24 * 3600000).toISOString().slice(0, 10);
        if (orderDateStr < start || orderDateStr > todayStr) return false;
      }
      if (datePreset === "custom" && customStart && customEnd) {
        if (orderDateStr < customStart || orderDateStr > customEnd) return false;
      }

      // Order Status Filter
      if (orderStatusFilter !== "all") {
        if (orderStatusFilter === "rejected") {
          const isRej =
            o.status === "cancelled" ||
            o.status === "rejected_by_waiter" ||
            o.status === "payment_rejected";
          if (!isRej) return false;
        } else if (o.status !== orderStatusFilter) {
          return false;
        }
      }

      // Payment Status Filter
      if (paymentStatusFilter !== "all") {
        if (paymentStatusFilter === "paid" && o.paymentStatus !== "paid") return false;
        if (paymentStatusFilter === "pending" && o.paymentStatus !== "pending") return false;
        if (paymentStatusFilter === "failed" && o.paymentStatus !== "failed") return false;
      }

      // Payment Method Filter
      if (paymentMethodFilter !== "all") {
        const m = (o.paymentMethod || "").toLowerCase();
        const target = paymentMethodFilter.toLowerCase();
        if (!m.includes(target)) return false;
      }

      // Text Search: Order #, Customer Name, Phone, Table Number
      if (q) {
        const matchesNum = (o.number || o.id).toLowerCase().includes(q);
        const matchesName = (o.customer?.name || "").toLowerCase().includes(q);
        const matchesPhone = (o.customer?.phone || "").toLowerCase().includes(q);
        const matchesTable = (o.customer?.table || "").toLowerCase().includes(q);
        const matchesItem = o.items.some((i) => i.name.toLowerCase().includes(q));

        if (!matchesNum && !matchesName && !matchesPhone && !matchesTable && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [
    orders,
    searchQuery,
    datePreset,
    customStart,
    customEnd,
    orderStatusFilter,
    paymentStatusFilter,
    paymentMethodFilter,
  ]);

  // Financial and Operational Totals for filtered view
  const totalAmountSum = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + o.total, 0);
  }, [filteredOrders]);

  const verifiedRevenueSum = useMemo(() => {
    return filteredOrders
      .filter((o) => o.paymentStatus === "paid")
      .reduce((sum, o) => sum + o.total, 0);
  }, [filteredOrders]);

  const pendingAmountSum = useMemo(() => {
    return filteredOrders
      .filter((o) => o.paymentStatus === "pending")
      .reduce((sum, o) => sum + o.total, 0);
  }, [filteredOrders]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ShoppingBag className="size-6 text-primary" />
            Order & Payment Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Unified customer orders, dine-in table tracking, payment verification, and cashier proofs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders in Period */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Orders Displayed</span>
              <ShoppingBag className="size-4 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-foreground mt-1">
              {filteredOrders.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Total Order Volume: {formatETB(totalAmountSum)}
            </p>
          </CardContent>
        </Card>

        {/* Verified Revenue */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Verified Revenue</span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-emerald-600 dark:text-emerald-400 mt-1">
              {formatETB(verifiedRevenueSum)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {filteredOrders.filter((o) => o.paymentStatus === "paid").length} verified payments
            </p>
          </CardContent>
        </Card>

        {/* Pending Settlement */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Pending Settlement</span>
              <Clock className="size-4 text-amber-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-amber-600 dark:text-amber-400 mt-1">
              {formatETB(pendingAmountSum)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {filteredOrders.filter((o) => o.paymentStatus === "pending").length} awaiting cashier / waiter review
            </p>
          </CardContent>
        </Card>

        {/* Dine-In Tables Active */}
        <Card className="surface-card shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-semibold flex items-center justify-between">
              <span>Dine-In Orders</span>
              <Utensils className="size-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-foreground mt-1">
              {filteredOrders.filter((o) => o.method === "dine-in").length}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Active table service orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive Filter Bar */}
      <Card className="surface-card shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search by Order ID or Customer Name */}
            <div className="md:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by order #, customer name, table..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Date Preset */}
            <div className="md:col-span-2">
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Order Status */}
            <div className="md:col-span-2">
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Order Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Order Statuses</SelectItem>
                  <SelectItem value="received">New / Received</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">In Kitchen</SelectItem>
                  <SelectItem value="ready">Ready for Pickup</SelectItem>
                  <SelectItem value="out-for-delivery">Out for Delivery</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected / Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Status */}
            <div className="md:col-span-2">
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment Statuses</SelectItem>
                  <SelectItem value="paid">Paid (Verified)</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Declined / Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method */}
            <div className="md:col-span-2">
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Telebirr">Telebirr</SelectItem>
                  <SelectItem value="CBE Birr">CBE Birr</SelectItem>
                  <SelectItem value="Bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Date Range Row */}
          {datePreset === "custom" && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
              <div className="flex items-center gap-2">
                <Label htmlFor="orders-custom-start" className="text-xs text-muted-foreground">
                  From:
                </Label>
                <Input
                  id="orders-custom-start"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="orders-custom-end" className="text-xs text-muted-foreground">
                  To:
                </Label>
                <Input
                  id="orders-custom-end"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
            </div>
          )}

          {(searchQuery ||
            datePreset !== "all" ||
            orderStatusFilter !== "all" ||
            paymentStatusFilter !== "all" ||
            paymentMethodFilter !== "all") && (
            <div className="pt-2 border-t border-border/50 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setDatePreset("all");
                  setCustomStart("");
                  setCustomEnd("");
                  setOrderStatusFilter("all");
                  setPaymentStatusFilter("all");
                  setPaymentMethodFilter("all");
                }}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset All Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified Table View */}
      <Card className="surface-card shadow-xs overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-border flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Orders & Payments ({filteredOrders.length})
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Complete view of each customer order, assigned waiter, items, and associated payment details
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="size-4 animate-spin text-primary" />
              Loading orders and payments...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState
                icon={<ShoppingBag className="size-8 text-muted-foreground" />}
                title="No orders found"
                description="No orders match the selected filters. Try broadening your date or status selections."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="text-xs font-semibold py-3">Order ID</TableHead>
                    <TableHead className="text-xs font-semibold">Customer</TableHead>
                    <TableHead className="text-xs font-semibold">Date & Time</TableHead>
                    <TableHead className="text-xs font-semibold">Ordered Items</TableHead>
                    <TableHead className="text-xs font-semibold">Type & Table</TableHead>
                    <TableHead className="text-xs font-semibold">Waiter</TableHead>
                    <TableHead className="text-xs font-semibold">Total Amount</TableHead>
                    <TableHead className="text-xs font-semibold">Payment Method</TableHead>
                    <TableHead className="text-xs font-semibold">Payment Status</TableHead>
                    <TableHead className="text-xs font-semibold">Order Status</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    const isElectronic =
                      order.paymentMethod?.toLowerCase().includes("telebirr") ||
                      order.paymentMethod?.toLowerCase().includes("cbe") ||
                      order.paymentMethod?.toLowerCase().includes("bank");

                    return (
                      <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                        {/* Order ID */}
                        <TableCell className="text-xs font-bold font-mono text-foreground whitespace-nowrap">
                          {order.number || `#${order.id.slice(0, 6)}`}
                        </TableCell>

                        {/* Customer */}
                        <TableCell className="text-xs whitespace-nowrap">
                          <p className="font-medium text-foreground">
                            {order.customer.name || "Guest Diner"}
                          </p>
                          {order.customer.phone && (
                            <p className="text-[11px] text-muted-foreground">
                              {order.customer.phone}
                            </p>
                          )}
                        </TableCell>

                        {/* Date & Time */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <div>
                            {new Date(order.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="text-[11px] text-muted-foreground/75">
                            {new Date(order.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </TableCell>

                        {/* Ordered Food and Drinks */}
                        <TableCell className="text-xs max-w-xs truncate">
                          {order.items.length > 0 ? (
                            <span
                              className="truncate block font-medium text-foreground"
                              title={order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                            >
                              {order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/70">No line items</span>
                          )}
                        </TableCell>

                        {/* Order Type & Table */}
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <MethodBadge method={order.method} />
                            {order.method === "dine-in" && order.customer.table && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-primary/5 text-primary border-primary/20 font-semibold"
                              >
                                T#{order.customer.table}
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Assigned Waiter */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {order.waiterName ? (
                            <span className="font-medium text-foreground flex items-center gap-1">
                              <User className="size-3 text-primary" />
                              {order.waiterName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </TableCell>

                        {/* Total Amount */}
                        <TableCell className="text-xs font-bold text-foreground whitespace-nowrap">
                          {formatETB(order.total)}
                        </TableCell>

                        {/* Payment Method */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <span className="font-medium text-foreground">
                            {(order.paymentMethod || "Cash").toLowerCase().includes("cash")
                              ? "💵 Cash"
                              : order.paymentMethod}
                          </span>
                        </TableCell>

                        {/* Payment Status */}
                        <TableCell className="whitespace-nowrap">
                          <PaymentStatusBadge
                            status={order.paymentStatus}
                            isElectronic={isElectronic}
                          />
                        </TableCell>

                        {/* Order Status */}
                        <TableCell className="whitespace-nowrap">
                          <OrderStatusBadge status={order.status} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2.5 gap-1.5"
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            <Eye className="size-3" />
                            <span>Inspect</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comprehensive Details Drawer / Sheet */}
      <Sheet
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
      >
        {selectedOrder && (
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-4 sm:p-6 space-y-6">
            <SheetHeader className="pb-4 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                  <span>Order {selectedOrder.number || `#${selectedOrder.id.slice(0, 6)}`}</span>
                  <MethodBadge method={selectedOrder.method} />
                </SheetTitle>
              </div>
              <SheetDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <span>
                  Placed on{" "}
                  {new Date(selectedOrder.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>•</span>
                <span>{formatElapsed(selectedOrder.createdAt)}</span>
              </SheetDescription>
            </SheetHeader>

            {/* Quick Status Control */}
            <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Current Workflow Stage
                </span>
                <OrderStatusBadge status={selectedOrder.status} />
              </div>

              <div className="flex items-center gap-2">
                {getNextStatus(selectedOrder) && (
                  <Button
                    size="sm"
                    className="flex-1 text-xs gap-1.5 font-medium"
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

                <Select
                  value={selectedOrder.status}
                  onValueChange={(val) =>
                    handleSetExplicitStatus(selectedOrder.id, val as OrderStatus)
                  }
                >
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue placeholder="Override Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_COLUMNS.map((c) => (
                      <SelectItem key={c.status} value={c.status} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="cancelled" className="text-xs">
                      Cancelled
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Associated Payment Details Section */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <CreditCard className="size-4" /> Associated Payment Information
                </h3>
                <PaymentStatusBadge status={selectedOrder.paymentStatus} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Payment Method</span>
                  <span className="font-semibold text-foreground text-sm">
                    {selectedOrder.paymentMethod || "Cash at Table"}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Payment Amount</span>
                  <span className="font-bold text-primary text-base">
                    {formatETB(selectedOrder.total)}
                  </span>
                </div>

                {selectedOrder.paymentProof?.transactionReference && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[11px]">
                      Transaction Reference / Confirmation Code
                    </span>
                    <span className="font-mono font-semibold text-foreground bg-background px-2 py-1 rounded border border-border inline-block mt-0.5">
                      {selectedOrder.paymentProof.transactionReference}
                    </span>
                  </div>
                )}
              </div>

              {/* Payment Verification / Proof Inspection */}
              {(() => {
                const isCash = (selectedOrder.paymentMethod || "").toLowerCase().includes("cash");
                if (isCash) {
                  return (
                    <div className="pt-3 border-t border-primary/10 space-y-2">
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-center space-y-1">
                        <p className="font-semibold text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                          <Banknote className="size-3.5 text-emerald-600" />
                          <span>Payment Method: 💵 Cash</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Cash payment collected directly in person. No screenshot or payment proof required.
                        </p>
                      </div>

                      {/* Cashier / Admin verify action */}
                      {selectedOrder.paymentStatus !== "paid" && selectedOrder.paymentProof && (
                        <Button
                          size="sm"
                          className="w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white mt-2"
                          onClick={() => handleApproveProof(selectedOrder.paymentProof!.id)}
                          disabled={updatingId === selectedOrder.id}
                        >
                          <Check className="size-3.5 mr-1.5" />
                          Confirm Cash Payment
                        </Button>
                      )}
                    </div>
                  );
                }

                if (selectedOrder.paymentProof) {
                  return (
                    <div className="pt-3 border-t border-primary/10 space-y-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Image className="size-3.5 text-primary" />
                        Electronic Payment Screenshot Evidence
                      </span>

                      {loadingProof ? (
                        <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
                          Generating secure preview URL...
                        </div>
                      ) : proofPreviewUrl ? (
                        <div className="space-y-2">
                          <div className="rounded-lg overflow-hidden border border-border bg-black/10 max-h-64 flex items-center justify-center">
                            <img
                              src={proofPreviewUrl}
                              alt="Payment Receipt Evidence"
                              className="object-contain max-h-64 w-auto rounded"
                            />
                          </div>
                          <a
                            href={proofPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            Open full size screenshot in new tab
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          Proof recorded with reference: {selectedOrder.paymentProof.transactionReference || "Standard verification"}
                        </p>
                      )}

                      {/* Cashier / Admin verify action */}
                      {selectedOrder.paymentStatus !== "paid" && (
                        <Button
                          size="sm"
                          className="w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white mt-2"
                          onClick={() => handleApproveProof(selectedOrder.paymentProof!.id)}
                          disabled={updatingId === selectedOrder.id}
                        >
                          <Check className="size-3.5 mr-1.5" />
                          Approve & Verify Payment
                        </Button>
                      )}
                    </div>
                  );
                }

                return null;
              })()}
            </div>

            {/* Customer & Table Details */}
            <div className="surface-card p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer & Service Details
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Customer Name</span>
                  <span className="font-semibold text-foreground">
                    {selectedOrder.customer.name || "Guest Diner"}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px]">Phone</span>
                  <span className="font-medium text-foreground">
                    {selectedOrder.customer.phone || "Not provided"}
                  </span>
                </div>

                {selectedOrder.method === "dine-in" && (
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Table Number</span>
                    <span className="font-bold text-primary text-sm">
                      {selectedOrder.customer.table ? `Table #${selectedOrder.customer.table}` : "Unassigned"}
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-muted-foreground block text-[11px]">Assigned Waiter</span>
                  <span className="font-medium text-foreground">
                    {selectedOrder.waiterName || "Unassigned"}
                  </span>
                </div>

                {selectedOrder.method === "delivery" && selectedOrder.customer.address && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[11px]">Delivery Address</span>
                    <span className="font-medium text-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="size-3.5 text-primary shrink-0" />
                      {selectedOrder.customer.address}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Ordered Line Items */}
            <div className="surface-card p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ordered Items ({selectedOrder.items.reduce((s, i) => s + i.quantity, 0)})
              </h3>

              <div className="divide-y divide-border">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between text-xs">
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

              <div className="border-t border-border pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatETB(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.delivery > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Delivery Fee</span>
                    <span>{formatETB(selectedOrder.delivery)}</span>
                  </div>
                )}
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>-{formatETB(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-foreground border-t border-border pt-1.5">
                  <span>Total Order Amount</span>
                  <span className="text-primary">{formatETB(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {/* Print Ticket Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="w-full text-xs gap-1.5"
            >
              <Printer className="size-3.5" />
              Print Receipt & Ticket
            </Button>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
