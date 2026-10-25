/**
 * ============================================================================
 * Rekik Café — Payment Account Settings Service (src/lib/payment-settings.ts)
 * ============================================================================
 * Centralised data access and realtime subscription layer for public.payment_account_settings.
 *
 * Ensures customer checkout, order tracking, and admin management always retrieve
 * and display the authoritative, live CBE bank account and Telebirr payment details.
 */

import { supabase } from "@/lib/supabase";

export type PaymentMethodType = "telebirr" | "cbe";

export interface PaymentAccountSetting {
  id: string;
  payment_method: PaymentMethodType;
  account_number: string;
  account_owner_name: string;
  is_active: boolean;
  created_at?: string | undefined;
  updated_at?: string | undefined;
}

export interface UpsertPaymentAccountInput {
  id?: string | undefined;
  payment_method: PaymentMethodType;
  account_number: string;
  account_owner_name: string;
  is_active?: boolean | undefined;
}

export interface PaymentAccountSettingsMap {
  cbe: PaymentAccountSetting | null;
  telebirr: PaymentAccountSetting | null;
}

/**
 * Default fallback receiving account details formatted for display cards.
 */
export const DEFAULT_RECEIVING_ACCOUNTS: Record<
  PaymentMethodType,
  { label: string; accountNumber: string; ownerName: string; instructions: string }
> = {
  telebirr: {
    label: "Telebirr Mobile Payment",
    accountNumber: "0911 234 567",
    ownerName: "Rekik Coffee",
    instructions: "Pay via Telebirr SuperApp or USSD *127# to Till / Phone",
  },
  cbe: {
    label: "CBE Birr / Mobile Banking",
    accountNumber: "1000 2345 67890",
    ownerName: "Rekik Coffee",
    instructions: "Transfer using Commercial Bank of Ethiopia (CBE) Mobile Banking / CBE Birr",
  },
};

/**
 * Default structured map fallback for checkout and order views.
 */
export const DEFAULT_PAYMENT_ACCOUNTS: PaymentAccountSettingsMap = {
  cbe: {
    id: "default-cbe",
    payment_method: "cbe",
    account_number: "1000 2345 67890",
    account_owner_name: "Commercial Bank of Ethiopia (CBE)",
    is_active: true,
  },
  telebirr: {
    id: "default-telebirr",
    payment_method: "telebirr",
    account_number: "0911 234 567",
    account_owner_name: "Telebirr Mobile Payment",
    is_active: true,
  },
};

/**
 * Normalizes an array of raw database payment_account_settings rows into a
 * structured map keyed by payment method ("cbe" and "telebirr").
 */
export function normalizePaymentAccountRows(
  rows?: Partial<PaymentAccountSetting>[] | null,
): PaymentAccountSettingsMap {
  const result: PaymentAccountSettingsMap = {
    cbe: null,
    telebirr: null,
  };

  if (!Array.isArray(rows)) return result;

  for (const row of rows) {
    if (!row) continue;
    const method = String(row.payment_method || "").toLowerCase().trim();
    if (method !== "cbe" && method !== "telebirr") continue;

    const setting: PaymentAccountSetting = {
      id: String(row.id || `pas-${method}`),
      payment_method: method as PaymentMethodType,
      account_number: String(row.account_number || "").trim(),
      account_owner_name: String(row.account_owner_name || "").trim(),
      is_active: row.is_active !== undefined && row.is_active !== null ? Boolean(row.is_active) : true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    if (method === "cbe") {
      result.cbe = setting;
    } else if (method === "telebirr") {
      result.telebirr = setting;
    }
  }

  return result;
}

/**
 * Fetches the latest saved payment account settings directly from Supabase
 * public.payment_account_settings, with a fallback to the internal API route
 * (/api/payment-settings) if RLS is restrictive before database migration.
 */
export async function fetchPaymentAccountSettings(): Promise<{
  data: PaymentAccountSettingsMap;
  error: Error | null;
}> {
  try {
    // 1. Primary: Direct query via browser Supabase client
    const { data: dbRows, error: dbErr } = await (supabase.from("payment_account_settings" as any) as any)
      .select("id, payment_method, account_number, account_owner_name, is_active, created_at, updated_at");

    if (!dbErr && Array.isArray(dbRows) && dbRows.length > 0) {
      return {
        data: normalizePaymentAccountRows(dbRows),
        error: null,
      };
    }

    // 2. Secondary fallback: Server-side API endpoint using server service-role client
    if (typeof window !== "undefined") {
      const res = await fetch("/api/payment-settings", {
        headers: { Accept: "application/json" },
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        if (json && Array.isArray(json.data) && json.data.length > 0) {
          return {
            data: normalizePaymentAccountRows(json.data),
            error: null,
          };
        }
      }
    }

    if (dbErr) {
      return {
        data: { cbe: null, telebirr: null },
        error: new Error(dbErr.message || "Failed to load payment account settings"),
      };
    }

    return {
      data: normalizePaymentAccountRows(dbRows || []),
      error: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error("Failed to load payment account settings");
    return {
      data: { cbe: null, telebirr: null },
      error,
    };
  }
}

/**
 * Updates a payment account setting (CBE or Telebirr) in Supabase public.payment_account_settings.
 * Restricted to authenticated administrators and staff.
 */
export async function updatePaymentAccountSetting(
  setting: {
    payment_method: string;
    account_number: string;
    account_owner_name: string;
    is_active: boolean;
  },
  token?: string,
): Promise<{ success: boolean; data?: PaymentAccountSetting; error?: Error }> {
  const method = setting.payment_method.toLowerCase().trim();
  const accountNumber = setting.account_number.trim();
  const accountOwner = setting.account_owner_name.trim();

  if (!accountNumber) {
    return { success: false, error: new Error("Account number is required.") };
  }
  if (!accountOwner) {
    return { success: false, error: new Error("Account owner / holder name is required.") };
  }

  const nowIso = new Date().toISOString();

  try {
    // 1. Try direct Supabase update
    const { data, error } = await (supabase.from("payment_account_settings" as any) as any)
      .update({
        account_number: accountNumber,
        account_owner_name: accountOwner,
        is_active: Boolean(setting.is_active),
        updated_at: nowIso,
      })
      .eq("payment_method", method)
      .select()
      .maybeSingle();

    if (!error && data) {
      return {
        success: true,
        data: {
          id: data.id,
          payment_method: data.payment_method,
          account_number: data.account_number,
          account_owner_name: data.account_owner_name,
          is_active: data.is_active,
          updated_at: data.updated_at,
        },
      };
    }

    // 2. Try server-side admin API endpoint if client RLS restricts update
    const res = await fetch("/api/admin/payment-settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        payment_method: method,
        account_number: accountNumber,
        account_owner_name: accountOwner,
        is_active: Boolean(setting.is_active),
      }),
    });

    if (res.ok) {
      const json = await res.json();
      return { success: true, data: json.data };
    }

    const errJson = await res.json().catch(() => ({}));
    return {
      success: false,
      error: new Error(errJson.message || error?.message || "Failed to update payment account settings"),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to update payment account setting"),
    };
  }
}

/**
 * Fetches all receiving accounts as an array.
 * If called with auth token, uses the authenticated admin endpoint.
 * Otherwise fetches the public active receiving accounts.
 */
export async function getPaymentAccountSettings(authToken?: string): Promise<PaymentAccountSetting[]> {
  try {
    if (authToken) {
      const res = await fetch("/api/admin/payment-accounts", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    }

    // Direct Supabase query fallback (works with RLS SELECT policy)
    const { data, error } = await supabase
      .from("payment_account_settings")
      .select("id, payment_method, account_number, account_owner_name, is_active, created_at, updated_at")
      .order("payment_method", { ascending: true });

    if (!error && Array.isArray(data)) {
      return data as PaymentAccountSetting[];
    }
  } catch (err) {
    console.error("[payment-settings] Failed to fetch payment account settings:", err);
  }

  return [];
}

/**
 * Saves (creates or updates) a receiving mobile-banking account in Supabase.
 */
export async function savePaymentAccountSetting(
  input: UpsertPaymentAccountInput,
  authToken?: string,
): Promise<PaymentAccountSetting> {
  const method = input.payment_method.trim().toLowerCase() as PaymentMethodType;
  if (method !== "telebirr" && method !== "cbe") {
    throw new Error("Invalid payment method. Supported providers are Telebirr and CBE.");
  }

  const accountNumber = input.account_number.trim();
  if (!accountNumber || accountNumber.length < 3) {
    throw new Error("Account number is required (minimum 3 characters).");
  }

  const ownerName = input.account_owner_name.trim();
  if (!ownerName || ownerName.length < 2) {
    throw new Error("Account owner name is required (minimum 2 characters).");
  }

  const isActive = input.is_active !== undefined ? Boolean(input.is_active) : true;

  // 1. If admin auth token is available, use trusted server endpoint
  if (authToken) {
    const res = await fetch("/api/admin/payment-accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        id: input.id,
        payment_method: method,
        account_number: accountNumber,
        account_owner_name: ownerName,
        is_active: isActive,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || json.error || "Failed to save receiving account settings.");
    }
    return json.account as PaymentAccountSetting;
  }

  // 2. Direct Supabase client upsert (subject to RLS)
  const nowIso = new Date().toISOString();
  const payload: any = {
    payment_method: method,
    account_number: accountNumber,
    account_owner_name: ownerName,
    is_active: isActive,
    updated_at: nowIso,
  };
  if (input.id) {
    payload.id = input.id;
  }

  const { data, error } = await supabase
    .from("payment_account_settings")
    .upsert(payload, { onConflict: "payment_method" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save receiving account: ${error.message}`);
  }

  return data as PaymentAccountSetting;
}
