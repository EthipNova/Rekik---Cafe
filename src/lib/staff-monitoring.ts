/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * Rekik Café — Category 3: Staff and Activity Monitoring Service
 * File: src/lib/staff-monitoring.ts
 * ============================================================================
 * Provides authoritative staff directory aggregation, operational workload
 * tracking, waiter approval decisions, cashier review audits, status transition
 * logs, and system notifications for business owners.
 *
 * Core Governance Rules:
 * - Real database records only: queries staff_profiles, order_approvals,
 *   order_status_logs, payment_reviews, orders, payment_proofs, notifications, audit_logs.
 * - Do NOT interpret accounts as "on duty" or invent shift attendance when no
 *   attendance/clock-in schema exists in the database.
 * - Distinct activity tables: order_approvals (waiters), payment_reviews (cashiers),
 *   order_status_logs (order stage transitions), audit_logs (admin actions).
 * - Never infer the actor when the database does not record it.
 * - Read-only monitoring; never exposes privileged keys or modifies assignments.
 */

import { supabase } from "@/lib/supabase";
import type { OrderStatus, OrderMethod } from "@/lib/orders";

export type StaffRole = "admin" | "waiter" | "cashier" | "kitchen" | string;

export interface StaffProfileRecord {
  userId: string;
  fullName: string;
  email: string;
  role: StaffRole;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  // Derived metrics
  activeAssignedOrdersCount: number;
  completedOrdersCount: number;
  totalApprovalsHandled: number;
  totalReviewsHandled: number;
}

export type ActivityType = "waiter_approval" | "status_transition" | "cashier_review" | "audit_log";

export interface StaffActivityItem {
  id: string;
  activityType: ActivityType;
  actorUserId: string | null;
  actorName: string;
  actorRole: string;
  orderId: string | null;
  orderNumber: string | null;
  decision?: "approved" | "rejected" | string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  notes?: string | null;
  actionDetails?: string | null;
  timestamp: string;
}

export interface OperationalWorkloadQueue {
  ordersAwaitingWaiterReview: {
    orderId: string;
    orderNumber: string;
    customerName: string;
    method: OrderMethod;
    tableNumber: string | null;
    createdAt: string;
    totalAmount: number;
  }[];
  ordersAssignedToWaiters: {
    orderId: string;
    orderNumber: string;
    waiterId: string;
    waiterName: string;
    status: OrderStatus;
    method: OrderMethod;
    tableNumber: string | null;
    createdAt: string;
  }[];
  ordersAwaitingPayment: {
    orderId: string;
    orderNumber: string;
    customerName: string;
    waiterName: string | null;
    createdAt: string;
    totalAmount: number;
  }[];
  paymentProofsAwaitingCashierReview: {
    proofId: string;
    orderId: string;
    orderNumber: string;
    customerName: string;
    submittedAmount: number;
    transactionReference: string | null;
    submittedAt: string;
  }[];
  recentlyRejectedItems: {
    type: "order_rejected_by_waiter" | "payment_rejected_by_cashier";
    orderId: string;
    orderNumber: string;
    actorName: string;
    reason: string;
    timestamp: string;
  }[];
}

export interface StaffNotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  orderId: string | null;
  orderNumber?: string | null;
  createdAt: string;
}

export interface StaffAuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface StaffRoleCounts {
  waiter: number;
  cashier: number;
  admin: number;
  kitchen: number;
  other: number;
}

export interface StaffMonitoringData {
  totalStaffCount: number;
  activeStaffCount: number;
  inactiveStaffCount: number;
  roleCounts: StaffRoleCounts;
  staffProfiles: StaffProfileRecord[];
  workload: OperationalWorkloadQueue;
  activities: StaffActivityItem[];
  notifications: StaffNotificationItem[];
  auditLogs: StaffAuditLogItem[];
  lastRefreshedAt: string;
}

export type StaffDatePreset = "today" | "7days" | "30days" | "custom" | "all";

export interface StaffDateBounds {
  preset: StaffDatePreset;
  start: Date;
  end: Date;
  label: string;
}

/**
 * Computes date bounds in Hawassa (EAT / UTC+3).
 */
export function calculateStaffDateBounds(
  preset: StaffDatePreset,
  customStart?: string,
  customEnd?: string,
): StaffDateBounds {
  const now = new Date();
  const utcNowMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const eatNow = new Date(utcNowMs + 3 * 3600000);

  if (preset === "today") {
    const startOfToday = new Date(eatNow);
    startOfToday.setHours(0, 0, 0, 0);
    const startUtc = new Date(startOfToday.getTime() - 3 * 3600000);

    const endOfToday = new Date(eatNow);
    endOfToday.setHours(23, 59, 59, 999);
    const endUtc = new Date(endOfToday.getTime() - 3 * 3600000);

    return { preset, start: startUtc, end: endUtc, label: "Today (EAT)" };
  }

  if (preset === "7days") {
    const end = new Date(eatNow);
    end.setHours(23, 59, 59, 999);
    const endUtc = new Date(end.getTime() - 3 * 3600000);

    const start = new Date(endUtc.getTime() - 7 * 24 * 3600000);
    return { preset, start, end: endUtc, label: "Last 7 Days" };
  }

  if (preset === "30days") {
    const end = new Date(eatNow);
    end.setHours(23, 59, 59, 999);
    const endUtc = new Date(end.getTime() - 3 * 3600000);

    const start = new Date(endUtc.getTime() - 30 * 24 * 3600000);
    return { preset, start, end: endUtc, label: "Last 30 Days" };
  }

  if (preset === "custom" && customStart && customEnd) {
    const startEat = new Date(`${customStart}T00:00:00+03:00`);
    const endEat = new Date(`${customEnd}T23:59:59.999+03:00`);
    return {
      preset,
      start: startEat,
      end: endEat,
      label: `${customStart} to ${customEnd}`,
    };
  }

  // "all" preset or fallback: 180 days
  const end = new Date(eatNow);
  const start = new Date(end.getTime() - 180 * 24 * 3600000);
  return { preset: "all", start, end, label: "All Recorded" };
}

/**
 * Pure helper to aggregate role counts from staff profiles.
 */
export function aggregateStaffRoleCounts(
  profiles: { role: string; isActive?: boolean }[],
): StaffRoleCounts {
  const counts: StaffRoleCounts = {
    waiter: 0,
    cashier: 0,
    admin: 0,
    kitchen: 0,
    other: 0,
  };

  profiles.forEach((p) => {
    const r = (p.role || "").toLowerCase().trim();
    if (r === "waiter") counts.waiter++;
    else if (r === "cashier") counts.cashier++;
    else if (r === "admin") counts.admin++;
    else if (r === "kitchen") counts.kitchen++;
    else counts.other++;
  });

  return counts;
}

/**
 * Pure helper to classify workload queues from orders and payment proofs.
 */
export function classifyOperationalWorkload(
  orders: any[],
  paymentProofs: any[],
  staffMap: Map<string, string>,
): OperationalWorkloadQueue {
  const awaitingWaiter: OperationalWorkloadQueue["ordersAwaitingWaiterReview"] = [];
  const assignedWaiters: OperationalWorkloadQueue["ordersAssignedToWaiters"] = [];
  const awaitingPayment: OperationalWorkloadQueue["ordersAwaitingPayment"] = [];
  const rejectedItems: OperationalWorkloadQueue["recentlyRejectedItems"] = [];

  orders.forEach((o) => {
    const orderNum = o.order_number || `#${String(o.id).slice(0, 4)}`;
    const waiterName = o.waiter_id ? staffMap.get(o.waiter_id) || "Assigned Waiter" : null;

    // 1. Orders awaiting waiter review
    if (o.status === "pending_waiter" || o.status === "received") {
      awaitingWaiter.push({
        orderId: o.id,
        orderNumber: orderNum,
        customerName: o.customer_name || "Guest Diner",
        method: o.method || "dine-in",
        tableNumber: o.table_number || null,
        createdAt: o.created_at,
        totalAmount: Number(o.total_amount) || 0,
      });
    }

    // 2. Orders assigned to waiters currently active in workflow
    if (
      o.waiter_id &&
      o.status !== "completed" &&
      o.status !== "delivered" &&
      o.status !== "cancelled" &&
      o.status !== "rejected_by_waiter"
    ) {
      assignedWaiters.push({
        orderId: o.id,
        orderNumber: orderNum,
        waiterId: o.waiter_id,
        waiterName: waiterName || "Waiter",
        status: o.status,
        method: o.method || "dine-in",
        tableNumber: o.table_number || null,
        createdAt: o.created_at,
      });
    }

    // 3. Orders approved by waiter and awaiting payment
    if (o.status === "awaiting_payment") {
      awaitingPayment.push({
        orderId: o.id,
        orderNumber: orderNum,
        customerName: o.customer_name || "Guest Diner",
        waiterName,
        createdAt: o.created_at,
        totalAmount: Number(o.total_amount) || 0,
      });
    }

    // 4. Recently rejected by waiter
    if (o.status === "rejected_by_waiter") {
      rejectedItems.push({
        type: "order_rejected_by_waiter",
        orderId: o.id,
        orderNumber: orderNum,
        actorName: waiterName || "Waiter",
        reason: "Order rejected during waiter verification",
        timestamp: o.updated_at || o.created_at,
      });
    }
  });

  // 5. Payment proofs awaiting cashier review
  const proofsAwaiting: OperationalWorkloadQueue["paymentProofsAwaitingCashierReview"] = [];
  const ordersById = new Map<string, any>();
  orders.forEach((o) => ordersById.set(o.id, o));

  paymentProofs.forEach((p) => {
    const linked = ordersById.get(p.order_id);
    const orderNum = linked?.order_number || (p.order_id ? `#${p.order_id.slice(0, 4)}` : "—");
    const customer = linked?.customer_name || "Customer";

    if (p.status === "pending") {
      proofsAwaiting.push({
        proofId: p.id,
        orderId: p.order_id,
        orderNumber: orderNum,
        customerName: customer,
        submittedAmount: Number(p.submitted_amount) || 0,
        transactionReference: p.transaction_reference || null,
        submittedAt: p.created_at,
      });
    }

    if (p.status === "rejected") {
      rejectedItems.push({
        type: "payment_rejected_by_cashier",
        orderId: p.order_id,
        orderNumber: orderNum,
        actorName: "Cashier Review Station",
        reason: p.rejection_reason || "Payment proof rejected by cashier",
        timestamp: p.created_at,
      });
    }
  });

  return {
    ordersAwaitingWaiterReview: awaitingWaiter,
    ordersAssignedToWaiters: assignedWaiters,
    ordersAwaitingPayment: awaitingPayment,
    paymentProofsAwaitingCashierReview: proofsAwaiting,
    recentlyRejectedItems: rejectedItems.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ),
  };
}

/**
 * Loads all authoritative Category 3 staff and activity records.
 */
export async function loadStaffMonitoringData(
  preset: StaffDatePreset = "7days",
  customStart?: string,
  customEnd?: string,
): Promise<StaffMonitoringData> {
  const bounds = calculateStaffDateBounds(preset, customStart, customEnd);
  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();

  // Query all verified database tables concurrently
  const [
    staffRes,
    ordersRes,
    approvalsRes,
    statusLogsRes,
    paymentReviewsRes,
    proofsRes,
    notificationsRes,
    auditLogsRes,
    usersRes,
  ] = await Promise.allSettled([
    // 1. Staff Profiles
    supabase
      .from("staff_profiles" as any)
      .select("user_id, full_name, email, role, phone, is_active, created_at, updated_at")
      .order("created_at", { ascending: false }),

    // 2. Orders with waiter linkage
    supabase
      .from("orders" as any)
      .select(
        "id, order_number, waiter_id, status, method, table_number, customer_name, customer_phone, total_amount, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),

    // 3. Order Approvals by Waiters
    supabase
      .from("order_approvals" as any)
      .select("id, order_id, waiter_id, decision, comments, decided_at")
      .order("decided_at", { ascending: false }),

    // 4. Order Status Logs
    supabase
      .from("order_status_logs" as any)
      .select("id, order_id, from_status, to_status, changed_by, notes, created_at")
      .order("created_at", { ascending: false }),

    // 5. Payment Reviews by Cashiers
    supabase
      .from("payment_reviews" as any)
      .select("id, payment_proof_id, cashier_id, decision, reason, reviewed_at")
      .order("reviewed_at", { ascending: false }),

    // 6. Payment Proofs
    supabase
      .from("payment_proofs" as any)
      .select(
        "id, order_id, screenshot_path, transaction_reference, submitted_amount, status, rejection_reason, created_at",
      )
      .order("created_at", { ascending: false }),

    // 7. System Notifications
    supabase
      .from("notifications" as any)
      .select("id, title, message, is_read, order_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50),

    // 8. Administrative Audit Logs
    supabase
      .from("audit_logs" as any)
      .select("id, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(50),

    // 9. Users table (for email resolution)
    supabase
      .from("users" as any)
      .select("id, email")
      .limit(100),
  ]);

  // Extract query payloads
  const rawStaff: any[] =
    staffRes.status === "fulfilled" && staffRes.value.data ? staffRes.value.data : [];
  const rawOrders: any[] =
    ordersRes.status === "fulfilled" && ordersRes.value.data ? ordersRes.value.data : [];
  const rawApprovals: any[] =
    approvalsRes.status === "fulfilled" && approvalsRes.value.data ? approvalsRes.value.data : [];
  const rawStatusLogs: any[] =
    statusLogsRes.status === "fulfilled" && statusLogsRes.value.data
      ? statusLogsRes.value.data
      : [];
  const rawReviews: any[] =
    paymentReviewsRes.status === "fulfilled" && paymentReviewsRes.value.data
      ? paymentReviewsRes.value.data
      : [];
  const rawProofs: any[] =
    proofsRes.status === "fulfilled" && proofsRes.value.data ? proofsRes.value.data : [];
  const rawNotifications: any[] =
    notificationsRes.status === "fulfilled" && notificationsRes.value.data
      ? notificationsRes.value.data
      : [];
  const rawAuditLogs: any[] =
    auditLogsRes.status === "fulfilled" && auditLogsRes.value.data ? auditLogsRes.value.data : [];
  const rawUsers: any[] =
    usersRes.status === "fulfilled" && usersRes.value.data ? usersRes.value.data : [];

  const userEmailMap = new Map<string, string>();
  rawUsers.forEach((u: { id: string; email: string }) => {
    if (u.id && u.email) userEmailMap.set(u.id, u.email);
  });

  // Lookup maps
  const staffNameMap = new Map<string, string>();
  const staffRoleMap = new Map<string, string>();
  rawStaff.forEach((s) => {
    staffNameMap.set(s.user_id, s.full_name || "Staff Member");
    staffRoleMap.set(s.user_id, s.role || "staff");
  });

  const ordersMap = new Map<string, any>();
  rawOrders.forEach((o) => ordersMap.set(o.id, o));

  // Compute Per-Staff Derived Workload
  const activeOrdersPerWaiter = new Map<string, number>();
  const completedOrdersPerWaiter = new Map<string, number>();

  rawOrders.forEach((o) => {
    if (o.waiter_id) {
      if (o.status === "completed" || o.status === "delivered") {
        completedOrdersPerWaiter.set(
          o.waiter_id,
          (completedOrdersPerWaiter.get(o.waiter_id) || 0) + 1,
        );
      } else if (o.status !== "cancelled" && o.status !== "rejected_by_waiter") {
        activeOrdersPerWaiter.set(o.waiter_id, (activeOrdersPerWaiter.get(o.waiter_id) || 0) + 1);
      }
    }
  });

  const approvalsCountPerStaff = new Map<string, number>();
  rawApprovals.forEach((a) => {
    if (a.waiter_id) {
      approvalsCountPerStaff.set(a.waiter_id, (approvalsCountPerStaff.get(a.waiter_id) || 0) + 1);
    }
  });

  const reviewsCountPerCashier = new Map<string, number>();
  rawReviews.forEach((r) => {
    if (r.cashier_id) {
      reviewsCountPerCashier.set(r.cashier_id, (reviewsCountPerCashier.get(r.cashier_id) || 0) + 1);
    }
  });

  const staffProfiles: StaffProfileRecord[] = rawStaff.map((s) => ({
    userId: s.user_id,
    fullName: s.full_name || "Unnamed Staff",
    email: s.email || userEmailMap.get(s.user_id) || "—",
    role: s.role || "staff",
    phone: s.phone || null,
    isActive: s.is_active !== false,
    createdAt: s.created_at || new Date().toISOString(),
    updatedAt: s.updated_at || null,
    activeAssignedOrdersCount: activeOrdersPerWaiter.get(s.user_id) || 0,
    completedOrdersCount: completedOrdersPerWaiter.get(s.user_id) || 0,
    totalApprovalsHandled: approvalsCountPerStaff.get(s.user_id) || 0,
    totalReviewsHandled: reviewsCountPerCashier.get(s.user_id) || 0,
  }));

  // Overview Counts
  const totalStaffCount = staffProfiles.length;
  const activeStaffCount = staffProfiles.filter((s) => s.isActive).length;
  const inactiveStaffCount = totalStaffCount - activeStaffCount;
  const roleCounts = aggregateStaffRoleCounts(staffProfiles);

  // Operational Workload Queues
  const workload = classifyOperationalWorkload(rawOrders, rawProofs, staffNameMap);

  // Build Unified Activity Feed
  const activities: StaffActivityItem[] = [];

  // Helper to check if a date falls in active filter window
  const inWindow = (dateStr?: string | null) => {
    if (!dateStr) return false;
    if (preset === "all") return true;
    const t = new Date(dateStr).getTime();
    return t >= startMs && t <= endMs;
  };

  // 1. Waiter Approvals
  rawApprovals.forEach((app) => {
    if (!inWindow(app.decided_at)) return;
    const linkedOrder = ordersMap.get(app.order_id);
    const orderNum =
      linkedOrder?.order_number || (app.order_id ? `#${app.order_id.slice(0, 4)}` : null);

    activities.push({
      id: `app-${app.id}`,
      activityType: "waiter_approval",
      actorUserId: app.waiter_id || null,
      actorName: app.waiter_id ? staffNameMap.get(app.waiter_id) || "Assigned Waiter" : "Waiter",
      actorRole: "waiter",
      orderId: app.order_id || null,
      orderNumber: orderNum,
      decision: app.decision || "reviewed",
      reason: app.comments || null,
      timestamp: app.decided_at || new Date().toISOString(),
    });
  });

  // 2. Cashier Payment Reviews
  const proofsById = new Map<string, any>();
  rawProofs.forEach((p) => proofsById.set(p.id, p));

  rawReviews.forEach((rev) => {
    if (!inWindow(rev.reviewed_at)) return;
    const linkedProof = proofsById.get(rev.payment_proof_id);
    const linkedOrder = linkedProof ? ordersMap.get(linkedProof.order_id) : null;
    const orderNum =
      linkedOrder?.order_number ||
      (linkedProof?.order_id ? `#${linkedProof.order_id.slice(0, 4)}` : null);

    activities.push({
      id: `rev-${rev.id}`,
      activityType: "cashier_review",
      actorUserId: rev.cashier_id || null,
      actorName: rev.cashier_id ? staffNameMap.get(rev.cashier_id) || "Cashier" : "Cashier",
      actorRole: "cashier",
      orderId: linkedProof?.order_id || null,
      orderNumber: orderNum,
      decision: rev.decision || "reviewed",
      reason: rev.reason || null,
      timestamp: rev.reviewed_at || new Date().toISOString(),
    });
  });

  // 3. Order Lifecycle Status Transitions
  rawStatusLogs.forEach((log) => {
    if (!inWindow(log.created_at)) return;
    const linkedOrder = ordersMap.get(log.order_id);
    const orderNum =
      linkedOrder?.order_number || (log.order_id ? `#${log.order_id.slice(0, 4)}` : null);
    const actorName = log.changed_by
      ? staffNameMap.get(log.changed_by) || "Staff / System"
      : "Automated Workflow";
    const actorRole = log.changed_by ? staffRoleMap.get(log.changed_by) || "staff" : "system";

    activities.push({
      id: `log-${log.id}`,
      activityType: "status_transition",
      actorUserId: log.changed_by || null,
      actorName,
      actorRole,
      orderId: log.order_id || null,
      orderNumber: orderNum,
      fromStatus: log.from_status || null,
      toStatus: log.to_status || null,
      notes: log.notes || null,
      timestamp: log.created_at || new Date().toISOString(),
    });
  });

  // 4. Administrative Audit Logs
  rawAuditLogs.forEach((al) => {
    if (!inWindow(al.created_at)) return;
    activities.push({
      id: `aud-${al.id}`,
      activityType: "audit_log",
      actorUserId: null, // audit_logs has no user_id column
      actorName: "Admin Action",
      actorRole: "admin",
      orderId: null,
      orderNumber: al.entity_id ? `#${al.entity_id.slice(0, 6)}` : null,
      actionDetails:
        typeof al.details === "object" ? JSON.stringify(al.details) : al.details || al.action,
      notes: `${al.action} on ${al.entity_type}`,
      timestamp: al.created_at || new Date().toISOString(),
    });
  });

  // Sort activities newest first
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Notifications
  const notifications: StaffNotificationItem[] = rawNotifications.map((n) => {
    const linkedOrder = n.order_id ? ordersMap.get(n.order_id) : null;
    return {
      id: n.id,
      title: n.title || "Notification",
      message: n.message || "",
      isRead: Boolean(n.is_read),
      orderId: n.order_id || null,
      orderNumber: linkedOrder?.order_number || (n.order_id ? `#${n.order_id.slice(0, 4)}` : null),
      createdAt: n.created_at || new Date().toISOString(),
    };
  });

  // Audit Logs
  const auditLogs: StaffAuditLogItem[] = rawAuditLogs.map((a) => ({
    id: a.id,
    action: a.action || "SYSTEM_EVENT",
    entityType: a.entity_type || "General",
    entityId: a.entity_id || "—",
    details: typeof a.details === "object" ? JSON.stringify(a.details) : String(a.details || ""),
    createdAt: a.created_at || new Date().toISOString(),
  }));

  return {
    totalStaffCount,
    activeStaffCount,
    inactiveStaffCount,
    roleCounts,
    staffProfiles,
    workload,
    activities,
    notifications,
    auditLogs,
    lastRefreshedAt: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}
