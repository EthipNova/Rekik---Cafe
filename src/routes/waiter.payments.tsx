import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
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
  fetchWaiterPayments,
  formatTimeAgo,
  getMethodLabel,
  getOrderStatusBadge,
} from "@/lib/waiter";
import type { WaiterOrder, WaiterPayment } from "@/types/waiter";

export const Route = createFileRoute("/waiter/payments")({
  head: () => ({
    meta: [
      { title: "Payment Status — Waiter Station" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WaiterPaymentsPage,
});

export function WaiterPaymentsPage() {
  const [orders, setOrders] = useState<WaiterOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPaymentOrder, setSelectedPaymentOrder] = useState<WaiterOrder | null>(null);

  const loadPayments = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await fetchWaiterPayments();
      setOrders(data || []);
    } catch (err: unknown) {
      console.warn("Error fetching waiter payments:", err);
      toast.error("Failed to load payment tracking");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPayments();

    const handleUpdate = () => void loadPayments();
    window.addEventListener("neba:waiter-order-update", handleUpdate);
    const interval = setInterval(() => void loadPayments(), 15000);

    return () => {
      window.removeEventListener("neba:waiter-order-update", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      (o.orderReference && o.orderReference.toLowerCase().includes(q)) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.tableNumber && o.tableNumber.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Payment Status Tracker
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Monitor customer payment submissions and cashier verification outcomes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadPayments(true)}
          disabled={refreshing}
          className="h-9 gap-2 text-xs"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      {/* Info notice about role separation */}
      <div className="rounded-lg border border-border bg-muted/40 p-3.5 flex items-start gap-3 text-xs text-muted-foreground">
        <Lock className="size-4 shrink-0 text-primary mt-0.5" />
        <div>
          <span className="font-semibold text-foreground">Cashier Role Separation: </span>
          Payment verification and screenshot review are restricted exclusively to authorized Cashiers.
          Waiters can view verification progress and rejection reasons, but cannot override cashier outcomes.
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search by order #, reference, customer name, or table…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 text-xs h-9 bg-background max-w-md"
        />
      </div>

      {/* Payment Orders List */}
      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading payment progress from Supabase…
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="surface-card p-12 text-center space-y-2">
          <CreditCard className="size-8 mx-auto text-muted-foreground" />
          <p className="font-semibold text-sm">No payment records found</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchTerm
              ? `No orders matching "${searchTerm}".`
              : "No orders with payment activity currently recorded."}
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
                  <th className="p-3">Amount</th>
                  <th className="p-3">Payment State</th>
                  <th className="p-3">Cashier Verification</th>
                  <th className="p-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredOrders.map((order) => {
                  const payment = order.payments?.[0];
                  const proof = payment?.proof;

                  let cashierReviewBadge = {
                    label: "No Proof Required",
                    className: "bg-muted text-muted-foreground border-border",
                  };

                  if (proof) {
                    if (proof.status === "approved") {
                      cashierReviewBadge = {
                        label: "Cashier Verified",
                        className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                      };
                    } else if (proof.status === "rejected") {
                      cashierReviewBadge = {
                        label: "Cashier Rejected",
                        className: "bg-destructive/10 text-destructive border-destructive/30",
                      };
                    } else {
                      cashierReviewBadge = {
                        label: "Under Cashier Review",
                        className: "bg-purple-500/10 text-purple-600 border-purple-500/30 animate-pulse",
                      };
                    }
                  } else if (payment?.status === "paid") {
                    cashierReviewBadge = {
                      label: "Confirmed Settled",
                      className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                    };
                  } else {
                    cashierReviewBadge = {
                      label: "Awaiting Proof Upload",
                      className: "bg-amber-500/10 text-amber-600 border-amber-500/30",
                    };
                  }

                  return (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-semibold text-foreground">
                        <div>#{order.orderNumber}</div>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {order.orderReference}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-foreground">{order.customerName}</div>
                        {order.tableNumber && (
                          <span className="text-[11px] text-primary font-bold">
                            Table {order.tableNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground font-medium">
                        {payment?.method || order.method}
                      </td>
                      <td className="p-3 font-bold text-foreground">
                        {formatETB(order.totalAmount)}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={
                            payment?.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                          }
                        >
                          {payment?.status === "paid" ? "Paid / Settled" : "Pending Payment"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={cashierReviewBadge.className}>
                          {cashierReviewBadge.label}
                        </Badge>
                        {proof?.rejectionReason && (
                          <p className="text-[10px] text-destructive mt-0.5 max-w-[200px] truncate" title={proof.rejectionReason}>
                            Reason: {proof.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelectedPaymentOrder(order)}
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

      {/* Payment Details Dialog */}
      <Dialog
        open={Boolean(selectedPaymentOrder)}
        onOpenChange={(open) => !open && setSelectedPaymentOrder(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Payment Tracker — #{selectedPaymentOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Live Supabase verification details and cashier review logs.
            </DialogDescription>
          </DialogHeader>

          {selectedPaymentOrder && (
            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{selectedPaymentOrder.customerName}</span>
                </div>
                {selectedPaymentOrder.tableNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="font-bold text-primary">{selectedPaymentOrder.tableNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Total:</span>
                  <span className="font-bold text-foreground">
                    {formatETB(selectedPaymentOrder.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="font-medium">
                    {selectedPaymentOrder.payments?.[0]?.method || "Not specified"}
                  </span>
                </div>
              </div>

              {/* Proof Details */}
              {selectedPaymentOrder.payments?.[0]?.proof ? (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="font-semibold text-foreground flex items-center justify-between">
                    <span>Payment Proof Submission</span>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedPaymentOrder.payments[0].proof.status}
                    </Badge>
                  </p>
                  <div className="space-y-1 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Submitted Amount:</span>
                      <span className="font-medium text-foreground">
                        {formatETB(selectedPaymentOrder.payments[0].proof.submittedAmount)}
                      </span>
                    </div>
                    {selectedPaymentOrder.payments[0].proof.transactionReference && (
                      <div className="flex justify-between">
                        <span>Transaction Ref:</span>
                        <span className="font-mono text-foreground">
                          {selectedPaymentOrder.payments[0].proof.transactionReference}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Submitted At:</span>
                      <span>
                        {new Date(selectedPaymentOrder.payments[0].proof.submittedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {selectedPaymentOrder.payments[0].proof.rejectionReason && (
                    <div className="rounded bg-destructive/10 border border-destructive/20 p-2 text-[11px] text-destructive">
                      <span className="font-semibold">Cashier Rejection Reason: </span>
                      {selectedPaymentOrder.payments[0].proof.rejectionReason}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-muted-foreground space-y-1">
                  <FileText className="size-5 mx-auto text-muted-foreground/60" />
                  <p className="font-medium">No screenshot proof submitted</p>
                  <p className="text-[11px]">
                    Customer has not uploaded digital transfer receipt yet.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
