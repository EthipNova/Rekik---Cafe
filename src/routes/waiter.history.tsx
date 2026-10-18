import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  History,
  RefreshCw,
  Search,
  ShoppingBag,
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
import {
  fetchWaiterOrders,
  formatTimeAgo,
  getMethodLabel,
  getOrderStatusBadge,
  getWaiterDecisionBadge,
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

export function WaiterHistoryPage() {
  const [orders, setOrders] = useState<WaiterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<WaiterOrder | null>(null);

  const loadHistory = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await fetchWaiterOrders(
        dateFilter !== "all" ? { date: dateFilter } : undefined,
      );
      // In history, we focus on completed and finalized/rejected orders
      setOrders(data || []);
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
  }, [dateFilter]);

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === "completed" && o.status !== "completed" && o.status !== "delivered") {
      return false;
    }
    if (statusFilter === "rejected" && o.status !== "rejected" && o.status !== "cancelled" && o.waiterDecision !== "rejected") {
      return false;
    }

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      (o.orderReference && o.orderReference.toLowerCase().includes(q)) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.tableNumber && o.tableNumber.toLowerCase().includes(q))
    );
  });

  const totalValue = filteredOrders.reduce((sum, o) => {
    if (o.status === "completed" || o.status === "delivered") {
      return sum + o.totalAmount;
    }
    return sum;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Order History
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Archived logs of completed service and closed decisions.
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
          Refresh
        </Button>
      </div>

      {/* Summary Stat */}
      <div className="surface-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium">Historical Completed Value</p>
          <p className="font-display text-2xl sm:text-3xl font-bold text-primary mt-1">
            {formatETB(totalValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Calculated authoritatively from stored line-item prices snapshot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs px-2.5 py-1">
            {filteredOrders.length} records shown
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg p-1 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              statusFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            All Outcomes
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("completed")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              statusFilter === "completed" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Completed / Delivered
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("rejected")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              statusFilter === "rejected" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Rejected / Cancelled
          </button>
        </div>

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
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search by order #, reference, or customer…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 text-xs h-9 bg-background"
        />
      </div>

      {/* History Table */}
      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading order history…
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-2">
          <History className="size-8 mx-auto text-muted-foreground" />
          <p className="font-semibold text-sm">No history records</p>
          <p className="text-xs text-muted-foreground">
            No completed or cancelled orders match your active filter.
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
                  <th className="p-3">Method</th>
                  <th className="p-3">Items Count</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3">Final State</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Date</th>
                  <th className="p-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredOrders.map((order) => {
                  const method = getMethodLabel(order.method);
                  const statusBadge = getOrderStatusBadge(order.status);
                  const decisionBadge = getWaiterDecisionBadge(order.waiterDecision);

                  return (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-semibold text-foreground">
                        #{order.orderNumber}
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-foreground">{order.customerName}</span>
                        {order.tableNumber && (
                          <span className="ml-1 text-[11px] text-primary font-bold">
                            (T-{order.tableNumber})
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground font-medium">{method.label}</td>
                      <td className="p-3 text-muted-foreground">{order.items.length} items</td>
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
                      <td className="p-3 text-right font-bold text-foreground">
                        {formatETB(order.totalAmount)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground text-[11px]">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelectedOrder(order)}
                        >
                          <Eye className="size-3.5 mr-1" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History Details Dialog */}
      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Order #{selectedOrder?.orderNumber} Summary
            </DialogTitle>
            <DialogDescription className="text-xs">
              Reference: {selectedOrder?.orderReference} • Placed {selectedOrder && new Date(selectedOrder.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-lg bg-secondary/50 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{selectedOrder.customerName}</span>
                </div>
                {selectedOrder.tableNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="font-bold text-primary">{selectedOrder.tableNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold text-foreground">{formatETB(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {selectedOrder.waiterRejectionReason && (
                <div className="rounded bg-destructive/10 border border-destructive/20 p-2.5 text-destructive text-xs">
                  <span className="font-semibold">Rejection reason:</span> {selectedOrder.waiterRejectionReason}
                </div>
              )}

              <div className="space-y-2">
                <p className="font-semibold text-xs text-foreground">Items</p>
                <div className="rounded border border-border divide-y divide-border/60">
                  {selectedOrder.items.map((it, idx) => (
                    <div key={idx} className="p-2 flex justify-between text-xs">
                      <span>
                        {it.quantity}x {it.name}
                      </span>
                      <span className="font-medium">{formatETB(it.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
