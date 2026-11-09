import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  QrCode,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  User,
  Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        content: "Complete your Rekik Coffee order: method, details, and floor server assignment.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Checkout — Rekik Coffee" },
      { property: "og:description", content: "Complete your Rekik Coffee order." },
    ],
  }),
  component: Checkout,
});

const steps = ["Ordering method", "Customer & Staff", "Order summary"] as const;

type FormField = "name" | "phone" | "address" | "waiter" | "table";
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
  const [tableNumber, setTableNumber] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authenticatedCustomerName, setAuthenticatedCustomerName] = useState<string | null>(null);
  const [waiters, setWaiters] = useState<AvailableWaiter[]>([]);
  const [waitersLoading, setWaitersLoading] = useState(true);
  const [waitersError, setWaitersError] = useState<string | null>(null);
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>("");
  const [checkoutReferenceId] = useState(
    () => `chk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  );

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
      const activeWaiters = data || [];
      setWaiters(activeWaiters);
      setSelectedWaiterId((current) => {
        // If the previously selected waiter is no longer active in the updated list, clear selection
        if (current && !activeWaiters.some((w) => w.id === current)) {
          return "";
        }
        if (!current && activeWaiters.length === 1) {
          return activeWaiters[0]!.id;
        }
        return current;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load floor staff";
      setWaitersError(msg);
    } finally {
      setWaitersLoading(false);
    }
  };

  useEffect(() => {
    void loadWaiters();

    // Real-time listener: refresh available waiters immediately when an Admin activates/deactivates a waiter
    const channel = supabase
      .channel("customer-checkout-waiters-realtime")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "staff_profiles" },
        () => {
          void loadWaiters();
        },
      )
      .subscribe();

    // Refresh when tab regains focus or visibility
    const handleFocus = () => {
      void loadWaiters();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
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
      text: "Enjoy your meal fresh at your table in the café.",
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
    // When changing from Dine-in to another method, clear the table number so it is not submitted
    if (newMethod !== "dine-in") {
      setTableNumber("");
    }
    setErrors({});
  };

  const validateCurrentStep = (): boolean => {
    if (step === 0) {
      if (method === "dine-in") {
        const cleanTable = tableNumber.trim();
        if (!cleanTable) {
          setErrors({ table: "Enter the number displayed on your table's QR code." });
          toast.error("Please enter the number displayed on your table's QR code.");
          return false;
        }
        if (!/^[a-zA-Z0-9\s#-]{1,20}$/.test(cleanTable)) {
          setErrors({ table: "Please enter a valid table number." });
          toast.error("Please enter a valid table number.");
          return false;
        }
      }

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

      // Waiter selection is required for all order methods when waiters exist
      if (waiters.length > 0 && !selectedWaiterId) {
        newErrors.waiter = "Please select an available waiter from the floor list.";
      }

      if (method !== "dine-in") {
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

    return true;
  };

  const next = () => {
    if (validateCurrentStep()) {
      setStep((s) => Math.min(steps.length - 1, s + 1));
    }
  };

  const submitOrder = async () => {
    if (submitting) return;
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

      // Customer does not handle payment. Order starts as pending settlement with assigned waiter.
      const orderData = {
        lines: resolvedLines,
        method,
        paymentMethod: "Pending Waiter Settlement",
        paymentStatus: "pending" as const,
        waiterId: selectedWaiterId || undefined,
        customer: {
          name: form.name.trim() || (method === "dine-in" ? "Dine-in guest" : ""),
          phone: form.phone.trim(),
          ...(method === "dine-in" && tableNumber.trim() ? { table: tableNumber.trim() } : {}),
          ...(method === "delivery" && form.address.trim() ? { address: form.address.trim() } : {}),
          ...(method === "delivery" && deliveryLocation
            ? { latitude: deliveryLocation.latitude, longitude: deliveryLocation.longitude }
            : {}),
        },
        clientReferenceId: checkoutReferenceId,
      };

      const order = await apiCreateOrder(orderData);

      // Cache order in local storage for offline access
      saveOrder(order);
      clear();

      const assignedWaiter = waiters.find((w) => w.id === selectedWaiterId);
      const waiterName = assignedWaiter ? assignedWaiter.name : "your assigned waiter";
      toast.success(`Order placed! Your order has been submitted to ${waiterName}.`);

      void navigate({ to: "/order/$id", params: { id: order.id } });
    } catch (e: unknown) {
      console.error("Checkout order creation error:", e);
      const errMsg = e instanceof Error ? e.message : "Failed to complete order. Please try again.";
      toast.error(`Order submission failed: ${errMsg}`);
      if (errMsg.toLowerCase().includes("waiter")) {
        setErrors((prev) => ({ ...prev, waiter: errMsg }));
        void loadWaiters();
      }
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
        {/* STEP 1: ORDERING METHOD & TABLE NUMBER */}
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

            {/* CONDITIONAL TABLE NUMBER INPUT: ONLY SHOWN FOR DINE-IN */}
            {method === "dine-in" && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-5 sm:p-6 space-y-3 transition-all animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2.5 text-foreground font-semibold">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <QrCode className="size-5" />
                  </div>
                  <div>
                    <Label
                      htmlFor="table-number"
                      className="text-base font-semibold text-foreground cursor-pointer"
                    >
                      Table Number (from QR Code) <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                      Enter the number displayed on your table's QR code.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <Input
                    id="table-number"
                    value={tableNumber}
                    onChange={(e) => {
                      setTableNumber(e.target.value);
                      if (errors.table) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.table;
                          return next;
                        });
                      }
                    }}
                    placeholder="Enter the number displayed on your table's QR code"
                    autoComplete="off"
                    aria-invalid={!!errors.table}
                    aria-describedby={errors.table ? "error-table" : "hint-table"}
                    className={cn(
                      "h-11 bg-background text-base font-medium placeholder:text-muted-foreground/70",
                      errors.table && "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  {errors.table ? (
                    <p
                      id="error-table"
                      role="alert"
                      className="text-xs text-destructive font-medium flex items-center gap-1"
                    >
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {errors.table}
                    </p>
                  ) : (
                    <p id="hint-table" className="text-[11px] text-muted-foreground">
                      Customers will find a unique table number printed on the QR code placed on each table.
                    </p>
                  )}
                </div>
              </div>
            )}

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

        {/* STEP 2: CUSTOMER & WAITER SELECTION */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Step 2 — Customer & staff details
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select your waiter and verify contact details.
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

            {/* Signed-in badge or Guest notice */}
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

            {/* Dine-in Table Confirmation Box */}
            {method === "dine-in" && tableNumber && (
              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <QrCode className="size-4 text-primary" />
                  <span>
                    Dine-In Table:{" "}
                    <strong className="font-bold text-foreground text-sm">Table #{tableNumber}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="font-medium text-primary hover:underline text-xs"
                >
                  Change Table
                </button>
              </div>
            )}

            {/* WAITER SELECTION FIELD (Required for All Methods) */}
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
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    {method === "dine-in" ? "Table service & payment" : "Order assistance & payment"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadWaiters()}
                    disabled={waitersLoading}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    title="Refresh live floor staff list"
                  >
                    <RotateCcw className={cn("size-3", waitersLoading && "animate-spin")} />
                    <span>Refresh</span>
                  </button>
                </div>
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
                    <p className="font-medium">No floor waiters currently online</p>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                      No dedicated floor waiters are currently checked in. An expeditor will be automatically assigned to attend to your order.
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

            {/* Dine-in guest fields */}
            {method === "dine-in" ? (
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
            ) : (
              /* Takeaway & Delivery fields */
              <div className="space-y-4 pt-2 border-t border-border/50">
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

        {/* STEP 3: ORDER SUMMARY & SUBMIT */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-xl font-semibold">Step 3 — Order summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review your items and details before submitting to your waiter.
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
                  <dd className="inline font-semibold text-foreground">{methodLabels[method]}</dd>
                </div>

                {method === "dine-in" && tableNumber && (
                  <div>
                    <dt className="inline font-medium text-foreground">Table: </dt>
                    <dd className="inline font-bold text-primary">Table #{tableNumber} (QR Code)</dd>
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

                {form.name && (
                  <div>
                    <dt className="inline font-medium text-foreground">Customer: </dt>
                    <dd className="inline">{form.name}</dd>
                  </div>
                )}

                {form.phone && (
                  <div>
                    <dt className="inline font-medium text-foreground">Phone: </dt>
                    <dd className="inline">{form.phone}</dd>
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
                <dt>Total Amount</dt>
                <dd className="text-primary">{formatETB(total)}</dd>
              </div>
            </dl>

            {/* Reassuring note regarding waiter workflow */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
              <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">No Payment Needed Right Now</p>
                <p className="leading-relaxed">
                  Your order will be transferred directly to your selected waiter (
                  <strong className="text-foreground capitalize">
                    {waiters.find((w) => w.id === selectedWaiterId)?.name || "Floor Staff"}
                  </strong>
                  ). Your waiter will review your order and handle payment settlement with you in person
                  (Cash, Telebirr, or CBE Birr).
                </p>
              </div>
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
            <Button onClick={submitOrder} disabled={submitting} className="font-semibold px-6">
              <Utensils className="size-4 mr-2" />
              {submitting ? "Submitting Order…" : `Submit Order (${formatETB(total)})`}
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
