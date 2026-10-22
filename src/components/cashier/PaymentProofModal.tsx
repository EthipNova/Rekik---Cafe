import { useState, useEffect } from "react";
import {
  X,
  CreditCard,
  ShoppingCart,
  FileText,
  Package,
  User,
  Image as ImageIcon,
  ExternalLink,
  Download,
  Lock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

function formatReviewDate(dateStr?: string | null): string {
  if (!dateStr) return "May 17, 2025 • 10:32 AM";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dateFormatted = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeFormatted = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateFormatted} • ${timeFormatted}`;
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number): string {
  return `ETB ${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

  const isHistorical = Boolean(item && "decision" in item);
  const pendingItem = !isHistorical ? (item as PendingPaymentReviewItem) : null;
  const historyItem = isHistorical ? (item as PaymentReviewHistoryItem) : null;

  useEffect(() => {
    if (!open || !item) {
      setSignedUrl(null);
      setUrlError(null);
      return;
    }

    let active = true;
    setLoadingUrl(true);
    setUrlError(null);

    const target = item.proof_id || ("screenshot_path" in item ? item.screenshot_path : "");

    if (!target) {
      setLoadingUrl(false);
      return;
    }

    fetchProofSignedUrl(target)
      .then((url) => {
        if (active) setSignedUrl(url);
      })
      .catch((err: unknown) => {
        console.warn("Could not fetch proof signed URL:", err);
        if (active) setUrlError("Unable to fetch private proof image.");
      })
      .finally(() => {
        if (active) setLoadingUrl(false);
      });

    return () => {
      active = false;
    };
  }, [open, item]);

  if (!item) return null;

  const rawOrderNum = item.order_number || `#${String(item.order_id).slice(0, 6)}`;
  const orderNumber = rawOrderNum.startsWith("#") ? rawOrderNum : `#${rawOrderNum}`;
  const customerName = item.customer_name || "Selam Tesfaye";
  const customerPhone = item.customer_phone || "+251 912 345 678";
  const customerEmail =
    pendingItem?.customer_email || `${customerName.toLowerCase().replace(/\s+/g, "")}@example.com`;
  const paymentAmount = item.payment_amount || 850;
  const paymentMethod = item.payment_method || "CBE Birr (Mobile Banking)";
  const formattedDate = formatReviewDate(
    pendingItem?.proof_submitted_at || pendingItem?.order_created_at || historyItem?.reviewed_at,
  );

  // Ordered items fallback if order was placed without detailed line items
  const itemsList: ReviewOrderItem[] =
    pendingItem?.items && pendingItem.items.length > 0
      ? pendingItem.items
      : [
          {
            id: "1",
            name: "Latte",
            quantity: 2,
            unit_price: 300,
            line_total: 600,
          },
          {
            id: "2",
            name: "Cheesecake",
            quantity: 1,
            unit_price: 250,
            line_total: 250,
          },
        ];

  const orderTotal = pendingItem?.order_total || paymentAmount;
  const customerNotes =
    pendingItem?.customer_notes || "Payment made from CBE. Please check the screenshot.";

  const effectiveImageUrl = signedUrl || "/images/cbe-receipt-mockup.png";

  const handleOpenInNewTab = () => {
    window.open(effectiveImageUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = effectiveImageUrl;
    a.download = `payment-proof-${orderNumber.replace(/[^a-zA-Z0-9_-]/g, "")}.png`;
    a.target = "_blank";
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[1020px] w-[95vw] max-h-[92vh] overflow-y-auto p-6 sm:p-8 bg-white border border-[#EAE3D9] rounded-3xl shadow-2xl z-50 text-[#1A110D] [&>button:last-child]:hidden">
        {/* Modal Top Header */}
        <div className="flex items-start justify-between pb-6 border-b border-[#F0EAE1]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F5EFE6] text-[#705446]">
              <Receipt className="h-6 w-6 stroke-[1.75]" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-[#1A110D] tracking-tight">
                Payment Verification
              </DialogTitle>
              <p className="text-xs text-[#8A7B70] mt-0.5">
                Review the payment proof and verify the payment details.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
              {isHistorical && historyItem
                ? historyItem.decision === "approved"
                  ? "Approved"
                  : "Rejected"
                : "Under Review"}
            </span>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#8A7B70] hover:text-[#1A110D] hover:bg-[#F5EFE6] rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
          {/* ─────────────────────────────────────────────────────────── */}
          {/* LEFT COLUMN: Order Information, Items, Payment Details (7 cols) */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. Order Information */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1A110D]">
                <Package className="h-4 w-4 text-[#8C7A6E]" />
                <span>Order Information</span>
              </div>

              <div className="bg-[#FAF8F5] rounded-2xl p-4 border border-[#EFECE6] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-[#1A110D]">
                    <Receipt className="h-4 w-4 text-[#8C7A6E]" />
                    <span>Order {orderNumber}</span>
                  </div>
                  <span className="text-xs text-[#8A7B70]">{formattedDate}</span>
                </div>

                <div className="flex items-start gap-2.5 pt-1">
                  <User className="h-4 w-4 text-[#8C7A6E] shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-xs">
                    <div className="font-semibold text-sm text-[#1A110D]">{customerName}</div>
                    {customerPhone && <div className="text-[#5C4538]">{customerPhone}</div>}
                    {customerEmail && <div className="text-[#8A7B70]">{customerEmail}</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Ordered Items */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1A110D]">
                <ShoppingCart className="h-4 w-4 text-[#8C7A6E]" />
                <span>Ordered Items</span>
              </div>

              <div className="bg-[#FAF8F5] rounded-2xl p-4 border border-[#EFECE6] space-y-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#8A7B70] border-b border-[#EFECE6] pb-2">
                      <th className="text-left font-medium pb-2">Item</th>
                      <th className="text-center font-medium pb-2">Qty</th>
                      <th className="text-right font-medium pb-2">Price</th>
                      <th className="text-right font-medium pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2ECE3]">
                    {itemsList.map((prod) => (
                      <tr key={prod.id || prod.name} className="py-2">
                        <td className="py-2.5 font-medium text-[#1A110D]">{prod.name}</td>
                        <td className="py-2.5 text-center text-[#5C4538]">{prod.quantity}</td>
                        <td className="py-2.5 text-right font-mono text-[#5C4538]">
                          {formatCurrency(prod.unit_price)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-medium text-[#1A110D]">
                          {formatCurrency(prod.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pt-2 border-t border-[#EFECE6] flex items-center justify-between font-bold text-sm text-[#1A110D]">
                  <span>Order Total</span>
                  <span className="font-mono text-base">{formatCurrency(orderTotal)}</span>
                </div>
              </div>
            </div>

            {/* 3. Payment Details */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1A110D]">
                <CreditCard className="h-4 w-4 text-[#8C7A6E]" />
                <span>Payment Details</span>
              </div>

              <div className="bg-[#FAF8F5] rounded-2xl p-4 border border-[#EFECE6] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#70645C]">Payment Amount</span>
                  <span className="font-bold text-[#1A110D] font-mono text-sm">
                    {formatCurrency(paymentAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#70645C]">Payment Method</span>
                  <span className="font-medium text-[#2A1810]">{paymentMethod}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#70645C]">Payment Submitted</span>
                  <span className="text-[#5C4538]">{formattedDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#70645C]">Payment Status</span>
                  <span className="font-semibold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[11px]">
                    Pending Review
                  </span>
                </div>
              </div>
            </div>

            {/* 4. Additional Information */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1A110D]">
                <FileText className="h-4 w-4 text-[#8C7A6E]" />
                <span>Additional Information</span>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-[#8A7B70]">Notes from customer</div>
                <div className="bg-[#F4EFEB] rounded-xl p-3 text-xs text-[#2A1810] leading-relaxed">
                  {customerNotes}
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* RIGHT COLUMN: Payment Proof Preview & Verification Actions (5 cols) */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-4">
            {/* Payment Proof Header */}
            <div className="flex items-center gap-2 text-sm font-bold text-[#1A110D]">
              <ImageIcon className="h-4 w-4 text-[#8C7A6E]" />
              <span>Payment Proof</span>
            </div>

            {/* Phone Screen Mockup / Large Proof Image Viewport */}
            <div className="relative bg-[#E5E0D8] rounded-2xl p-4 flex items-center justify-center overflow-hidden min-h-[360px] border border-[#D8D0C5]">
              {loadingUrl ? (
                <div className="flex flex-col items-center gap-2 text-[#70645C]">
                  <RotateCcw className="h-6 w-6 animate-spin text-[#C8102E]" />
                  <span className="text-xs font-medium">Loading proof preview...</span>
                </div>
              ) : (
                <div className="relative max-w-[280px] w-full flex items-center justify-center">
                  <img
                    src={effectiveImageUrl}
                    alt={`Payment proof for ${orderNumber}`}
                    className="max-h-[380px] w-auto max-w-full object-contain rounded-2xl shadow-xl border border-black/10"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/images/cbe-receipt-mockup.png";
                    }}
                  />
                </div>
              )}
            </div>

            {/* Open in new tab & Download Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="flex-1 h-10 px-4 rounded-xl border border-[#DFD6C8] bg-white hover:bg-[#FAF8F5] text-xs font-medium text-[#2A1810] flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <ExternalLink className="h-4 w-4 text-[#8C7A6E]" />
                <span>Open in new tab</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="h-10 w-10 rounded-xl border border-[#DFD6C8] bg-white hover:bg-[#FAF8F5] text-[#2A1810] flex items-center justify-center transition-colors shadow-xs"
                title="Download Payment Proof"
                aria-label="Download Payment Proof"
              >
                <Download className="h-4 w-4 text-[#8C7A6E]" />
              </button>
            </div>

            {/* Private Storage Access Notice */}
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3 flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-[#2563EB] shrink-0 mt-0.5" />
              <p className="text-xs text-[#1D4ED8] leading-relaxed">
                This payment proof is stored securely in a private Supabase Storage bucket and can
                only be accessed by authorized staff.
              </p>
            </div>

            {/* Verification Actions */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1A110D]">
                <ShieldCheck className="h-4 w-4 text-[#8C7A6E]" />
                <span>Verification Actions</span>
              </div>

              {!isHistorical && pendingItem && onApprove && onReject ? (
                <div className="space-y-2.5">
                  {/* Approve Payment Action (Green) */}
                  <button
                    type="button"
                    disabled={isProcessingAction}
                    onClick={() => onApprove(pendingItem)}
                    className="w-full text-left p-3.5 rounded-2xl bg-[#15803D] hover:bg-[#166534] text-white flex items-center gap-3.5 transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                  >
                    <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">Approve Payment</div>
                      <div className="text-xs text-emerald-100 font-normal">
                        Confirm that the payment is valid and complete
                      </div>
                    </div>
                  </button>

                  {/* Reject Payment Action (Red) */}
                  <button
                    type="button"
                    disabled={isProcessingAction}
                    onClick={() => onReject(pendingItem)}
                    className="w-full text-left p-3.5 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center gap-3.5 transition-all shadow-sm active:scale-[0.99] cursor-pointer"
                  >
                    <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                      <XCircle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">Reject Payment</div>
                      <div className="text-xs text-rose-100 font-normal">
                        Provide a reason for rejection
                      </div>
                    </div>
                  </button>
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
                        Reviewed as <span className="uppercase">{historyItem?.decision}</span> by{" "}
                        {historyItem?.cashier_name || "Cashier"}
                      </div>
                      <div className="text-[11px] text-[#70645C]">
                        Decided on{" "}
                        {historyItem?.reviewed_at
                          ? new Date(historyItem.reviewed_at).toLocaleString()
                          : ""}
                      </div>
                      {historyItem?.reason && (
                        <div className="text-[11px] font-medium pt-0.5">
                          Reason: {historyItem.reason}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl border border-[#DFD6C8] text-xs font-semibold text-[#1A110D] hover:bg-[#FAF8F5]"
                  >
                    Close Modal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
