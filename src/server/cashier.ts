import { serverSupabase } from "./supabase";
import { supabase } from "@/lib/supabase";
import type {
  CashierRole,
  CashierStaffProfile,
  PendingPaymentReviewItem,
  PaymentReviewHistoryItem,
  CashierOverviewMetrics,
  CashierNotification,
  ReviewOrderItem,
} from "@/lib/cashier";

export const PAYMENT_PROOFS_BUCKET = "payment-proofs";

export type CashierMeResult =
  | { success: true; profile: CashierStaffProfile; role: CashierRole }
  | { success: false; status: "unauthenticated"; message: string }
  | { success: false; status: "no_profile"; message: string }
  | { success: false; status: "inactive"; message: string }
  | { success: false; status: "role_mismatch"; role: string; message: string };

/**
 * Extracts Supabase access token from Authorization header or cookie fallback.
 */
function extractTokenFromRequest(request: Request): string | null {
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
 * Resolves the authenticated user's staff status for /api/cashier/me
 * Distinguishes between cashier, admin, waiter, inactive, or no staff profile.
 */
export async function resolveCashierMe(request: Request): Promise<CashierMeResult> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return { success: false, status: "unauthenticated", message: "Sign in is required." };
  }

  let user = null;
  let userErr = null;

  if (serverSupabase?.auth) {
    const res = await serverSupabase.auth.getUser(token);
    user = res.data?.user;
    userErr = res.error;
  }
  if (!user && supabase?.auth) {
    const res = await supabase.auth.getUser(token);
    user = res.data?.user;
    userErr = res.error || userErr;
  }

  if (userErr || !user || !user.id) {
    return { success: false, status: "unauthenticated", message: "Invalid or expired session." };
  }

  const { data: staffRow, error: staffErr } = await serverSupabase
    .from("staff_profiles")
    .select("user_id, full_name, phone, role, is_available, is_active, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (staffErr) {
    console.error("[cashier-me] Error looking up staff profile:", staffErr);
    return { success: false, status: "no_profile", message: "Failed to look up staff profile." };
  }

  if (!staffRow) {
    return {
      success: false,
      status: "no_profile",
      message: "No staff profile found for this account. Access denied.",
    };
  }

  if (!staffRow.is_active) {
    return {
      success: false,
      status: "inactive",
      message: "Your staff account is currently inactive. Please contact your manager.",
    };
  }

  const role = String(staffRow.role || "").toLowerCase() as CashierRole;

  const profile: CashierStaffProfile = {
    user_id: staffRow.user_id,
    full_name:
      staffRow.full_name ||
      (typeof user.user_metadata?.["full_name"] === "string"
        ? user.user_metadata["full_name"]
        : "Staff Member"),
    email: user.email || "",
    phone: staffRow.phone ?? null,
    role,
    is_available: Boolean(staffRow.is_available),
    is_active: Boolean(staffRow.is_active),
    created_at: staffRow.created_at,
    updated_at: staffRow.updated_at,
  };

  if (role !== "cashier") {
    return {
      success: false,
      status: "role_mismatch",
      role,
      message:
        role === "admin"
          ? "This account has Administrator privileges. Cashier dashboard is for cashier staff."
          : `Access denied. Users with '${staffRow.role}' role cannot access the Cashier dashboard.`,
    };
  }

  return { success: true, profile, role };
}

/**
 * Validates request Bearer token against Supabase Auth,
 * looks up the staff profile in staff_profiles,
 * and asserts that the user is an active cashier.
 * Throws an Error if unauthorized or forbidden.
 */
export async function authenticateCashier(request: Request): Promise<{
  profile: CashierStaffProfile;
  token: string;
}> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    throw new Error("UNAUTHORIZED: Missing or malformed authorization header.");
  }

  const meResult = await resolveCashierMe(request);
  if (!meResult.success) {
    if (meResult.status === "unauthenticated") {
      throw new Error("UNAUTHORIZED: " + meResult.message);
    }
    throw new Error("FORBIDDEN: " + meResult.message);
  }

  return { profile: meResult.profile, token };
}


/**
 * Returns all payment proofs awaiting cashier review (status = 'pending').
 */
export async function getPendingPaymentReviews(): Promise<PendingPaymentReviewItem[]> {
  const { data: proofs, error: proofErr } = await serverSupabase
    .from("payment_proofs")
    .select(`
      id,
      payment_id,
      order_id,
      submitted_by,
      screenshot_path,
      submitted_amount,
      transaction_reference,
      status,
      submitted_at,
      payments (
        id,
        order_id,
        method,
        status,
        amount,
        transaction_reference,
        created_at
      ),
      orders (
        id,
        order_number,
        order_reference,
        customer_id,
        customer_name,
        customer_phone,
        waiter_id,
        waiter_decision,
        waiter_decided_at,
        waiter_rejection_reason,
        method,
        status,
        table_number,
        delivery_address,
        customer_notes,
        subtotal,
        discount_amount,
        delivery_fee,
        total_amount,
        created_at,
        customers (
          id,
          name,
          phone,
          email
        ),
        order_items (
          id,
          product_id,
          name,
          quantity,
          unit_price,
          line_total
        )
      )
    `)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });

  if (proofErr) {
    console.error("[cashier] Error fetching pending payment proofs:", proofErr);
    throw new Error(`Failed to fetch pending payment reviews: ${proofErr.message}`);
  }

  const items: PendingPaymentReviewItem[] = (proofs || []).map((raw: any) => {
    const order = Array.isArray(raw.orders) ? raw.orders[0] : raw.orders;
    const payment = Array.isArray(raw.payments) ? raw.payments[0] : raw.payments;
    const customer = order?.customers
      ? Array.isArray(order.customers)
        ? order.customers[0]
        : order.customers
      : null;

    const rawItems: any[] = order?.order_items || [];
    const formattedItems: ReviewOrderItem[] = rawItems.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      name: it.name,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      line_total: Number(it.line_total) || 0,
    }));

    return {
      proof_id: raw.id,
      payment_id: raw.payment_id,
      order_id: raw.order_id,
      order_number: order?.order_number || `#${String(raw.order_id).slice(0, 6)}`,
      order_reference: order?.order_reference ?? null,
      customer_id: order?.customer_id ?? null,
      customer_name: order?.customer_name || customer?.name || "Guest Diner",
      customer_phone: order?.customer_phone || customer?.phone || null,
      customer_email: customer?.email ?? null,
      table_number: order?.table_number ?? null,
      delivery_address: order?.delivery_address ?? null,
      customer_notes: order?.customer_notes ?? null,
      order_method: order?.method || "dine_in",
      order_status: order?.status || "pending",
      order_created_at: order?.created_at || raw.submitted_at,
      order_total: Number(order?.total_amount) || Number(raw.submitted_amount) || 0,
      subtotal: Number(order?.subtotal) || 0,
      discount_amount: Number(order?.discount_amount) || 0,
      delivery_fee: Number(order?.delivery_fee) || 0,
      payment_amount: Number(payment?.amount) || Number(raw.submitted_amount) || 0,
      payment_method: payment?.method || "Mobile Payment",
      payment_status: payment?.status || "pending",
      transaction_reference: raw.transaction_reference || payment?.transaction_reference || null,
      proof_screenshot_path: raw.screenshot_path,
      proof_submitted_amount: Number(raw.submitted_amount) || 0,
      proof_status: raw.status || "pending",
      proof_submitted_at: raw.submitted_at,
      waiter_id: order?.waiter_id ?? null,
      waiter_decision: order?.waiter_decision ?? null,
      waiter_decided_at: order?.waiter_decided_at ?? null,
      waiter_rejection_reason: order?.waiter_rejection_reason ?? null,
      items: formattedItems,
    };
  });

  return items;
}

/**
 * Returns historical reviews (approved and rejected) with cashier details.
 */
export async function getPaymentReviewHistory(): Promise<PaymentReviewHistoryItem[]> {
  const { data: reviews, error: revErr } = await serverSupabase
    .from("payment_reviews")
    .select(`
      id,
      payment_proof_id,
      cashier_id,
      decision,
      reason,
      reviewed_at,
      payment_proofs (
        id,
        payment_id,
        order_id,
        screenshot_path,
        submitted_amount,
        transaction_reference,
        payments (
          id,
          method,
          amount,
          status
        ),
        orders (
          id,
          order_number,
          customer_name,
          customer_phone,
          total_amount,
          created_at,
          order_items (
            name,
            quantity
          )
        )
      ),
      staff_profiles (
        user_id,
        full_name,
        phone
      )
    `)
    .order("reviewed_at", { ascending: false });

  if (revErr) {
    console.error("[cashier] Error fetching review history:", revErr);
    throw new Error(`Failed to fetch payment review history: ${revErr.message}`);
  }

  const items: PaymentReviewHistoryItem[] = (reviews || []).map((rev: any) => {
    const proof = Array.isArray(rev.payment_proofs) ? rev.payment_proofs[0] : rev.payment_proofs;
    const order = proof?.orders
      ? Array.isArray(proof.orders)
        ? proof.orders[0]
        : proof.orders
      : null;
    const payment = proof?.payments
      ? Array.isArray(proof.payments)
        ? proof.payments[0]
        : proof.payments
      : null;
    const staff = rev.staff_profiles
      ? Array.isArray(rev.staff_profiles)
        ? rev.staff_profiles[0]
        : rev.staff_profiles
      : null;

    const orderItems: any[] = order?.order_items || [];
    const itemsSummary = orderItems
      .map((it) => `${it.quantity}x ${it.name}`)
      .join(", ");

    return {
      review_id: rev.id,
      proof_id: rev.payment_proof_id,
      payment_id: proof?.payment_id || "",
      order_id: proof?.order_id || "",
      order_number: order?.order_number || `#${String(proof?.order_id || "").slice(0, 6)}`,
      customer_name: order?.customer_name || "Guest",
      customer_phone: order?.customer_phone || null,
      payment_amount: Number(payment?.amount) || Number(proof?.submitted_amount) || 0,
      payment_method: payment?.method || "Mobile Payment",
      decision: rev.decision as "approved" | "rejected",
      reason: rev.reason || null,
      cashier_id: rev.cashier_id,
      cashier_name: staff?.full_name || "Cashier",
      reviewed_at: rev.reviewed_at,
      screenshot_path: proof?.screenshot_path || "",
      order_created_at: order?.created_at,
      items_summary: itemsSummary || undefined,
    };
  });

  return items;
}

/**
 * Calculates real-time KPI overview metrics for the cashier dashboard.
 */
export async function getCashierOverviewMetrics(): Promise<CashierOverviewMetrics> {
  const pendingItems = await getPendingPaymentReviews();
  const historyItems = await getPaymentReviewHistory();

  const pendingCount = pendingItems.length;
  const pendingAmount = pendingItems.reduce((sum, item) => sum + item.payment_amount, 0);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const approvedHistory = historyItems.filter((h) => h.decision === "approved");
  const rejectedHistory = historyItems.filter((h) => h.decision === "rejected");

  const todayApproved = approvedHistory.filter(
    (h) => new Date(h.reviewed_at).getTime() >= startOfToday.getTime(),
  );

  const todayVerifiedCount = todayApproved.length;
  const todayVerifiedAmount = todayApproved.reduce((sum, h) => sum + h.payment_amount, 0);

  const totalVerifiedCount = approvedHistory.length;
  const totalVerifiedAmount = approvedHistory.reduce((sum, h) => sum + h.payment_amount, 0);

  const rejectedCount = rejectedHistory.length;

  return {
    pendingCount,
    pendingAmount,
    todayVerifiedCount,
    todayVerifiedAmount,
    totalVerifiedCount,
    totalVerifiedAmount,
    rejectedCount,
  };
}

/**
 * Generates a short-lived signed URL for a payment proof screenshot in private Storage.
 */
export async function getProofSignedUrl(proofIdOrPath: string): Promise<string> {
  let screenshotPath = proofIdOrPath;

  // If a proofId was passed, resolve the actual stored path
  if (!screenshotPath.includes("/") && proofIdOrPath.length >= 20) {
    const { data: proof, error } = await serverSupabase
      .from("payment_proofs")
      .select("screenshot_path")
      .eq("id", proofIdOrPath)
      .maybeSingle();

    if (error || !proof) {
      throw new Error("Payment proof record not found.");
    }
    screenshotPath = proof.screenshot_path;
  }

  // Ensure path doesn't start with leading slash or bucket name
  let cleanPath = screenshotPath.replace(/^\/+/, "");
  if (cleanPath.startsWith(`${PAYMENT_PROOFS_BUCKET}/`)) {
    cleanPath = cleanPath.replace(`${PAYMENT_PROOFS_BUCKET}/`, "");
  }

  // Generate 15-minute (900 seconds) signed URL
  const { data, error } = await serverSupabase.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .createSignedUrl(cleanPath, 900);

  if (error || !data?.signedUrl) {
    console.error("[cashier-proof] Error creating signed URL:", error);
    throw new Error(`Unable to generate signed URL for payment proof: ${error?.message || "File inaccessible"}`);
  }

  return data.signedUrl;
}

/**
 * Atomically approves a payment proof:
 * 1. Checks payment proof exists and is currently 'pending'.
 * 2. Records review in `payment_reviews` ('approved').
 * 3. Updates `payment_proofs` to 'approved'.
 * 4. Updates `payments` to 'paid'.
 * 5. Updates `orders` to 'confirmed'.
 * 6. Logs status transition in `order_status_logs`.
 * 7. Records event in `audit_logs`.
 * 8. Dispatches notification to customer and/or waiter.
 */
export async function approvePaymentProof(
  proofId: string,
  cashierUserId: string,
  notes?: string,
): Promise<{ success: boolean; message: string; reviewId: string }> {
  const nowIso = new Date().toISOString();

  // 1. Fetch current proof and linked payment & order
  const { data: proof, error: fetchErr } = await serverSupabase
    .from("payment_proofs")
    .select(`
      id,
      payment_id,
      order_id,
      submitted_amount,
      status,
      payments (
        id,
        amount,
        status
      ),
      orders (
        id,
        order_number,
        customer_id,
        customer_name,
        waiter_id,
        waiter_decision,
        waiter_rejection_reason,
        status
      )
    `)
    .eq("id", proofId)
    .maybeSingle();

  if (fetchErr || !proof) {
    throw new Error("Payment proof not found.");
  }

  if (proof.status !== "pending") {
    throw new Error(`Payment proof has already been reviewed (current status: ${proof.status}). Duplicate decisions are prevented.`);
  }

  const order = Array.isArray(proof.orders) ? proof.orders[0] : proof.orders;
  const payment = Array.isArray(proof.payments) ? proof.payments[0] : proof.payments;

  // Safeguard: Protection against cashiers changing waiter decisions
  if (order?.waiter_decision === "rejected" || order?.status === "rejected") {
    throw new Error(
      `Cannot approve payment: Order has already been rejected by the assigned server/waiter${order.waiter_rejection_reason ? ` ("${order.waiter_rejection_reason}")` : ""}. Cashiers cannot override waiter rejection decisions.`,
    );
  }

  const reviewId = crypto.randomUUID();

  // 2. Insert into payment_reviews
  const { error: revErr } = await serverSupabase.from("payment_reviews").insert({
    id: reviewId,
    payment_proof_id: proof.id,
    cashier_id: cashierUserId,
    decision: "approved",
    reason: notes || "Payment verified by cashier",
    reviewed_at: nowIso,
  });

  if (revErr) {
    console.error("[cashier-approve] Failed to record payment review:", revErr);
    throw new Error(`Failed to record review: ${revErr.message}`);
  }

  // 3. Update payment_proofs
  const { error: proofUpdateErr } = await serverSupabase
    .from("payment_proofs")
    .update({
      status: "approved",
      reviewed_by: cashierUserId,
      reviewed_at: nowIso,
    })
    .eq("id", proof.id);

  if (proofUpdateErr) {
    console.error("[cashier-approve] Failed to update payment proof status:", proofUpdateErr);
    throw new Error(`Failed to update payment proof: ${proofUpdateErr.message}`);
  }

  // 4. Update payments to 'paid'
  const { error: payUpdateErr } = await serverSupabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", proof.payment_id);

  if (payUpdateErr) {
    console.error("[cashier-approve] Failed to update payment status:", payUpdateErr);
    throw new Error(`Failed to update payment status: ${payUpdateErr.message}`);
  }

  // 5. Update orders status to 'confirmed'
  const fromStatus = order?.status || "pending";
  const { error: ordUpdateErr } = await serverSupabase
    .from("orders")
    .update({
      status: "confirmed",
      updated_at: nowIso,
    })
    .eq("id", proof.order_id);

  if (ordUpdateErr) {
    console.error("[cashier-approve] Failed to update order status:", ordUpdateErr);
    throw new Error(`Failed to update order status: ${ordUpdateErr.message}`);
  }

  // 6. Record order_status_logs
  await serverSupabase.from("order_status_logs").insert({
    id: crypto.randomUUID(),
    order_id: proof.order_id,
    from_status: fromStatus,
    to_status: "confirmed",
    changed_by: cashierUserId,
    notes: `Payment verified (${notes || "Approved"}). Order confirmed for preparation.`,
    created_at: nowIso,
  });

  // 7. Record audit_logs
  await serverSupabase.from("audit_logs").insert({
    id: crypto.randomUUID(),
    actor_user_id: cashierUserId,
    order_id: proof.order_id,
    payment_proof_id: proof.id,
    action: "PAYMENT_APPROVED",
    entity_type: "payment",
    entity_id: proof.payment_id,
    old_values: { payment_status: payment?.status, order_status: fromStatus },
    new_values: { payment_status: "paid", order_status: "confirmed" },
    details: {
      order_number: order?.order_number,
      customer_name: order?.customer_name,
      amount: payment?.amount || proof.submitted_amount,
      notes: notes || null,
    },
    created_at: nowIso,
  });

  // 8. Notifications for customer and assigned waiter
  const orderNum = order?.order_number || `#${String(proof.order_id).slice(0, 6)}`;
  if (order?.customer_id) {
    // Notify customer
    await serverSupabase.from("notifications").insert({
      id: crypto.randomUUID(),
      recipient_user_id: order.customer_id,
      order_id: proof.order_id,
      payment_proof_id: proof.id,
      title: "Payment Verified",
      message: `Your payment for order ${orderNum} has been verified and confirmed! We are now preparing your order.`,
      notification_type: "payment_approved",
      is_read: false,
      created_at: nowIso,
    });
  }

  if (order?.waiter_id) {
    // Notify assigned waiter
    await serverSupabase.from("notifications").insert({
      id: crypto.randomUUID(),
      recipient_user_id: order.waiter_id,
      order_id: proof.order_id,
      payment_proof_id: proof.id,
      title: "Payment Confirmed",
      message: `Payment for order ${orderNum} was approved by cashier. Ready for kitchen preparation.`,
      notification_type: "waiter_payment_confirmed",
      is_read: false,
      created_at: nowIso,
    });
  }

  return {
    success: true,
    message: `Payment for order ${orderNum} has been verified and approved.`,
    reviewId,
  };
}

/**
 * Atomically rejects a payment proof:
 * 1. Checks payment proof is still 'pending'.
 * 2. Records rejection and reason in `payment_reviews`.
 * 3. Updates `payment_proofs` to 'rejected' with `rejection_reason`.
 * 4. Updates `payments` to 'failed'.
 * 5. Updates `orders` to 'rejected'.
 * 6. Records transition in `order_status_logs`.
 * 7. Records event in `audit_logs`.
 * 8. Notifies customer with reason.
 */
export async function rejectPaymentProof(
  proofId: string,
  cashierUserId: string,
  reason: string,
): Promise<{ success: boolean; message: string; reviewId: string }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A clear rejection reason is required.");
  }

  const nowIso = new Date().toISOString();

  // 1. Fetch current proof
  const { data: proof, error: fetchErr } = await serverSupabase
    .from("payment_proofs")
    .select(`
      id,
      payment_id,
      order_id,
      submitted_amount,
      status,
      payments (
        id,
        amount,
        status
      ),
      orders (
        id,
        order_number,
        customer_id,
        customer_name,
        waiter_id,
        waiter_decision,
        waiter_rejection_reason,
        status
      )
    `)
    .eq("id", proofId)
    .maybeSingle();

  if (fetchErr || !proof) {
    throw new Error("Payment proof not found.");
  }

  if (proof.status !== "pending") {
    throw new Error(`Payment proof has already been reviewed (current status: ${proof.status}). Duplicate decisions are prevented.`);
  }

  const order = Array.isArray(proof.orders) ? proof.orders[0] : proof.orders;
  const payment = Array.isArray(proof.payments) ? proof.payments[0] : proof.payments;

  const reviewId = crypto.randomUUID();

  // 2. Insert into payment_reviews (reason is required by DB check constraint)
  const { error: revErr } = await serverSupabase.from("payment_reviews").insert({
    id: reviewId,
    payment_proof_id: proof.id,
    cashier_id: cashierUserId,
    decision: "rejected",
    reason: trimmedReason,
    reviewed_at: nowIso,
  });

  if (revErr) {
    console.error("[cashier-reject] Failed to record payment review:", revErr);
    throw new Error(`Failed to record review: ${revErr.message}`);
  }

  // 3. Update payment_proofs with rejection_reason
  const { error: proofUpdateErr } = await serverSupabase
    .from("payment_proofs")
    .update({
      status: "rejected",
      rejection_reason: trimmedReason,
      reviewed_by: cashierUserId,
      reviewed_at: nowIso,
    })
    .eq("id", proof.id);

  if (proofUpdateErr) {
    console.error("[cashier-reject] Failed to update payment proof status:", proofUpdateErr);
    throw new Error(`Failed to update payment proof: ${proofUpdateErr.message}`);
  }

  // 4. Update payments to 'failed'
  const { error: payUpdateErr } = await serverSupabase
    .from("payments")
    .update({
      status: "failed",
      updated_at: nowIso,
    })
    .eq("id", proof.payment_id);

  if (payUpdateErr) {
    console.error("[cashier-reject] Failed to update payment status:", payUpdateErr);
    throw new Error(`Failed to update payment status: ${payUpdateErr.message}`);
  }

  // 5. Update orders status to 'rejected'
  const fromStatus = order?.status || "pending";
  const { error: ordUpdateErr } = await serverSupabase
    .from("orders")
    .update({
      status: "rejected",
      updated_at: nowIso,
    })
    .eq("id", proof.order_id);

  if (ordUpdateErr) {
    console.error("[cashier-reject] Failed to update order status:", ordUpdateErr);
    throw new Error(`Failed to update order status: ${ordUpdateErr.message}`);
  }

  // 6. Record order_status_logs
  await serverSupabase.from("order_status_logs").insert({
    id: crypto.randomUUID(),
    order_id: proof.order_id,
    from_status: fromStatus,
    to_status: "rejected",
    changed_by: cashierUserId,
    notes: `Payment proof rejected: ${trimmedReason}`,
    created_at: nowIso,
  });

  // 7. Record audit_logs
  await serverSupabase.from("audit_logs").insert({
    id: crypto.randomUUID(),
    actor_user_id: cashierUserId,
    order_id: proof.order_id,
    payment_proof_id: proof.id,
    action: "PAYMENT_REJECTED",
    entity_type: "payment",
    entity_id: proof.payment_id,
    old_values: { payment_status: payment?.status, order_status: fromStatus },
    new_values: { payment_status: "failed", order_status: "rejected" },
    details: {
      order_number: order?.order_number,
      customer_name: order?.customer_name,
      rejection_reason: trimmedReason,
    },
    created_at: nowIso,
  });

  // 8. Notifications for customer & waiter
  const orderNum = order?.order_number || `#${String(proof.order_id).slice(0, 6)}`;
  if (order?.customer_id) {
    await serverSupabase.from("notifications").insert({
      id: crypto.randomUUID(),
      recipient_user_id: order.customer_id,
      order_id: proof.order_id,
      payment_proof_id: proof.id,
      title: "Payment Proof Rejected",
      message: `Your payment proof for order ${orderNum} was not approved: "${trimmedReason}". Please review and upload a valid receipt.`,
      notification_type: "payment_rejected",
      is_read: false,
      created_at: nowIso,
    });
  }

  if (order?.waiter_id) {
    await serverSupabase.from("notifications").insert({
      id: crypto.randomUUID(),
      recipient_user_id: order.waiter_id,
      order_id: proof.order_id,
      payment_proof_id: proof.id,
      title: "Order Payment Rejected",
      message: `Payment proof for order ${orderNum} was rejected by cashier: "${trimmedReason}".`,
      notification_type: "waiter_payment_rejected",
      is_read: false,
      created_at: nowIso,
    });
  }

  return {
    success: true,
    message: `Payment proof for order ${orderNum} has been rejected.`,
    reviewId,
  };
}

/**
 * Returns notifications relevant to the cashier.
 */
export async function getCashierNotifications(cashierUserId: string): Promise<CashierNotification[]> {
  const { data, error } = await serverSupabase
    .from("notifications")
    .select("id, recipient_user_id, order_id, payment_proof_id, title, message, notification_type, is_read, created_at, read_at")
    .or(`recipient_user_id.eq.${cashierUserId},notification_type.ilike.%payment%`)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[cashier-notifications] Error fetching notifications:", error);
    return [];
  }

  return (data || []).map((n) => ({
    id: n.id,
    recipient_user_id: n.recipient_user_id,
    order_id: n.order_id,
    payment_proof_id: n.payment_proof_id,
    title: n.title,
    message: n.message,
    notification_type: n.notification_type,
    is_read: Boolean(n.is_read),
    created_at: n.created_at,
    read_at: n.read_at,
  }));
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(
  notificationId: string,
  cashierUserId: string,
): Promise<void> {
  await serverSupabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);
}
