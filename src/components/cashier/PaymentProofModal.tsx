import { useState, useEffect } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  User,
  Phone,
  CreditCard,
  FileX,
  Lock,
  Layers,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchProofSignedUrl } from "@/services/cashier";
import type {
  PendingPaymentReviewItem,
  PaymentReviewHistoryItem,
  ReviewOrderItem,
} from "@/lib/cashier";

export type VerificationModalItem = PendingPaymentReviewItem | PaymentReviewHistoryItem;

interface PaymentProofModalProps {
  open: boolean;
  item: VerificationModalItem | null;
  onApprove?: (item: PendingPaymentReviewItem) => void;
  onReject?: (item: PendingPaymentReviewItem) => void;
  onClose: () => void;
  isProcessingAction?: boolean;
}

export function PaymentProofModal({
  open,
  item,
  onApprove,
  onReject,
  onClose,
  isProcessingAction = false,
}: PaymentProofModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  // Zoom and rotation for preview image
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const isHistorical = Boolean(item && "decision" in item);

  const fetchUrl = async () => {
    if (!item) return;
    setLoadingUrl(true);
    setUrlError(null);

    try {
      // Use proof_id or screenshot_path
      const target = item.proof_id || ("screenshot_path" in item ? item.screenshot_path : "");
      const url = await fetchProofSignedUrl(target);
      setSignedUrl(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to generate preview URL";
      setUrlError(msg);
    } finally {
      setLoadingUrl(false);
    }
  };

  useEffect(() => {
    if (!open || !item) {
      setSignedUrl(null);
      setUrlError(null);
      setZoom(1);
      setRotation(0);
      return;
    }

    fetchUrl();
  }, [open, item]);

  if (!item) return null;

  // Zoom and Rotation handlers
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const copyRef = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  // Safe property extraction
  const orderNumber = item.order_number || `#${String(item.order_id).slice(0, 6)}`;
  const customerName = item.customer_name || "Guest Customer";
  const customerPhone = item.customer_phone;
  const paymentAmount = item.payment_amount || 0;
  const paymentMethod = item.payment_method || "Mobile Payment";

  // For pending items with full order details
  const pendingItem = !isHistorical ? (item as PendingPaymentReviewItem) : null;
  const historyItem = isHistorical ? (item as PaymentReviewHistoryItem) : null;

  const orderTotal = pendingItem ? pendingItem.order_total : paymentAmount;
  const amountDiff = paymentAmount - orderTotal;
  const isExactMatch = Math.abs(amountDiff) < 0.01;
  const isUnderpaid = amountDiff < -0.01;
  const isOverpaid = amountDiff > 0.01;

  const orderItems: ReviewOrderItem[] = pendingItem?.items || [];
  const transactionRef =
    pendingItem?.transaction_reference ||
    ("transaction_reference" in item ? (item as any).transaction_reference : null);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 border-[#EAE3D9] bg-[#FAF7F2] overflow-hidden shadow-2xl rounded-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#EAE3D9] px-6 py-4 bg-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2A1810] text-[#E8A87C]">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-[#2A1810] font-display flex items-center gap-2">
                Payment Verification Panel
                <Badge
                  variant="outline"
                  className="font-mono text-xs font-semibold border-[#D6C7B7] text-[#2A1810] bg-[#FAF7F2]"
                >
                  {orderNumber}
                </Badge>
                {isHistorical && (
                  <Badge
                    className={
                      historyItem?.decision === "approved"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold"
                        : "bg-red-100 text-red-800 border-red-300 font-bold"
                    }
                  >
                    {historyItem?.decision === "approved" ? "Approved" : "Rejected"}
                  </Badge>
                )}
              </DialogTitle>
              <p className="text-xs text-[#70645C] mt-0.5">
                Customer: <strong className="text-[#2A1810]">{customerName}</strong>
                {customerPhone && ` • ${customerPhone}`}
                {" • "}
                {pendingItem?.order_method === "delivery" ? "Delivery Order" : "Dine-in"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[#70645C] hover:bg-[#F0EBE3] hover:text-[#2A1810] transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body: 2 Main Columns on Desktop */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-y-auto divide-y md:divide-y-0 md:divide-x divide-[#EAE3D9]">
          {/* ================================================================= */}
          {/* LEFT COLUMN: Order Information, Payment Details, & Notes (6 cols) */}
          {/* ================================================================= */}
          <div className="md:col-span-6 p-6 space-y-6 overflow-y-auto bg-white/80">
            {/* 1. Order Information Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[#F0EAE1] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C7A6E] flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#C8102E]" />
                  Order Information
                </span>
                <span className="text-[11px] text-[#70645C]">
                  {pendingItem?.order_created_at
                    ? new Date(pendingItem.order_created_at).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : ""}
                </span>
              </div>

              {/* Delivery or Table Location */}
              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#EAE3D9] text-xs space-y-1">
                <div className="flex justify-between items-center text-[#70645C]">
                  <span>Order Type:</span>
                  <span className="font-semibold text-[#2A1810] capitalize">
                    {pendingItem?.order_method === "dine_in" ? "Dine-in" : "Delivery"}
                  </span>
                </div>
                {pendingItem?.table_number && (
                  <div className="flex justify-between items-center text-[#70645C]">
                    <span>Assigned Table:</span>
                    <span className="font-bold text-[#2A1810]">
                      {pendingItem.table_number}
                    </span>
                  </div>
                )}
                {pendingItem?.delivery_address && (
                  <div className="flex justify-between items-start text-[#70645C] pt-1">
                    <span>Address:</span>
                    <span className="font-medium text-[#2A1810] text-right max-w-[220px]">
                      {pendingItem.delivery_address}
                    </span>
                  </div>
                )}
              </div>

              {/* Ordered Products Table */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#2A1810]">
                  Ordered Products ({orderItems.length})
                </div>
                {orderItems.length > 0 ? (
                  <div className="rounded-xl border border-[#EAE3D9] overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#FAF7F2] text-[#8C7A6E] font-semibold border-b border-[#EAE3D9]">
                        <tr>
                          <th className="py-2 px-3">Item</th>
                          <th className="py-2 px-2 text-center">Qty</th>
                          <th className="py-2 px-2 text-right">Price</th>
                          <th className="py-2 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0EAE1]">
                        {orderItems.map((prod) => (
                          <tr key={prod.id} className="hover:bg-[#FCFBF9]">
                            <td className="py-2 px-3 font-medium text-[#2A1810]">
                              {prod.name}
                            </td>
                            <td className="py-2 px-2 text-center text-[#70645C] font-mono">
                              {prod.quantity}
                            </td>
                            <td className="py-2 px-2 text-right text-[#70645C] font-mono">
                              {prod.unit_price.toLocaleString()} ETB
                            </td>
                            <td className="py-2 px-3 text-right font-bold font-mono text-[#2A1810]">
                              {prod.line_total.toLocaleString()} ETB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : historyItem?.items_summary ? (
                  <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#EAE3D9] text-xs font-medium text-[#2A1810]">
                    {historyItem.items_summary}
                  </div>
                ) : (
                  <div className="text-xs text-[#70645C] italic">No items listed.</div>
                )}
              </div>

              {/* Subtotal & Total Financial Summary */}
              {pendingItem && (
                <div className="rounded-xl bg-[#FAF7F2] p-3.5 border border-[#EAE3D9] text-xs space-y-1.5">
                  <div className="flex justify-between text-[#70645C]">
                    <span>Items Subtotal:</span>
                    <span className="font-mono text-[#2A1810]">
                      {pendingItem.subtotal.toLocaleString()} ETB
                    </span>
                  </div>
                  {pendingItem.delivery_fee > 0 && (
                    <div className="flex justify-between text-[#70645C]">
                      <span>Delivery Fee:</span>
                      <span className="font-mono text-[#2A1810]">
                        {pendingItem.delivery_fee.toLocaleString()} ETB
                      </span>
                    </div>
                  )}
                  {pendingItem.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount:</span>
                      <span className="font-mono">
                        -{pendingItem.discount_amount.toLocaleString()} ETB
                      </span>
                    </div>
                  )}
                  <div className="border-t border-[#EAE3D9] pt-2 flex justify-between items-center text-sm font-bold text-[#2A1810]">
                    <span>Order Bill Total:</span>
                    <span className="font-mono text-base text-[#C8102E]">
                      {pendingItem.order_total.toLocaleString()} ETB
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Payment Details Section */}
            <div className="space-y-3 pt-2">
              <div className="border-b border-[#F0EAE1] pb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C7A6E] flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-amber-600" />
                  Payment Details
                </span>
                <Badge
                  variant="secondary"
                  className="bg-[#FAF2EB] text-[#5C3B28] border border-[#E6D5C7] text-[10px]"
                >
                  {paymentMethod}
                </Badge>
              </div>

              {/* Amount Being Verified vs Order Total */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white rounded-xl border border-[#EAE3D9] shadow-sm">
                  <div className="text-[11px] text-[#8C7A6E] font-medium">Order Total</div>
                  <div className="text-lg font-bold font-mono text-[#2A1810]">
                    {orderTotal.toLocaleString()} ETB
                  </div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#EAE3D9] shadow-sm">
                  <div className="text-[11px] text-[#8C7A6E] font-medium">Verified Amount</div>
                  <div className="text-lg font-bold font-mono text-emerald-700">
                    {paymentAmount.toLocaleString()} ETB
                  </div>
                </div>
              </div>

              {/* Amount Reconciliation Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                  isExactMatch
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                    : isUnderpaid
                      ? "bg-red-50 border-red-300 text-red-900"
                      : "bg-amber-50 border-amber-300 text-amber-900"
                }`}
              >
                {isExactMatch ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">
                    {isExactMatch
                      ? "Payment Amount Exactly Matches Order Bill"
                      : isUnderpaid
                        ? `Amount Mismatch: Underpaid by ${Math.abs(amountDiff).toLocaleString()} ETB`
                        : `Overpayment: Paid +${amountDiff.toLocaleString()} ETB above bill`}
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-90">
                    {isExactMatch
                      ? "The customer submitted proof matching the exact order total."
                      : "Review the discrepancy with the diner or restaurant supervisor before approval."}
                  </div>
                </div>
              </div>

              {/* Transaction Reference Number */}
              {transactionRef && (
                <div className="flex items-center justify-between p-2.5 bg-[#FAF7F2] rounded-xl border border-[#EAE3D9] text-xs">
                  <span className="text-[#70645C] font-medium">Transaction Reference:</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-[#2A1810]">
                    <span>{transactionRef}</span>
                    <button
                      type="button"
                      onClick={() => copyRef(transactionRef)}
                      className="text-[#8C7A6E] hover:text-[#2A1810] p-1"
                      title="Copy Reference"
                    >
                      {copiedRef ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Additional Information (Notes) */}
            {pendingItem?.customer_notes && (
              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-bold uppercase tracking-wider text-[#8C7A6E]">
                  Customer Notes
                </div>
                <div className="p-3 bg-[#FAF7F2] rounded-xl border border-[#EAE3D9] text-xs text-[#2A1810]">
                  {pendingItem.customer_notes}
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* RIGHT COLUMN: Payment Proof Viewer & Verification Actions (6 cols)*/}
          {/* ================================================================= */}
          <div className="md:col-span-6 flex flex-col justify-between bg-[#F4EFEA] min-h-[460px]">
            {/* Top Toolbar for Image Controls */}
            <div className="flex items-center justify-between border-b border-[#EAE3D9] bg-white px-4 py-2.5">
              <span className="text-xs font-bold text-[#2A1810] flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-[#C8102E]" />
                Payment Proof Screenshot
              </span>

              {/* Zoom & Rotate Controls */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#70645C] hover:text-[#2A1810]"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-[11px] font-mono text-[#70645C] w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#70645C] hover:text-[#2A1810]"
                  onClick={handleZoomIn}
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#70645C] hover:text-[#2A1810]"
                  onClick={handleRotate}
                  title="Rotate 90°"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-[#70645C] hover:text-[#2A1810] px-2"
                  onClick={handleReset}
                  title="Reset Zoom & Rotation"
                >
                  Reset
                </Button>
                {signedUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[#70645C] hover:text-[#2A1810]"
                    onClick={() => window.open(signedUrl, "_blank")}
                    title="Open Full Image in New Tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Proof Image Viewport Area */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto min-h-[320px] max-h-[460px]">
              {loadingUrl ? (
                <div className="flex flex-col items-center gap-2 text-[#70645C]">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C8102E] border-t-transparent" />
                  <span className="text-xs font-medium">Generating secure signed preview...</span>
                </div>
              ) : urlError ? (
                <div className="flex flex-col items-center gap-2 text-center p-6 text-red-600">
                  <FileX className="h-10 w-10 opacity-70" />
                  <p className="text-sm font-bold">Unable to load payment proof</p>
                  <p className="text-xs text-[#70645C] max-w-xs">{urlError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchUrl}
                    className="mt-2 text-xs border-[#D6C7B7] rounded-xl"
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry Loading
                  </Button>
                </div>
              ) : signedUrl ? (
                <div className="relative max-h-full max-w-full flex items-center justify-center">
                  <img
                    src={signedUrl}
                    alt={`Payment proof for ${orderNumber}`}
                    style={{
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transition: "transform 0.15s ease-out",
                    }}
                    className="max-h-[380px] w-auto max-w-full object-contain rounded-xl shadow-md border border-[#D6C7B7]"
                  />
                </div>
              ) : (
                <div className="text-xs text-[#70645C]">No proof image found.</div>
              )}
            </div>

            {/* Security Notice & Prominent Verification Actions at Bottom */}
            <div className="p-4 bg-white border-t border-[#EAE3D9] space-y-3">
              {/* Subtle Security Notice */}
              <div className="flex items-center gap-2 text-[11px] text-[#8C7A6E]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>
                  Protected Staff Asset: Payment proofs are stored in private encrypted storage and accessible only to authorized cashiers.
                </span>
              </div>

              {/* Action Buttons: Pending Decision vs Historical Record */}
              {!isHistorical && pendingItem && onApprove && onReject ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {/* Reject Payment Button */}
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isProcessingAction}
                    onClick={() => onReject(pendingItem)}
                    className="h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject Payment
                  </Button>

                  {/* Approve Payment Button */}
                  <Button
                    type="button"
                    disabled={isProcessingAction}
                    onClick={() => onApprove(pendingItem)}
                    className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve Payment
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                      historyItem?.decision === "approved"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                        : "bg-red-50 border-red-300 text-red-900"
                    }`}
                  >
                    {historyItem?.decision === "approved" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="font-bold">
                        Reviewed as{" "}
                        <span className="uppercase">{historyItem?.decision}</span> by{" "}
                        {historyItem?.cashier_name || "Cashier"}
                      </div>
                      <div className="text-[11px] text-[#70645C]">
                        Decided on {historyItem?.reviewed_at ? new Date(historyItem.reviewed_at).toLocaleString() : ""}
                      </div>
                      {historyItem?.reason && (
                        <div className="text-[11px] font-medium pt-0.5">
                          Reason: {historyItem.reason}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="w-full border-[#D6C7B7] text-[#2A1810] h-10 rounded-xl"
                  >
                    Close Panel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
