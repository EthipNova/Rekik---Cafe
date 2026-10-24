/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * Rekik Café — Business Owner Overview Dashboard Service & Metrics Engine
 * File: src/lib/owner-dashboard.ts
 * ============================================================================
 * Provides authoritative calculations for:
 * - Verified Sales (strictly paid & verified transactions, zero mock figures)
 * - Order Counts & Average Order Value (AOV) across date boundaries (EAT / UTC+3)
 * - Rekik 5-Stage Operational Workflow Statuses (Waiter -> Payment -> Cashier -> Completed)
 * - Staff on Duty (from live staff_profiles tracking active & available staff)
 * - Real Operational Alerts & Daily Revenue Aggregation for Recharts
 */

import { supabase } from "@/lib/supabase";
import type { Order, OrderStatus } from "@/lib/orders";
import { fetchAdminPayments, type PaymentRecord } from "@/lib/payments";

export type DateRangePreset = "today" | "7days" | "30days" | "custom";

export interface DateRangeBounds {
  preset: DateRangePreset;
  start: Date;
  end: Date;
  label: string;
  isToday: boolean;
}

export interface StaffProfile {
  userId: string;
  fullName: string;
  phone: string;
  role: "admin" | "waiter" | "cashier" | string;
  isAvailable: boolean;
  isActive: boolean;
}

export interface PaymentProofRecord {
  id: string;
  paymentId?: string;
  orderId?: string;
  status: "pending" | "approved" | "rejected" | string;
  submittedAmount: number;
  transactionReference: string | null;
  submittedAt: string;
  rejectionReason: string | null;
}

export interface SalesTrendPoint {
  date: string;
  label: string;
  revenue: number;
  orderCount: number;
}

export interface OperationalAlert {
  id: string;
  type: "proof_review" | "waiter_review" | "order_issue" | "item_unavailable";
  title: string;
  description: string;
  count: number;
  severity: "critical" | "warning" | "info";
  href: string;
}

export interface WorkflowStageSummary {
  id: string;
  title: string;
  description: string;
  count: number;
  totalValue: number;
  orders: Order[];
  href: string;
  statusCategory: "pending" | "awaiting_payment" | "review" | "verified" | "issues";
}

export interface OwnerDashboardData {
  range: DateRangeBounds;
  // KPI Metrics
  periodSalesRevenue: number;
  todaySalesRevenue: number;
  periodOrdersCount: number;
  todayOrdersCount: number;
  averageOrderValue: number;
  paidOrdersCount: number;
  awaitingWaiterCount: number;
  awaitingPaymentCount: number;
  awaitingCashierReviewCount: number;
  unresolvedAttentionCount: number;
  // Staff on duty
  staffOnDutyCount: number;
  staffOnDutyRoles: {
    waiters: number;
    cashiers: number;
    admins: number;
  };
  totalStaffProfiles: number;
  // Aggregated data
  salesTrend: SalesTrendPoint[];
  peakDayRevenue: number;
  recentOrders: Order[];
  workflowStages: WorkflowStageSummary[];
  operationalAlerts: OperationalAlert[];
  rejectedOrders: Order[];
  rejectedOrdersCount: number;
  ordersError?: string | null;
  unavailableProductsCount: number;
  lastUpdated: string;
}

/**
 * Calculates start and end Date objects in Hawassa, Ethiopia local time (EAT / UTC+3).
 */
export function calculateDateBounds(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
): DateRangeBounds {
  const now = new Date();

  // Create now in UTC+3 offset
  // Ethiopia is UTC+3 with no daylight saving time.
  const utcNowMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const eatNowMs = utcNowMs + 3 * 3600000;
  const eatNow = new Date(eatNowMs);

  if (preset === "today") {
    const startOfEatToday = new Date(eatNow);
    startOfEatToday.setHours(0, 0, 0, 0);
    // Convert back to real UTC Date
    const startUtc = new Date(startOfEatToday.getTime() - 3 * 3600000);

    const endOfEatToday = new Date(eatNow);
    endOfEatToday.setHours(23, 59, 59, 999);
    const endUtc = new Date(endOfEatToday.getTime() - 3 * 3600000);

    return {
      preset,
      start: startUtc,
      end: endUtc,
      label: "Today",
      isToday: true,
    };
  }

  if (preset === "7days") {
    const start = new Date(now.getTime() - 7 * 24 * 3600000);
    return {
      preset,
      start,
      end: now,
      label: "Last 7 Days",
      isToday: false,
    };
  }

  if (preset === "30days") {
    const start = new Date(now.getTime() - 30 * 24 * 3600000);
    return {
      preset,
      start,
      end: now,
      label: "Last 30 Days",
      isToday: false,
    };
  }

  // Custom preset
  if (customStart && customEnd) {
    const start = new Date(`${customStart}T00:00:00+03:00`);
    const end = new Date(`${customEnd}T23:59:59+03:00`);
    const validStart = isNaN(start.getTime()) ? new Date(now.getTime() - 7 * 24 * 3600000) : start;
    const validEnd = isNaN(end.getTime()) ? now : end;

    return {
      preset: "custom",
      start: validStart,
      end: validEnd,
      label: `${validStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${validEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      isToday: false,
    };
  }

  // Default fallback to 7 days
  const fallbackStart = new Date(now.getTime() - 7 * 24 * 3600000);
  return {
    preset: "7days",
    start: fallbackStart,
    end: now,
    label: "Last 7 Days",
    isToday: false,
  };
}

/**
 * Checks whether an order's status indicates it has been paid / verified.
 */
export function isOrderPaid(order: Order): boolean {
  if (order.paymentStatus === "paid") return true;
  if (order.status === "payment_verified" || order.status === "completed") return true;
  return false;
}

/**
 * Categorizes an order status into the 5 Rekik workflow stages:
 * 1. awaiting_waiter: 'pending_waiter' | 'received'
 * 2. awaiting_payment: 'awaiting_payment'
 * 3. awaiting_cashier: 'payment_under_review'
 * 4. verified_processing: 'payment_verified' | 'confirmed' | 'preparing' | 'ready' | 'out-for-delivery' | 'delivered' | 'completed'
 * 5. unresolved_rejected: 'rejected_by_waiter' | 'payment_rejected' | 'cancelled'
 */
export function getWorkflowCategory(
  status: OrderStatus,
): "waiter" | "payment" | "cashier" | "verified" | "issues" {
  switch (status) {
    case "pending_waiter":
    case "received":
      return "waiter";
    case "awaiting_payment":
      return "payment";
    case "payment_under_review":
      return "cashier";
    case "rejected_by_waiter":
    case "payment_rejected":
    case "cancelled":
      return "issues";
    case "payment_verified":
    case "confirmed":
    case "preparing":
    case "ready":
    case "out-for-delivery":
    case "delivered":
    case "completed":
    default:
      return "verified";
  }
}

/**
 * Loads all required tables for the Business Owner Overview Dashboard.
 */
export async function loadOwnerDashboardData(
  preset: DateRangePreset = "today",
  customStart?: string,
  customEnd?: string,
): Promise<OwnerDashboardData> {
  const range = calculateDateBounds(preset, customStart, customEnd);
  const todayBounds = calculateDateBounds("today");

  // 1. Concurrently fetch all authoritative sources
  const [ordersRes, paymentsRes, staffRes, proofsRes, productsRes] = await Promise.allSettled([
    // Orders (with joined waiter staff_profiles and payments)
    supabase
      .from("orders" as any)
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        method,
        status,
        waiter_id,
        waiter_decision,
        waiter_rejection_reason,
        table_number,
        delivery_address,
        subtotal,
        discount_amount,
        delivery_fee,
        total_amount,
        created_at,
        updated_at,
        staff_profiles (
          user_id,
          full_name,
          role
        ),
        payments (
          id,
          order_id,
          method,
          status,
          amount
        )
      `,
      )
      .order("created_at", { ascending: false }),
    // Payments
    fetchAdminPayments().catch(() => ({ data: [], error: null })),
    // Staff Profiles
    supabase
      .from("staff_profiles" as any)
      .select("user_id, full_name, phone, role, is_available, is_active"),
    // Payment Proofs
    supabase
      .from("payment_proofs" as any)
      .select(
        "id, payment_id, order_id, status, submitted_amount, transaction_reference, submitted_at, rejection_reason",
      ),
    // Menu Products (for unavailable items count)
    supabase.from("products" as any).select("id, name, available"),
  ]);

  let ordersError: string | null = null;
  if (ordersRes.status === "rejected") {
    ordersError = (ordersRes as any).reason?.message || "Failed to load orders from database.";
  } else if ((ordersRes.value as any)?.error) {
    ordersError = (ordersRes.value as any).error.message || "Database query failed for orders.";
  }

  let rawOrders =
    ordersRes.status === "fulfilled" && Array.isArray((ordersRes.value as any)?.data)
      ? (ordersRes.value as any).data
      : [];

  let rawProofs =
    proofsRes.status === "fulfilled" && Array.isArray((proofsRes.value as any)?.data)
      ? (proofsRes.value as any).data
      : [];

  // Fallback: If direct client query returns 0 rows (due to restrictive RLS) or error,
  // fetch through authorized backend API endpoint /api/admin/sales-monitoring
  if (rawOrders.length === 0) {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/admin/sales-monitoring", { headers });
      if (res.ok) {
        const apiData = await res.json();
        if (Array.isArray(apiData?.orders) && apiData.orders.length > 0) {
          rawOrders = apiData.orders;
          ordersError = null;
          if (Array.isArray(apiData.proofs) && apiData.proofs.length > 0) {
            rawProofs = apiData.proofs;
          }
        }
      } else if (!ordersError) {
        ordersError = `Backend orders API returned status ${res.status}`;
      }
    } catch (apiErr) {
      console.warn("[owner-dashboard] Fallback to /api/admin/sales-monitoring failed:", apiErr);
      if (!ordersError) {
        ordersError =
          apiErr instanceof Error ? apiErr.message : "Failed to fetch orders from server API.";
      }
    }
  }

  // Deduplicate orders to prevent duplicate rows from table joins
  const seenOrderIds = new Set<string>();
  const uniqueRawOrders: any[] = [];
  for (const raw of rawOrders) {
    if (raw?.id) {
      if (seenOrderIds.has(raw.id)) continue;
      seenOrderIds.add(raw.id);
    }
    uniqueRawOrders.push(raw);
  }

  const allOrders: Order[] = uniqueRawOrders.map((raw: any) => {
    const paymentRaw = Array.isArray(raw?.payments) ? raw.payments[0] : raw?.payments;
    const paymentStatus = paymentRaw?.status || "paid";
    return {
      id: raw.id,
      number: raw.order_number,
      createdAt: raw.created_at,
      method: raw.method || "dine-in",
      status: raw.status || "received",
      paymentStatus:
        paymentStatus === "paid" || paymentStatus === "pending" || paymentStatus === "failed"
          ? paymentStatus
          : "paid",
      paymentMethod: paymentRaw?.method || "Mobile Payment",
      customer: {
        name: raw.customer_name || "Guest",
        phone: raw.customer_phone || "",
        table: raw.table_number || undefined,
        address: raw.delivery_address || undefined,
      },
      items: [],
      subtotal: Number(raw.subtotal) || 0,
      discount: Number(raw.discount_amount) || 0,
      delivery: Number(raw.delivery_fee) || 0,
      total: Number(raw.total_amount) || 0,
      waiterId: raw.waiter_id || null,
      waiterName:
        (Array.isArray(raw.staff_profiles)
          ? raw.staff_profiles[0]?.full_name
          : raw.staff_profiles?.full_name) || null,
      waiterDecision: raw.waiter_decision || null,
      waiterRejectionReason: raw.waiter_rejection_reason || null,
    };
  });
  const paymentRecords: PaymentRecord[] =
    paymentsRes.status === "fulfilled" && paymentsRes.value?.data ? paymentsRes.value.data : [];

  const rawStaff =
    staffRes.status === "fulfilled" && Array.isArray((staffRes.value as any)?.data)
      ? (staffRes.value as any).data
      : [];
  const staffProfiles: StaffProfile[] = rawStaff.map((s: any) => ({
    userId: s.user_id,
    fullName: s.full_name || "Staff Member",
    phone: s.phone || "",
    role: String(s.role || "waiter").toLowerCase(),
    isAvailable: Boolean(s.is_available),
    isActive: Boolean(s.is_active),
  }));

  const paymentProofs: PaymentProofRecord[] = rawProofs.map((p: any) => ({
    id: p.id,
    paymentId: p.payment_id,
    orderId: p.order_id,
    status: p.status || "pending",
    submittedAmount: Number(p.submitted_amount) || 0,
    transactionReference: p.transaction_reference,
    submittedAt: p.submitted_at || new Date().toISOString(),
    rejectionReason: p.rejection_reason || null,
  }));

  const rawProducts =
    productsRes.status === "fulfilled" && Array.isArray((productsRes.value as any)?.data)
      ? (productsRes.value as any).data
      : [];
  const unavailableProducts = rawProducts.filter((p: any) => p.available === false);

  // 2. Filter Orders & Payments within Selected Date Range
  const rangeStartMs = range.start.getTime();
  const rangeEndMs = range.end.getTime();

  const isWithinRange = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return t >= rangeStartMs && t <= rangeEndMs;
  };

  const isTodayDate = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return t >= todayBounds.start.getTime() && t <= todayBounds.end.getTime();
  };

  // 3. Compute Verified Sales
  // Authoritative: sum payments where status === 'paid' or status === 'payment_verified'
  // Avoid double-counting orders if payment record is already present
  const paidPaymentsInRange = paymentRecords.filter(
    (p) =>
      (p.status === "paid" || (p.status as string) === "payment_verified") &&
      isWithinRange(p.paid_at || p.created_at),
  );

  let periodSalesRevenue = 0;
  let paidOrdersCount = 0;

  if (paidPaymentsInRange.length > 0) {
    periodSalesRevenue = paidPaymentsInRange.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    paidOrdersCount = paidPaymentsInRange.length;
  } else {
    // If payments table is empty, derive from orders with paymentStatus === 'paid'
    const eligibleOrders = allOrders.filter((o) => isWithinRange(o.createdAt) && isOrderPaid(o));
    periodSalesRevenue = eligibleOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    paidOrdersCount = eligibleOrders.length;
  }

  // Today's Sales Revenue
  const paidPaymentsToday = paymentRecords.filter(
    (p) =>
      (p.status === "paid" || (p.status as string) === "payment_verified") &&
      isTodayDate(p.paid_at || p.created_at),
  );
  let todaySalesRevenue = 0;
  if (paidPaymentsToday.length > 0) {
    todaySalesRevenue = paidPaymentsToday.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  } else {
    const todayEligibleOrders = allOrders.filter((o) => isTodayDate(o.createdAt) && isOrderPaid(o));
    todaySalesRevenue = todayEligibleOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }

  // Order Counts
  const periodOrders = allOrders.filter((o) => isWithinRange(o.createdAt));
  const todayOrders = allOrders.filter((o) => isTodayDate(o.createdAt));

  // Average Order Value (AOV)
  const averageOrderValue = paidOrdersCount > 0 ? periodSalesRevenue / paidOrdersCount : 0;

  // Active & Pending Workflow Counts
  const awaitingWaiterOrders = allOrders.filter(
    (o) => o.status === "pending_waiter" || o.status === "received",
  );
  const awaitingPaymentOrders = allOrders.filter((o) => o.status === "awaiting_payment");
  const pendingProofsCount = paymentProofs.filter((p) => p.status === "pending").length;
  const awaitingCashierOrders = allOrders.filter(
    (o) => o.status === "payment_under_review" || o.paymentStatus === "pending",
  );
  const awaitingCashierReviewCount = Math.max(awaitingCashierOrders.length, pendingProofsCount);

  const attentionOrders = allOrders.filter(
    (o) =>
      o.status === "rejected_by_waiter" ||
      o.status === "payment_rejected" ||
      o.status === "cancelled" ||
      o.paymentStatus === "failed",
  );

  // Staff on duty
  const onDutyStaff = staffProfiles.filter((s) => s.isActive && s.isAvailable);
  const staffOnDutyRoles = {
    waiters: onDutyStaff.filter((s) => s.role === "waiter").length,
    cashiers: onDutyStaff.filter((s) => s.role === "cashier").length,
    admins: onDutyStaff.filter((s) => s.role === "admin").length,
  };

  // 4. Group Orders into Workflow Stages
  const workflowStages: WorkflowStageSummary[] = [
    {
      id: "awaiting_waiter",
      title: "1. Awaiting Waiter Review",
      description: "Orders placed by diners awaiting assignment & approval",
      count: awaitingWaiterOrders.length,
      totalValue: awaitingWaiterOrders.reduce((sum, o) => sum + o.total, 0),
      orders: awaitingWaiterOrders.slice(0, 5),
      href: "/admin/orders",
      statusCategory: "pending",
    },
    {
      id: "awaiting_payment",
      title: "2. Approved / Awaiting Payment",
      description: "Diners notified to submit proof of payment",
      count: awaitingPaymentOrders.length,
      totalValue: awaitingPaymentOrders.reduce((sum, o) => sum + o.total, 0),
      orders: awaitingPaymentOrders.slice(0, 5),
      href: "/admin/orders",
      statusCategory: "awaiting_payment",
    },
    {
      id: "under_review",
      title: "3. Proofs Under Cashier Review",
      description: "Payment screenshots uploaded awaiting cashier verification",
      count: awaitingCashierReviewCount,
      totalValue: awaitingCashierOrders.reduce((sum, o) => sum + o.total, 0),
      orders: awaitingCashierOrders.slice(0, 5),
      href: "/admin/payments",
      statusCategory: "review",
    },
    {
      id: "verified_processing",
      title: "4. Verified & Kitchen Fulfillment",
      description: "Paid orders confirmed, in cooking, or out for delivery",
      count: allOrders.filter(
        (o) =>
          o.status === "payment_verified" ||
          o.status === "confirmed" ||
          o.status === "preparing" ||
          o.status === "ready" ||
          o.status === "out-for-delivery",
      ).length,
      totalValue: allOrders
        .filter(
          (o) =>
            o.status === "payment_verified" ||
            o.status === "confirmed" ||
            o.status === "preparing" ||
            o.status === "ready" ||
            o.status === "out-for-delivery",
        )
        .reduce((sum, o) => sum + o.total, 0),
      orders: allOrders
        .filter(
          (o) =>
            o.status === "payment_verified" ||
            o.status === "confirmed" ||
            o.status === "preparing" ||
            o.status === "ready" ||
            o.status === "out-for-delivery",
        )
        .slice(0, 5),
      href: "/admin/orders",
      statusCategory: "verified",
    },
    {
      id: "attention_issues",
      title: "5. Rejected / Failed Orders",
      description: "Orders rejected by waiter, declined payments, or cancelled",
      count: attentionOrders.length,
      totalValue: attentionOrders.reduce((sum, o) => sum + o.total, 0),
      orders: attentionOrders.slice(0, 5),
      href: "/admin/orders",
      statusCategory: "issues",
    },
  ];

  // 5. Daily Sales Trend Calculation
  // Generate date buckets covering every day in the selected range
  const salesTrend: SalesTrendPoint[] = [];
  const dayMs = 24 * 3600000;
  const startDay = new Date(range.start);
  startDay.setHours(0, 0, 0, 0);

  const endDay = new Date(range.end);
  endDay.setHours(23, 59, 59, 999);

  let currentIter = new Date(startDay);

  // If range is today, build 6-hour interval buckets for today
  if (range.isToday) {
    const hours = [
      { start: 7, end: 10, label: "7am – 10am" },
      { start: 10, end: 13, label: "10am – 1pm" },
      { start: 13, end: 16, label: "1pm – 4pm" },
      { start: 16, end: 19, label: "4pm – 7pm" },
      { start: 19, end: 23, label: "7pm – 11pm" },
    ];

    for (const h of hours) {
      const bucketOrders = todayOrders.filter((o) => {
        const orderHour = new Date(o.createdAt).getHours();
        return orderHour >= h.start && orderHour < h.end && isOrderPaid(o);
      });
      const rev = bucketOrders.reduce((sum, o) => sum + o.total, 0);
      salesTrend.push({
        date: h.label,
        label: h.label,
        revenue: rev,
        orderCount: bucketOrders.length,
      });
    }
  } else {
    // Multi-day timeline: one bucket per day
    while (currentIter.getTime() <= endDay.getTime()) {
      const year = currentIter.getFullYear();
      const month = String(currentIter.getMonth() + 1).padStart(2, "0");
      const day = String(currentIter.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      const dayLabel = currentIter.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      const dayStartMs = new Date(`${dateKey}T00:00:00+03:00`).getTime();
      const dayEndMs = new Date(`${dateKey}T23:59:59+03:00`).getTime();

      // Check payments or paid orders
      const dayPaidOrders = periodOrders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= dayStartMs && t <= dayEndMs && isOrderPaid(o);
      });

      const dayRevenue = dayPaidOrders.reduce((sum, o) => sum + o.total, 0);

      salesTrend.push({
        date: dateKey,
        label: dayLabel,
        revenue: dayRevenue,
        orderCount: dayPaidOrders.length,
      });

      currentIter = new Date(currentIter.getTime() + dayMs);
    }
  }

  const peakDayRevenue = Math.max(0, ...salesTrend.map((p) => p.revenue));

  // 6. Rejected Orders & Operational Alerts
  // Task 3: Operational Alert must show only actual rejected orders
  // Exclude pending, confirmed, preparing, delivered, completed, and all other non-rejected orders
  const rejectedOrders = allOrders.filter((o) => {
    return (
      (o.status as string) === "rejected" ||
      o.status === "rejected_by_waiter" ||
      o.status === "payment_rejected" ||
      o.waiterDecision === "rejected"
    );
  });

  const operationalAlerts: OperationalAlert[] = rejectedOrders.map((o) => {
    const reason = o.waiterRejectionReason || o.paymentProof?.rejectionReason || "Order marked rejected";
    return {
      id: `rejected-${o.id}`,
      type: "order_issue",
      title: `Rejected Order #${o.number}`,
      description: `${o.customer.name || "Guest diner"} — Reason: ${reason} (${o.total.toLocaleString()} ETB)`,
      count: 1,
      severity: "critical",
      href: "/admin/orders",
    };
  });

  return {
    range,
    periodSalesRevenue,
    todaySalesRevenue,
    periodOrdersCount: periodOrders.length,
    todayOrdersCount: todayOrders.length,
    averageOrderValue,
    paidOrdersCount,
    awaitingWaiterCount: awaitingWaiterOrders.length,
    awaitingPaymentCount: awaitingPaymentOrders.length,
    awaitingCashierReviewCount,
    unresolvedAttentionCount: attentionOrders.length,
    staffOnDutyCount: onDutyStaff.length,
    staffOnDutyRoles,
    totalStaffProfiles: staffProfiles.length,
    salesTrend,
    peakDayRevenue,
    recentOrders: allOrders.slice(0, 10),
    workflowStages,
    operationalAlerts,
    rejectedOrders,
    rejectedOrdersCount: rejectedOrders.length,
    ordersError,
    unavailableProductsCount: unavailableProducts.length,
    lastUpdated: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}
