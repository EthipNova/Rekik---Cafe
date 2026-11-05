import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  Filter,
  History,
  Phone,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatETB } from "@/lib/menu-data";
import { WaiterPaymentDialog } from "@/components/waiter/WaiterPaymentDialog";
import {
  fetchWaiterOrders,
  formatTimeAgo,
  getMethodLabel,
  getOrderPaymentStatus,
  getOrderStatusBadge,
  type DisplayPaymentStatus,
} from "@/lib/waiter";
import type { WaiterOrder } from "@/types/waiter";

export const Route = createFileRoute("/waiter/history")({
  head: () => ({
    meta: [
      { title: "Order History — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterHistoryPage,
});

type DateFilterType = "all" | "today" | "yesterday" | "7days" | "30days" | "custom";
type PaymentFilterType = "all" | "paid" | "pending" | "rejected" | "failed";

export function WaiterHistoryPage() {
  const [orders, setOrders] = useState<WaiterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilterType>("today");
  const [customDate, setCustomDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterType>("all");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");

  // Dialogs
  const [selectedOrder, setSelectedOrder] = useState<WaiterOrder | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<WaiterOrder | null>(null);

  const loadHistory = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      // Query backend for assigned orders
      const data = await fetchWaiterOrders();
      setOrders(data || []);
      if (selectedOrder) {
        const updated = data.find((o) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
    } catch (err: unknown) {
      console.warn("Error fetching waiter history:", err);
      toast.error("Failed to load order history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    const handleUpdate = () => void loadHistory();
    window.addEventListener("neba:waiter-order-update", handleUpdate);
    const interval = setInterval(() => void loadHistory(), 20000);

    return () => {
      window.removeEventListener("neba:waiter-order-update", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  // Timezone-safe local date boundary filter
  const matchesDateFilter = (orderDateIso: string): boolean => {
    if (dateFilter === "all") return true;

    const d = new Date(orderDateIso);
    if (isNaN(d.getTime())) return true;
    const now = new Date();

    const orderYear = d.getFullYear();
    const orderMonth = d.getMonth();
    const orderDay = d.getDate();

    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDay = now.getDate();

    if (dateFilter === "today") {
      return orderYear === nowYear && orderMonth === nowMonth && orderDay === nowDay;
    }

    if (dateFilter === "yesterday") {
      const y = new Date(nowYear, nowMonth, nowDay - 1);
      return orderYear === y.getFullYear() && orderMonth === y.getMonth() && orderDay === y.getDate();
    }

    if (dateFilter === "7days") {
      const start = new Date(nowYear, nowMonth, nowDay - 6, 0, 0, 0, 0);
      const end = new Date(nowYear, nowMonth, nowDay, 23, 59, 59, 999);
      return d >= start && d <= end;
    }

    if (dateFilter === "30days") {
      const start = new Date(nowYear, nowMonth, nowDay - 29, 0, 0, 0, 0);
      const end = new Date(nowYear, nowMonth, nowDay, 23, 59, 59, 999);
      return d >= start && d <= end;
    }

    if (dateFilter === "custom") {
      if (!customDate) return true;
      const [cy, cm, cd] = customDate.split("-").map(Number);
      if (!customEndDate) {
        return orderYear === cy && orderMonth === cm! - 1 && orderDay === cd;
      }
      const [ey, em, ed] = customEndDate.split("-").map(Number);
      const start = new Date(cy!, cm! - 1, cd!, 0, 0, 0, 0);
      const end = new Date(ey!, em! - 1, ed!, 23, 59, 59, 999);
      return d >= start && d <= end;
    }

    return true;
  };

  const filteredOrders = orders.filter((o) => {
    // 1. Date Filter
    if (!matchesDateFilter(o.createdAt)) return false;

    // 2. Payment Status Filter
    const payInfo = getOrderPaymentStatus(o);
    if (paymentFilter === "paid" && payInfo.status !== "Paid") return false;
    if (paymentFilter === "pending" && payInfo.status !== "Pending") return false;
    if (paymentFilter === "rejected" && payInfo.status !== "Rejected") return false;
    if (paymentFilter === "failed" && payInfo.status !== "Failed") return false;

    // 3. Order Status Filter
    if (orderStatusFilter !== "all" && o.status !== orderStatusFilter) {
      return false;
    }

    // 4. Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        o.orderNumber.toLowerCase().includes(q) ||
        (o.orderReference && o.orderReference.toLowerCase().includes(q)) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q)) ||
        o.items.some((it) => it.name.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    return true;
  });

  const totalValue = filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
  const paidCount = filteredOrders.filter((o) => getOrderPaymentStatus(o).status === "Paid").length;
  const pendingCount = filteredOrders.filter((o) => getOrderPaymentStatus(o).status === "Pending").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Order History
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Unified records of customer orders, table details, and payment statuses.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadHistory(true)}
          disabled={refreshing}
          className="h-9 gap-2 text-xs"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh History
        </Button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Orders Shown</p>
          <p className="font-display text-2xl font-bold mt-1 text-foreground">
            {filteredOrders.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Filtered by criteria</p>
        </div>

        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Total Orders Value</p>
          <p className="font-display text-2xl font-bold mt-1 text-primary">
            {formatETB(totalValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Gross order value</p>
        </div>

        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Paid & Settled</p>
          <p className="font-display text-2xl font-bold mt-1 text-emerald-600">
            {paidCount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Payments confirmed</p>
        </div>

        <div className="surface-card p-4">
          <p className="text-xs text-muted-foreground font-medium">Awaiting Payment</p>
          <p className="font-display text-2xl font-bold mt-1 text-amber-600">
            {pendingCount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Pending collection / review</p>
        </div>
      </div>

      {/* Date Filters Bar */}
      <div className="surface-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Calendar className="size-3.5" /> Date:
            </span>
            <Button
              type="button"
              variant={dateFilter === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateFilter("today")}
              className="h-8 text-xs px-3"
            >
              Today
            </Button>
            <Button
              type="button"
              variant={dateFilter === "yesterday" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateFilter("yesterday")}
              className="h-8 text-xs px-3"
            >
              Yesterday
            </Button>
            <Button
              type="button"
              variant={dateFilter === "7days" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateFilter("7days")}
              className="h-8 text-xs px-3"
            >
              Last 7 Days
            </Button>
            <Button
              type="button"
              variant={dateFilter === "30days" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateFilter("30days")}
              className="h-8 text-xs px-3"
            >
              Last 30 Days
            </Button>
            <Button
              type="button"
              variant={dateFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateFilter("all")}
              className="h-8 text-xs px-3"
            >
              All Time
            </Button>
            <Button
              type="button"
              variant={dateFilter === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateFilter("custom")}
              className="h-8 text-xs px-3"
            >
              Custom Date
            </Button>
          </div>

          {/* Payment Status Dropdown / Quick Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <CreditCard className="size-3.5" /> Payment:
            </span>
            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1 text-xs">
              {(["all", "paid", "pending", "rejected", "failed"] as PaymentFilterType[]).map((pf) => (
                <button
                  key={pf}
                  type="button"
                  onClick={() => setPaymentFilter(pf)}
                  className={`px-2.5 py-1 rounded font-medium capitalize transition-colors ${
                    paymentFilter === pf ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {pf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Date Pickers (if Custom Date active) */}
        {dateFilter === "custom" && (
          <div className="p-3 bg-muted/30 rounded-lg border border-border flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-foreground">Select Date Range:</span>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-start-date" className="text-muted-foreground">
                From:
              </label>
              <Input
                id="custom-start-date"
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-8 text-xs w-36 bg-background"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-end-date" className="text-muted-foreground">
                To (Optional):
              </label>
              <Input
                id="custom-end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-8 text-xs w-36 bg-background"
              />
            </div>
            {(customDate || customEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setCustomDate("");
                  setCustomEndDate("");
                }}
              >
                Clear Custom Date
              </Button>
            )}
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by order #, reference, customer name, table number, or product item…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 text-xs h-9 bg-background max-w-lg"
          />
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading order history from Supabase…
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-2">
          <History className="size-8 mx-auto text-muted-foreground" />
          <p className="font-semibold text-sm">No orders found</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {searchTerm
              ? `No orders matching "${searchTerm}". Try adjusting your search or date filter.`
              : "No orders match the selected date and status filters."}
          </p>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Customer / Table</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Ordered Food & Drinks</th>
                  <th className="p-3">Order Status</th>
                  <th className="p-3">Payment Status</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Date & Time</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredOrders.map((order) => {
                  const method = getMethodLabel(order.method);
                  const statusBadge = getOrderStatusBadge(order.status);
                  const payInfo = getOrderPaymentStatus(order);
                  const isPaid = payInfo.status === "Paid";
                  const orderDate = new Date(order.createdAt);
                  const formattedDateTime = !isNaN(orderDate.getTime())
                    ? orderDate.toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : order.createdAt;

                  return (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      {/* 1. Order ID / Reference */}
                      <td className="p-3 font-semibold text-foreground whitespace-nowrap">
                        <div className="font-display font-bold text-sm">#{order.orderNumber}</div>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {order.orderReference}
                        </span>
                      </td>

                      {/* 2. Customer Name & Table Number */}
                      <td className="p-3 min-w-[140px]">
                        <div className="font-medium text-foreground flex items-center gap-1">
                          <User className="size-3 text-muted-foreground shrink-0" />
                          <span>{order.customerName}</span>
                        </div>
                        {order.tableNumber && (
                          <div className="mt-0.5 inline-flex items-center gap-1 font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-[11px]">
                            <QrCode className="size-3 shrink-0" />
                            Table #{order.tableNumber}
                          </div>
                        )}
                        {order.customerPhone && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Phone className="size-2.5 shrink-0" />
                            {order.customerPhone}
                          </div>
                        )}
                      </td>

                      {/* 3. Order Type (Dine-In, Takeaway, Delivery) */}
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] ${method.color}`}>
                          {method.label}
                        </Badge>
                      </td>

                      {/* 4. Ordered Food and Drinks */}
                      <td className="p-3 max-w-[220px]">
                        <div className="space-y-0.5">
                          {order.items.slice(0, 2).map((it, idx) => (
                            <div key={idx} className="truncate text-foreground text-[11px]">
                              <span className="font-semibold text-primary mr-1">{it.quantity}x</span>
                              <span>{it.name}</span>
                            </div>
                          ))}
                          {order.items.length > 2 && (
                            <span className="text-[10px] text-muted-foreground italic">
                              +{order.items.length - 2} more item{order.items.length - 2 > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Order Status */}
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
                          {statusBadge.label}
                        </Badge>
                      </td>

                      {/* 6. Payment Status */}
                      <td className="p-3 whitespace-nowrap">
                        <Badge variant="outline" className={`text-[10px] font-semibold ${payInfo.className}`}>
                          {payInfo.label}
                        </Badge>
                        {payInfo.subtext && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[150px] truncate" title={payInfo.subtext}>
                            {payInfo.subtext}
                          </p>
                        )}
                      </td>

                      {/* 7. Order Total */}
                      <td className="p-3 text-right font-bold text-foreground whitespace-nowrap">
                        {formatETB(order.totalAmount)}
                      </td>

                      {/* 8. Date and Time */}
                      <td className="p-3 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                        <div>{formattedDateTime}</div>
                        <span className="text-[10px] opacity-75">{formatTimeAgo(order.createdAt)}</span>
                      </td>

                      {/* 9. Actions */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid && (
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                              onClick={() => setPaymentOrder(order)}
                            >
                              <Camera className="size-3 mr-1" />
                              Pay
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <Eye className="size-3 mr-1" />
                            Details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Details Dialog */}
      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="font-display text-xl font-bold">
                    Order #{selectedOrder.orderNumber}
                  </DialogTitle>
                  <Badge variant="outline" className={`text-xs ${getMethodLabel(selectedOrder.method).color}`}>
                    {getMethodLabel(selectedOrder.method).label}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Reference: {selectedOrder.orderReference} • Placed on{" "}
                  {new Date(selectedOrder.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Status Badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`text-xs ${getOrderStatusBadge(selectedOrder.status).className}`}>
                    Status: {getOrderStatusBadge(selectedOrder.status).label}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${getOrderPaymentStatus(selectedOrder).className}`}>
                    Payment: {getOrderPaymentStatus(selectedOrder).label}
                  </Badge>
                </div>

                {/* Customer Details */}
                <div className="rounded-lg bg-secondary/50 p-3 space-y-1.5">
                  <p className="font-semibold text-foreground text-xs">Customer Information</p>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>
                      <span className="block text-[10px] uppercase text-muted-foreground/70">Name</span>
                      <span className="font-medium text-foreground">{selectedOrder.customerName}</span>
                    </div>
                    {selectedOrder.tableNumber && (
                      <div>
                        <span className="block text-[10px] uppercase text-muted-foreground/70">Table (QR Code)</span>
                        <span className="font-bold text-primary text-sm flex items-center gap-1">
                          <QrCode className="size-3.5" /> Table #{selectedOrder.tableNumber}
                        </span>
                      </div>
                    )}
                    {selectedOrder.customerPhone && (
                      <div>
                        <span className="block text-[10px] uppercase text-muted-foreground/70">Phone</span>
                        <span className="font-medium text-foreground">{selectedOrder.customerPhone}</span>
                      </div>
                    )}
                    {selectedOrder.deliveryAddress && (
                      <div className="col-span-2">
                        <span className="block text-[10px] uppercase text-muted-foreground/70">Delivery Address</span>
                        <span className="font-medium text-foreground">{selectedOrder.deliveryAddress}</span>
                      </div>
                    )}
                  </div>
                  {selectedOrder.customerNotes && (
                    <div className="pt-2 border-t border-border/40 text-[11px] text-amber-700 dark:text-amber-400">
                      <span className="font-semibold">Special Instructions:</span> {selectedOrder.customerNotes}
                    </div>
                  )}
                </div>

                {/* Ordered Items List */}
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">Ordered Food & Drinks</p>
                  <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                    {selectedOrder.items.map((it, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{it.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {it.quantity} x {formatETB(it.unitPrice)}
                          </p>
                        </div>
                        <span className="font-bold text-foreground">{formatETB(it.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatETB(selectedOrder.subtotal)}</span>
                  </div>
                  {selectedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount</span>
                      <span>-{formatETB(selectedOrder.discountAmount)}</span>
                    </div>
                  )}
                  {selectedOrder.deliveryFee > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Delivery Fee</span>
                      <span>{formatETB(selectedOrder.deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t border-border/60 font-bold text-sm text-foreground">
                    <span>Total Amount</span>
                    <span className="text-primary">{formatETB(selectedOrder.totalAmount)}</span>
                  </div>
                </div>

                {/* Payment Breakdown / Evidence */}
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Receipt className="size-3.5 text-primary" /> Payment Status Details
                    </span>
                    <Badge variant="outline" className={getOrderPaymentStatus(selectedOrder).className}>
                      {getOrderPaymentStatus(selectedOrder).label}
                    </Badge>
                  </div>

                  {getOrderPaymentStatus(selectedOrder).status === "Paid" ? (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded flex items-center gap-2">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>Payment successfully settled and confirmed.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedOrder.payments?.[0]?.proof?.rejectionReason && (
                        <div className="rounded bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive">
                          <span className="font-semibold">Cashier Note:</span>{" "}
                          {selectedOrder.payments[0].proof.rejectionReason}
                        </div>
                      )}
                      <Button
                        size="sm"
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 font-medium gap-1.5"
                        onClick={() => {
                          setPaymentOrder(selectedOrder);
                        }}
                      >
                        <Camera className="size-3.5" />
                        <span>Record Payment (Cash / Screenshot)</span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Recording Dialog */}
      {paymentOrder && (
        <WaiterPaymentDialog
          order={paymentOrder}
          open={Boolean(paymentOrder)}
          onOpenChange={(open) => !open && setPaymentOrder(null)}
          onSuccess={() => {
            setPaymentOrder(null);
            void loadHistory(true);
          }}
        />
      )}
    </div>
  );
}
