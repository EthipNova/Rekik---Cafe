import { useState } from "react";
import { XCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PendingPaymentReviewItem } from "@/lib/cashier";

interface RejectDialogProps {
  open: boolean;
  item: PendingPaymentReviewItem | null;
  onConfirm: (proofId: string, reason: string) => Promise<void>;
  onClose: () => void;
}

const COMMON_REASONS = [
  "Amount does not match order total",
  "Unreadable or blurry screenshot",
  "Invalid or unconfirmed transaction reference",
  "Duplicate payment proof already submitted",
  "Payment sent to incorrect account",
  "Screenshot does not show successful transfer status",
];

export function RejectDialog({ open, item, onConfirm, onClose }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!item) return null;

  const handleSelectPreset = (preset: string) => {
    setReason(preset);
    setErrorMsg(null);
  };

  const handleReject = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setErrorMsg("Please provide a rejection reason so the customer understands what to fix.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirm(item.proof_id, trimmed);
      setReason("");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject payment proof.";
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader className="space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <XCircle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-xl font-bold font-display text-foreground">
            Reject Payment Proof
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Specify why this payment proof cannot be approved. The customer and assigned waiter will receive this reason and can resubmit a corrected receipt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order:</span>
              <span className="font-semibold text-foreground">{item.order_number} ({item.customer_name})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Submitted Amount:</span>
              <span className="font-medium text-foreground">{item.proof_submitted_amount.toLocaleString()} ETB</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Quick Select Reason
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    reason === preset
                      ? "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-accent"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rejection-reason" className="text-sm font-medium text-foreground">
              Rejection Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rejection-reason"
              placeholder="Explain the issue clearly to the customer..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              rows={3}
              disabled={isSubmitting}
              className="resize-none text-sm bg-background"
            />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={isSubmitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isSubmitting || !reason.trim()}
            onClick={handleReject}
            className="bg-[#C8102E] hover:bg-[#a60d26] text-white"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Rejecting...
              </span>
            ) : (
              "Reject Payment Proof"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
