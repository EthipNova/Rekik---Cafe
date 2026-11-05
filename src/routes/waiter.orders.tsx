import { createFileRoute } from "@tanstack/react-router";
import {
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  Phone,
  QrCode,
  Receipt,
  RefreshCw,
  Banknote,
  Search,
  ShoppingBag,
  Upload,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatETB } from "@/lib/menu-data";
import { WaiterPaymentDialog } from "@/components/waiter/WaiterPaymentDialog";
import {
  fetchWaiterOrders,
  formatTimeAgo,
  getMethodLabel,
  getOrderPaymentStatus,
  getOrderStatusBadge,
} from "@/lib/waiter";
import type { WaiterOrder } from "@/types/waiter";

export const Route = createFileRoute("/waiter/orders")({
  head: () => ({
    meta: [
      { title: "Current Orders — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterOrdersPage,
});

export function WaiterOrdersPage() {
  const [orders, setOrders] = useState<WaiterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusTab, setStatusTab] = useState<string>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Detail Sheet
  const [selectedOrder, setSelectedOrder] = useState<WaiterOrder | null>(null);

  // Payment Submission Dialog
  const [paymentOrder, setPaymentOrder] = useState<WaiterOrder | null>(null);

  const loadOrders = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const queryObj: { status?: string; search?: string; date?: string } = {};
      if (statusTab) queryObj.status = statusTab;
      if (searchTerm.trim()) queryObj.search = searchTerm.trim();
      if (dateFilter !== "all") queryObj.date = dateFilter;
      const data = await fetchWaiterOrders(queryObj);
      setOrders(data || []);
      // If selectedOrder is open, update its reference
      if (selectedOrder) {
        const updatedSelected = data.find((o) => o.id === selectedOrder.id);
        if (updatedSelected) setSelectedOrder(updatedSelected);
      }
    } catch (err: unknown) {
      console.warn("Error fetching waiter orders:", err);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadOrders();

    const handleUpdate = () => void loadOrders();
    window.addEventListener("neba:waiter-order-update", handleUpdate);
    const interval = setInterval(() => void loadOrders(), 15000);

    return () => {
      window.removeEventListener("neba:waiter-order-update", handleUpdate);
      clearInterval(interval);
    };
  }, [statusTab, dateFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadOrders(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Current Orders
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Monitor active meal preparation, table service, and customer payments in real time.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadOrders(true)}
          disabled={refreshing}
          className="h-9 gap-2 text-xs"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Orders
        </Button>
      </div>

      {/* Tabs and Controls */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={statusTab} onValueChange={setStatusTab} className="w-full sm:w-auto">
            <TabsList className="bg-muted/70">
              <TabsTrigger value="active" className="text-xs font-medium">
                All Active
              </TabsTrigger>
              <TabsTrigger value="confirmed" className="text-xs font-medium">
                Confirmed
              </TabsTrigger>
              <TabsTrigger value="preparing" className="text-xs font-medium">
                Preparing
              </TabsTrigger>
              <TabsTrigger value="ready" className="text-xs font-medium">
                Ready for Service
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs font-medium">
                All Orders
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Quick Date Selector */}
          <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg p-1 text-xs">
            <button
              type="button"
              onClick={() => setDateFilter("all")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                dateFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("today")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                dateFilter === "today" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("week")}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                dateFilter === "week" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Last 7 Days
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by order #, reference, customer name, or table number…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs h-9 bg-background"
            />
          </div>
          <Button type="submit" size="sm" className="h-9 px-4 text-xs">
            Search
          </Button>
          {searchTerm && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                void fetchWaiterOrders({ status: statusTab }).then((d) => setOrders(d || []));
              }}
              className="h-9 text-xs"
            >
              Clear
            </Button>
          )}
        </form>
      </div>

      {/* Orders List / Table */}
      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading assigned orders from Supabase…
        </div>
      ) : orders.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ShoppingBag className="size-6" />
          </div>
          <h2 className="font-display font-semibold text-base">No orders found</h2>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchTerm
              ? `No orders matching "${searchTerm}". Try another search term.`
              : "No orders match the selected status filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const method = getMethodLabel(order.method);
            const statusBadge = getOrderStatusBadge(order.status);
            const paymentStatus = getOrderPaymentStatus(order);
            const isPaid = paymentStatus.status === "Paid";

            return (
              <div
                key={order.id}
                className="surface-card p-4 flex flex-col justify-between transition-all hover:shadow-md border-border hover:border-primary/40"
              >
                <div className="space-y-3">
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-bold text-base">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {order.orderReference}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-foreground mt-0.5 flex items-center gap-1">
                        <User className="size-3 text-muted-foreground" />
                        {order.customerName}
                        {order.tableNumber && (
                          <span className="ml-1.5 inline-flex items-center gap-1 font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded text-[11px]">
                            <QrCode className="size-3" />
                            Table #{order.tableNumber}
                          </span>
                        )}
                      </p>
                    </div>

                    <Badge variant="outline" className={`text-[10px] shrink-0 ${method.color}`}>
                      {method.label}
                    </Badge>
                  </div>

                  {/* Badges: Order Status & Payment Status */}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
                      {statusBadge.label}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${paymentStatus.className}`}>
                      {paymentStatus.label}
                    </Badge>
                  </div>

                  {/* Items snapshot */}
                  <div className="rounded-md bg-secondary/50 p-2 text-xs space-y-1">
                    {order.items.slice(0, 3).map((it, idx) => (
                      <div key={idx} className="flex justify-between text-muted-foreground">
                        <span className="truncate pr-2">
                          {it.quantity}x {it.name}
                        </span>
                        <span className="font-medium text-foreground shrink-0">
                          {formatETB(it.lineTotal)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pt-0.5 italic">
                        +{order.items.length - 3} more items…
                      </p>
                    )}
                  </div>

                  {order.customerNotes && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-2 rounded text-[11px]">
                      <span className="font-semibold">Note:</span> {order.customerNotes}
                    </p>
                  )}
                </div>

                {/* Footer and Actions */}
                <div className="pt-3 mt-3 border-t border-border/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" /> {formatTimeAgo(order.createdAt)}
                    </span>
                    <span className="font-display font-bold text-base text-primary">
                      {formatETB(order.totalAmount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 text-xs gap-1.5"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <Eye className="size-3.5" /> Details
                    </Button>

                    {!isPaid && (
                      <Button
                        size="sm"
                        className="h-8 flex-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium gap-1"
                        onClick={() => setPaymentOrder(order)}
                      >
                        <Camera className="size-3" />
                        <span>Record Payment</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Details Drawer (Sheet) */}
      <Sheet open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-6 space-y-6">
          {selectedOrder && (
            <>
              <SheetHeader className="text-left pb-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <SheetTitle className="font-display text-xl font-bold">
                    Order #{selectedOrder.orderNumber}
                  </SheetTitle>
                  <Badge variant="outline" className={`text-xs ${getMethodLabel(selectedOrder.method).color}`}>
                    {getMethodLabel(selectedOrder.method).label}
                  </Badge>
                </div>
                <SheetDescription className="text-xs text-muted-foreground">
                  Reference: {selectedOrder.orderReference} • Created {formatTimeAgo(selectedOrder.createdAt)}
                </SheetDescription>
              </SheetHeader>

              {/* Status Badges */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`text-xs ${getOrderStatusBadge(selectedOrder.status).className}`}>
                    Status: {getOrderStatusBadge(selectedOrder.status).label}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${getOrderPaymentStatus(selectedOrder).className}`}>
                    Payment: {getOrderPaymentStatus(selectedOrder).label}
                  </Badge>
                </div>

                {/* Clearly Identifiable Payment Evidence / Settlement Section */}
                <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                      <Receipt className="size-3.5 text-primary" /> Payment Settlement
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${getOrderPaymentStatus(selectedOrder).className}`}
                    >
                      {getOrderPaymentStatus(selectedOrder).label}
                    </Badge>
                  </div>

                  {getOrderPaymentStatus(selectedOrder).status === "Paid" ? (
                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5" /> Payment Settled & Verified
                      </span>
                      <span className="font-bold">{formatETB(selectedOrder.totalAmount)}</span>
                    </div>
                  ) : getOrderPaymentStatus(selectedOrder).status === "Pending" &&
                    selectedOrder.payments?.[0]?.proof?.status === "pending" ? (
                    (selectedOrder.payments?.[0]?.method || "").toLowerCase().includes("cash") ? (
                      <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                        <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                          <Banknote className="size-4" /> 💵 Cash Payment Recorded — Sent to Cashier
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          Awaiting cashier verification. No receipt photo or proof required.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-md bg-purple-500/10 border border-purple-500/30 p-2.5 text-xs text-purple-700 dark:text-purple-300 space-y-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Clock className="size-3.5 animate-spin" /> Payment Evidence Sent to Cashier
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          Awaiting cashier verification. Status will update automatically upon review.
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="space-y-2">
                      {selectedOrder.payments?.[0]?.proof?.status === "rejected" &&
                        selectedOrder.payments[0].proof.rejectionReason && (
                          <div className="rounded bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive">
                            <span className="font-semibold">Rejection reason:</span>{" "}
                            {selectedOrder.payments[0].proof.rejectionReason}
                          </div>
                        )}
                      <Button
                        size="sm"
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-9 font-semibold gap-1.5"
                        onClick={() => {
                          setPaymentOrder(selectedOrder);
                        }}
                      >
                        <Camera className="size-3.5" />
                        <Upload className="size-3.5" />
                        <span>
                          {selectedOrder.payments?.[0]?.proof?.status === "rejected"
                            ? "Re-upload Payment Evidence"
                            : "Record Payment (Cash / Digital Screenshot)"}
                        </span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer & Location */}
              <div className="rounded-lg bg-secondary/50 p-3.5 space-y-2 text-xs">
                <p className="font-semibold text-foreground">Customer Information</p>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Name
                    </span>
                    <span className="font-medium text-foreground">{selectedOrder.customerName}</span>
                  </div>
                  {selectedOrder.tableNumber && (
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Table (QR Code)
                      </span>
                      <span className="font-bold text-primary text-sm flex items-center gap-1">
                        <QrCode className="size-3.5" /> Table #{selectedOrder.tableNumber}
                      </span>
                    </div>
                  )}
                  {selectedOrder.customerPhone && (
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Phone
                      </span>
                      <span className="font-medium text-foreground flex items-center gap-1">
                        <Phone className="size-3 text-muted-foreground" />
                        {selectedOrder.customerPhone}
                      </span>
                    </div>
                  )}
                  {selectedOrder.deliveryAddress && (
                    <div className="col-span-2">
                      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Delivery Address
                      </span>
                      <span className="font-medium text-foreground">{selectedOrder.deliveryAddress}</span>
                    </div>
                  )}
                </div>

                {selectedOrder.customerNotes && (
                  <div className="pt-2 border-t border-border/40 text-[11px] text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">Special Notes:</span> {selectedOrder.customerNotes}
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <p className="font-semibold text-xs text-foreground">Ordered Items</p>
                <div className="rounded-lg border border-border divide-y divide-border/60 text-xs overflow-hidden">
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

              {/* Financial Breakdown */}
              <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-xs">
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
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Payment Dialog */}
      {paymentOrder && (
        <WaiterPaymentDialog
          order={paymentOrder}
          open={Boolean(paymentOrder)}
          onOpenChange={(open) => !open && setPaymentOrder(null)}
          onSuccess={() => {
            setPaymentOrder(null);
            void loadOrders(true);
          }}
        />
      )}
    </div>
  );
}
