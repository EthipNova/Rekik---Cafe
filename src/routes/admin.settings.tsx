import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Globe,
  Info,
  Laptop,
  Loader2,
  Mail,
  MapPin,
  Moon,
  Palette,
  Phone,
  RotateCcw,
  Save,
  Server,
  ShoppingBag,
  Store,
  Sun,
  Truck,
  Utensils,
  CreditCard,
  Smartphone,
  Building2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import {
  applyTheme,
  DEFAULT_SETTINGS,
  fetchStoreSettings,
  readSettings,
  resetSettings,
  SETTINGS_STORAGE_KEY,
  updateStoreSettings,
  type NebaSettings,
  type ThemePreference,
} from "@/lib/settings";
import {
  fetchPaymentAccountSettings,
  updatePaymentAccountSetting,
  type PaymentAccountSettingsMap,
} from "@/lib/payment-settings";
import type { DeliveryRoundingRule } from "@/lib/distance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Rekik Café" },
      {
        name: "description",
        content:
          "Configure café profile information, appearance preferences, and system parameters.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSettings,
});

function AdminSettings() {
  const [savedSettings, setSavedSettings] = useState<NebaSettings>(DEFAULT_SETTINGS);
  const [form, setForm] = useState<NebaSettings>(DEFAULT_SETTINGS);
  const [savedPaymentAccounts, setSavedPaymentAccounts] = useState<PaymentAccountSettingsMap>({
    cbe: null,
    telebirr: null,
  });
  const [paymentForm, setPaymentForm] = useState<{
    cbeAccountNumber: string;
    cbeAccountOwner: string;
    cbeIsActive: boolean;
    telebirrNumber: string;
    telebirrAccountOwner: string;
    telebirrIsActive: boolean;
  }>({
    cbeAccountNumber: "",
    cbeAccountOwner: "",
    cbeIsActive: true,
    telebirrNumber: "",
    telebirrAccountOwner: "",
    telebirrIsActive: true,
  });
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<"loading" | "connected" | "error">(
    "loading",
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setSupabaseStatus("loading");
    try {
      // 1. Fetch store profile settings
      const { data, error: fetchErr } = await fetchStoreSettings();
      if (fetchErr) {
        setError(fetchErr.message);
        setSupabaseStatus("error");
        return;
      }
      const loaded = data || DEFAULT_SETTINGS;
      setSavedSettings(loaded);
      setForm(loaded);

      // 2. Fetch live payment account settings (CBE & Telebirr)
      const { data: payData } = await fetchPaymentAccountSettings();
      if (payData) {
        setSavedPaymentAccounts(payData);
        setPaymentForm({
          cbeAccountNumber: payData.cbe?.account_number || "",
          cbeAccountOwner: payData.cbe?.account_owner_name || "",
          cbeIsActive: payData.cbe ? payData.cbe.is_active : true,
          telebirrNumber: payData.telebirr?.account_number || "",
          telebirrAccountOwner: payData.telebirr?.account_owner_name || "",
          telebirrIsActive: payData.telebirr ? payData.telebirr.is_active : true,
        });
      }

      setSupabaseStatus("connected");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Failed to load store settings";
      setError(msg);
      setSupabaseStatus("error");
    } finally {
      setLoading(false);
    }
  };

  // Load settings on client mount and synchronize with cross-tab storage changes
  useEffect(() => {
    void loadData();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        if (session.access_token) {
          setAuthToken(session.access_token);
        }
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();
        if (data?.role) {
          setRole(data.role);
        }
      }
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_STORAGE_KEY || e.key === null) {
        const next = readSettings();
        setSavedSettings((prev) => ({
          ...prev,
          theme: next.theme,
          showToasts: next.showToasts,
        }));
        setForm((prev) => ({
          ...prev,
          theme: next.theme,
          showToasts: next.showToasts,
        }));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Dirty state tracking for store profile settings
  const isStoreDirty =
    form.cafeName !== savedSettings.cafeName ||
    form.phone !== savedSettings.phone ||
    form.email !== savedSettings.email ||
    form.address !== savedSettings.address ||
    form.openingHours !== savedSettings.openingHours ||
    form.deliveryFee !== savedSettings.deliveryFee ||
    form.deliveryEnabled !== savedSettings.deliveryEnabled ||
    form.pricePerKm !== savedSettings.pricePerKm ||
    form.minDeliveryFee !== savedSettings.minDeliveryFee ||
    form.maxDeliveryDistanceKm !== savedSettings.maxDeliveryDistanceKm ||
    form.roundingRule !== savedSettings.roundingRule ||
    form.cafeLatitude !== savedSettings.cafeLatitude ||
    form.cafeLongitude !== savedSettings.cafeLongitude ||
    form.theme !== savedSettings.theme ||
    form.showToasts !== savedSettings.showToasts;

  // Dirty state tracking for payment accounts (CBE & Telebirr)
  const isPaymentDirty =
    paymentForm.cbeAccountNumber !== (savedPaymentAccounts.cbe?.account_number || "") ||
    paymentForm.cbeAccountOwner !== (savedPaymentAccounts.cbe?.account_owner_name || "") ||
    paymentForm.cbeIsActive !== (savedPaymentAccounts.cbe ? savedPaymentAccounts.cbe.is_active : true) ||
    paymentForm.telebirrNumber !== (savedPaymentAccounts.telebirr?.account_number || "") ||
    paymentForm.telebirrAccountOwner !== (savedPaymentAccounts.telebirr?.account_owner_name || "") ||
    paymentForm.telebirrIsActive !== (savedPaymentAccounts.telebirr ? savedPaymentAccounts.telebirr.is_active : true);

  const isDirty = isStoreDirty || isPaymentDirty;

  const handleFieldChange = <K extends keyof NebaSettings>(key: K, value: NebaSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleThemeChange = (newTheme: ThemePreference) => {
    setForm((prev) => ({ ...prev, theme: newTheme }));
    // Immediately apply theme to the DOM so user experiences visual feedback
    applyTheme(newTheme);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;

    if (!form.cafeName.trim()) {
      toast.error("Café name is required");
      return;
    }

    if (form.pricePerKm < 0 || isNaN(form.pricePerKm)) {
      toast.error("Price per KM cannot be negative");
      return;
    }

    if (form.minDeliveryFee < 0 || isNaN(form.minDeliveryFee)) {
      toast.error("Minimum delivery fee cannot be negative");
      return;
    }

    if (form.maxDeliveryDistanceKm <= 0 || isNaN(form.maxDeliveryDistanceKm)) {
      toast.error("Maximum delivery distance must be greater than 0");
      return;
    }

    if (
      form.cafeLatitude !== null &&
      form.cafeLatitude !== undefined &&
      (isNaN(form.cafeLatitude) || form.cafeLatitude < -90 || form.cafeLatitude > 90)
    ) {
      toast.error("Café latitude must be between -90 and 90 degrees");
      return;
    }

    if (
      form.cafeLongitude !== null &&
      form.cafeLongitude !== undefined &&
      (isNaN(form.cafeLongitude) || form.cafeLongitude < -180 || form.cafeLongitude > 180)
    ) {
      toast.error("Café longitude must be between -180 and 180 degrees");
      return;
    }

    const validRules: DeliveryRoundingRule[] = ["none", "nearest_1", "nearest_5", "ceil"];
    if (!validRules.includes(form.roundingRule)) {
      toast.error("Invalid rounding rule selected");
      return;
    }

    // Validate payment accounts if modified
    if (paymentForm.cbeIsActive && !paymentForm.cbeAccountNumber.trim()) {
      toast.error("CBE Bank Account number is required when CBE payment is enabled.");
      return;
    }
    if (paymentForm.telebirrIsActive && !paymentForm.telebirrNumber.trim()) {
      toast.error("Telebirr Till / Phone number is required when Telebirr payment is enabled.");
      return;
    }

    setIsSaving(true);
    try {
      // 1. Save store profile settings if changed
      if (isStoreDirty) {
        const { data, error: saveErr } = await updateStoreSettings(form);
        if (saveErr || !data) {
          toast.error(saveErr?.message || "Failed to save store settings to Supabase");
          setSupabaseStatus("error");
          return;
        }
        setSavedSettings(data);
        setForm(data);
      }

      // 2. Save payment account settings if changed
      if (isPaymentDirty) {
        const cbeRes = await updatePaymentAccountSetting(
          {
            payment_method: "cbe",
            account_number: paymentForm.cbeAccountNumber,
            account_owner_name: paymentForm.cbeAccountOwner || "Commercial Bank of Ethiopia (CBE)",
            is_active: paymentForm.cbeIsActive,
          },
          authToken || undefined,
        );
        if (!cbeRes.success) {
          toast.error(cbeRes.error?.message || "Failed to save CBE payment account settings.");
          return;
        }

        const telebirrRes = await updatePaymentAccountSetting(
          {
            payment_method: "telebirr",
            account_number: paymentForm.telebirrNumber,
            account_owner_name: paymentForm.telebirrAccountOwner || "Telebirr Mobile Payment",
            is_active: paymentForm.telebirrIsActive,
          },
          authToken || undefined,
        );
        if (!telebirrRes.success) {
          toast.error(telebirrRes.error?.message || "Failed to save Telebirr payment account settings.");
          return;
        }

        // Refresh saved payment accounts state
        const { data: updatedPayData } = await fetchPaymentAccountSettings();
        if (updatedPayData) {
          setSavedPaymentAccounts(updatedPayData);
          setPaymentForm({
            cbeAccountNumber: updatedPayData.cbe?.account_number || "",
            cbeAccountOwner: updatedPayData.cbe?.account_owner_name || "",
            cbeIsActive: updatedPayData.cbe ? updatedPayData.cbe.is_active : true,
            telebirrNumber: updatedPayData.telebirr?.account_number || "",
            telebirrAccountOwner: updatedPayData.telebirr?.account_owner_name || "",
            telebirrIsActive: updatedPayData.telebirr ? updatedPayData.telebirr.is_active : true,
          });
        }
      }

      setSupabaseStatus("connected");
      if (form.showToasts) {
        toast.success("Settings saved successfully", {
          description: "Store settings and payment accounts updated in Supabase.",
        });
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred while saving";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(savedSettings);
    applyTheme(savedSettings.theme);
    setPaymentForm({
      cbeAccountNumber: savedPaymentAccounts.cbe?.account_number || "",
      cbeAccountOwner: savedPaymentAccounts.cbe?.account_owner_name || "",
      cbeIsActive: savedPaymentAccounts.cbe ? savedPaymentAccounts.cbe.is_active : true,
      telebirrNumber: savedPaymentAccounts.telebirr?.account_number || "",
      telebirrAccountOwner: savedPaymentAccounts.telebirr?.account_owner_name || "",
      telebirrIsActive: savedPaymentAccounts.telebirr ? savedPaymentAccounts.telebirr.is_active : true,
    });
    if (savedSettings.showToasts) {
      toast.info("Unsaved changes discarded");
    }
  };

  const handleRestoreDefaults = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const resetLocal = resetSettings();
      const defaultWithLocal: NebaSettings = {
        ...DEFAULT_SETTINGS,
        theme: resetLocal.theme,
        showToasts: resetLocal.showToasts,
      };

      const { data, error: restoreErr } = await updateStoreSettings(defaultWithLocal);
      if (restoreErr || !data) {
        toast.error(restoreErr?.message || "Failed to restore default settings");
        return;
      }

      setSavedSettings(data);
      setForm(data);
      setSupabaseStatus("connected");
      if (data.showToasts) {
        toast.success("Settings restored to defaults", {
          description: "Store settings and preferences have been reset to factory defaults.",
        });
      }
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : "Failed to restore defaults");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* 1. HEADER & DEMO NOTICE */}
      <header>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage café business details, appearance preferences, and review operational defaults.
            </p>
          </div>
          {isDirty && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                Discard
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                <span>{isSaving ? "Saving…" : "Save changes"}</span>
              </Button>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground inline-flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase font-semibold">
            Hybrid Settings
          </Badge>
          <span>
            Business profile and delivery parameters are synchronized centrally with Supabase (
            <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono text-foreground">
              public.store_settings
            </code>
            ). Workspace appearance preferences remain local to this browser (
            <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono text-foreground">
              {SETTINGS_STORAGE_KEY}
            </code>
            ).
          </span>
        </div>
      </header>

      {loading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
            <p className="animate-pulse">Loading café settings from Supabase…</p>
          </div>
        </div>
      ) : error ? (
        <div className="surface-card p-12 text-center space-y-4 border-destructive/20 bg-destructive/5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Failed to load store settings
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden />
            <span>Retry connection</span>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* 2. SECTION: CAFÉ PROFILE & CONTACT */}
          <section aria-labelledby="cafe-profile-heading" className="surface-card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Store className="size-5 text-primary" aria-hidden />
                  <h2 id="cafe-profile-heading" className="font-display text-xl font-semibold">
                    Café Profile & Contact
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Public café contact details displayed across the website and order receipts.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Server Synchronized
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Café Name */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="setting-cafe-name">Café Name</Label>
                <div className="relative">
                  <Store
                    className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="setting-cafe-name"
                    value={form.cafeName}
                    onChange={(e) => handleFieldChange("cafeName", e.target.value)}
                    placeholder="e.g. Rekik Café"
                    className="pl-9 h-9 text-sm"
                    disabled={isSaving}
                    required
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="setting-phone">Customer Phone Number</Label>
                <div className="relative">
                  <Phone
                    className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="setting-phone"
                    value={form.phone}
                    onChange={(e) => handleFieldChange("phone", e.target.value)}
                    placeholder="e.g. +251 91 123 4567"
                    className="pl-9 h-9 text-sm"
                    disabled={isSaving}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="setting-email">Enquiries Email</Label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="setting-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => handleFieldChange("email", e.target.value)}
                    placeholder="e.g. hello@rekikcafe.com"
                    className="pl-9 h-9 text-sm"
                    disabled={isSaving}
                    required
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="setting-address">Physical Location / Address</Label>
                <div className="relative">
                  <MapPin
                    className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="setting-address"
                    value={form.address}
                    onChange={(e) => handleFieldChange("address", e.target.value)}
                    placeholder="e.g. Bole Medhanialem, Camorra Building, Addis Ababa, Ethiopia"
                    className="pl-9 h-9 text-sm"
                    disabled={isSaving}
                    required
                  />
                </div>
              </div>

              {/* Opening Hours */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="setting-hours">Service & Opening Hours</Label>
                <div className="relative">
                  <Clock
                    className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="setting-hours"
                    value={form.openingHours}
                    onChange={(e) => handleFieldChange("openingHours", e.target.value)}
                    placeholder="e.g. Mon – Sun: 7:00 AM – 10:00 PM"
                    className="pl-9 h-9 text-sm"
                    disabled={isSaving}
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 2b. SECTION: PAYMENT ACCOUNT SETTINGS (CBE & TELEBIRR) */}
          <section aria-labelledby="payment-accounts-heading" className="surface-card p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <CreditCard className="size-5 text-primary" aria-hidden />
                  <h2 id="payment-accounts-heading" className="font-display text-xl font-semibold">
                    Payment Account Settings
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure live Commercial Bank of Ethiopia (CBE) and Telebirr payment receiver accounts displayed to customers during checkout and order tracking.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                  Authoritative (public.payment_account_settings)
                </Badge>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Commercial Bank of Ethiopia (CBE) */}
              <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="size-5" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-semibold text-foreground">
                        Commercial Bank of Ethiopia (CBE)
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Bank transfer and CBE Birr settlement
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="cbe-active-toggle" className="text-xs text-muted-foreground cursor-pointer">
                      {paymentForm.cbeIsActive ? "Active" : "Disabled"}
                    </Label>
                    <Switch
                      id="cbe-active-toggle"
                      checked={paymentForm.cbeIsActive}
                      onCheckedChange={(checked) =>
                        setPaymentForm((prev) => ({ ...prev, cbeIsActive: checked }))
                      }
                      disabled={isSaving}
                      aria-label="Enable or disable CBE payment method"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cbe-account-number" className="text-xs font-medium">
                      CBE Bank Account Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="cbe-account-number"
                      value={paymentForm.cbeAccountNumber}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, cbeAccountNumber: e.target.value }))
                      }
                      placeholder="e.g. 1000 2345 67890"
                      className="font-mono text-sm h-9"
                      disabled={isSaving}
                      required={paymentForm.cbeIsActive}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Shown to customers during checkout and copied to their clipboard.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cbe-account-owner" className="text-xs font-medium">
                      Account Holder / Business Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="cbe-account-owner"
                      value={paymentForm.cbeAccountOwner}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, cbeAccountOwner: e.target.value }))
                      }
                      placeholder="e.g. Rekik Coffee"
                      className="text-sm h-9"
                      disabled={isSaving}
                      required={paymentForm.cbeIsActive}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Exact name registered on the CBE bank account.
                    </p>
                  </div>
                </div>

                {savedPaymentAccounts.cbe?.updated_at && (
                  <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-2">
                    Last updated: {new Date(savedPaymentAccounts.cbe.updated_at).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Telebirr Mobile Payment */}
              <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Smartphone className="size-5" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-semibold text-foreground">
                        Telebirr Mobile Payment
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        Instant mobile wallet / USSD *127# settlement
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="telebirr-active-toggle" className="text-xs text-muted-foreground cursor-pointer">
                      {paymentForm.telebirrIsActive ? "Active" : "Disabled"}
                    </Label>
                    <Switch
                      id="telebirr-active-toggle"
                      checked={paymentForm.telebirrIsActive}
                      onCheckedChange={(checked) =>
                        setPaymentForm((prev) => ({ ...prev, telebirrIsActive: checked }))
                      }
                      disabled={isSaving}
                      aria-label="Enable or disable Telebirr payment method"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="telebirr-number" className="text-xs font-medium">
                      Telebirr Merchant / Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="telebirr-number"
                      value={paymentForm.telebirrNumber}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, telebirrNumber: e.target.value }))
                      }
                      placeholder="e.g. 0911 234 567"
                      className="font-mono text-sm h-9"
                      disabled={isSaving}
                      required={paymentForm.telebirrIsActive}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Merchant code or registered mobile number to receive customer transfers.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="telebirr-account-owner" className="text-xs font-medium">
                      Merchant / Account Holder Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="telebirr-account-owner"
                      value={paymentForm.telebirrAccountOwner}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({ ...prev, telebirrAccountOwner: e.target.value }))
                      }
                      placeholder="e.g. Rekik Coffee"
                      className="text-sm h-9"
                      disabled={isSaving}
                      required={paymentForm.telebirrIsActive}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Display name shown on Telebirr verification receipts.
                    </p>
                  </div>
                </div>

                {savedPaymentAccounts.telebirr?.updated_at && (
                  <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-2">
                    Last updated: {new Date(savedPaymentAccounts.telebirr.updated_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* 3. SECTION: APPEARANCE & DISPLAY */}
          <section aria-labelledby="appearance-heading" className="surface-card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Palette className="size-5 text-primary" aria-hidden />
                  <h2 id="appearance-heading" className="font-display text-xl font-semibold">
                    Appearance & Display
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Customize the visual interface and operational alert behavior for this browser.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Local Workspace
              </Badge>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Workspace Theme</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                  Select your preferred color theme. Changes take effect immediately.
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  {/* Light Theme */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange("light")}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                      form.theme === "light"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-border/80 bg-card/60"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Sun className="size-5 text-amber-600" aria-hidden />
                      {form.theme === "light" && (
                        <Check className="size-4 text-primary" aria-hidden />
                      )}
                    </div>
                    <span className="font-medium text-sm mt-3 text-foreground">Rekik Light</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      Clean white and charcoal daylight palette with Rekik red accents.
                    </span>
                  </button>

                  {/* Dark Theme */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange("dark")}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                      form.theme === "dark"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-border/80 bg-card/60"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Moon className="size-5 text-primary" aria-hidden />
                      {form.theme === "dark" && (
                        <Check className="size-4 text-primary" aria-hidden />
                      )}
                    </div>
                    <span className="font-medium text-sm mt-3 text-foreground">Charcoal Dark</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      Deep charcoal background with bold Rekik red accents.
                    </span>
                  </button>

                  {/* System Theme */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange("system")}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                      form.theme === "system"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-border/80 bg-card/60"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Laptop className="size-5 text-muted-foreground" aria-hidden />
                      {form.theme === "system" && (
                        <Check className="size-4 text-primary" aria-hidden />
                      )}
                    </div>
                    <span className="font-medium text-sm mt-3 text-foreground">System Default</span>
                    <span className="text-xs text-muted-foreground mt-1">
                      Automatically matches your operating system preference.
                    </span>
                  </button>
                </div>
              </div>

              {/* Notification / Toast alert toggle */}
              <div className="flex items-center justify-between border-t border-border/50 pt-4">
                <div className="space-y-0.5">
                  <Label htmlFor="setting-show-toasts" className="text-sm font-medium">
                    In-App Toast Alerts
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Display interactive confirmation toasts when updating orders, promotions, or
                    settings.
                  </p>
                </div>
                <Switch
                  id="setting-show-toasts"
                  checked={form.showToasts}
                  onCheckedChange={(checked) => handleFieldChange("showToasts", checked)}
                  aria-label="Toggle in-app toast alerts"
                />
              </div>
            </div>
          </section>

          {/* 4. SECTION: DELIVERY & FULFILLMENT */}
          <section
            aria-labelledby="delivery-fulfillment-heading"
            className="surface-card p-6 space-y-6"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Truck className="size-5 text-primary" aria-hidden />
                  <h2
                    id="delivery-fulfillment-heading"
                    className="font-display text-xl font-semibold"
                  >
                    Delivery & Fulfillment
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure distance-based delivery pricing, operating radius, rounding rules, and
                  café coordinates.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Backend Authoritative
              </Badge>
            </div>

            {/* Warning banner when delivery is enabled but café GPS coordinates are unconfigured */}
            {form.deliveryEnabled &&
              (form.cafeLatitude === null || form.cafeLongitude === null) && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-3"
                >
                  <AlertTriangle className="size-5 shrink-0 mt-0.5 text-amber-500" aria-hidden />
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                      Café Location Configuration Required
                    </p>
                    <p>
                      Delivery is enabled, but the café location has not been configured. Customers
                      cannot place delivery orders until the café coordinates are set.
                    </p>
                  </div>
                </div>
              )}

            {/* Delivery Enable/Disable Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-4">
              <div className="space-y-0.5">
                <Label
                  htmlFor="setting-delivery-enabled"
                  className="text-sm font-semibold cursor-pointer"
                >
                  Delivery Orders Enabled
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, customers can choose delivery during checkout (requires valid
                  customer and café coordinates).
                </p>
              </div>
              <Switch
                id="setting-delivery-enabled"
                checked={form.deliveryEnabled}
                onCheckedChange={(checked) => handleFieldChange("deliveryEnabled", checked)}
                aria-label="Toggle delivery orders"
                disabled={isSaving}
              />
            </div>

            {/* Pricing and Radius Parameters */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Price Per KM */}
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="setting-price-per-km"
                    className="text-xs font-semibold uppercase text-muted-foreground cursor-pointer"
                  >
                    Price per KM
                  </Label>
                  <Truck className="size-4 text-primary" aria-hidden />
                </div>
                <div className="relative flex items-center">
                  <Input
                    id="setting-price-per-km"
                    type="number"
                    min={0}
                    step="any"
                    value={isNaN(form.pricePerKm) ? "" : form.pricePerKm}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      handleFieldChange("pricePerKm", isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="pr-16 font-display text-lg font-bold h-9"
                    aria-label="Price per kilometer in ETB"
                    disabled={isSaving}
                  />
                  <span className="absolute right-3 text-xs font-semibold text-muted-foreground pointer-events-none">
                    ETB/KM
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Charged per straight-line kilometer
                </p>
              </div>

              {/* Minimum Delivery Fee */}
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="setting-min-delivery-fee"
                    className="text-xs font-semibold uppercase text-muted-foreground cursor-pointer"
                  >
                    Min Delivery Fee
                  </Label>
                  <ShoppingBag className="size-4 text-primary" aria-hidden />
                </div>
                <div className="relative flex items-center">
                  <Input
                    id="setting-min-delivery-fee"
                    type="number"
                    min={0}
                    step="any"
                    value={isNaN(form.minDeliveryFee) ? "" : form.minDeliveryFee}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      handleFieldChange("minDeliveryFee", isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="pr-12 font-display text-lg font-bold h-9"
                    aria-label="Minimum delivery fee in ETB"
                    disabled={isSaving}
                  />
                  <span className="absolute right-3 text-xs font-semibold text-muted-foreground pointer-events-none">
                    ETB
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Base floor charge for any delivery
                </p>
              </div>

              {/* Maximum Delivery Distance */}
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="setting-max-distance"
                    className="text-xs font-semibold uppercase text-muted-foreground cursor-pointer"
                  >
                    Max Distance
                  </Label>
                  <MapPin className="size-4 text-primary" aria-hidden />
                </div>
                <div className="relative flex items-center">
                  <Input
                    id="setting-max-distance"
                    type="number"
                    min={0.1}
                    step="any"
                    value={isNaN(form.maxDeliveryDistanceKm) ? "" : form.maxDeliveryDistanceKm}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      handleFieldChange(
                        "maxDeliveryDistanceKm",
                        isNaN(val) ? 1 : Math.max(0.1, val),
                      );
                    }}
                    className="pr-12 font-display text-lg font-bold h-9"
                    aria-label="Maximum delivery distance in kilometers"
                    disabled={isSaving}
                  />
                  <span className="absolute right-3 text-xs font-semibold text-muted-foreground pointer-events-none">
                    KM
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Orders beyond this radius are rejected
                </p>
              </div>

              {/* Rounding Rule */}
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="setting-rounding-rule"
                    className="text-xs font-semibold uppercase text-muted-foreground cursor-pointer"
                  >
                    Rounding Rule
                  </Label>
                  <CheckCircle2 className="size-4 text-primary" aria-hidden />
                </div>
                <Select
                  value={form.roundingRule}
                  onValueChange={(val) =>
                    handleFieldChange("roundingRule", val as DeliveryRoundingRule)
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger id="setting-rounding-rule" className="h-9 font-medium text-xs">
                    <SelectValue placeholder="Select rounding rule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nearest_5">Nearest 5 ETB (e.g. 50, 55, 60)</SelectItem>
                    <SelectItem value="nearest_1">Nearest 1 ETB (e.g. 51, 52)</SelectItem>
                    <SelectItem value="ceil">Round Up / Ceil</SelectItem>
                    <SelectItem value="none">Exact (No Rounding)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Applied after distance × price calculation
                </p>
              </div>
            </div>

            {/* Café GPS Coordinates */}
            <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-primary" aria-hidden />
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      Rekik Café GPS Coordinates (Origin)
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Confirmed coordinates are strictly required to calculate delivery distance.
                    Leave empty until the café owner provides exact coordinates.
                  </p>
                </div>
                <Badge
                  variant={
                    form.cafeLatitude !== null && form.cafeLongitude !== null
                      ? "secondary"
                      : "outline"
                  }
                  className="text-[11px]"
                >
                  {form.cafeLatitude !== null && form.cafeLongitude !== null
                    ? "Configured"
                    : "Unconfigured"}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="setting-cafe-lat"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Café Latitude (-90 to 90)
                  </Label>
                  <Input
                    id="setting-cafe-lat"
                    type="number"
                    step="any"
                    placeholder="e.g. 7.0581234"
                    value={
                      form.cafeLatitude === null || form.cafeLatitude === undefined
                        ? ""
                        : form.cafeLatitude
                    }
                    onChange={(e) => {
                      const str = e.target.value.trim();
                      if (str === "") {
                        handleFieldChange("cafeLatitude", null);
                      } else {
                        const val = parseFloat(str);
                        handleFieldChange("cafeLatitude", isNaN(val) ? null : val);
                      }
                    }}
                    className="font-mono text-sm h-9"
                    disabled={isSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="setting-cafe-lng"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Café Longitude (-180 to 180)
                  </Label>
                  <Input
                    id="setting-cafe-lng"
                    type="number"
                    step="any"
                    placeholder="e.g. 38.4731234"
                    value={
                      form.cafeLongitude === null || form.cafeLongitude === undefined
                        ? ""
                        : form.cafeLongitude
                    }
                    onChange={(e) => {
                      const str = e.target.value.trim();
                      if (str === "") {
                        handleFieldChange("cafeLongitude", null);
                      } else {
                        const val = parseFloat(str);
                        handleFieldChange("cafeLongitude", isNaN(val) ? null : val);
                      }
                    }}
                    className="font-mono text-sm h-9"
                    disabled={isSaving}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
              <Info className="size-4 shrink-0 mt-0.5 text-primary" aria-hidden />
              <span>
                <strong>Distance Formula:</strong>{" "}
                <code>delivery_fee = max(min_delivery_fee, distance_km × price_per_km)</code>{" "}
                rounded by the configured rule. Orders exceeding {form.maxDeliveryDistanceKm || 15}{" "}
                KM are rejected. The legacy flat rate field remains preserved in the database for
                historical orders.
              </span>
            </div>
          </section>

          {/* 5. SECTION: SYSTEM & ENVIRONMENT INFORMATION (READ-ONLY) */}
          <section aria-labelledby="system-info-heading" className="surface-card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Server className="size-5 text-primary" aria-hidden />
                  <h2 id="system-info-heading" className="font-display text-xl font-semibold">
                    System & Environment
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Technical metadata about the current client deployment and active storage engines.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Read-Only
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
                <span className="text-xs text-muted-foreground">Application</span>
                <span className="font-medium text-foreground text-xs">
                  Rekik Café Ordering System
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
                <span className="text-xs text-muted-foreground">Runtime Mode</span>
                <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                  {import.meta.env.MODE || "development"}
                </Badge>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
                <span className="text-xs text-muted-foreground">Active Role</span>
                <Badge variant="outline" className="text-[10px] font-semibold">
                  {role || "ADMIN"}
                </Badge>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
                <span className="text-xs text-muted-foreground">Storage Engine</span>
                <span className="text-xs font-medium text-foreground">
                  Supabase + Browser LocalStorage
                </span>
              </div>

              <div className="sm:col-span-2 rounded-lg border border-border/60 bg-card/40 p-3 space-y-1.5">
                <span className="text-xs text-muted-foreground block font-medium">
                  Active Client Storage Partitions
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                    <Database className="size-3" aria-hidden /> neba.orders.v1
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                    <Database className="size-3" aria-hidden /> neba.promotions.v1
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                    <Database className="size-3" aria-hidden /> neba.settings.v1
                  </span>
                </div>
              </div>

              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
                <span className="text-xs text-muted-foreground">Supabase Settings Backend</span>
                {supabaseStatus === "connected" ? (
                  <span className="text-xs text-success font-medium inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-success animate-pulse" aria-hidden />
                    Connected (public.store_settings)
                  </span>
                ) : supabaseStatus === "error" ? (
                  <span className="text-xs text-destructive font-medium inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
                    Connection Error
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground font-medium">
                    Connecting to Supabase…
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* ACTION BAR */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={!isDirty || isSaving}
                className="gap-2"
                aria-label="Save all settings changes"
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                <span>{isSaving ? "Saving…" : "Save Settings"}</span>
              </Button>

              {isDirty && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isSaving}
                  aria-label="Discard unsaved changes"
                >
                  Discard Changes
                </Button>
              )}
            </div>

            <span className="text-xs text-muted-foreground">
              {isDirty ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  ● You have unsaved changes
                </span>
              ) : (
                <span className="text-muted-foreground">All settings are up to date</span>
              )}
            </span>
          </div>
        </form>
      )}

      {/* 6. SECTION: RESET DEFAULTS (DANGER ZONE) */}
      <section
        aria-labelledby="reset-defaults-heading"
        className="surface-card p-6 space-y-4 border-destructive/25"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="size-5 text-destructive" aria-hidden />
              <h2 id="reset-defaults-heading" className="font-display text-lg font-semibold">
                Restore Default Settings
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Reset all café profile information, theme selections, and local workspace preferences
              back to factory defaults.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving || loading}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5 shrink-0"
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="size-3.5" aria-hidden />
                )}
                Restore Defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5" aria-hidden />
                  Restore default settings?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                  <span>
                    This action will reset your café profile details on Supabase, theme preferences,
                    and in-app display options to their factory defaults.
                  </span>
                  <span className="block font-medium text-foreground">
                    Your saved customer orders (<code>neba.orders.v1</code>) and promotional
                    campaigns (<code>neba.promotions.v1</code>) will remain completely safe and
                    untouched.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleRestoreDefaults()}
                  disabled={isSaving}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, Restore Defaults
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            Restoring defaults updates <code>store_settings</code> with factory defaults and resets{" "}
            <code>neba.settings.v1</code>. It does not modify or remove existing orders or
            inventory.
          </span>
        </div>
      </section>
    </div>
  );
}
