import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  FileCheck2,
  FileText,
  MapPin,
  Phone,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
  UploadCloud,
  User,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Section } from "@/components/site/Section";
import { LocationPicker } from "@/components/site/LocationPicker";
import { useCart } from "@/lib/cart";
import { formatETB, getProduct } from "@/lib/menu-data";
import { methodLabels, saveOrder, type OrderMethod } from "@/lib/orders";
import {
  createOrder as apiCreateOrder,
  fetchAvailableWaiters,
  fetchCustomerProfile,
  fetchSettings,
  type AvailableWaiter,
} from "@/services/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  calculateDeliveryFee,
  calculateHaversineDistance,
  isValidCoordinate,
} from "@/lib/distance";
import { DEFAULT_SETTINGS, type NebaSettings } from "@/lib/settings";

export const Route = createFileRoute("/checkout")({
  loader: async () => {
    try {
      const settings = await fetchSettings();
      return { settings };
    } catch {
      return { settings: DEFAULT_SETTINGS };
    }
  },
  head: () => ({
    meta: [
      { title: "Checkout — Rekik Coffee" },
      {
        name: "description",
        content: "Complete your Rekik Coffee order: method, details and payment.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Checkout — Rekik Coffee" },
      { property: "og:description", content: "Complete your Rekik Coffee order." },
    ],
  }),
  component: Checkout,
});

const steps = ["Ordering method", "Customer information", "Order summary", "Payment"] as const;

type FormField = "name" | "phone" | "address" | "waiter";
type FormErrors = Partial<Record<FormField, string>>;

function Checkout() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const { lines, subtotal, clear } = useCart();
  const [settings, setSettings] = useState<NebaSettings>(loaderData?.settings || DEFAULT_SETTINGS);
  const [deliveryLocation, setDeliveryLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<OrderMethod>("dine-in");
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [payment, setPayment] = useState<"telebirr" | "cbe" | "cash">("telebirr");
  const [transactionRef, setTransactionRef] = useState("");
  const [proofImageBase64, setProofImageBase64] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const [proofFileSize, setProofFileSize] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authenticatedCustomerName, setAuthenticatedCustomerName] = useState<string | null>(null);
  const [waiters, setWaiters] = useState<AvailableWaiter[]>([]);
  const [waitersLoading, setWaitersLoading] = useState(true);
  const [waitersError, setWaitersError] = useState<string | null>(null);
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>("");

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, or WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Receipt image must be smaller than 5MB.");
      return;
    }

    setProofFileName(file.name);
    setProofFileSize((file.size / (1024 * 1024)).toFixed(2) + " MB");

    const reader = new FileReader();
    reader.onload = (event) => {
      setProofImageBase64(event.target?.result as string);
      toast.success("Receipt image loaded! Preview is ready.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProof = () => {
    setProofImageBase64(null);
    setProofFileName(null);
    setProofFileSize(null);
  };

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        if (s) setSettings(s);
      })
      .catch(() => {});
  }, []);

  const loadWaiters = async () => {
    setWaitersLoading(true);
    setWaitersError(null);
    try {
      const data = await fetchAvailableWaiters();
      setWaiters(data || []);
      if (data && data.length === 1 && !selectedWaiterId) {
        setSelectedWaiterId(data[0]!.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load floor staff";
      setWaitersError(msg);
    } finally {
      setWaitersLoading(false);
    }
  };

  useEffect(() => {
    void loadWaiters();
  }, []);

  useEffect(() => {
    let active = true;

    const loadProfile = async (s: Session) => {
      try {
        const profile = await fetchCustomerProfile();
        if (!active) return;
        const meta = (s.user.user_metadata || {}) as Record<string, unknown>;
        const name =
          profile?.customer?.name ||
          profile?.user?.full_name ||
          (typeof meta["full_name"] === "string" ? meta["full_name"] : "") ||
          (typeof meta["name"] === "string" ? meta["name"] : "") ||
          "";
        const phone =
          profile?.customer?.phone ||
          profile?.user?.phone ||
          (typeof meta["phone"] === "string" ? meta["phone"] : "") ||
          "";

        if (name) {
          setAuthenticatedCustomerName(name);
        } else if (s.user.email) {
          setAuthenticatedCustomerName(s.user.email);
        }

        setForm((prev) => ({
          ...prev,
          name: prev.name || name,
          phone: prev.phone || phone,
        }));
      } catch {
        if (!active) return;
        const meta = (s.user.user_metadata || {}) as Record<string, unknown>;
        const name =
          (typeof meta["full_name"] === "string" ? meta["full_name"] : "") ||
          (typeof meta["name"] === "string" ? meta["name"] : "") ||
          s.user.email ||
          "";
        const phone = typeof meta["phone"] === "string" ? meta["phone"] : "";
        if (name) setAuthenticatedCustomerName(name);
        setForm((prev) => ({
          ...prev,
          name: prev.name || name,
          phone: prev.phone || phone,
        }));
      }
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!active) return;
      setSession(s);
      if (s) {
        void loadProfile(s);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      if (s) {
        void loadProfile(s);
      } else {
        setAuthenticatedCustomerName(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Delivery distance and pricing engine
  const hasCafeCoords = isValidCoordinate(settings.cafeLatitude, settings.cafeLongitude);
  const hasCustomerCoords =
    deliveryLocation !== null &&
    isValidCoordinate(deliveryLocation.latitude, deliveryLocation.longitude);

  let deliveryDistanceKm: number | null = null;
  let estimatedDeliveryFee = 0;
  let isDeliveryEligible = false;
  let deliveryEligibilityReason: string | null = null;

  if (method === "delivery") {
    if (settings.deliveryEnabled === false) {
      isDeliveryEligible = false;
      deliveryEligibilityReason =
        "Delivery orders are currently disabled. Please choose Takeaway or Dine-in.";
    } else if (!hasCafeCoords) {
      isDeliveryEligible = false;
      deliveryEligibilityReason =
        "The café delivery location has not been configured yet. Customers cannot place delivery orders at this time. Please select Takeaway or Dine-in.";
    } else if (!hasCustomerCoords) {
      isDeliveryEligible = false;
      deliveryEligibilityReason = "Please pinpoint your delivery location on the map.";
    } else {
      deliveryDistanceKm = calculateHaversineDistance(
        settings.cafeLatitude!,
        settings.cafeLongitude!,
        deliveryLocation.latitude,
        deliveryLocation.longitude,
      );
      const feeResult = calculateDeliveryFee(deliveryDistanceKm, settings, {
        hasCafeCoordinates: true,
      });
      isDeliveryEligible = feeResult.eligible;
      if (feeResult.eligible) {
        estimatedDeliveryFee = feeResult.fee;
      } else {
        deliveryEligibilityReason =
          feeResult.reason ||
          `Selected location (${deliveryDistanceKm.toFixed(1)} km) exceeds our maximum delivery radius of ${settings.maxDeliveryDistanceKm} km.`;
      }
    }
  }

  const delivery = method === "delivery" ? estimatedDeliveryFee : 0;
  const total = subtotal + delivery;

  const methodOptions: {
    value: OrderMethod;
    label: string;
    text: string;
    icon: typeof Utensils;
  }[] = [
    {
      value: "dine-in",
      label: "Dine-in",
      text: "Enjoy your meal fresh at the café.",
      icon: Utensils,
    },
    {
      value: "takeaway",
      label: "Takeaway",
      text: "Order ahead and collect your food.",
      icon: Store,
    },
    {
      value: "delivery",
      label: "Delivery",
      text:
        settings.deliveryEnabled === false
          ? "Delivery is currently disabled."
          : !hasCafeCoords
            ? "Café location pending configuration."
            : hasCustomerCoords && isDeliveryEligible
              ? `Delivered to your location (+${formatETB(estimatedDeliveryFee)} • ${deliveryDistanceKm?.toFixed(1)} km).`
              : "Distance-based pricing (location pin required).",
      icon: Truck,
    },
  ];

  if (lines.length === 0) {
    return (
      <Section className="max-w-2xl">
        <h1 className="mb-8 text-4xl font-semibold">Checkout</h1>
        <EmptyState
          icon={<ShoppingBag className="size-8" />}
          title="Your cart is empty"
          description="Add something from the menu before checking out."
          action={
            <Button asChild>
              <Link to="/menu">Explore Menu</Link>
            </Button>
          }
        />
      </Section>
    );
  }

  const handleFieldChange = (field: FormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleMethodSelect = (newMethod: OrderMethod) => {
    setMethod(newMethod);
    // Clear any obsolete field errors when method changes
    setErrors({});
  };

  const validateCurrentStep = (): boolean => {
    if (step === 0) {
      if (method === "delivery") {
        if (settings.deliveryEnabled === false) {
          toast.error("Delivery orders are currently disabled. Please select Takeaway or Dine-in.");
          return false;
        }
        if (!hasCafeCoords) {
          toast.error(
            "Delivery is temporarily unavailable because the café location has not been configured. Please choose Takeaway or Dine-in.",
          );
          return false;
        }
      }
      return true;
    }

    if (step === 1) {
      const newErrors: FormErrors = {};

      if (method === "dine-in") {
        if (waiters.length > 0 && !selectedWaiterId) {
          newErrors.waiter = "Please select an available waiter from the floor list.";
        }
      } else {
        if (!form.name.trim()) {
          newErrors.name = "Please enter your name.";
        }
        if (!form.phone.trim()) {
          newErrors.phone = "Please enter your phone number.";
        } else if (!/^[0-9+\s-]{7,}$/.test(form.phone.trim())) {
          newErrors.phone = "Enter a valid phone number (at least 7 digits).";
        }

        if (method === "delivery") {
          if (settings.deliveryEnabled === false) {
            toast.error(
              "Delivery orders are currently disabled. Please choose Takeaway or Dine-in.",
            );
            return false;
          }
          if (!hasCafeCoords) {
            toast.error(
              "Delivery is temporarily unavailable because the café location has not been configured. Please choose Takeaway or Dine-in.",
            );
            return false;
          }
          if (!hasCustomerCoords) {
            newErrors.address = "Please select your delivery location on the map.";
          } else if (!isDeliveryEligible) {
            newErrors.address =
              deliveryEligibilityReason ||
              "Selected location is outside our delivery radius. Please select a closer location or choose Takeaway.";
          }

          if (!form.address.trim()) {
            newErrors.address =
              newErrors.address ||
              "Please enter building name, floor, landmark, or street address.";
          }
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }

    if (step === 3) {
      if (!payment) {
        toast.error("Please select a payment method.");
        return false;
      }
      return true;
    }

    return true;
  };

  const next = () => {
    if (validateCurrentStep()) {
      setStep((s) => Math.min(steps.length - 1, s + 1));
    }
  };

  const pay = async () => {
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    try {
      const resolvedLines = lines.map((l) => {
        const p = getProduct(l.productId);
        return {
          productId: l.productId,
          name: p?.name || "Menu Item",
          quantity: l.quantity,
          price: p?.price !== undefined ? p.price : 0,
        };
      });

      const paymentMethodName =
        payment === "telebirr"
          ? "Telebirr Mobile"
          : payment === "cbe"
            ? "CBE Birr"
            : method === "delivery"
              ? "Cash on Delivery"
              : method === "dine-in"
                ? "Pay at Table / Cash"
                : "Pay at Pickup Counter";

      // Orders requiring cashier verification or cash settlement start as pending.
      const initialPaymentStatus: "paid" | "pending" = "pending";

      // Client sends only order requirements. Monetary amounts and fees are authoritatively
      // calculated on the server using canonical database prices and distance settings.
      const orderData = {
        lines: resolvedLines,
        method,
        paymentMethod: paymentMethodName,
        paymentStatus: initialPaymentStatus,
        transactionReference: transactionRef.trim() || undefined,
        proofImageBase64: proofImageBase64 || undefined,
        waiterId: selectedWaiterId || undefined,
        customer: {
          name: form.name.trim() || (method === "dine-in" ? "Dine-in guest" : ""),
          phone: form.phone.trim(),
          ...(method === "delivery" && form.address.trim() ? { address: form.address.trim() } : {}),
          ...(method === "delivery" && deliveryLocation
            ? { latitude: deliveryLocation.latitude, longitude: deliveryLocation.longitude }
            : {}),
        },
      };

      const order = await apiCreateOrder(orderData);

      // Cache order in local storage for instant offline access
      saveOrder(order);
      clear();
      if (payment === "cash") {
        toast.success("Order placed! Pay in cash upon delivery or to your floor server.");
      } else if (proofImageBase64 || transactionRef.trim()) {
        toast.success("Order placed! Payment proof submitted for cashier verification.");
      } else {
        toast.info("Order placed! Please upload receipt proof on your order page to verify payment.");
      }
      void navigate({ to: "/order/$id", params: { id: order.id } });
    } catch (e: unknown) {
      console.error("Checkout order creation error:", e);
      const errMsg = e instanceof Error ? e.message : "Failed to complete order. Please try again.";
      toast.error(`Order submission failed: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Section className="max-w-3xl">
      <h1 className="text-4xl font-semibold">Checkout</h1>

      <ol className="mt-8 flex flex-wrap gap-2" aria-label="Checkout progress">
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
              i === step && "border-primary bg-primary text-primary-foreground font-medium",
              i < step && "border-success text-success cursor-pointer hover:bg-secondary/60",
              i > step && "border-border text-muted-foreground",
            )}
            onClick={() => {
              // Allow jumping back to previously completed steps
              if (i < step) {
                setStep(i);
              }
            }}
          >
            {i < step ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <span className="font-semibold">{i + 1}</span>
            )}
            {label}
          </li>
        ))}
      </ol>

      <div className="surface-card mt-8 p-6 sm:p-8">
        {/* STEP 1: ORDERING METHOD */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-xl font-semibold">Step 1 — Ordering method</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                How would you like to receive your food today?
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {methodOptions.map((m) => {
                const isSelected = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handleMethodSelect(m.value)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex flex-col rounded-xl border p-5 text-left transition-all",
                      isSelected
                        ? "border-primary bg-accent/60 shadow-[var(--shadow-soft)] ring-1 ring-primary"
                        : "border-border hover:bg-secondary/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <m.icon className="size-6 text-primary" aria-hidden />
                      {isSelected && (
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" />
                        </span>
                      )}
                    </div>
                    <span className="mt-4 block font-display text-lg font-semibold">{m.label}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{m.text}</span>
                  </button>
                );
              })}
            </div>

            {method === "delivery" && (
              <div
                className={cn(
                  "rounded-xl border p-4 text-xs space-y-1.5",
                  settings.deliveryEnabled === false || !hasCafeCoords
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                    : "border-primary/20 bg-primary/5 text-muted-foreground",
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  {settings.deliveryEnabled === false || !hasCafeCoords ? (
                    <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                  ) : (
                    <Truck className="size-4 text-primary shrink-0" />
                  )}
                  <span className="text-foreground font-semibold">Delivery Information</span>
                </div>
                <p>
                  {settings.deliveryEnabled === false
                    ? "Delivery orders are currently disabled. Please select Takeaway or Dine-in."
                    : !hasCafeCoords
                      ? "Delivery is currently unavailable because the café location has not been configured. Please choose Takeaway or Dine-in."
                      : `Delivery fee is calculated strictly by distance (${settings.pricePerKm} ETB/km, min ${settings.minDeliveryFee} ETB, max radius ${settings.maxDeliveryDistanceKm} km). You will pinpoint your exact location on an interactive map in the next step.`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CUSTOMER INFORMATION */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Step 2 — Customer information
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {method === "dine-in" && "Select your floor waiter for café service."}
                  {method === "takeaway" && "Enter your contact details for order pickup."}
                  {method === "delivery" && "Enter your contact details and delivery location."}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs">
                <span className="font-medium text-foreground">{methodLabels[method]}</span>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="font-medium text-primary hover:underline"
                >
                  Change
                </button>
              </div>
            </div>

            {authenticatedCustomerName ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary shrink-0" />
                  <span>
                    Ordering as{" "}
                    <strong className="font-semibold text-primary">
                      {authenticatedCustomerName}
                    </strong>
                  </span>
                </div>
                <Badge
                  variant="secondary"
                  className="text-[10px] uppercase tracking-wider font-semibold"
                >
                  Signed In
                </Badge>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-xs text-muted-foreground">
                <span>Guest Checkout — No account required</span>
                <Link to="/account" className="text-primary hover:underline font-medium">
                  Sign in for faster ordering
                </Link>
              </div>
            )}

            {/* Dine-in fields */}
            {method === "dine-in" && (
              <div className="space-y-4">
                {/* Select Your Waiter Field */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="waiter-select"
                      className="text-sm font-medium flex items-center gap-1.5"
                    >
                      <User className="size-4 text-primary" aria-hidden />
                      <span>
                        Select Your Waiter{" "}
                        {waiters.length > 0 && <span className="text-destructive">*</span>}
                      </span>
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      Floor table service
                    </span>
                  </div>

                  {waitersLoading ? (
                    <div
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/30 px-3.5 py-2.5 text-xs text-muted-foreground animate-pulse"
                      role="status"
                    >
                      <RotateCcw className="size-3.5 animate-spin text-primary" aria-hidden />
                      <span>Fetching available floor staff from Rekik Coffee…</span>
                    </div>
                  ) : waitersError ? (
                    <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
                        <span>Failed to load waiters: {waitersError}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadWaiters()}
                        className="self-start text-xs h-7 px-2.5 gap-1.5"
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        <span>Retry connection</span>
                      </Button>
                    </div>
                  ) : waiters.length === 0 ? (
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                      <AlertTriangle
                        className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                        aria-hidden
                      />
                      <div>
                        <p className="font-medium">No floor waiters currently available</p>
                        <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                          No dedicated floor waiters are currently on duty. An expeditor will attend your table.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <select
                          id="waiter-select"
                          value={selectedWaiterId}
                          onChange={(e) => {
                            setSelectedWaiterId(e.target.value);
                            if (errors.waiter) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.waiter;
                                return next;
                              });
                            }
                          }}
                          aria-invalid={!!errors.waiter}
                          aria-describedby={errors.waiter ? "error-waiter" : undefined}
                          className={cn(
                            "w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary",
                            errors.waiter && "border-destructive focus-visible:ring-destructive",
                            !selectedWaiterId && "text-muted-foreground",
                          )}
                        >
                          <option value="" disabled>
                            -- Select Your Waiter --
                          </option>
                          {waiters.map((w) => (
                            <option key={w.id} value={w.id} className="text-foreground py-1">
                              {w.name} (Active Waiter)
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
                          <User className="size-4" aria-hidden />
                        </div>
                      </div>

                      {errors.waiter && (
                        <p id="error-waiter" role="alert" className="text-xs text-destructive">
                          {errors.waiter}
                        </p>
                      )}

                      {selectedWaiterId && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-md px-3 py-1.5">
                          <span className="size-2 rounded-full bg-success animate-pulse" aria-hidden />
                          <span>
                            Assigned Floor Waiter:{" "}
                            <strong className="text-foreground capitalize">
                              {waiters.find((w) => w.id === selectedWaiterId)?.name}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/50">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Guest name <span className="text-xs text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => handleFieldChange("name", e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium">
                      Phone number <span className="text-xs text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => handleFieldChange("phone", e.target.value)}
                      placeholder="+251 ..."
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Takeaway & Delivery fields */}
            {method !== "dine-in" && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Full name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => handleFieldChange("name", e.target.value)}
                      placeholder="e.g. Abebe Kebede"
                      autoComplete="name"
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "error-name" : undefined}
                      className={cn(
                        errors.name && "border-destructive focus-visible:ring-destructive",
                      )}
                    />
                    {errors.name && (
                      <p id="error-name" role="alert" className="text-xs text-destructive">
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium">
                      Phone number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => handleFieldChange("phone", e.target.value)}
                      placeholder="+251 91 123 4567"
                      autoComplete="tel"
                      aria-invalid={!!errors.phone}
                      aria-describedby={errors.phone ? "error-phone" : undefined}
                      className={cn(
                        errors.phone && "border-destructive focus-visible:ring-destructive",
                      )}
                    />
                    {errors.phone && (
                      <p id="error-phone" role="alert" className="text-xs text-destructive">
                        {errors.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Optional Waiter/Server Selection for Takeaway/Delivery */}
                {waiters.length > 0 && !waitersLoading && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50">
                    <Label
                      htmlFor="waiter-select-opt"
                      className="text-sm font-medium flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        <User className="size-4 text-primary" aria-hidden />
                        <span>Select Your Server</span>
                        <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">Order assistance</span>
                    </Label>
                    <div className="relative">
                      <select
                        id="waiter-select-opt"
                        value={selectedWaiterId}
                        onChange={(e) => setSelectedWaiterId(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:border-primary"
                      >
                        <option value="">-- Any Available Staff Member --</option>
                        {waiters.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} (Active Waiter)
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
                        <User className="size-4" aria-hidden />
                      </div>
                    </div>
                  </div>
                )}

                {method === "delivery" && (
                  <div className="space-y-4 pt-2">
                    <LocationPicker
                      cafeLatitude={settings.cafeLatitude}
                      cafeLongitude={settings.cafeLongitude}
                      selectedLatitude={deliveryLocation?.latitude ?? null}
                      selectedLongitude={deliveryLocation?.longitude ?? null}
                      onLocationChange={(coords) => {
                        setDeliveryLocation(coords);
                        if (errors.address) {
                          setErrors((prev) => {
                            const next = { ...prev };
                            delete next.address;
                            return next;
                          });
                        }
                      }}
                      pricePerKm={settings.pricePerKm}
                      minDeliveryFee={settings.minDeliveryFee}
                      maxDeliveryDistanceKm={settings.maxDeliveryDistanceKm}
                      roundingRule={settings.roundingRule}
                      deliveryEnabled={settings.deliveryEnabled}
                      disabled={submitting}
                    />

                    <div className="space-y-1.5">
                      <Label htmlFor="address" className="text-sm font-medium">
                        Building, floor, landmark & delivery notes{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="address"
                        value={form.address}
                        onChange={(e) => handleFieldChange("address", e.target.value)}
                        placeholder="Building name, floor, landmark, nearby shop..."
                        autoComplete="street-address"
                        aria-invalid={!!errors.address}
                        aria-describedby={errors.address ? "error-address" : undefined}
                        className={cn(
                          errors.address && "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                      {errors.address && (
                        <p id="error-address" role="alert" className="text-xs text-destructive">
                          {errors.address}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: ORDER SUMMARY */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-xl font-semibold">Step 3 — Order summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review your items, delivery details and final total before payment.
              </p>
            </div>

            {/* Products breakdown */}
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {lines.map((l) => {
                const p = getProduct(l.productId);
                if (!p) return null;
                return (
                  <div
                    key={l.productId}
                    className="flex items-center justify-between gap-4 p-4 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={p.image}
                        alt={p.name}
                        className="size-12 rounded-lg object-cover"
                        loading="lazy"
                        width={48}
                        height={48}
                      />
                      <div>
                        <p className="font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatETB(p.price)} × {l.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="font-semibold text-foreground">
                      {formatETB(p.price * l.quantity)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Customer & Method verification card */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Order details</span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Edit details
                </button>
              </div>
              <dl className="mt-2 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium text-foreground">Method: </dt>
                  <dd className="inline">{methodLabels[method]}</dd>
                </div>

                {form.name && (
                  <div>
                    <dt className="inline font-medium text-foreground">Name: </dt>
                    <dd className="inline">{form.name}</dd>
                  </div>
                )}
                {form.phone && (
                  <div>
                    <dt className="inline font-medium text-foreground">Phone: </dt>
                    <dd className="inline">{form.phone}</dd>
                  </div>
                )}
                {selectedWaiterId && (
                  <div>
                    <dt className="inline font-medium text-foreground">Assigned Waiter: </dt>
                    <dd className="inline font-semibold text-primary capitalize">
                      {waiters.find((w) => w.id === selectedWaiterId)?.name || "Floor Staff"}
                    </dd>
                  </div>
                )}
                {method === "delivery" && (
                  <>
                    {form.address && (
                      <div className="sm:col-span-2">
                        <dt className="inline font-medium text-foreground">Delivery address: </dt>
                        <dd className="inline">{form.address}</dd>
                      </div>
                    )}
                    {deliveryDistanceKm !== null && (
                      <div>
                        <dt className="inline font-medium text-foreground">Distance: </dt>
                        <dd className="inline">{deliveryDistanceKm.toFixed(1)} KM</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline font-medium text-foreground">Estimated Delivery: </dt>
                      <dd className="inline font-semibold text-primary">
                        {formatETB(estimatedDeliveryFee)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            {/* Calculations breakdown */}
            <dl className="space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium">{formatETB(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery fee</dt>
                <dd className="font-medium">
                  {method === "delivery"
                    ? `${formatETB(estimatedDeliveryFee)}${deliveryDistanceKm !== null ? ` (${deliveryDistanceKm.toFixed(1)} KM)` : ""}`
                    : "Free (Dine-in / Takeaway)"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="font-medium">{formatETB(0)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 font-display text-xl font-semibold">
                <dt>Total</dt>
                <dd className="text-primary">{formatETB(total)}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* STEP 4: PAYMENT PANEL */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Step 4 — Payment & Settlement
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Verify your pending order details and authorize your payment method.
                </p>
              </div>
              <Badge
                variant="outline"
                className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 px-3 py-1 font-medium text-xs"
              >
                <Clock className="size-3 text-amber-500 animate-pulse" aria-hidden />
                <span>Awaiting Payment</span>
              </Badge>
            </div>

            {/* PENDING ORDER REVIEW CARD */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <span className="font-display font-semibold text-foreground text-sm uppercase tracking-wider">
                  Order Summary
                </span>
                <span className="text-xs text-muted-foreground">
                  {lines.reduce((s, l) => s + l.quantity, 0)} item(s)
                </span>
              </div>

              {/* Items summary */}
              <div className="divide-y divide-border/60 max-h-48 overflow-y-auto pr-1">
                {lines.map((l) => {
                  const p = getProduct(l.productId);
                  return (
                    <div
                      key={l.productId}
                      className="flex items-center justify-between py-2 text-xs sm:text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        {p?.image ? (
                          <img
                            src={p.image}
                            alt={p.name}
                            className="size-9 rounded-md object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <ShoppingBag className="size-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">{p?.name || "Menu item"}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatETB(p?.price || 0)} × {l.quantity}
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold text-foreground">
                        {formatETB((p?.price || 0) * l.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Fulfillment info snippet */}
              <div className="rounded-lg border border-border/60 bg-background/80 p-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {method === "dine-in" && (
                      <Utensils className="size-3.5 text-primary shrink-0" />
                    )}
                    {method === "takeaway" && <Store className="size-3.5 text-primary shrink-0" />}
                    {method === "delivery" && <Truck className="size-3.5 text-primary shrink-0" />}
                    <span>
                      <strong className="text-foreground">{methodLabels[method]}</strong>
                      {method === "delivery" && ` · ${form.address || "Delivery location"}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:justify-end">
                    <Phone className="size-3.5 text-primary shrink-0" />
                    <span>
                      {form.name
                        ? `${form.name} (${form.phone || "No phone"})`
                        : form.phone || "Guest"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pricing breakdown */}
              <dl className="space-y-1.5 border-t border-border/60 pt-3 text-xs sm:text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd className="font-medium text-foreground">{formatETB(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Delivery Fee</dt>
                  <dd className="font-medium text-foreground">
                    {delivery > 0 ? formatETB(delivery) : "Free (Dine-in / Takeaway)"}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 font-display text-lg font-bold text-foreground">
                  <dt>Total Amount Due</dt>
                  <dd className="text-primary">{formatETB(total)}</dd>
                </div>
              </dl>
            </div>

            {/* PAYMENT METHOD SELECTOR */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-foreground">
                Select payment method
              </legend>

              {[
                {
                  id: "telebirr" as const,
                  label: "Telebirr Mobile Payment",
                  desc: "Instant payment via Telebirr app or USSD *127#",
                  detail: "0911 234 567",
                  accountName: "Rekik Coffee Lounge",
                  accountType: "Telebirr Merchant / Phone",
                  icon: Smartphone,
                  tag: "Instant settlement",
                },
                {
                  id: "cbe" as const,
                  label: "CBE Birr / CBE Mobile Banking",
                  desc: "Transfer using CBE Birr mobile wallet or CBE Mobile Banking app",
                  detail: "1000 2345 67890",
                  shortCode: "123456",
                  accountName: "Rekik Coffee & Roastery",
                  accountType: "CBE Account / Shortcode",
                  icon: CreditCard,
                  tag: "Fast & verified",
                },
                {
                  id: "cash" as const,
                  label:
                    method === "dine-in"
                      ? "Pay to Server / Counter"
                      : method === "delivery"
                        ? "Cash on Delivery"
                        : "Pay at Pickup Counter",
                  desc:
                    method === "dine-in"
                      ? "Pay cash or card with your floor server upon service"
                      : method === "delivery"
                        ? "Pay cash directly to the courier upon delivery"
                        : "Pay cash or card at the pickup counter",
                  detail: "Pay in person",
                  accountName: "Cashier or Server",
                  accountType: "In-person Settlement",
                  icon: Banknote,
                  tag: "In-person",
                },
              ].map((option) => {
                const isSelected = payment === option.id;
                return (
                  <div
                    key={option.id}
                    onClick={() => setPayment(option.id)}
                    className={cn(
                      "cursor-pointer rounded-xl border p-4 transition-all",
                      isSelected
                        ? "border-primary bg-accent/40 ring-1 ring-primary shadow-sm"
                        : "border-border hover:bg-secondary/40",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value={option.id}
                        checked={isSelected}
                        onChange={() => setPayment(option.id)}
                        className="mt-1 size-4 accent-[var(--primary)]"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <option.icon className="size-4 text-primary" aria-hidden />
                            <span className="font-semibold text-foreground text-sm">
                              {option.label}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                            {option.tag}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{option.desc}</p>

                        {/* PAYMENT INSTRUCTIONS & PROOF UPLOAD (When Telebirr or CBE Birr is selected) */}
                        {isSelected && option.id !== "cash" && (
                          <div
                            className="mt-3 pt-3 border-t border-border/50 space-y-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Step-by-step transfer instructions */}
                            <div className="rounded-lg bg-background/80 border border-border/70 p-3 space-y-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                  <Receipt className="size-3.5 text-primary" />
                                  Transfer Instructions
                                </span>
                                <span className="font-bold text-primary text-sm">
                                  Total: {formatETB(total)}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
                                <div>
                                  <span className="block text-[11px] text-muted-foreground">Transfer to:</span>
                                  <span className="font-mono font-medium text-foreground text-xs flex items-center gap-1">
                                    {option.detail}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void navigator.clipboard.writeText(option.detail.replace(/\s+/g, ""));
                                        toast.success("Account details copied to clipboard!");
                                      }}
                                      className="text-muted-foreground hover:text-foreground inline-flex items-center"
                                      title="Copy account number"
                                    >
                                      <Copy className="size-3 ml-1" />
                                    </button>
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[11px] text-muted-foreground">Account Name:</span>
                                  <span className="font-medium text-foreground text-xs">{option.accountName}</span>
                                </div>
                              </div>
                              <p className="text-[11px] text-muted-foreground/90 border-t border-border/40 pt-1.5">
                                Transfer exact amount <strong className="text-foreground">{formatETB(total)}</strong>, then upload receipt screenshot or enter transaction code below.
                              </p>
                            </div>

                            {/* RECEIPT IMAGE UPLOAD & PREVIEW */}
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                                <span>Upload Payment Receipt Screenshot</span>
                                <span className="text-[11px] font-normal text-muted-foreground">
                                  PNG, JPG or WEBP (Max 5MB)
                                </span>
                              </Label>

                              {!proofImageBase64 ? (
                                <label
                                  htmlFor="receipt-upload"
                                  className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/80 bg-background/40 hover:bg-background/80 hover:border-primary/60 p-4 cursor-pointer transition-colors text-center"
                                >
                                  <div className="rounded-full bg-primary/10 p-2 text-primary group-hover:scale-105 transition-transform">
                                    <UploadCloud className="size-5" />
                                  </div>
                                  <div>
                                    <span className="text-xs font-medium text-foreground">
                                      Click to upload receipt photo / screenshot
                                    </span>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      or take a photo of your receipt slip
                                    </p>
                                  </div>
                                  <input
                                    id="receipt-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleProofFileChange}
                                    className="hidden"
                                  />
                                </label>
                              ) : (
                                <div className="rounded-xl border border-border bg-background p-3 space-y-2.5">
                                  <div className="flex items-center gap-3">
                                    <div
                                      onClick={() => setPreviewModalOpen(true)}
                                      className="relative size-16 shrink-0 rounded-lg overflow-hidden border border-border cursor-pointer group bg-muted/40"
                                      title="Click to view full preview"
                                    >
                                      <img
                                        src={proofImageBase64}
                                        alt="Payment receipt preview"
                                        className="size-full object-cover transition-transform group-hover:scale-105"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                        <Eye className="size-4" />
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <FileCheck2 className="size-3.5 text-success shrink-0" />
                                        <p className="text-xs font-medium text-foreground truncate">
                                          {proofFileName || "Receipt Screenshot"}
                                        </p>
                                      </div>
                                      {proofFileSize && (
                                        <p className="text-[11px] text-muted-foreground">{proofFileSize}</p>
                                      )}
                                      <div className="mt-1 flex items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-[11px] px-2 gap-1"
                                          onClick={() => setPreviewModalOpen(true)}
                                        >
                                          <Eye className="size-3" />
                                          Preview
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-[11px] px-2 text-destructive hover:text-destructive gap-1"
                                          onClick={handleRemoveProof}
                                        >
                                          <X className="size-3" />
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* TRANSACTION REFERENCE / BANK ID */}
                            <div className="space-y-1.5">
                              <Label htmlFor="tx-ref" className="text-xs font-medium text-foreground flex items-center justify-between">
                                <span>Bank Transfer ID or Transaction Reference</span>
                                <span className="text-[11px] text-muted-foreground">Optional if screenshot uploaded</span>
                              </Label>
                              <Input
                                id="tx-ref"
                                value={transactionRef}
                                onChange={(e) => setTransactionRef(e.target.value)}
                                placeholder="e.g. TXN-84729103 or FT230983..."
                                className="h-9 text-xs font-mono"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                Enter the confirmation code from your SMS or mobile banking app.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Cash in person message */}
                        {isSelected && option.id === "cash" && (
                          <div className="mt-2 text-xs text-muted-foreground bg-background/60 rounded p-2.5 border border-border/40">
                            No upload required. Your order will be placed immediately and settled with the server or delivery agent.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </fieldset>

            {/* FULL RECEIPT PREVIEW MODAL */}
            <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
              <DialogContent className="max-w-md p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="text-base flex items-center gap-2">
                    <Receipt className="size-4 text-primary" />
                    Payment Receipt Preview
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-2 flex flex-col items-center justify-center">
                  {proofImageBase64 ? (
                    <div className="w-full max-h-[70vh] overflow-auto rounded-lg border border-border bg-black/5 flex items-center justify-center p-2">
                      <img
                        src={proofImageBase64}
                        alt="Full receipt proof"
                        className="max-h-[65vh] w-auto object-contain rounded"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No image available.</p>
                  )}
                  {proofFileName && (
                    <p className="mt-2 text-xs text-muted-foreground font-mono">{proofFileName}</p>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="rounded-lg border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary shrink-0" />
              <span>
                All payment proofs are verified by our cashier and receptionist team before processing.
              </span>
            </div>
          </div>
        )}

        {/* NAVIGATION BUTTONS */}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Back
          </Button>

          {step < steps.length - 1 ? (
            <Button
              onClick={next}
              disabled={
                step === 1 && method === "delivery" && (!hasCustomerCoords || !isDeliveryEligible)
              }
            >
              Continue
            </Button>
          ) : (
            <Button onClick={pay} disabled={submitting}>
              <CreditCard className="size-4" />
              {submitting
                ? "Processing…"
                : payment === "cash"
                  ? `Place Order (Pay ${formatETB(total)})`
                  : `Confirm & Pay ${formatETB(total)}`}
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
