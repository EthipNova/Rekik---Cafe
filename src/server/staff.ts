/**
 * ============================================================================
 * Rekik Café — Server Staff Management & Registration Service
 * File: src/server/staff.ts
 * ============================================================================
 * Handles trusted server-side account creation for Waiter and Cashier staff,
 * enforces administrative authorization, guarantees partial-failure cleanup,
 * and maintains role isolation without leaking secrets or passwords.
 */

import { serverSupabase } from "./supabase";
import {
  allocateStaffId,
  getStaffIdForUserId,
  markStaffIdDeleted,
  getNextStaffId,
  BASELINE_STAFF_MAPPING,
} from "./staff-id";

export const DESIGNATED_ADMIN_ID = "e145d152-0ecb-43d6-863c-06fa40c12db4";

export interface RegisterStaffInput {
  name: string;
  email?: string;
  password: string;
  role: "waiter" | "cashier";
  phone?: string | null | undefined;
}

export interface StaffSummary {
  id: string;
  userId?: string;
  staffId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  phone: string | null;
  createdAt: string;
  updatedAt: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\s()-]{7,20}$/;

/**
 * Validates staff registration input fields strictly.
 * The form contains name, email, password, and phone number.
 * The role selector is separate and only permits 'waiter' or 'cashier'.
 */
export function validateStaffRegistrationInput(input: RegisterStaffInput): {
  valid: boolean;
  error?: string;
  field?: "name" | "email" | "password" | "role" | "phone";
} {
  const name = (input.name || "").trim();
  if (!name || name.length < 2) {
    return {
      valid: false,
      error: "Staff member's full name is required (minimum 2 characters).",
      field: "name",
    };
  }

  const email = (input.email || "").trim().toLowerCase();
  if (email && !EMAIL_REGEX.test(email)) {
    return { valid: false, error: "A valid email address is required.", field: "email" };
  }

  const password = input.password || "";
  if (!password || password.length < 6) {
    return {
      valid: false,
      error: "Password must be at least 6 characters in length.",
      field: "password",
    };
  }

  const role = (input.role || "").trim().toLowerCase();
  if (role !== "waiter" && role !== "cashier") {
    return {
      valid: false,
      error:
        "Role selector only permits 'waiter' or 'cashier'. Administrative roles cannot be registered through this form.",
      field: "role",
    };
  }

  if (input.phone) {
    const cleaned = input.phone.trim();
    if (cleaned && !PHONE_REGEX.test(cleaned)) {
      return {
        valid: false,
        error: "Enter a valid phone number (at least 7 digits, e.g. +251 91 123 4567 or 0911234567).",
        field: "phone",
      };
    }
  }

  return { valid: true };
}

/**
 * Lists registered staff (specifically waiters, cashiers, and active staff)
 * with real email addresses resolved from public.users / staff_profiles.
 */
export async function getRegisteredStaffList(): Promise<StaffSummary[]> {
  // 1. Fetch all staff profiles
  let profiles: any[] | null = null;
  const { data: pData, error: profErr } = await (
    serverSupabase.from("staff_profiles" as any) as any
  )
    .select("user_id, full_name, role, is_active, phone, created_at, updated_at, staff_id")
    .order("created_at", { ascending: false });

  if (profErr) {
    const { data: fallbackProfiles, error: fallbackErr } = await (
      serverSupabase.from("staff_profiles" as any) as any
    )
      .select("user_id, full_name, role, is_active, phone, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (fallbackErr) {
      console.error("[staff] Failed to load staff_profiles:", fallbackErr.message);
      throw new Error(`Failed to load staff list: ${fallbackErr.message}`);
    }
    profiles = fallbackProfiles;
  } else {
    profiles = pData;
  }

  // 2. Fetch all users to resolve emails in case staff_profiles.email is not yet populated
  const { data: users, error: userErr } = await (serverSupabase.from("users" as any) as any).select(
    "id, email, full_name",
  );

  const emailMap = new Map<string, string>();
  if (!userErr && Array.isArray(users)) {
    users.forEach((u: { id: string; email: string }) => {
      if (u.id && u.email) emailMap.set(u.id, u.email);
    });
  }

  // 3. Resolve staffId for every profile (guaranteeing everyone has a readable Staff ID)
  const summaries: StaffSummary[] = [];
  for (const p of profiles || []) {
    let staffId = p.staff_id || getStaffIdForUserId(p.user_id);
    if (!staffId) {
      staffId = await allocateStaffId({
        userId: p.user_id,
        name: p.full_name || "Staff Member",
        role: p.role || "staff",
        email: p.email || emailMap.get(p.user_id),
      });
    }

    summaries.push({
      id: p.user_id,
      userId: p.user_id,
      staffId,
      name: p.full_name || "Staff Member",
      email: p.email || emailMap.get(p.user_id) || "—",
      role: (p.role || "staff").toLowerCase(),
      isActive: p.is_active !== false,
      phone: p.phone || null,
      createdAt: p.created_at || new Date().toISOString(),
      updatedAt: p.updated_at || null,
    });
  }

  return summaries;
}

/**
 * Registers a new Waiter or Cashier account securely using Supabase Auth Admin API.
 * Guarantees atomic creation and rolls back partial failures.
 */
export async function registerStaffMember(
  input: RegisterStaffInput,
  adminUserId?: string,
): Promise<StaffSummary> {
  const validation = validateStaffRegistrationInput(input);
  if (!validation.valid) {
    const err = new Error(validation.error);
    (err as any).statusCode = 400;
    (err as any).field = validation.field;
    throw err;
  }

  const name = input.name.trim();
  const role = input.role.toLowerCase() as "waiter" | "cashier";
  const phone = input.phone?.trim() || null;

  // 0. Auto-generate next permanent Staff ID
  const { staffId } = await getNextStaffId();

  // If email was not provided or blank, generate an internal email mapped to staffId
  const email = (input.email && input.email.trim())
    ? input.email.trim().toLowerCase()
    : `staff.${staffId.toLowerCase().replace(/[^a-z0-9]/g, "")}@rekikcafe.local`;

  const password = input.password;

  // 1. Check for duplicate email in public.users
  const { data: existingUser } = await (serverSupabase.from("users" as any) as any)
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    const err = new Error("A staff member or user with this email address already exists.");
    (err as any).statusCode = 409;
    throw err;
  }

  // 2. Create the user in Supabase Auth securely
  const { data: authData, error: authErr } = await serverSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm since created directly by authorized administrator
    user_metadata: {
      full_name: name,
      role,
      staff_id: staffId,
      ...(phone ? { phone } : {}),
    },
  });

  if (authErr) {
    const msg = authErr.message || "";
    const isDuplicate =
      msg.toLowerCase().includes("already registered") ||
      msg.toLowerCase().includes("already exists") ||
      authErr.code === "23505";

    const err = new Error(
      isDuplicate
        ? "A staff member or user with this email address already exists."
        : `Supabase Auth error: ${msg}`,
    );
    (err as any).statusCode = isDuplicate ? 409 : 400;
    throw err;
  }

  const newUserId = authData.user.id;

  // 3. Persist public.users and public.staff_profiles with rollback on partial failure
  try {
    // 3a. Upsert public.users
    const { error: userInsertErr } = await (serverSupabase.from("users" as any) as any).upsert(
      {
        id: newUserId,
        email,
        full_name: name,
        role: "STAFF",
        phone,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (userInsertErr) {
      throw userInsertErr;
    }

    // 3b. Upsert public.staff_profiles
    // First try with email column
    let staffInsertErr: any = null;
    const { error: errWithEmail } = await (
      serverSupabase.from("staff_profiles" as any) as any
    ).upsert(
      {
        user_id: newUserId,
        full_name: name,
        email,
        phone,
        role,
        staff_id: staffId,
        is_active: true,
        is_available: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (errWithEmail) {
      // If error indicates column 'email' does not exist yet (pre-migration) or not in PostgREST schema cache, retry without email column
      const isMissingEmailCol =
        errWithEmail.code === "42703" ||
        errWithEmail.code === "PGRST204" ||
        (errWithEmail.message &&
          errWithEmail.message.toLowerCase().includes("email") &&
          (errWithEmail.message.toLowerCase().includes("column") ||
            errWithEmail.message.toLowerCase().includes("schema cache")));

      if (isMissingEmailCol) {
        const { error: fallbackErr } = await (
          serverSupabase.from("staff_profiles" as any) as any
        ).upsert(
          {
            user_id: newUserId,
            full_name: name,
            phone,
            role,
            is_active: true,
            is_available: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        staffInsertErr = fallbackErr;
      } else {
        staffInsertErr = errWithEmail;
      }
    }

    if (staffInsertErr) {
      throw staffInsertErr;
    }

    // 4. Log admin audit event if table is available
    try {
      await (serverSupabase.from("audit_logs" as any) as any).insert({
        action: "register_staff_account",
        entity_type: "staff_profiles",
        entity_id: newUserId,
        details: {
          name,
          email,
          role,
          phone,
          registered_by: adminUserId || "administrator",
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Non-critical audit logging failure
    }

    await allocateStaffId({
      userId: newUserId,
      name,
      role,
      email,
      customStaffId: staffId,
    });

    return {
      id: newUserId,
      userId: newUserId,
      staffId,
      name,
      email,
      role,
      isActive: true,
      phone,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  } catch (dbErr: any) {
    // 5. Atomic Rollback: remove created Supabase Auth account so no orphaned account exists
    console.error(
      "[staff] Database profile initialization failed, rolling back Auth user:",
      dbErr.message,
    );
    try {
      await serverSupabase.auth.admin.deleteUser(newUserId);
    } catch (cleanupErr: any) {
      console.error("[staff] Cleanup of orphaned auth user failed:", cleanupErr.message);
    }

    const err = new Error(`Failed to initialize staff database profile: ${dbErr.message}`);
    (err as any).statusCode = 500;
    throw err;
  }
}

/**
 * Toggles or updates the active status of a staff member.
 * Protects against deactivating self and modifying administrator accounts.
 */
export async function updateStaffActiveStatus(
  targetUserId: string,
  isActive: boolean,
  adminUserId: string,
): Promise<{ success: boolean; userId: string; isActive: boolean; staff?: { userId: string; isActive: boolean } }> {
  if (!targetUserId) {
    const err = new Error("Target user ID is required.");
    (err as any).statusCode = 400;
    throw err;
  }

  // Guard 0: Authoritative single admin protection - designated administrator cannot be deactivated
  if (targetUserId === DESIGNATED_ADMIN_ID) {
    const err = new Error("Administrator and Owner accounts cannot be deactivated via staff management.");
    (err as any).statusCode = 403;
    throw err;
  }

  // Guard 1: Cannot modify own status
  if (targetUserId === adminUserId) {
    const err = new Error("You cannot change the active status of your own administrator account.");
    (err as any).statusCode = 400;
    throw err;
  }

  // Guard 2: Inspect target profile - ensure not modifying administrator/owner
  let targetProfile: { role?: string; full_name?: string; is_active?: boolean } | null = null;
  try {
    const { data } = await (serverSupabase.from("staff_profiles" as any) as any)
      .select("role, full_name, is_active")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (data) {
      targetProfile = data;
    }
  } catch {
    /* fallback to local baseline */
  }

  if (!targetProfile) {
    const baseline = BASELINE_STAFF_MAPPING.find((b) => b.userId === targetUserId);
    if (baseline) {
      targetProfile = { role: baseline.role, full_name: baseline.name, is_active: baseline.isActive ?? true };
    }
  }

  if (!targetProfile) {
    const err = new Error("Staff profile not found.");
    (err as any).statusCode = 404;
    throw err;
  }

  const roleLower = (targetProfile.role || "").toLowerCase().trim();
  if (["admin", "owner", "manager"].includes(roleLower)) {
    const err = new Error(
      "Administrator and Owner accounts cannot be deactivated via staff management.",
    );
    (err as any).statusCode = 403;
    throw err;
  }

  // 3. Update staff_profiles table
  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    is_active: isActive,
    updated_at: nowIso,
  };
  if (!isActive) {
    // If deactivating, also mark unavailable
    updatePayload["is_available"] = false;
  }

  const { error: updateErr } = await (serverSupabase.from("staff_profiles" as any) as any)
    .update(updatePayload)
    .eq("user_id", targetUserId);

  if (updateErr) {
    const err = new Error(`Failed to update staff status: ${updateErr.message}`);
    (err as any).statusCode = 500;
    throw err;
  }

  // 4. Log status change audit
  try {
    await (serverSupabase.from("audit_logs" as any) as any).insert({
      action: isActive ? "activate_staff_account" : "deactivate_staff_account",
      entity_type: "staff_profiles",
      entity_id: targetUserId,
      details: {
        target_name: targetProfile.full_name,
        target_role: targetProfile.role,
        changed_by: adminUserId,
        is_active: isActive,
      },
      created_at: nowIso,
    });
  } catch {
    // Non-critical audit logging failure
  }

  return {
    success: true,
    userId: targetUserId,
    isActive,
    staff: { userId: targetUserId, isActive },
  };
}

export interface DeleteStaffResult {
  success: boolean;
  userId: string;
  isDeleted: boolean;
  isArchived: boolean;
  message: string;
}

/**
 * Safely removes or archives a staff account.
 * If the staff member has historical records (orders, payments, approvals),
 * prevents deleting business records by revoking credentials and deactivating the account.
 * If the staff member has no business records, permanently deletes the account from auth and database.
 */
export async function deleteStaffMember(
  targetUserId: string,
  adminUserId: string,
): Promise<DeleteStaffResult> {
  if (!targetUserId) {
    const err = new Error("Target user ID is required.");
    (err as any).statusCode = 400;
    throw err;
  }

  // Guard 0: Authoritative single admin protection - designated administrator cannot be deleted
  if (targetUserId === DESIGNATED_ADMIN_ID) {
    const err = new Error("Administrator and Owner accounts cannot be deleted via staff management.");
    (err as any).statusCode = 403;
    throw err;
  }

  // Guard 1: Cannot delete self
  if (targetUserId === adminUserId) {
    const err = new Error("You cannot delete your own administrator account.");
    (err as any).statusCode = 400;
    throw err;
  }

  // Guard 2: Inspect target profile - ensure not deleting administrator/owner
  let targetProfile: { role?: string; full_name?: string; is_active?: boolean; phone?: string | null } | null = null;
  try {
    const { data } = await (serverSupabase.from("staff_profiles" as any) as any)
      .select("role, full_name, is_active, phone")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (data) {
      targetProfile = data;
    }
  } catch {
    /* fallback to local baseline */
  }

  if (!targetProfile) {
    const baseline = BASELINE_STAFF_MAPPING.find((b) => b.userId === targetUserId);
    if (baseline) {
      targetProfile = { role: baseline.role, full_name: baseline.name, is_active: baseline.isActive ?? true };
    }
  }

  if (!targetProfile) {
    const err = new Error("Staff profile not found.");
    (err as any).statusCode = 404;
    throw err;
  }

  const roleLower = (targetProfile.role || "").toLowerCase().trim();
  if (["admin", "owner", "manager"].includes(roleLower)) {
    const err = new Error(
      "Administrator and Owner accounts cannot be deleted via staff management.",
    );
    (err as any).statusCode = 403;
    throw err;
  }

  // Check for historical business records (orders, payment reviews, approvals)
  let hasHistoricalOrders = false;
  let hasPaymentReviews = false;
  let hasApprovals = false;

  try {
    const { count: orderCount } = await (serverSupabase.from("orders" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("waiter_id", targetUserId);
    hasHistoricalOrders = Boolean(orderCount && orderCount > 0);
  } catch {
    /* ignore */
  }

  try {
    const { count: reviewCount } = await (serverSupabase.from("payment_reviews" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("cashier_id", targetUserId);
    hasPaymentReviews = Boolean(reviewCount && reviewCount > 0);
  } catch {
    /* ignore */
  }

  try {
    const { count: approvalCount } = await (serverSupabase.from("order_approvals" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("waiter_id", targetUserId);
    hasApprovals = Boolean(approvalCount && approvalCount > 0);
  } catch {
    /* ignore */
  }

  const hasBusinessRecords = hasHistoricalOrders || hasPaymentReviews || hasApprovals;

  if (hasBusinessRecords) {
    // PRESERVE HISTORICAL RECORDS STRATEGY:
    // Mark staff ID as deleted so it is never reused
    markStaffIdDeleted(targetUserId);

    // Deactivate account and revoke login credentials to preserve business and payment history.
    const nowIso = new Date().toISOString();
    await (serverSupabase.from("staff_profiles" as any) as any)
      .update({
        is_active: false,
        is_available: false,
        updated_at: nowIso,
      })
      .eq("user_id", targetUserId);

    try {
      await serverSupabase.auth.admin.updateUserById(targetUserId, {
        ban_duration: "876000h",
      });
    } catch {
      /* ignore */
    }

    try {
      await (serverSupabase.from("audit_logs" as any) as any).insert({
        action: "archive_staff_account",
        entity_type: "staff_profiles",
        entity_id: targetUserId,
        details: {
          target_name: targetProfile.full_name,
          target_role: targetProfile.role,
          deleted_by: adminUserId,
          reason: "Account archived to preserve historical business orders and payment records",
        },
        created_at: nowIso,
      });
    } catch {
      /* ignore */
    }

    return {
      success: true,
      userId: targetUserId,
      isDeleted: false,
      isArchived: true,
      message: `Staff member "${targetProfile.full_name}" has associated historical orders or payments. Their login credentials were permanently revoked and account deactivated to preserve business history.`,
    };
  }

  // NO HISTORICAL BUSINESS RECORDS: Perform safe permanent deletion
  markStaffIdDeleted(targetUserId);
  const nowIso = new Date().toISOString();
  try {
    // 1. Remove from staff_profiles
    await (serverSupabase.from("staff_profiles" as any) as any)
      .delete()
      .eq("user_id", targetUserId);

    // 2. Remove from public.users
    await (serverSupabase.from("users" as any) as any)
      .delete()
      .eq("id", targetUserId);

    // 3. Remove from Supabase Auth
    try {
      await serverSupabase.auth.admin.deleteUser(targetUserId);
    } catch (authDelErr: any) {
      console.warn("[staff] Auth user deletion warning:", authDelErr?.message);
    }

    try {
      await (serverSupabase.from("audit_logs" as any) as any).insert({
        action: "delete_staff_account",
        entity_type: "staff_profiles",
        entity_id: targetUserId,
        details: {
          target_name: targetProfile.full_name,
          target_role: targetProfile.role,
          deleted_by: adminUserId,
        },
        created_at: nowIso,
      });
    } catch {
      /* ignore */
    }

    return {
      success: true,
      userId: targetUserId,
      isDeleted: true,
      isArchived: false,
      message: `Staff account for "${targetProfile.full_name}" was permanently removed.`,
    };
  } catch (delErr: any) {
    const err = new Error(`Failed to delete staff account: ${delErr.message}`);
    (err as any).statusCode = 500;
    throw err;
  }
}

/**
 * Updates a waiter or cashier staff member's account password via the Supabase Auth Admin API.
 * Protected: prevents modifying administrator/owner accounts, requires min 6 characters.
 */
export async function updateStaffPassword(
  targetUserId: string,
  newPassword: string,
  adminUserId: string,
): Promise<{ success: boolean; userId: string; message: string }> {
  if (!targetUserId) {
    const err = new Error("Target user ID is required.");
    (err as any).statusCode = 400;
    throw err;
  }

  const cleanPassword = (newPassword || "").trim();
  if (cleanPassword.length < 6) {
    const err = new Error("Password must be at least 6 characters long.");
    (err as any).statusCode = 400;
    throw err;
  }

  if (!adminUserId) {
    const err = new Error("Admin authorization required.");
    (err as any).statusCode = 401;
    throw err;
  }

  // Guard: Inspect target profile to ensure account exists and is not administrator/owner
  const { data: targetProfile, error: fetchErr } = await (
    serverSupabase.from("staff_profiles" as any) as any
  )
    .select("role, full_name, is_active")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (fetchErr) {
    const err = new Error(`Failed to inspect target staff profile: ${fetchErr.message}`);
    (err as any).statusCode = 500;
    throw err;
  }

  if (!targetProfile) {
    const err = new Error("Staff profile not found.");
    (err as any).statusCode = 404;
    throw err;
  }

  const roleLower = (targetProfile.role || "").toLowerCase().trim();
  if (["admin", "owner", "manager"].includes(roleLower)) {
    const err = new Error(
      "Administrator and Owner passwords cannot be changed via staff password management.",
    );
    (err as any).statusCode = 403;
    throw err;
  }

  // Execute password change using server-side Supabase Auth Admin API
  const { error: updateErr } = await serverSupabase.auth.admin.updateUserById(targetUserId, {
    password: cleanPassword,
  });

  if (updateErr) {
    const err = new Error(`Failed to update password: ${updateErr.message}`);
    (err as any).statusCode = 500;
    throw err;
  }

  // Record audit log
  try {
    await (serverSupabase.from("audit_logs" as any) as any).insert({
      action: "update_staff_password",
      entity_type: "staff_profiles",
      entity_id: targetUserId,
      details: {
        target_name: targetProfile.full_name,
        target_role: targetProfile.role,
        updated_by: adminUserId,
      },
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical audit failure
  }

  return {
    success: true,
    userId: targetUserId,
    message: `Password updated successfully for ${targetProfile.full_name || "staff member"}.`,
  };
}
