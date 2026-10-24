/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * NEBA Café — Server-Side Waiter Data Operations (src/server/waiter.ts)
 * ============================================================================
 * Handles authoritative database transactions for the Waiter role,
 * querying and mutating staff_profiles, orders, order_approvals,
 * order_status_logs, payments, and notifications using the server-side client.
 */

import { serverSupabase as supabase } from "./supabase";
import type {
  WaiterProfile,
  WaiterOrder,
  WaiterMetrics,
  WaiterNotification,
  WaiterPayment,
  StaffRole,
} from "@/types/waiter";

export interface AuthenticatedStaff {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: StaffRole;
  isAvailable: boolean;
  isActive: boolean;
}

export type WaiterAuthResult =
  | { success: true; staff: AuthenticatedStaff }
  | { success: false; status: "unauthenticated"; message: string }
  | { success: false; status: "no_profile"; message: string }
  | { success: false; status: "inactive"; message: string }
  | { success: false; status: "role_mismatch"; role: string; message: string };

/**
 * Extracts Supabase access token from Authorization header or cookie fallback.
 */
export function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }

  const cookieHeader = request.headers.get("cookie") || request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.split("=");
      if (!name) continue;
      const val = decodeURIComponent(rest.join("="));
      if (!val) continue;

      if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && parsed[0]) return parsed[0];
          if (parsed.access_token) return parsed.access_token;
        } catch {
          if (val.startsWith("base64-")) {
            try {
              const decoded = Buffer.from(val.replace("base64-", ""), "base64").toString("utf-8");
              const parsed = JSON.parse(decoded);
              if (parsed.access_token) return parsed.access_token;
            } catch {
              /* ignore decode error */
            }
          }
        }
      } else if (name === "sb-access-token" || name === "supabase-auth-token") {
        return val;
      }
    }
  }

  return null;
}

/**
 * Resolves the authenticated user's staff status for Waiter Station API endpoints.
 * Distinguishes strictly between unauthenticated (401) vs unauthorized/inactive/no-profile (403).
 */
export async function resolveWaiterUser(request: Request): Promise<WaiterAuthResult> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return { success: false, status: "unauthenticated", message: "Sign in is required." };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user || !user.id) {
      return { success: false, status: "unauthenticated", message: "Invalid or expired session." };
    }

    // 1. Query public.staff_profiles for this user_id
    const { data: profile, error: profileErr } = await supabase
      .from("staff_profiles" as any)
      .select("user_id, full_name, phone, role, is_available, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.warn("[server/waiter] Error querying staff profile:", profileErr.message);
      return { success: false, status: "no_profile", message: "Failed to look up staff profile." };
    }

    if (profile) {
      if (!profile.is_active) {
        return {
          success: false,
          status: "inactive",
          message: "Your staff profile is currently inactive. Contact the administrator.",
        };
      }

      const role = (profile.role || "").toLowerCase().trim();
      if (role === "waiter" || role === "admin" || role === "manager") {
        return {
          success: true,
          staff: {
            userId: profile.user_id,
            email: user.email || "",
            fullName: profile.full_name || "Floor Waiter",
            phone: profile.phone || null,
            role: profile.role as StaffRole,
            isAvailable: Boolean(profile.is_available),
            isActive: Boolean(profile.is_active),
          },
        };
      }

      return {
        success: false,
        status: "role_mismatch",
        role: profile.role,
        message: `Access denied. Role '${profile.role}' is not authorized for the waiter station.`,
      };
    }

    // 2. Initial Setup Fallback: If user is the registered administrator (e.g. henth2030@gmail.com
    // or has admin metadata) and has no profile yet in staff_profiles, provision their admin profile.
    const isAdminEmail = user.email?.toLowerCase().includes("admin") || user.email === "henth2030@gmail.com";
    const userRoleMeta = (user.user_metadata?.["role"] as string | undefined)?.toLowerCase();
    const isMetaAdmin = userRoleMeta === "admin" || userRoleMeta === "staff";

    if (isAdminEmail || isMetaAdmin) {
      const fallbackName =
        (user.user_metadata?.["full_name"] as string) ||
        (user.user_metadata?.["name"] as string) ||
        (user.email ? user.email.split("@")[0] : "Admin");
      const fallbackPhone = (user.user_metadata?.["phone"] as string) || "0911000000";

      const { data: newProfile, error: insertErr } = await supabase
        .from("staff_profiles" as any)
        .upsert({
          user_id: user.id,
          full_name: fallbackName,
          phone: fallbackPhone,
          role: "admin",
          is_available: true,
          is_active: true,
        })
        .select()
        .maybeSingle();

      if (newProfile && !insertErr) {
        return {
          success: true,
          staff: {
            userId: newProfile.user_id,
            email: user.email || "",
            fullName: newProfile.full_name,
            phone: newProfile.phone,
            role: newProfile.role as StaffRole,
            isAvailable: Boolean(newProfile.is_available),
            isActive: Boolean(newProfile.is_active),
          },
        };
      }
    }

    return {
      success: false,
      status: "no_profile",
      message: "No staff profile found for this account. Access denied.",
    };
  } catch (err) {
    console.warn("[server/waiter] Error in resolveWaiterUser:", err);
    return {
      success: false,
      status: "unauthenticated",
      message: "Authentication validation encountered an unexpected error.",
    };
  }
}

/**
 * Resolves and verifies an authenticated waiter or admin from the request Authorization header.
 * Enforces database-backed role validation from public.staff_profiles.
 */
export async function resolveStaffUser(request: Request): Promise<AuthenticatedStaff | null> {
  const result = await resolveWaiterUser(request);
  return result.success ? result.staff : null;
}

/**
 * Normalizes raw order record from database into WaiterOrder type.
 */
function normalizeWaiterOrder(raw: any): WaiterOrder {
  const itemsRaw = Array.isArray(raw?.order_items) ? raw.order_items : [];
  const items = itemsRaw.map((it: any) => ({
    id: it.id,
    productId: it.product_id,
    name: it.name || it.products?.name || "Menu item",
    quantity: Number(it.quantity) || 1,
    unitPrice: Number(it.unit_price) || 0,
    lineTotal: Number(it.line_total) || Number(it.unit_price) * Number(it.quantity) || 0,
  }));

  const paymentsRaw = Array.isArray(raw?.payments) ? raw.payments : [];
  const proofsRaw = Array.isArray(raw?.payment_proofs) ? raw.payment_proofs : [];

  const payments: WaiterPayment[] = paymentsRaw.map((p: any) => {
    const proof = proofsRaw.find((pr: any) => pr.payment_id === p.id) || proofsRaw[0] || null;
    return {
      id: p.id,
      orderId: p.order_id,
      method: p.method,
      status: p.status,
      amount: Number(p.amount) || 0,
      transactionReference: p.transaction_reference,
      paidAt: p.paid_at,
      proof: proof
        ? {
            id: proof.id,
            paymentId: proof.payment_id,
            orderId: proof.order_id,
            screenshotPath: proof.screenshot_path,
            submittedAmount: Number(proof.submitted_amount) || 0,
            transactionReference: proof.transaction_reference,
            status: proof.status,
            rejectionReason: proof.rejection_reason,
            reviewedBy: proof.reviewed_by,
            submittedAt: proof.submitted_at,
            reviewedAt: proof.reviewed_at,
          }
        : null,
    };
  });

  const approvals = Array.isArray(raw?.order_approvals)
    ? raw.order_approvals.map((a: any) => ({
        id: a.id,
        orderId: a.order_id,
        waiterId: a.waiter_id,
        decision: a.decision,
        comments: a.comments,
        decidedAt: a.decided_at,
      }))
    : [];

  const statusLogs = Array.isArray(raw?.order_status_logs)
    ? raw.order_status_logs.map((l: any) => ({
        id: l.id,
        orderId: l.order_id,
        fromStatus: l.from_status,
        toStatus: l.to_status,
        changedBy: l.changed_by,
        notes: l.notes,
        createdAt: l.created_at,
      }))
    : [];

  return {
    id: raw.id,
    orderNumber: raw.order_number,
    orderReference: raw.order_reference || `REF-${raw.order_number}`,
    customerId: raw.customer_id,
    waiterId: raw.waiter_id,
    method: raw.method,
    status: raw.status,
    waiterDecision: raw.waiter_decision || "pending",
    customerName: raw.customer_name || "Guest",
    customerPhone: raw.customer_phone || null,
    tableNumber: raw.table_number || null,
    deliveryAddress: raw.delivery_address || null,
    customerNotes: raw.customer_notes || null,
    subtotal: Number(raw.subtotal) || 0,
    discountAmount: Number(raw.discount_amount) || 0,
    deliveryFee: Number(raw.delivery_fee) || 0,
    totalAmount: Number(raw.total_amount) || 0,
    waiterAssignedAt: raw.waiter_assigned_at,
    waiterDecidedAt: raw.waiter_decided_at,
    waiterRejectionReason: raw.waiter_rejection_reason,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    items,
    payments,
    approvals,
    statusLogs,
  };
}

/**
 * Determines whether an order has reached completed/settled status in the Rekik Café workflow.
 * Covers both orders marked 'completed' or 'delivered' and confirmed orders with paid settlement.
 */
export function isWaiterOrderCompleted(order: WaiterOrder): boolean {
  if (order.status === "completed" || order.status === "delivered") {
    return true;
  }
  const isPaid = Array.isArray(order.payments) && order.payments.some((p) => p.status === "paid");
  if (isPaid && (order.status === "confirmed" || order.waiterDecision === "approved")) {
    return true;
  }
  return false;
}

/**
 * Retrieves the full profile of a staff member.
 */
export async function getWaiterProfile(userId: string): Promise<WaiterProfile | null> {
  const { data, error } = await supabase
    .from("staff_profiles" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    fullName: data.full_name,
    phone: data.phone,
    role: data.role,
    isAvailable: Boolean(data.is_available),
    isActive: Boolean(data.is_active),
    createdAt: data.created_at,
  };
}

/**
 * Updates duty availability for a waiter.
 */
export async function updateWaiterAvailability(
  userId: string,
  isAvailable: boolean,
): Promise<{ success: boolean; isAvailable: boolean }> {
  const { data, error } = await (supabase.from("staff_profiles" as any) as any)
    .update({
      is_available: isAvailable,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("is_available")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update availability: ${error.message}`);
  }

  return { success: true, isAvailable: Boolean(data?.is_available) };
}

/**
 * Computes live, real metrics for a waiter from database records.
 */
export async function getWaiterMetrics(staff: AuthenticatedStaff): Promise<WaiterMetrics> {
  const isSuperAdmin = staff.role === "admin";

  let query = (supabase.from("orders" as any) as any)
    .select("id, status, waiter_decision, total_amount, created_at, waiter_id");

  // If waiter (not super admin), filter exclusively by orders assigned to them or unassigned pending
  if (!isSuperAdmin) {
    query = query.or(`waiter_id.eq.${staff.userId},and(waiter_id.is.null,waiter_decision.eq.pending)`);
  }

  const { data: orders, error } = await query;
  if (error || !orders) {
    console.warn("[server/waiter] Error fetching metrics:", error?.message);
    return {
      pendingReview: 0,
      approvedToday: 0,
      awaitingPayment: 0,
      underCashierReview: 0,
      completedToday: 0,
      rejectedTotal: 0,
      todayTotalRevenue: 0,
      totalAssignedActive: 0,
    };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  let pendingReview = 0;
  let approvedToday = 0;
  let awaitingPayment = 0;
  let underCashierReview = 0;
  let completedToday = 0;
  let rejectedTotal = 0;
  let todayTotalRevenue = 0;
  let totalAssignedActive = 0;

  for (const o of orders) {
    const isAssignedToMe = o.waiter_id === staff.userId || isSuperAdmin;
    const isToday = o.created_at >= todayIso;

    if (o.waiter_decision === "pending") {
      pendingReview++;
    }

    if (o.waiter_decision === "approved") {
      if (isToday) approvedToday++;
      // Check payment status or order status
      if (o.status === "pending") {
        awaitingPayment++;
      }
    }

    if (o.status === "confirmed" || o.status === "preparing" || o.status === "ready") {
      if (isAssignedToMe) totalAssignedActive++;
    }

    if (o.status === "completed" || o.status === "delivered") {
      if (isToday) {
        completedToday++;
        todayTotalRevenue += Number(o.total_amount) || 0;
      }
    }

    if (o.status === "rejected" || o.status === "cancelled" || o.waiter_decision === "rejected") {
      rejectedTotal++;
    }
  }

  // Count orders under cashier review (orders with payment_proofs where status = 'pending')
  const { count: underReviewCount } = await (supabase.from("payment_proofs" as any) as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  underCashierReview = underReviewCount || 0;

  return {
    pendingReview,
    approvedToday,
    awaitingPayment,
    underCashierReview,
    completedToday,
    rejectedTotal,
    todayTotalRevenue,
    totalAssignedActive,
  };
}

/**
 * Retrieves orders assigned to the authenticated waiter, with search, status, and date filters.
 */
export async function getWaiterOrders(
  staff: AuthenticatedStaff,
  filters?: {
    status?: string | undefined;
    search?: string | undefined;
    date?: string | undefined;
  },
): Promise<WaiterOrder[]> {
  const isSuperAdmin = staff.role === "admin";

  let query = (supabase.from("orders" as any) as any)
    .select(
      `
      id,
      order_number,
      order_reference,
      customer_id,
      waiter_id,
      method,
      status,
      waiter_decision,
      customer_name,
      customer_phone,
      table_number,
      delivery_address,
      customer_notes,
      subtotal,
      discount_amount,
      delivery_fee,
      total_amount,
      waiter_assigned_at,
      waiter_decided_at,
      waiter_rejection_reason,
      created_at,
      updated_at,
      order_items (
        id,
        order_id,
        product_id,
        name,
        quantity,
        unit_price,
        line_total
      ),
      payments (
        id,
        order_id,
        method,
        status,
        amount,
        transaction_reference,
        paid_at
      ),
      payment_proofs (
        id,
        payment_id,
        order_id,
        screenshot_path,
        submitted_amount,
        transaction_reference,
        status,
        rejection_reason,
        reviewed_by,
        submitted_at,
        reviewed_at
      ),
      order_approvals (
        id,
        order_id,
        waiter_id,
        decision,
        comments,
        decided_at
      ),
      order_status_logs (
        id,
        order_id,
        from_status,
        to_status,
        changed_by,
        notes,
        created_at
      )
    `,
    )
    .order("created_at", { ascending: false });

  // Role isolation: Only view orders assigned to this waiter, or unassigned pending orders
  if (!isSuperAdmin) {
    query = query.or(`waiter_id.eq.${staff.userId},and(waiter_id.is.null,waiter_decision.eq.pending)`);
  }

  // Status Filter
  if (filters?.status && filters.status !== "all") {
    if (filters.status === "pending_review") {
      query = query.eq("waiter_decision", "pending");
    } else if (filters.status === "approved") {
      query = query.eq("waiter_decision", "approved");
    } else if (filters.status === "rejected") {
      query = query.eq("waiter_decision", "rejected");
    } else if (filters.status === "active") {
      query = query.in("status", ["confirmed", "preparing", "ready"]);
    } else if (filters.status === "completed") {
      // In Rekik Café, completed orders are either status 'delivered'/'completed'
      // or confirmed orders with paid settlement. Filtered authoritatively below.
    } else {
      query = query.eq("status", filters.status);
    }
  }

  // Date Filter
  if (filters?.date) {
    const now = new Date();
    if (filters.date === "today") {
      now.setHours(0, 0, 0, 0);
      query = query.gte("created_at", now.toISOString());
    } else if (filters.date === "week") {
      now.setDate(now.getDate() - 7);
      now.setHours(0, 0, 0, 0);
      query = query.gte("created_at", now.toISOString());
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[server/waiter] Error fetching waiter orders:", error.message);
    throw new Error(`Failed to load orders: ${error.message}`);
  }

  let orders = (data || []).map(normalizeWaiterOrder);

  // Completed status post-filter (ensures orders settled with paid payments are properly included)
  if (filters?.status === "completed") {
    orders = orders.filter((o: WaiterOrder) => isWaiterOrderCompleted(o));
  }

  // Search Filter (by order number, reference, customer name, table number)
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    orders = orders.filter(
      (o: WaiterOrder) =>
        o.orderNumber.toLowerCase().includes(q) ||
        (o.orderReference && o.orderReference.toLowerCase().includes(q)) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q)),
    );
  }

  return orders;
}

/**
 * Atomically approves an order by an authorized waiter.
 * Updates order status, records decision in order_approvals and order_status_logs,
 * and emits a customer notification.
 */
export async function approveWaiterOrder(
  staff: AuthenticatedStaff,
  orderId: string,
  comments?: string,
): Promise<WaiterOrder> {
  // 1. Fetch current order state
  const { data: currentOrder, error: fetchErr } = await (supabase.from("orders" as any) as any)
    .select("id, status, waiter_decision, waiter_id, order_number, customer_id, method, customer_name")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !currentOrder) {
    throw new Error(`Order not found (${orderId})`);
  }

  // 2. Validate waiter assignment and current status
  const isSuperAdmin = staff.role === "admin";
  if (!isSuperAdmin && currentOrder.waiter_id && currentOrder.waiter_id !== staff.userId) {
    throw new Error("You are not authorized to decide on an order assigned to another waiter.");
  }

  if (currentOrder.waiter_decision === "approved") {
    throw new Error("This order has already been approved.");
  }

  if (currentOrder.waiter_decision === "rejected" || currentOrder.status === "cancelled" || currentOrder.status === "rejected") {
    throw new Error("Cannot approve an order that has already been cancelled or rejected.");
  }

  const nowIso = new Date().toISOString();
  // For cash/dine-in or pickup, approving confirms the order to the kitchen.
  // Allowed statuses: 'confirmed' or 'pending'.
  const nextStatus = "confirmed";

  // 3. Atomically update the orders record ensuring order is still pending decision
  const updatePayload: Record<string, unknown> = {
    waiter_decision: "approved",
    waiter_decided_at: nowIso,
    status: nextStatus,
    updated_at: nowIso,
  };

  // If order was unassigned, claim it for this waiter
  if (!currentOrder.waiter_id) {
    updatePayload["waiter_id"] = staff.userId;
    updatePayload["waiter_assigned_at"] = nowIso;
  }

  const { data: updatedRows, error: updateErr } = await (supabase.from("orders" as any) as any)
    .update(updatePayload)
    .eq("id", orderId)
    .eq("waiter_decision", "pending")
    .select("id");

  if (updateErr) {
    throw new Error(`Failed to update order approval: ${updateErr.message}`);
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("This order has already been decided or updated by another session.");
  }

  // 4. Insert into order_approvals
  const { error: approvalErr } = await (supabase.from("order_approvals" as any) as any).insert({
    id: crypto.randomUUID(),
    order_id: orderId,
    waiter_id: staff.userId,
    decision: "approved",
    comments: comments?.trim() || `Approved by ${staff.fullName}`,
    decided_at: nowIso,
  });

  if (approvalErr) {
    console.warn("[server/waiter] order_approvals insert warning:", approvalErr.message);
  }

  // 5. Insert into order_status_logs
  const { error: logErr } = await (supabase.from("order_status_logs" as any) as any).insert({
    id: crypto.randomUUID(),
    order_id: orderId,
    from_status: currentOrder.status,
    to_status: nextStatus,
    changed_by: staff.userId,
    notes: `Approved by waiter ${staff.fullName}. ${comments ? `Comments: ${comments}` : ""}`.trim(),
    created_at: nowIso,
  });

  if (logErr) {
    console.warn("[server/waiter] order_status_logs insert warning:", logErr.message);
  }

  // 6. Notify Customer if customer_id exists
  if (currentOrder.customer_id) {
    try {
      await (supabase.from("notifications" as any) as any).insert({
        id: crypto.randomUUID(),
        recipient_user_id: currentOrder.customer_id,
        order_id: orderId,
        title: "Order Approved",
        message: `Your order #${currentOrder.order_number} has been approved by your waiter.`,
        notification_type: "order_approved",
        is_read: false,
        created_at: nowIso,
      });
    } catch (notifEx) {
      console.warn("[server/waiter] Customer notification warning:", notifEx);
    }
  }

  // 7. Return updated order
  const updatedOrders = await getWaiterOrders(staff, { search: currentOrder.order_number });
  return updatedOrders[0] || (currentOrder as any);
}

/**
 * Atomically rejects an order by an authorized waiter with a mandatory reason.
 */
export async function rejectWaiterOrder(
  staff: AuthenticatedStaff,
  orderId: string,
  reason: string,
): Promise<WaiterOrder> {
  const cleanReason = reason?.trim();
  if (!cleanReason) {
    throw new Error("A rejection reason is strictly required.");
  }

  // 1. Fetch current order state
  const { data: currentOrder, error: fetchErr } = await (supabase.from("orders" as any) as any)
    .select("id, status, waiter_decision, waiter_id, order_number, customer_id, customer_name")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !currentOrder) {
    throw new Error(`Order not found (${orderId})`);
  }

  // 2. Validate waiter assignment and state
  const isSuperAdmin = staff.role === "admin";
  if (!isSuperAdmin && currentOrder.waiter_id && currentOrder.waiter_id !== staff.userId) {
    throw new Error("You are not authorized to decide on an order assigned to another waiter.");
  }

  if (currentOrder.waiter_decision === "approved") {
    throw new Error("Cannot reject an order that has already been approved.");
  }

  if (currentOrder.waiter_decision === "rejected" || currentOrder.status === "rejected" || currentOrder.status === "cancelled") {
    throw new Error("This order has already been cancelled or rejected.");
  }

  const nowIso = new Date().toISOString();

  // 3. Atomically update orders record to rejected ensuring order is still pending decision
  const updatePayload: Record<string, unknown> = {
    waiter_decision: "rejected",
    waiter_rejection_reason: cleanReason,
    waiter_decided_at: nowIso,
    status: "rejected",
    updated_at: nowIso,
  };

  if (!currentOrder.waiter_id) {
    updatePayload["waiter_id"] = staff.userId;
    updatePayload["waiter_assigned_at"] = nowIso;
  }

  const { data: updatedRows, error: updateErr } = await (supabase.from("orders" as any) as any)
    .update(updatePayload)
    .eq("id", orderId)
    .eq("waiter_decision", "pending")
    .select("id");

  if (updateErr) {
    throw new Error(`Failed to update order rejection: ${updateErr.message}`);
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("This order has already been decided or updated by another session.");
  }

  // 4. Insert into order_approvals
  await (supabase.from("order_approvals" as any) as any).insert({
    id: crypto.randomUUID(),
    order_id: orderId,
    waiter_id: staff.userId,
    decision: "rejected",
    comments: cleanReason,
    decided_at: nowIso,
  });

  // 5. Insert into order_status_logs
  await (supabase.from("order_status_logs" as any) as any).insert({
    id: crypto.randomUUID(),
    order_id: orderId,
    from_status: currentOrder.status,
    to_status: "rejected",
    changed_by: staff.userId,
    notes: `Rejected by waiter ${staff.fullName}. Reason: ${cleanReason}`,
    created_at: nowIso,
  });

  // 6. Notify Customer
  if (currentOrder.customer_id) {
    try {
      await (supabase.from("notifications" as any) as any).insert({
        id: crypto.randomUUID(),
        recipient_user_id: currentOrder.customer_id,
        order_id: orderId,
        title: "Order Update: Not Accepted",
        message: `Your order #${currentOrder.order_number} could not be accepted. Reason: ${cleanReason}`,
        notification_type: "order_rejected",
        is_read: false,
        created_at: nowIso,
      });
    } catch {
      /* ignore */
    }
  }

  const updatedOrders = await getWaiterOrders(staff, { search: currentOrder.order_number });
  return updatedOrders[0] || (currentOrder as any);
}

/**
 * Retrieves payment status tracker for orders assigned to this waiter.
 */
export async function getWaiterPayments(staff: AuthenticatedStaff): Promise<WaiterOrder[]> {
  const orders = await getWaiterOrders(staff);
  // Filter orders that have approvals or payments
  return orders.filter(
    (o) => o.waiterDecision === "approved" || o.payments && o.payments.length > 0,
  );
}

/**
 * Retrieves in-app notifications for the authenticated waiter.
 */
export async function getWaiterNotifications(userId: string): Promise<WaiterNotification[]> {
  const { data, error } = await (supabase.from("notifications" as any) as any)
    .select(
      `
      id,
      recipient_user_id,
      order_id,
      payment_proof_id,
      title,
      message,
      notification_type,
      is_read,
      created_at,
      read_at,
      orders (
        order_number,
        total_amount
      )
    `,
    )
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  return data.map((n: any) => ({
    id: n.id,
    recipientUserId: n.recipient_user_id,
    orderId: n.order_id,
    paymentProofId: n.payment_proof_id,
    title: n.title,
    message: n.message,
    notificationType: n.notification_type,
    isRead: Boolean(n.is_read),
    createdAt: n.created_at,
    readAt: n.read_at,
    order: n.orders
      ? {
          orderNumber: n.orders.order_number,
          totalAmount: Number(n.orders.total_amount) || 0,
        }
      : null,
  }));
}

/**
 * Marks a notification as read.
 */
export async function markWaiterNotificationRead(
  userId: string,
  notificationId: string,
): Promise<{ success: boolean }> {
  const { error } = await (supabase.from("notifications" as any) as any)
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .eq("recipient_user_id", userId);

  if (error) {
    throw new Error(`Failed to update notification: ${error.message}`);
  }

  return { success: true };
}

export interface AvailableWaiterDTO {
  id: string;
  userId: string;
  name: string;
  fullName: string;
  phone: string | null;
  role: string;
  isAvailable: boolean;
  isActive: boolean;
}

/**
 * Retrieves the list of available waiters for customer table selection during checkout.
 */
export async function getAvailableWaiters(): Promise<AvailableWaiterDTO[]> {
  const { data, error } = await (supabase.from("staff_profiles" as any) as any)
    .select("user_id, full_name, phone, role, is_available, is_active")
    .eq("role", "waiter")
    .eq("is_available", true)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error || !data) {
    // If no dedicated 'waiter' role rows yet, check for active admin/staff available
    const { data: fallbackStaff } = await (supabase.from("staff_profiles" as any) as any)
      .select("user_id, full_name, phone, role, is_available, is_active")
      .eq("is_available", true)
      .eq("is_active", true);

    if (fallbackStaff && fallbackStaff.length > 0) {
      return fallbackStaff.map((s: any) => ({
        id: s.user_id,
        userId: s.user_id,
        name: s.full_name || "Floor Staff",
        fullName: s.full_name || "Floor Staff",
        phone: s.phone || null,
        role: s.role || "staff",
        isAvailable: Boolean(s.is_available ?? true),
        isActive: Boolean(s.is_active ?? true),
      }));
    }
    return [];
  }

  return data.map((w: any) => ({
    id: w.user_id,
    userId: w.user_id,
    name: w.full_name || "Floor Waiter",
    fullName: w.full_name || "Floor Waiter",
    phone: w.phone || null,
    role: w.role || "waiter",
    isAvailable: Boolean(w.is_available ?? true),
    isActive: Boolean(w.is_active ?? true),
  }));
}

export interface WaiterPaymentProofInput {
  screenshotPath?: string | null;
  imageBase64?: string | null;
  mimeType?: string | null;
  submittedAmount: number;
  paymentMethod: string;
  transactionReference?: string | null;
  notes?: string | null;
}

/**
 * Authoritatively submits payment evidence captured/collected by a waiter.
 * Enforces waiter assignment authorization, atomic duplicate guards,
 * creates/updates payments and payment_proofs, logs audit trail,
 * and notifies the customer that payment is pending cashier verification.
 */
export async function submitWaiterPaymentProof(
  staff: AuthenticatedStaff,
  orderIdOrNumber: string,
  input: WaiterPaymentProofInput,
): Promise<WaiterOrder> {
  // 1. Fetch current order
  const { data: order, error: orderErr } = await (supabase.from("orders" as any) as any)
    .select("id, order_number, waiter_id, waiter_decision, status, total_amount, customer_id, customer_name")
    .or(`id.eq.${orderIdOrNumber},order_number.eq.${orderIdOrNumber}`)
    .maybeSingle();

  if (orderErr || !order) {
    throw new Error(`Order ${orderIdOrNumber} not found.`);
  }

  // 2. Authorization check: Waiter must be assigned to this order or be an admin
  const isSuperAdmin = staff.role === "admin";
  if (!isSuperAdmin && order.waiter_id && order.waiter_id !== staff.userId) {
    throw new Error("You are not authorized to submit payment for an order assigned to another waiter.");
  }

  // 3. Status check: Waiter must have accepted/approved the order first
  if (order.waiter_decision !== "approved") {
    throw new Error(
      `Order #${order.order_number} must be accepted/approved by the waiter before submitting payment.`,
    );
  }

  // 4. Check if order is already settled
  const { data: existingPaidPayment } = await (supabase.from("payments" as any) as any)
    .select("id, status")
    .eq("order_id", order.id)
    .eq("status", "paid")
    .maybeSingle();

  if (existingPaidPayment) {
    throw new Error(`Order #${order.order_number} is already marked as paid.`);
  }

  // 5. Concurrency / Duplicate submission guard: check if there is an existing pending proof
  const { data: existingPendingProof } = await (supabase.from("payment_proofs" as any) as any)
    .select("id, status, submitted_at")
    .eq("order_id", order.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPendingProof) {
    throw new Error(
      `A payment proof for Order #${order.order_number} has already been submitted and is pending cashier verification.`,
    );
  }

  const nowIso = new Date().toISOString();
  const submittedAmount =
    Number(input.submittedAmount) > 0
      ? Number(input.submittedAmount)
      : Number(order.total_amount) || 0;

  const cleanTxRef =
    typeof input.transactionReference === "string" && input.transactionReference.trim()
      ? input.transactionReference.trim()
      : null;

  // Handle proof screenshot upload if base64 was provided
  let resolvedScreenshotPath = input.screenshotPath || "";
  if (!resolvedScreenshotPath && input.imageBase64) {
    try {
      const base64Data = input.imageBase64.includes(",")
        ? input.imageBase64.split(",")[1]!
        : input.imageBase64;
      const buffer = Buffer.from(base64Data, "base64");
      const ext = input.mimeType?.includes("png")
        ? "png"
        : input.mimeType?.includes("webp")
          ? "webp"
          : "jpg";
      const storagePath = `waiter-proofs/${order.id}/${Date.now()}.${ext}`;

      try {
        await supabase.storage.createBucket("payment-proofs", { public: true });
      } catch {
        /* ignore if exists */
      }

      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(storagePath, buffer, {
          contentType: input.mimeType || "image/jpeg",
          upsert: true,
        });

      if (!uploadError) {
        resolvedScreenshotPath = storagePath;
      }
    } catch (uploadEx) {
      console.warn("[server/waiter] Error uploading base64 proof image:", uploadEx);
    }
  }

  if (!resolvedScreenshotPath) {
    resolvedScreenshotPath = `proofs/waiter-receipt-${order.id}.png`;
  }

  // 6. Find or create payment row
  const { data: existingPayment } = await (supabase.from("payments" as any) as any)
    .select("id, status")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .maybeSingle();

  let paymentId = existingPayment?.id;
  if (paymentId) {
    await (supabase.from("payments" as any) as any)
      .update({
        method: input.paymentMethod || "Mobile Payment",
        transaction_reference: cleanTxRef,
        status: "pending",
        amount: submittedAmount,
        updated_at: nowIso,
      })
      .eq("id", paymentId);
  } else {
    const newPayId = crypto.randomUUID();
    const { error: insPayErr } = await (supabase.from("payments" as any) as any).insert({
      id: newPayId,
      order_id: order.id,
      method: input.paymentMethod || "Mobile Payment",
      status: "pending",
      amount: submittedAmount,
      transaction_reference: cleanTxRef,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (insPayErr) {
      throw new Error(`Failed to create payment record: ${insPayErr.message}`);
    }
    paymentId = newPayId;
  }

  // 7. Insert payment proof record
  const proofId = crypto.randomUUID();
  const { error: proofErr } = await (supabase.from("payment_proofs" as any) as any).insert({
    id: proofId,
    payment_id: paymentId,
    order_id: order.id,
    screenshot_path: resolvedScreenshotPath,
    submitted_amount: submittedAmount,
    transaction_reference: cleanTxRef,
    status: "pending",
    submitted_at: nowIso,
  });

  if (proofErr) {
    throw new Error(`Failed to record payment proof: ${proofErr.message}`);
  }

  // 8. Log audit trail in order_status_logs
  const auditNotes = `Payment evidence submitted by server ${staff.fullName} (Method: ${input.paymentMethod}, Amount: ${submittedAmount} ETB, Ref: ${cleanTxRef || "Not provided"}). Awaiting cashier review.`;
  await (supabase.from("order_status_logs" as any) as any).insert({
    id: crypto.randomUUID(),
    order_id: order.id,
    from_status: order.status,
    to_status: order.status,
    changed_by: staff.userId,
    notes: auditNotes,
    created_at: nowIso,
  });

  // 9. Send notification to customer if customer_id exists
  if (order.customer_id) {
    try {
      await (supabase.from("notifications" as any) as any).insert({
        id: crypto.randomUUID(),
        recipient_user_id: order.customer_id,
        order_id: order.id,
        payment_proof_id: proofId,
        title: "Payment Submitted for Verification",
        message: `Your server ${staff.fullName} has submitted payment evidence (${input.paymentMethod}). Pending cashier review.`,
        notification_type: "payment_submitted",
        is_read: false,
        created_at: nowIso,
      });
    } catch (notifErr) {
      console.warn("[server/waiter] Error inserting customer notification:", notifErr);
    }
  }

  // 10. Return refreshed order
  const updatedOrders = await getWaiterOrders(staff, { search: order.order_number });
  return updatedOrders[0] || (order as any);
}
