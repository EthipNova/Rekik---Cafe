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

export interface RegisterStaffInput {
  name: string;
  email: string;
  password: string;
  role: "waiter" | "cashier";
}

export interface StaffSummary {
  id: string;
  userId?: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  phone: string | null;
  createdAt: string;
  updatedAt: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates staff registration input fields strictly.
 * The form contains ONLY name, email, and password.
 * The role selector is separate and only permits 'waiter' or 'cashier'.
 */
export function validateStaffRegistrationInput(input: RegisterStaffInput): {
  valid: boolean;
  error?: string;
  field?: "name" | "email" | "password" | "role";
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
  if (!email || !EMAIL_REGEX.test(email)) {
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

  return { valid: true };
}

/**
 * Lists registered staff (specifically waiters, cashiers, and active staff)
 * with real email addresses resolved from public.users / staff_profiles.
 */
export async function getRegisteredStaffList(): Promise<StaffSummary[]> {
  // 1. Fetch all staff profiles
  const { data: profiles, error: profErr } = await (
    serverSupabase.from("staff_profiles" as any) as any
  )
    .select("user_id, full_name, email, role, is_active, phone, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (profErr) {
    console.error("[staff] Failed to load staff_profiles:", profErr.message);
    throw new Error(`Failed to load staff list: ${profErr.message}`);
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

  return (profiles || []).map((p: any) => ({
    id: p.user_id,
    name: p.full_name || "Staff Member",
    email: p.email || emailMap.get(p.user_id) || "—",
    role: (p.role || "staff").toLowerCase(),
    isActive: p.is_active !== false,
    phone: p.phone || null,
    createdAt: p.created_at || new Date().toISOString(),
    updatedAt: p.updated_at || null,
  }));
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
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role = input.role.toLowerCase() as "waiter" | "cashier";

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
        role,
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
          registered_by: adminUserId || "administrator",
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Non-critical audit logging failure
    }

    return {
      id: newUserId,
      userId: newUserId,
      name,
      email,
      role,
      isActive: true,
      phone: null,
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

  // Guard 1: Cannot modify own status
  if (targetUserId === adminUserId) {
    const err = new Error("You cannot change the active status of your own administrator account.");
    (err as any).statusCode = 400;
    throw err;
  }

  // Guard 2: Inspect target profile - ensure not modifying administrator/owner
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
