import { serverSupabase } from "./supabase";

export interface PaymentAccountRecord {
  id: string;
  payment_method: "telebirr" | "cbe";
  account_number: string;
  account_owner_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertPaymentAccountInput {
  id?: string | undefined;
  payment_method: string;
  account_number: string;
  account_owner_name: string;
  is_active?: boolean | undefined;
}

/**
 * Public safe read of active mobile banking accounts for customer checkout.
 * Exposes only verified operational receiving accounts.
 */
export async function getPublicPaymentAccounts(): Promise<
  Array<Pick<PaymentAccountRecord, "id" | "payment_method" | "account_number" | "account_owner_name" | "is_active">>
> {
  const { data, error } = await serverSupabase
    .from("payment_account_settings")
    .select("id, payment_method, account_number, account_owner_name, is_active")
    .eq("is_active", true)
    .order("payment_method", { ascending: true });

  if (error) {
    console.error("[payment-accounts] Error loading public payment accounts:", error.message);
    return [];
  }

  return (data || []) as PaymentAccountRecord[];
}

/**
 * Admin view of all receiving mobile banking accounts.
 */
export async function getAdminPaymentAccounts(): Promise<PaymentAccountRecord[]> {
  const { data, error } = await serverSupabase
    .from("payment_account_settings")
    .select("id, payment_method, account_number, account_owner_name, is_active, created_at, updated_at")
    .order("payment_method", { ascending: true });

  if (error) {
    console.error("[payment-accounts] Error loading admin payment accounts:", error.message);
    throw new Error(`Failed to load payment accounts: ${error.message}`);
  }

  return (data || []) as PaymentAccountRecord[];
}

/**
 * Creates or updates a receiving mobile-banking account in public.payment_account_settings.
 */
export async function upsertPaymentAccount(input: UpsertPaymentAccountInput): Promise<PaymentAccountRecord> {
  const method = (input.payment_method || "").trim().toLowerCase();
  if (method !== "telebirr" && method !== "cbe") {
    const err = new Error("Invalid payment method. Only 'telebirr' and 'cbe' are supported.");
    (err as any).statusCode = 400;
    throw err;
  }

  const accountNumber = (input.account_number || "").trim();
  if (!accountNumber || accountNumber.length < 3) {
    const err = new Error("Account number is required (at least 3 characters).");
    (err as any).statusCode = 400;
    throw err;
  }

  const ownerName = (input.account_owner_name || "").trim();
  if (!ownerName || ownerName.length < 2) {
    const err = new Error("Account owner name is required (at least 2 characters).");
    (err as any).statusCode = 400;
    throw err;
  }

  const isActive = input.is_active !== undefined ? Boolean(input.is_active) : true;
  const nowIso = new Date().toISOString();

  // 1. Check if record with this id exists or with this payment_method exists
  let targetId = input.id;
  if (!targetId) {
    const { data: existing } = await serverSupabase
      .from("payment_account_settings")
      .select("id")
      .eq("payment_method", method)
      .maybeSingle();

    if (existing?.id) {
      targetId = existing.id;
    }
  }

  if (targetId) {
    // UPDATE existing record
    const { data: updated, error: updateErr } = await serverSupabase
      .from("payment_account_settings")
      .update({
        account_number: accountNumber,
        account_owner_name: ownerName,
        is_active: isActive,
        updated_at: nowIso,
      })
      .eq("id", targetId)
      .select("*")
      .single();

    if (updateErr) {
      console.error("[payment-accounts] Update error:", updateErr.message);
      const err = new Error(`Failed to update receiving account: ${updateErr.message}`);
      (err as any).statusCode = 500;
      throw err;
    }

    return updated as PaymentAccountRecord;
  }

  // INSERT new record
  const { data: inserted, error: insertErr } = await serverSupabase
    .from("payment_account_settings")
    .insert({
      payment_method: method,
      account_number: accountNumber,
      account_owner_name: ownerName,
      is_active: isActive,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (insertErr) {
    console.error("[payment-accounts] Insert error:", insertErr.message);
    const err = new Error(`Failed to create receiving account: ${insertErr.message}`);
    (err as any).statusCode = insertErr.code === "23505" ? 409 : 500;
    throw err;
  }

  return inserted as PaymentAccountRecord;
}
