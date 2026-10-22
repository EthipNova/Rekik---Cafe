import { supabase } from "@/lib/supabase";
import { getAuthHeaders, getValidAccessToken } from "@/lib/auth-token";
import type { DeliveryRoundingRule } from "./distance";

export type ThemePreference = "light" | "dark" | "system";

export type NebaSettings = {
  // Café Profile
  cafeName: string;
  phone: string;
  email: string;
  address: string;
  openingHours: string;
  deliveryFee: number; // Legacy flat rate fallback

  // Distance-Based Delivery Engine Configuration
  cafeLatitude: number | null;
  cafeLongitude: number | null;
  pricePerKm: number;
  minDeliveryFee: number;
  maxDeliveryDistanceKm: number;
  deliveryEnabled: boolean;
  roundingRule: DeliveryRoundingRule;

  // Appearance & Display
  theme: ThemePreference;
  showToasts: boolean;
};

export type StoreSettingsRow = {
  id: string | number;
  cafe_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_hours: string | null;
  delivery_fee: number | string | null;
  cafe_latitude: number | string | null;
  cafe_longitude: number | string | null;
  price_per_km: number | string | null;
  min_delivery_fee: number | string | null;
  max_delivery_distance_km: number | string | null;
  delivery_enabled: boolean | null;
  rounding_rule: string | null;
  updated_at: string | null;
};

export const SETTINGS_STORAGE_KEY = "neba.settings.v1";

export const DEFAULT_SETTINGS: NebaSettings = {
  cafeName: "NEBA Café",
  phone: "+251 91 123 4567",
  email: "hello@nebacafe.com",
  address: "Piassa, Next to Kibru Hospital, Hawassa, Ethiopia.",
  openingHours: "Mon – Sun: 7:00 AM – 10:00 PM",
  deliveryFee: 90, // Legacy fallback
  cafeLatitude: null, // Left NULL until confirmed by owner
  cafeLongitude: null, // Left NULL until confirmed by owner
  pricePerKm: 20,
  minDeliveryFee: 50,
  maxDeliveryDistanceKm: 15,
  deliveryEnabled: true,
  roundingRule: "nearest_5",
  theme: "light",
  showToasts: true,
};

/**
 * Applies the selected theme class to the document root element.
 * Toggles the `.dark` class defined in styles.css.
 */
export function applyTheme(theme: ThemePreference): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

const parseCoordinate = (val: unknown, min: number, max: number): number | null => {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return !isNaN(num) && num >= min && num <= max ? num : null;
};

/**
 * Normalizes a raw Supabase store_settings record and merges with local browser preferences.
 */
export function normalizeStoreSettings(
  row?: Partial<StoreSettingsRow> | null,
  localPrefs?: Partial<NebaSettings>,
): NebaSettings {
  const currentLocal = localPrefs || readSettings();

  const parsedFee =
    row?.delivery_fee !== undefined && row?.delivery_fee !== null
      ? Number(row.delivery_fee)
      : undefined;

  const cafeLat = parseCoordinate(
    row?.cafe_latitude !== undefined ? row.cafe_latitude : currentLocal.cafeLatitude,
    -90,
    90,
  );
  const cafeLng = parseCoordinate(
    row?.cafe_longitude !== undefined ? row.cafe_longitude : currentLocal.cafeLongitude,
    -180,
    180,
  );

  const parsedPricePerKm = Number(
    row?.price_per_km !== undefined ? row.price_per_km : currentLocal.pricePerKm,
  );
  const pricePerKm =
    !isNaN(parsedPricePerKm) && parsedPricePerKm >= 0
      ? parsedPricePerKm
      : DEFAULT_SETTINGS.pricePerKm;

  const parsedMinFee = Number(
    row?.min_delivery_fee !== undefined ? row.min_delivery_fee : currentLocal.minDeliveryFee,
  );
  const minDeliveryFee =
    !isNaN(parsedMinFee) && parsedMinFee >= 0 ? parsedMinFee : DEFAULT_SETTINGS.minDeliveryFee;

  const parsedMaxDist = Number(
    row?.max_delivery_distance_km !== undefined
      ? row.max_delivery_distance_km
      : currentLocal.maxDeliveryDistanceKm,
  );
  const maxDeliveryDistanceKm =
    !isNaN(parsedMaxDist) && parsedMaxDist > 0
      ? parsedMaxDist
      : DEFAULT_SETTINGS.maxDeliveryDistanceKm;

  const deliveryEnabled =
    typeof row?.delivery_enabled === "boolean"
      ? row.delivery_enabled
      : typeof currentLocal.deliveryEnabled === "boolean"
        ? currentLocal.deliveryEnabled
        : DEFAULT_SETTINGS.deliveryEnabled;

  const validRoundingRules: DeliveryRoundingRule[] = ["none", "nearest_1", "nearest_5", "ceil"];
  const rawRule = (row?.rounding_rule ||
    currentLocal.roundingRule ||
    DEFAULT_SETTINGS.roundingRule) as DeliveryRoundingRule;
  const roundingRule = validRoundingRules.includes(rawRule)
    ? rawRule
    : DEFAULT_SETTINGS.roundingRule;

  return {
    cafeName:
      typeof row?.cafe_name === "string" && row.cafe_name.trim()
        ? row.cafe_name.trim()
        : DEFAULT_SETTINGS.cafeName,
    phone:
      typeof row?.phone === "string" && row.phone.trim()
        ? row.phone.trim()
        : DEFAULT_SETTINGS.phone,
    email:
      typeof row?.email === "string" && row.email.trim()
        ? row.email.trim()
        : DEFAULT_SETTINGS.email,
    address:
      typeof row?.address === "string" && row.address.trim()
        ? row.address.trim()
        : DEFAULT_SETTINGS.address,
    openingHours:
      typeof row?.opening_hours === "string" && row.opening_hours.trim()
        ? row.opening_hours.trim()
        : DEFAULT_SETTINGS.openingHours,
    deliveryFee:
      typeof parsedFee === "number" && !isNaN(parsedFee) && parsedFee >= 0
        ? parsedFee
        : typeof currentLocal.deliveryFee === "number" && !isNaN(currentLocal.deliveryFee)
          ? currentLocal.deliveryFee
          : DEFAULT_SETTINGS.deliveryFee,
    cafeLatitude: cafeLat,
    cafeLongitude: cafeLng,
    pricePerKm,
    minDeliveryFee,
    maxDeliveryDistanceKm,
    deliveryEnabled,
    roundingRule,
    theme: currentLocal.theme || DEFAULT_SETTINGS.theme,
    showToasts:
      typeof currentLocal.showToasts === "boolean"
        ? currentLocal.showToasts
        : DEFAULT_SETTINGS.showToasts,
  };
}

/**
 * Safely reads settings from localStorage with fallback defaults.
 * Crash-proof against null, undefined, or malformed JSON.
 */
export function readSettings(): NebaSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };

    const parsedDeliveryFee =
      typeof parsed.deliveryFee === "number" &&
      !isNaN(parsed.deliveryFee) &&
      parsed.deliveryFee >= 0
        ? parsed.deliveryFee
        : DEFAULT_SETTINGS.deliveryFee;

    const cafeLat = parseCoordinate(parsed.cafeLatitude, -90, 90);
    const cafeLng = parseCoordinate(parsed.cafeLongitude, -180, 180);

    const pricePerKmNum = Number(parsed.pricePerKm);
    const pricePerKm =
      !isNaN(pricePerKmNum) && pricePerKmNum >= 0 ? pricePerKmNum : DEFAULT_SETTINGS.pricePerKm;

    const minFeeNum = Number(parsed.minDeliveryFee);
    const minDeliveryFee =
      !isNaN(minFeeNum) && minFeeNum >= 0 ? minFeeNum : DEFAULT_SETTINGS.minDeliveryFee;

    const maxDistNum = Number(parsed.maxDeliveryDistanceKm);
    const maxDeliveryDistanceKm =
      !isNaN(maxDistNum) && maxDistNum > 0 ? maxDistNum : DEFAULT_SETTINGS.maxDeliveryDistanceKm;

    const deliveryEnabled =
      typeof parsed.deliveryEnabled === "boolean"
        ? parsed.deliveryEnabled
        : DEFAULT_SETTINGS.deliveryEnabled;

    const validRoundingRules: DeliveryRoundingRule[] = ["none", "nearest_1", "nearest_5", "ceil"];
    const roundingRule = validRoundingRules.includes(parsed.roundingRule)
      ? (parsed.roundingRule as DeliveryRoundingRule)
      : DEFAULT_SETTINGS.roundingRule;

    return {
      cafeName:
        typeof parsed.cafeName === "string" && parsed.cafeName.trim()
          ? parsed.cafeName.trim()
          : DEFAULT_SETTINGS.cafeName,
      phone:
        typeof parsed.phone === "string" && parsed.phone.trim()
          ? parsed.phone.trim()
          : DEFAULT_SETTINGS.phone,
      email:
        typeof parsed.email === "string" && parsed.email.trim()
          ? parsed.email.trim()
          : DEFAULT_SETTINGS.email,
      address:
        typeof parsed.address === "string" && parsed.address.trim()
          ? parsed.address.trim()
          : DEFAULT_SETTINGS.address,
      openingHours:
        typeof parsed.openingHours === "string" && parsed.openingHours.trim()
          ? parsed.openingHours.trim()
          : DEFAULT_SETTINGS.openingHours,
      deliveryFee: parsedDeliveryFee,
      cafeLatitude: cafeLat,
      cafeLongitude: cafeLng,
      pricePerKm,
      minDeliveryFee,
      maxDeliveryDistanceKm,
      deliveryEnabled,
      roundingRule,
      theme:
        parsed.theme === "dark" || parsed.theme === "light" || parsed.theme === "system"
          ? parsed.theme
          : DEFAULT_SETTINGS.theme,
      showToasts:
        typeof parsed.showToasts === "boolean" ? parsed.showToasts : DEFAULT_SETTINGS.showToasts,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Writes browser workspace preferences to localStorage and applies the theme to the DOM.
 */
export function writeSettings(settings: NebaSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    applyTheme(settings.theme);
  } catch {
    // Ignore storage quota or disabled localStorage errors
  }
}

/**
 * Resets settings back to original defaults.
 * Does NOT touch or delete orders, promotions, or roles.
 */
export function resetSettings(): NebaSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    applyTheme(DEFAULT_SETTINGS.theme);
  } catch {
    // ignore
  }

  return { ...DEFAULT_SETTINGS };
}

const STORE_SETTINGS_COLUMNS =
  "id, cafe_name, phone, email, address, opening_hours, delivery_fee, cafe_latitude, cafe_longitude, price_per_km, min_delivery_fee, max_delivery_distance_km, delivery_enabled, rounding_rule, updated_at";

/**
 * Fetches store settings from the server API (/api/settings) which accesses public.store_settings.
 * Merges with local browser preferences (theme, showToasts).
 * Falls back to direct Supabase client query or defaults gracefully.
 */
export async function fetchStoreSettings(): Promise<{
  data: NebaSettings | null;
  error: Error | null;
}> {
  try {
    // 1. Primary: fetch via server API endpoint /api/settings
    if (typeof window !== "undefined") {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch("/api/settings", {
          credentials: "same-origin",
          headers,
        });
        if (response.ok) {
          const raw = await response.json();
          const localPrefs = readSettings();
          const settings = normalizeStoreSettings(raw, localPrefs);
          return { data: settings, error: null };
        }
      } catch {
        /* proceed to direct Supabase query fallback */
      }
    }

    // 2. Fallback: query Supabase public.store_settings singleton row
    const { data, error } = await (supabase.from("store_settings" as any) as any)
      .select(STORE_SETTINGS_COLUMNS)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[settings] Direct store_settings query error:", error.message);
    }

    const localPrefs = readSettings();
    const settings = normalizeStoreSettings(data, localPrefs);
    return { data: settings, error: null };
  } catch (err: any) {
    console.error("[settings] Failed to load store settings:", err);
    return {
      data: normalizeStoreSettings(null, readSettings()),
      error: null,
    };
  }
}

/**
 * Persists store settings via server API (/api/settings) with active admin Bearer token.
 * Persists business fields to Supabase and saves browser preferences locally.
 */
export async function updateStoreSettings(settings: NebaSettings): Promise<{
  data: NebaSettings | null;
  error: Error | null;
}> {
  try {
    const deliveryFeeNum = Number(settings.deliveryFee);
    const safeDeliveryFee = isNaN(deliveryFeeNum) || deliveryFeeNum < 0 ? 0 : deliveryFeeNum;

    const payload = {
      cafeName: settings.cafeName.trim() || DEFAULT_SETTINGS.cafeName,
      phone: settings.phone.trim() || DEFAULT_SETTINGS.phone,
      email: settings.email.trim() || DEFAULT_SETTINGS.email,
      address: settings.address.trim() || DEFAULT_SETTINGS.address,
      openingHours: settings.openingHours.trim() || DEFAULT_SETTINGS.openingHours,
      deliveryFee: safeDeliveryFee,
      cafeLatitude:
        settings.cafeLatitude !== null && !isNaN(Number(settings.cafeLatitude))
          ? Number(settings.cafeLatitude)
          : null,
      cafeLongitude:
        settings.cafeLongitude !== null && !isNaN(Number(settings.cafeLongitude))
          ? Number(settings.cafeLongitude)
          : null,
      pricePerKm: Math.max(0, Number(settings.pricePerKm) || 0),
      minDeliveryFee: Math.max(0, Number(settings.minDeliveryFee) || 0),
      maxDeliveryDistanceKm: Math.max(0.1, Number(settings.maxDeliveryDistanceKm) || 15),
      deliveryEnabled: Boolean(settings.deliveryEnabled),
      roundingRule: settings.roundingRule || "nearest_5",
    };

    // 1. Primary: send via authenticated server API /api/settings
    if (typeof window !== "undefined") {
      const token = await getValidAccessToken();
      if (!token) {
        return {
          data: null,
          error: new Error("Authentication required. Please sign in as an administrator."),
        };
      }

      const headers = await getAuthHeaders({
        "Content-Type": "application/json",
      });

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const savedData = await response.json();
        // Save browser workspace preferences locally
        writeSettings(settings);

        const updated = normalizeStoreSettings(savedData, {
          theme: settings.theme,
          showToasts: settings.showToasts,
        });

        return { data: updated, error: null };
      } else {
        const errPayload = await response.json().catch(() => null);
        const errMsg =
          response.status === 401
            ? "Authentication required. Your session may have expired. Please sign in again."
            : errPayload?.message || `Failed to save settings (HTTP ${response.status})`;
        return { data: null, error: new Error(errMsg) };
      }
    }

    // 2. Server/non-browser fallback: direct Supabase query with singleton row
    const dbPayload = {
      cafe_name: payload.cafeName,
      phone: payload.phone,
      email: payload.email,
      address: payload.address,
      opening_hours: payload.openingHours,
      delivery_fee: payload.deliveryFee,
      cafe_latitude: payload.cafeLatitude,
      cafe_longitude: payload.cafeLongitude,
      price_per_km: payload.pricePerKm,
      min_delivery_fee: payload.minDeliveryFee,
      max_delivery_distance_km: payload.maxDeliveryDistanceKm,
      delivery_enabled: payload.deliveryEnabled,
      rounding_rule: payload.roundingRule,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await (supabase.from("store_settings" as any) as any)
      .select("id")
      .limit(1)
      .maybeSingle();

    let query;
    if (existing?.id) {
      query = (supabase.from("store_settings" as any) as any)
        .update(dbPayload)
        .eq("id", existing.id)
        .select(STORE_SETTINGS_COLUMNS)
        .single();
    } else {
      query = (supabase.from("store_settings" as any) as any)
        .insert(dbPayload)
        .select(STORE_SETTINGS_COLUMNS)
        .single();
    }

    const { data, error } = await query;
    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    writeSettings(settings);
    const updated = normalizeStoreSettings(data, {
      theme: settings.theme,
      showToasts: settings.showToasts,
    });
    return { data: updated, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to update store settings"),
    };
  }
}
