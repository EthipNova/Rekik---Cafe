import { useState } from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { PendingPaymentReviewItem } from "@/lib/cashier";

interface ApproveDialogProps {
  open: boolean;
  item: PendingPaymentReviewItem | null;
  onConfirm: (proofId: string, notes?: string) => Promise<void>;
  onClose: () => void;
}

export function ApproveDialog({ open, item, onConfirm, onClose }: ApproveDialogProps) {
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!item) return null;

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(item.proof_id, notes.trim() || undefined);
      setNotes("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const amountMatches = Math.abs(item.order_total - item.proof_submitted_amount) < 0.01;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent className="max-w-md border-border bg-card">
        <AlertDialogHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <AlertDialogTitle className="text-xl font-bold font-display text-foreground">
            Approve Payment Verification
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Confirm that the submitted proof of payment matches the customer order. This will mark the payment as verified and confirm the order for preparation.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-2 rounded-xl border border-border/80 bg-muted/40 p-4 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Order Number:</span>
            <span className="font-semibold text-foreground">{item.order_number}</span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Customer:</span>
            <span className="font-medium text-foreground">{item.customer_name}</span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Payment Method:</span>
            <span className="font-medium text-foreground">{item.payment_method}</span>
          </div>

          {item.transaction_reference && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Reference:</span>
              <span className="font-mono text-xs font-semibold text-foreground px-2 py-0.5 rounded bg-background border border-border">
                {item.transaction_reference}
              </span>
            </div>
          )}

          <div className="border-t border-border/60 pt-2 flex justify-between items-center">
            <span className="font-medium text-foreground">Total to Confirm:</span>
            <span className="text-lg font-bold text-emerald-600">
              {item.proof_submitted_amount.toLocaleString()} ETB
            </span>
          </div>

          {!amountMatches && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Note: Proof amount ({item.proof_submitted_amount} ETB) differs from order total ({item.order_total} ETB).
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1.5 py-1">
          <Label htmlFor="verification-notes" className="text-xs font-medium text-muted-foreground">
            Verification Notes (Optional)
          </Label>
          <Input
            id="verification-notes"
            placeholder="e.g. Verified via Telebirr SMS notification"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
            className="text-sm h-9"
          />
        </div>

        <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
          <AlertDialogCancel disabled={isSubmitting} onClick={onClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleApprove();
            }}
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Approving...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Confirm & Verify Payment
              </span>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
