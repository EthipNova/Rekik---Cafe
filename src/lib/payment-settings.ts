import { supabase } from "@/lib/supabase";

export type PaymentMethodType = "telebirr" | "cbe";

export interface PaymentAccountSetting {
  id: string;
  payment_method: PaymentMethodType;
  account_number: string;
  account_owner_name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UpsertPaymentAccountInput {
  id?: string | undefined;
  payment_method: PaymentMethodType;
  account_number: string;
  account_owner_name: string;
  is_active?: boolean | undefined;
}

/**
 * Default fallback receiving account details when no database record is set.
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
 * Fetches all receiving accounts.
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
