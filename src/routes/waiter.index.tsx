import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Utensils,
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
import { Textarea } from "@/components/ui/textarea";
import { formatETB } from "@/lib/menu-data";
import { WaiterPaymentDialog } from "@/components/waiter/WaiterPaymentDialog";
import {
  approveWaiterOrder,
  fetchWaiterMetrics,
  fetchWaiterOrders,
  formatTimeAgo,
  getMethodLabel,
  getOrderStatusBadge,
  getWaiterDecisionBadge,
  rejectWaiterOrder,
} from "@/lib/waiter";
import type { WaiterMetrics, WaiterOrder } from "@/types/waiter";

export const Route = createFileRoute("/waiter/")({
  head: () => ({
    meta: [
      { title: "Waiter Overview — NEBA Café" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterOverview,
});

export function WaiterOverview() {
  const [metrics, setMetrics] = useState<WaiterMetrics | null>(null);
  const [pendingOrders, setPendingOrders] = useState<WaiterOrder[]>([]);
  const [recentOrders, setRecentOrders] = useState<WaiterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal actions
  const [activeOrder, setActiveOrder] = useState<WaiterOrder | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<WaiterOrder | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [processingAction, setProcessingAction] = useState(false);

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [m, pending, recent] = await Promise.all([
        fetchWaiterMetrics().catch(() => null),
        fetchWaiterOrders({ status: "pending_review" }).catch(() => []),
        fetchWaiterOrders().catch(() => []),
      ]);

      if (m) setMetrics(m);
      setPendingOrders(pending || []);
      setRecentOrders(recent || []);
    } catch (err) {
      console.warn("Failed to load waiter overview:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();

    // Listen for realtime events dispatched by WaiterLayout
    const handleUpdate = () => void loadData();
    window.addEventListener("neba:waiter-order-update", handleUpdate);
    window.addEventListener("neba:waiter-notif-update", handleUpdate);

    // 12s polling fallback
    const interval = setInterval(() => void loadData(), 12000);

    return () => {
      window.removeEventListener("neba:waiter-order-update", handleUpdate);
      window.removeEventListener("neba:waiter-notif-update", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleConfirmAction = async () => {
    if (!activeOrder || !actionType) return;
    setProcessingAction(true);

    try {
      if (actionType === "approve") {
        const approved = await approveWaiterOrder(activeOrder.id, approvalNotes.trim() || undefined);
        toast.success(`Order #${activeOrder.orderNumber} approved!`);
        // Immediately reveal the Payment Evidence upload step for the approved order
        setPaymentOrder(approved);
      } else {
        if (!rejectionReason.trim()) {
          toast.error("Please provide a rejection reason.");
          setProcessingAction(false);
          return;
        }
        await rejectWaiterOrder(activeOrder.id, rejectionReason.trim());
        toast.success(`Order #${activeOrder.orderNumber} rejected.`);
      }

      setActiveOrder(null);
      setActionType(null);
      setApprovalNotes("");
      setRejectionReason("");
      void loadData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process order";
      toast.error(msg);
    } finally {
      setProcessingAction(false);
    }
  };

  const metricCards = [
    {
      label: "Awaiting My Review",
      value: metrics ? String(metrics.pendingReview) : "0",
      highlight: (metrics?.pendingReview ?? 0) > 0,
      icon: Clock,
      color: "text-amber-600 bg-amber-500/10",
      link: "/waiter/orders?status=pending_review",
    },
    {
      label: "Approved Today",
      value: metrics ? String(metrics.approvedToday) : "0",
      highlight: false,
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-500/10",
      link: "/waiter/orders?status=approved",
    },
    {
      label: "Awaiting Payment",
      value: metrics ? String(metrics.awaitingPayment) : "0",
      highlight: false,
      icon: CreditCard,
      color: "text-blue-600 bg-blue-500/10",
      link: "/waiter/payments",
    },
    {
      label: "Cashier Review",
      value: metrics ? String(metrics.underCashierReview) : "0",
      highlight: false,
      icon: Sparkles,
      color: "text-purple-600 bg-purple-500/10",
      link: "/waiter/payments",
    },
    {
      label: "Completed Today",
      value: metrics ? String(metrics.completedToday) : "0",
      highlight: false,
      icon: Utensils,
      color: "text-teal-600 bg-teal-500/10",
      link: "/waiter/history",
    },
    {
      label: "Today's Total Value",
      value: formatETB(metrics?.todayTotalRevenue ?? 0),
      highlight: false,
      icon: ShoppingBag,
      color: "text-primary bg-primary/10",
      link: "/waiter/history",
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Waiter Overview
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Real-time table and order review station.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="h-9 gap-2 text-xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild size="sm" className="h-9 gap-2 text-xs">
            <Link to="/waiter/orders">View All Orders</Link>
          </Button>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
        {metricCards.map((card) => (
          <Link
            key={card.label}
            to={card.link}
            className={`surface-card p-4 transition-all hover:shadow-md hover:border-primary/40 block ${
              card.highlight ? "ring-2 ring-amber-500/30 bg-amber-500/5" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`flex size-8 items-center justify-center rounded-lg ${card.color}`}>
                <card.icon className="size-4" />
              </span>
              {card.highlight && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 text-[10px] px-1.5 py-0 animate-pulse">
                  Action
                </Badge>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground font-medium truncate">{card.label}</p>
            <p className="mt-1 font-display text-xl sm:text-2xl font-bold tracking-tight">
              {card.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Immediate Attention Queue */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg sm:text-xl font-semibold">
              Action Queue: Pending Review
            </h2>
            <Badge variant="secondary" className="text-xs font-semibold">
              {pendingOrders.length}
            </Badge>
          </div>
          {pendingOrders.length > 0 && (
            <Link
              to="/waiter/orders"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              Open Orders Tab <ArrowRight className="size-3" />
            </Link>
          )}
        </div>

        {loading ? (
          <div className="surface-card p-10 text-center text-sm text-muted-foreground animate-pulse">
            Loading pending orders…
          </div>
        ) : pendingOrders.length === 0 ? (
          <div className="surface-card p-8 text-center space-y-2 border-dashed">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="font-medium text-sm">All caught up!</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No orders are currently waiting for review. New orders assigned to you will appear here instantly.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingOrders.map((order) => {
              const method = getMethodLabel(order.method);
              return (
                <div
                  key={order.id}
                  className="surface-card p-4 flex flex-col justify-between border-amber-500/30 hover:border-amber-500/60 transition-colors shadow-sm space-y-3"
                >
                  <div className="space-y-2">
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
                        <p className="text-xs font-medium text-foreground mt-0.5">
                          {order.customerName}
                          {order.tableNumber && (
                            <span className="ml-2 font-semibold text-primary">
                              Table {order.tableNumber}
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${method.color}`}>
                        {method.label}
                      </Badge>
                    </div>

                    {/* Order items preview */}
                    <div className="rounded bg-secondary/50 p-2 text-xs space-y-1">
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
                      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-1.5 rounded text-[11px]">
                        Note: {order.customerNotes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" /> {formatTimeAgo(order.createdAt)}
                      </span>
                      <span className="font-display font-bold text-base text-primary">
                        {formatETB(order.totalAmount)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                        onClick={() => {
                          setActiveOrder(order);
                          setActionType("reject");
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          setActiveOrder(order);
                          setActionType("approve");
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg sm:text-xl font-semibold">
            Recent Assigned Activity
          </h2>
          <Link
            to="/waiter/history"
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            History <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Customer / Table</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Review Decision</th>
                  <th className="p-3">State</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No order activity recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentOrders.slice(0, 8).map((o) => {
                    const statusBadge = getOrderStatusBadge(o.status);
                    const decisionBadge = getWaiterDecisionBadge(o.waiterDecision);
                    const method = getMethodLabel(o.method);

                    return (
                      <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          <Link to="/waiter/orders" className="hover:underline">
                            #{o.orderNumber}
                          </Link>
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-foreground">{o.customerName}</span>
                          {o.tableNumber && (
                            <span className="ml-1 text-[11px] text-primary font-semibold">
                              (T-{o.tableNumber})
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {method.label}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={`text-[10px] ${decisionBadge.className}`}>
                            {decisionBadge.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={`text-[10px] ${statusBadge.className}`}>
                            {statusBadge.label}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-semibold text-foreground">
                          {formatETB(o.totalAmount)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground text-[11px]">
                          {formatTimeAgo(o.createdAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Confirmation Dialogs for Approve / Reject */}
      <Dialog
        open={Boolean(activeOrder && actionType)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveOrder(null);
            setActionType(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve"
                ? `Approve Order #${activeOrder?.orderNumber}`
                : `Reject Order #${activeOrder?.orderNumber}`}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? "Confirming this order notifies the customer and kitchen to proceed with meal preparation."
                : "A rejection reason is strictly required so the customer can be notified accurately."}
            </DialogDescription>
          </DialogHeader>

          {activeOrder && (
            <div className="space-y-3 py-2 text-xs">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{activeOrder.customerName}</span>
                </div>
                {activeOrder.tableNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="font-semibold text-primary">{activeOrder.tableNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Total:</span>
                  <span className="font-bold text-foreground">{formatETB(activeOrder.totalAmount)}</span>
                </div>
              </div>

              {actionType === "approve" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="approval-notes" className="text-xs">
                    Optional Waiter Notes (e.g. Special requests confirmed)
                  </Label>
                  <Input
                    id="approval-notes"
                    placeholder="e.g. Verified table 4, kitchen expedited"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    disabled={processingAction}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="rejection-reason" className="text-xs text-destructive font-medium">
                    Reason for Rejection (Required) *
                  </Label>
                  <Textarea
                    id="rejection-reason"
                    required
                    placeholder="e.g. Selected item is out of stock / Invalid table number / Café closing"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    disabled={processingAction}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={processingAction}
              onClick={() => {
                setActiveOrder(null);
                setActionType(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={processingAction || (actionType === "reject" && !rejectionReason.trim())}
              className={
                actionType === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-destructive hover:bg-destructive/90 text-white"
              }
              onClick={handleConfirmAction}
            >
              {processingAction
                ? "Processing…"
                : actionType === "approve"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waiter Payment Evidence Dialog */}
      <WaiterPaymentDialog
        order={paymentOrder}
        open={Boolean(paymentOrder)}
        onOpenChange={(open) => !open && setPaymentOrder(null)}
        onSuccess={() => void loadData()}
      />
    </div>
  );
}
