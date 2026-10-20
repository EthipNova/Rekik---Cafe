import { useState, useEffect, useRef } from "react";
import {
  Camera,
  Upload,
  X,
  FileImage,
  Clock,
  ShieldCheck,
  CreditCard,
  Building,
  Banknote,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { formatETB } from "@/lib/menu-data";
import { submitWaiterPaymentProof } from "@/lib/waiter";
import type { WaiterOrder } from "@/types/waiter";

interface WaiterPaymentDialogProps {
  order: WaiterOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (updatedOrder: WaiterOrder) => void;
}

const PAYMENT_METHODS = [
  { id: "Telebirr Mobile", label: "Telebirr Mobile", icon: CreditCard },
  { id: "CBE Birr", label: "CBE Birr", icon: Building },
  { id: "Cash at Table", label: "Cash at Table", icon: Banknote },
  { id: "Bank Transfer", label: "Bank Transfer", icon: Receipt },
];

export function WaiterPaymentDialog({
  order,
  open,
  onOpenChange,
  onSuccess,
}: WaiterPaymentDialogProps) {
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Telebirr Mobile");
  const [transactionRef, setTransactionRef] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Two distinct file input refs: Camera and Gallery
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Initialize form state when order changes
  useEffect(() => {
    if (order) {
      setAmount(String(order.totalAmount || ""));
      const existingPayment = order.payments?.[0];
      if (existingPayment?.method) {
        setPaymentMethod(existingPayment.method);
      } else {
        setPaymentMethod("Telebirr Mobile");
      }
      setTransactionRef(existingPayment?.transactionReference || "");
      setNotes("");
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  }, [order, open]);

  // Clean up object URL
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!order) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      toast.error("Invalid image format. Please upload JPG, PNG, or WEBP.");
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file is too large. Maximum size is 5MB.");
      return;
    }

    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid positive payment amount.");
      return;
    }

    if (!paymentMethod) {
      toast.error("Please select a payment method.");
      return;
    }

    if (!selectedFile) {
      toast.error("Payment evidence photo/screenshot is strictly required.");
      return;
    }

    setSubmitting(true);

    try {
      // Convert File to Base64 data URL
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(selectedFile);
      });

      const updatedOrder = await submitWaiterPaymentProof(order.id, {
        submittedAmount: numAmount,
        paymentMethod,
        transactionReference: transactionRef.trim() || undefined,
        notes: notes.trim() || undefined,
        imageBase64: base64Data,
        mimeType: selectedFile.type,
      });

      toast.success("Payment evidence sent to the cashier. Awaiting verification.");

      // Notify window listeners
      window.dispatchEvent(
        new CustomEvent("neba:waiter-order-update", { detail: { orderId: order.id } }),
      );

      onOpenChange(false);
      onSuccess?.(updatedOrder);
    } catch (err: unknown) {
      console.error("[WaiterPaymentDialog] submission error:", err);
      const msg = err instanceof Error ? err.message : "Failed to submit payment evidence.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid =
    Boolean(selectedFile) &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > 0 &&
    !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Hidden File Inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/jpg"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/jpg"
          className="hidden"
          onChange={handleFileChange}
        />

        <DialogHeader className="text-left pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display text-lg font-bold">
              Payment Evidence — #{order.orderNumber}
            </DialogTitle>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
              Table {order.tableNumber || "N/A"}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Collect payment from customer, capture receipt evidence, and route to cashier for verification.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          {/* Order Snapshot */}
          <div className="rounded-lg bg-secondary/50 p-3 space-y-1.5 border border-border/50">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer:</span>
              <span className="font-semibold text-foreground">{order.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Items:</span>
              <span>{order.items.length} items</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-1.5 text-sm font-bold">
              <span className="text-muted-foreground">Total Due:</span>
              <span className="text-primary">{formatETB(order.totalAmount)}</span>
            </div>
          </div>

          {/* Amount Received Input */}
          <div className="space-y-1.5">
            <Label htmlFor="payment-amount" className="text-xs font-semibold">
              Amount Received (ETB) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 350.00"
              className="text-xs h-9 font-medium"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Defaults to order total ({formatETB(order.totalAmount)}). Adjust if custom or split payment received.
            </p>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Payment Method <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                        : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate text-xs">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transaction Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="transaction-ref" className="text-xs font-semibold">
              Transaction / Reference Number{" "}
              <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Input
              id="transaction-ref"
              type="text"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder={
                paymentMethod.includes("Telebirr")
                  ? "e.g. TBL9384729103 (optional)"
                  : paymentMethod.includes("CBE")
                    ? "e.g. FT260819ABCD (optional)"
                    : "e.g. Receipt voucher # (optional)"
              }
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Optional reference code from customer SMS or bank notification if available.
            </p>
          </div>

          {/* Evidence Photo Upload Section */}
          <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-foreground">
                Payment Evidence Photo <span className="text-destructive">*</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">JPG, PNG, or WEBP (Max 5MB)</span>
            </div>

            {previewUrl ? (
              <div className="space-y-2.5">
                <div className="relative rounded-lg border border-border bg-background p-2.5 flex items-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Payment preview"
                    className="size-16 object-cover rounded-md border border-border/80 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{selectedFile?.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedFile ? (selectedFile.size / 1024).toFixed(1) + " KB" : ""}
                    </p>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 mt-1">
                      Ready to send
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeSelectedFile}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    title="Remove image"
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                {/* Replace image buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 h-8 text-[11px] gap-1.5"
                  >
                    <RotateCcw className="size-3" /> Retake Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex-1 h-8 text-[11px] gap-1.5"
                  >
                    <FileImage className="size-3" /> Choose Different
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-muted-foreground">
                  Take a clear photo of the customer's transfer confirmation screen/voucher with permission, or pick from gallery:
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => cameraInputRef.current?.click()}
                    className="h-14 flex flex-col items-center justify-center gap-1 border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
                  >
                    <Camera className="size-5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Take Photo</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => galleryInputRef.current?.click()}
                    className="h-14 flex flex-col items-center justify-center gap-1 border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
                  >
                    <FileImage className="size-5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">Choose from Gallery</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="waiter-notes" className="text-xs font-semibold">
              Waiter Notes <span className="text-muted-foreground font-normal">(Optional)</span>
            </Label>
            <Textarea
              id="waiter-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Verified customer SMS, cash change provided."
              className="text-xs min-h-[55px]"
            />
          </div>

          {/* Cashier Governance Notice */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-start gap-2.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-primary mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Cashier Verification Required: </span>
              Clicking Send to Cashier submits this evidence to the Cashier Queue. Final payment approval is authorized exclusively by the Cashier.
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!isFormValid}
              className="text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5"
            >
              {submitting ? (
                <>
                  <Clock className="size-3.5 animate-spin" />
                  Sending to Cashier…
                </>
              ) : (
                <>
                  <Upload className="size-3.5" />
                  Send to Cashier
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
