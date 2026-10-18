import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  User,
  UtensilsCrossed,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatETB } from "@/lib/menu-data";
import {
  approveWaiterOrder,
  fetchWaiterOrders,
  formatTimeAgo,
  getMethodLabel,
  getOrderStatusBadge,
  getWaiterDecisionBadge,
  rejectWaiterOrder,
} from "@/lib/waiter";
import type { WaiterOrder } from "@/types/waiter";

export const Route = createFileRoute("/waiter/orders")({
  head: () => ({
    meta: [
      { title: "Assigned Orders — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterOrdersPage,
});

export function WaiterOrdersPage() {
  const [orders, setOrders] = useState<WaiterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusTab, setStatusTab] = useState<string>("pending_review");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Detail Sheet
  const [selectedOrder, setSelectedOrder] = useState<WaiterOrder | null>(null);

  // Approval / Rejection dialogs
  const [actionOrder, setActionOrder] = useState<WaiterOrder | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

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

  const handleConfirmDecision = async () => {
    if (!actionOrder || !actionType) return;
    setSubmittingAction(true);

    try {
      if (actionType === "approve") {
        const approved = await approveWaiterOrder(
          actionOrder.id,
          approvalNotes.trim() || undefined,
        );
        toast.success(`Order #${actionOrder.orderNumber} approved successfully`);
        if (selectedOrder?.id === actionOrder.id) setSelectedOrder(approved);
      } else {
        if (!rejectionReason.trim()) {
          toast.error("Rejection reason is mandatory.");
          setSubmittingAction(false);
          return;
        }
        const rejected = await rejectWaiterOrder(actionOrder.id, rejectionReason.trim());
        toast.success(`Order #${actionOrder.orderNumber} marked as rejected`);
        if (selectedOrder?.id === actionOrder.id) setSelectedOrder(rejected);
      }

      setActionOrder(null);
      setActionType(null);
      setApprovalNotes("");
      setRejectionReason("");
      void loadOrders(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process decision";
      toast.error(msg);
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Order Station
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Review, verify table service, and confirm orders in real time.
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
              <TabsTrigger value="pending_review" className="text-xs font-medium">
                Awaiting Review
              </TabsTrigger>
              <TabsTrigger value="active" className="text-xs font-medium">
                In Progress
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-xs font-medium">
                Approved
              </TabsTrigger>
              <TabsTrigger value="rejected" className="text-xs font-medium">
                Rejected
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs font-medium">
                All Orders
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Date Selector */}
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
            const decisionBadge = getWaiterDecisionBadge(order.waiterDecision);
            const isPendingDecision = order.waiterDecision === "pending";

            return (
              <div
                key={order.id}
                className={`surface-card p-4 flex flex-col justify-between transition-all hover:shadow-md ${
                  isPendingDecision ? "border-amber-500/40 bg-amber-500/[0.02]" : ""
                }`}
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
                          <span className="ml-1.5 font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded text-[11px]">
                            Table {order.tableNumber}
                          </span>
                        )}
                      </p>
                    </div>

                    <Badge variant="outline" className={`text-[10px] shrink-0 ${method.color}`}>
                      {method.label}
                    </Badge>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${decisionBadge.className}`}>
                      {decisionBadge.label}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
                      {statusBadge.label}
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

                  {order.waiterRejectionReason && (
                    <div className="rounded bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive">
                      <span className="font-semibold">Rejection reason:</span> {order.waiterRejectionReason}
                    </div>
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

                    {isPendingDecision && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                          onClick={() => {
                            setActionOrder(order);
                            setActionType("reject");
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => {
                            setActionOrder(order);
                            setActionType("approve");
                          }}
                        >
                          Approve
                        </Button>
                      </>
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

              {/* Status and Actions */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={`text-xs ${getWaiterDecisionBadge(selectedOrder.waiterDecision).className}`}>
                    {getWaiterDecisionBadge(selectedOrder.waiterDecision).label}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${getOrderStatusBadge(selectedOrder.status).className}`}>
                    {getOrderStatusBadge(selectedOrder.status).label}
                  </Badge>
                </div>

                {selectedOrder.waiterDecision === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                      onClick={() => {
                        setActionOrder(selectedOrder);
                        setActionType("approve");
                      }}
                    >
                      <CheckCircle2 className="size-3.5 mr-1.5" /> Approve Order
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-destructive hover:bg-destructive/10 border-destructive/30 text-xs h-8"
                      onClick={() => {
                        setActionOrder(selectedOrder);
                        setActionType("reject");
                      }}
                    >
                      <XCircle className="size-3.5 mr-1.5" /> Reject Order
                    </Button>
                  </div>
                )}
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
                        Table
                      </span>
                      <span className="font-bold text-primary">{selectedOrder.tableNumber}</span>
                    </div>
                  )}
                  {selectedOrder.customerPhone && (
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Phone
                      </span>
                      <span className="font-medium text-foreground">{selectedOrder.customerPhone}</span>
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
                    <span>+{formatETB(selectedOrder.deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-foreground pt-1.5 border-t border-border">
                  <span>Total Amount</span>
                  <span className="text-primary">{formatETB(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {/* History & Timeline */}
              <div className="space-y-2">
                <p className="font-semibold text-xs text-foreground">Status & Decision Logs</p>
                {selectedOrder.statusLogs && selectedOrder.statusLogs.length > 0 ? (
                  <div className="space-y-2 text-xs">
                    {selectedOrder.statusLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-2 rounded bg-secondary/30">
                        <Clock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium">
                            Status changed to <span className="font-semibold text-primary">{log.toStatus}</span>
                          </p>
                          {log.notes && <p className="text-[11px] text-muted-foreground">{log.notes}</p>}
                          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                            {new Date(log.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No historical status logs recorded.</p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialogs for Approve / Reject */}
      <Dialog
        open={Boolean(actionOrder && actionType)}
        onOpenChange={(open) => {
          if (!open) {
            setActionOrder(null);
            setActionType(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve"
                ? `Approve Order #${actionOrder?.orderNumber}`
                : `Reject Order #${actionOrder?.orderNumber}`}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? "Confirming this order notifies the kitchen and customer to proceed."
                : "A rejection reason is strictly required so the customer understands the decision."}
            </DialogDescription>
          </DialogHeader>

          {actionOrder && (
            <div className="space-y-3 py-2 text-xs">
              <div className="rounded bg-muted/60 p-2.5 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{actionOrder.customerName}</span>
                </div>
                {actionOrder.tableNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="font-bold text-primary">{actionOrder.tableNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold">{formatETB(actionOrder.totalAmount)}</span>
                </div>
              </div>

              {actionType === "approve" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="order-approval-notes" className="text-xs">
                    Optional Waiter Comments
                  </Label>
                  <Input
                    id="order-approval-notes"
                    placeholder="e.g. Table 3 verified, guest seated"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    disabled={submittingAction}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="order-rejection-reason" className="text-xs text-destructive font-medium">
                    Reason for Rejection *
                  </Label>
                  <Textarea
                    id="order-rejection-reason"
                    required
                    placeholder="e.g. Item unavailable / Incorrect table number / Kitchen closed"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    disabled={submittingAction}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={submittingAction}
              onClick={() => {
                setActionOrder(null);
                setActionType(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={submittingAction || (actionType === "reject" && !rejectionReason.trim())}
              className={
                actionType === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-destructive hover:bg-destructive/90 text-white"
              }
              onClick={handleConfirmDecision}
            >
              {submittingAction
                ? "Processing…"
                : actionType === "approve"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
