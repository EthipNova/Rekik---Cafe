/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * Rekik Café — Category 2: Sales and Financial Monitoring Service
 * File: src/lib/financial-monitoring.ts
 * ============================================================================
 * Provides authoritative financial calculations, revenue aggregation,
 * multi-period comparisons, and payment proof audit data for business owners.
 *
 * Financial Calculation Rules:
 * - Count revenue ONLY from payments identified as successfully paid/verified.
 * - Do NOT count pending proof uploads as received revenue.
 * - Do NOT include failed, pending, or rejected payment attempts in verified sales.
 * - Prevent duplicate counting when an order has multiple payment attempts.
 * - Keep order totals and actually collected payment amounts distinct.
 * - Use historical order_items price snapshots (unit_price, line_total) for audits.
 * - Compute preceding period comparisons using identical time-window spans in EAT (UTC+3).
 */

import { supabase } from "@/lib/supabase";
import type { OrderStatus, OrderMethod } from "@/lib/orders";

export type FinancialDatePreset = "today" | "7days" | "30days" | "custom";

export interface FinancialDateWindow {
  preset: FinancialDatePreset;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  label: string;
  prevLabel: string;
  isToday: boolean;
}

export interface HistoricalOrderItemSnapshot {
  id: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface PaymentAttemptRecord {
  id: string;
  orderId: string;
  method: string;
  status: "paid" | "pending" | "failed" | string;
  amount: number;
  transactionReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface OrderSalesRow {
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  orderStatus: OrderStatus;
  orderMethod: OrderMethod;
  customerName: string;
  customerPhone: string;
  tableNumber: string | null;
  deliveryAddress: string | null;
  orderSubtotal: number;
  discountAmount: number;
  deliveryFee: number;
  orderTotal: number;
  // Financial settlement
  verifiedPaymentAmount: number;
  paymentStatus: "paid" | "pending" | "failed" | "unpaid";
  paymentMethod: string;
  transactionReference: string | null;
  paymentAttemptsCount: number;
  paymentAttempts: PaymentAttemptRecord[];
  isFullyPaid: boolean;
  assignedWaiterName: string | null;
  // Historical item snapshots
  items: HistoricalOrderItemSnapshot[];
}

export type CanonicalPaymentMethod = "cbe" | "telebirr" | "cash";

export const ALLOWED_PAYMENT_METHODS: { value: CanonicalPaymentMethod; label: string }[] = [
  { value: "cbe", label: "CBE" },
  { value: "telebirr", label: "Telebirr" },
  { value: "cash", label: "Cash" },
];

export function classifyPaymentMethod(rawMethod?: string | null): CanonicalPaymentMethod | "other" {
  if (!rawMethod) return "other";
  const m = rawMethod.trim().toLowerCase();
  if (m.includes("telebirr")) {
    return "telebirr";
  }
  if (m.includes("cbe") || m.includes("bank transfer") || m.includes("commercial bank")) {
    return "cbe";
  }
  if (
    m.includes("cash") ||
    m.includes("table") ||
    m.includes("counter") ||
    m.includes("pickup") ||
    m.includes("delivery")
  ) {
    return "cash";
  }
  return "other";
}

export function orderMatchesPaymentMethod(
  r: { paymentMethod?: string; paymentAttempts?: Array<{ method?: string }> },
  filter: string,
): boolean {
  if (filter === "all") return true;
  if (classifyPaymentMethod(r.paymentMethod) === filter) return true;
  if (r.paymentAttempts && r.paymentAttempts.some((a) => classifyPaymentMethod(a.method) === filter)) {
    return true;
  }
  return false;
}

export interface PaymentProofAuditItem {
  id: string;
  orderId: string;
  orderNumber?: string;
  customerName?: string;
  submittedAmount: number;
  transactionReference: string | null;
  screenshotPath: string | null;
  status: "pending" | "approved" | "rejected" | string;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  cashierDecision?: string | null;
  cashierReason?: string | null;
}

export interface PeriodComparisonMetric {
  current: number;
  previous: number;
  diff: number;
  percentageChange: number | null;
  trend: "up" | "down" | "flat";
}

export interface MethodRevenueBreakdown {
  method: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface DailySalesTrendPoint {
  dateKey: string;
  label: string;
  verifiedRevenue: number;
  ordersPlacedCount: number;
  paidOrdersCount: number;
}

export interface SalesMonitoringData {
  window: FinancialDateWindow;
  // Primary KPI Metrics with Comparisons
  verifiedRevenue: PeriodComparisonMetric;
  ordersPlacedCount: PeriodComparisonMetric;
  ordersWithVerifiedPaymentsCount: PeriodComparisonMetric;
  averageOrderValue: PeriodComparisonMetric;
  // Workload and Alert Counts
  pendingPaymentReviewsCount: number;
  rejectedPaymentProofsCount: number;
  failedPaymentsCount: number;
  // Visualizations & Tables
  dailySalesTrend: DailySalesTrendPoint[];
  paymentMethodBreakdown: MethodRevenueBreakdown[];
  orderMethodBreakdown: MethodRevenueBreakdown[];
  orderSalesRows: OrderSalesRow[];
  paymentProofAudits: PaymentProofAuditItem[];
  lastRefreshedAt: string;
}

/**
 * Computes start, end, and preceding comparison date windows in Hawassa, Ethiopia (EAT / UTC+3).
 */
export function calculateFinancialDateWindows(
  preset: FinancialDatePreset,
  customStart?: string,
  customEnd?: string,
): FinancialDateWindow {
  const now = new Date();

  // Offset now to EAT (UTC+3)
  const utcNowMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const eatNow = new Date(utcNowMs + 3 * 3600000);

  if (preset === "today") {
    // Current: Today 00:00:00 to 23:59:59 EAT (UTC+3)
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Addis_Ababa",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const eatDateStr = formatter.format(now);
    const startUtc = new Date(`${eatDateStr}T00:00:00.000+03:00`);
    const endUtc = new Date(`${eatDateStr}T23:59:59.999+03:00`);

    // Preceding: Yesterday 00:00:00 to 23:59:59 EAT
    const prevStartUtc = new Date(startUtc.getTime() - 24 * 3600000);
    const prevEndUtc = new Date(endUtc.getTime() - 24 * 3600000);

    return {
      preset,
      start: startUtc,
      end: endUtc,
      prevStart: prevStartUtc,
      prevEnd: prevEndUtc,
      label: "Today",
      prevLabel: "Yesterday",
      isToday: true,
    };
  }

  if (preset === "7days") {
    const durationMs = 7 * 24 * 3600000;
    const start = new Date(now.getTime() - durationMs);
    const prevStart = new Date(start.getTime() - durationMs);
    const prevEnd = new Date(start.getTime());

    return {
      preset,
      start,
      end: now,
      prevStart,
      prevEnd,
      label: "Last 7 Days",
      prevLabel: "Previous 7 Days",
      isToday: false,
    };
  }

  if (preset === "30days") {
    const durationMs = 30 * 24 * 3600000;
    const start = new Date(now.getTime() - durationMs);
    const prevStart = new Date(start.getTime() - durationMs);
    const prevEnd = new Date(start.getTime());

    return {
      preset,
      start,
      end: now,
      prevStart,
      prevEnd,
      label: "Last 30 Days",
      prevLabel: "Previous 30 Days",
      isToday: false,
    };
  }

  // Custom preset
  if (customStart && customEnd) {
    const start = new Date(`${customStart}T00:00:00+03:00`);
    const end = new Date(`${customEnd}T23:59:59+03:00`);
    const validStart = isNaN(start.getTime()) ? new Date(now.getTime() - 7 * 24 * 3600000) : start;
    const validEnd = isNaN(end.getTime()) ? now : end;

    const spanMs = Math.max(24 * 3600000, validEnd.getTime() - validStart.getTime());
    const prevStart = new Date(validStart.getTime() - spanMs);
    const prevEnd = new Date(validStart.getTime() - 1);

    const formatShort = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return {
      preset: "custom",
      start: validStart,
      end: validEnd,
      prevStart,
      prevEnd,
      label: `${formatShort(validStart)} – ${formatShort(validEnd)}`,
      prevLabel: `Prior ${Math.round(spanMs / (24 * 3600000))}d`,
      isToday: false,
    };
  }

  // Fallback to 7 days
  const fallbackDuration = 7 * 24 * 3600000;
  const fallbackStart = new Date(now.getTime() - fallbackDuration);
  return {
    preset: "7days",
    start: fallbackStart,
    end: now,
    prevStart: new Date(fallbackStart.getTime() - fallbackDuration),
    prevEnd: new Date(fallbackStart.getTime() - 1),
    label: "Last 7 Days",
    prevLabel: "Previous 7 Days",
    isToday: false,
  };
}

/**
 * Calculates percentage change and direction between two periods safely.
 */
export function calculateComparisonMetric(
  current: number,
  previous: number,
): PeriodComparisonMetric {
  const diff = current - previous;

  if (previous === 0) {
    if (current === 0) {
      return { current, previous, diff: 0, percentageChange: 0, trend: "flat" };
    }
    return { current, previous, diff, percentageChange: 100, trend: "up" };
  }

  const rawPct = (diff / previous) * 100;
  const percentageChange = Math.round(rawPct * 10) / 10;
  const trend = diff > 0 ? "up" : diff < 0 ? "down" : "flat";

  return {
    current,
    previous,
    diff,
    percentageChange,
    trend,
  };
}

/**
 * Normalizes an order record and its associated payment attempts into a consolidated sales row.
 * Handles duplicate payment attempts, separating failed/pending attempts from verified payments.
 */
export function processOrderSalesRow(rawOrder: any): OrderSalesRow {
  const rawPayments: any[] = Array.isArray(rawOrder.payments)
    ? rawOrder.payments
    : rawOrder.payments
      ? [rawOrder.payments]
      : [];

  const rawItems: any[] = Array.isArray(rawOrder.order_items) ? rawOrder.order_items : [];

  const items: HistoricalOrderItemSnapshot[] = rawItems.map((item) => ({
    id: item.id || crypto.randomUUID(),
    productId: item.product_id,
    name: item.name || "Menu Product",
    unitPrice: Number(item.unit_price) || 0,
    quantity: Number(item.quantity) || 1,
    lineTotal:
      Number(item.line_total) || (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
  }));

  // Identify successful/verified payment attempts
  const verifiedPaymentAttempts = rawPayments.filter(
    (p) => p.status === "paid" || p.status === "payment_verified" || p.status === "verified",
  );

  const isCancelled =
    rawOrder.status === "cancelled" ||
    rawOrder.status === "rejected_by_waiter" ||
    rawOrder.status === "payment_rejected";

  const hasRefund = rawPayments.some((p) => p.status === "refunded");

  // Sum verified payment amounts (avoiding pending/failed/refunded attempts and cancelled orders)
  let verifiedPaymentAmount = isCancelled || hasRefund
    ? 0
    : verifiedPaymentAttempts.reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0,
      );

  // If no payment record exists in payments table, check order-level paymentStatus
  if (
    !isCancelled &&
    !hasRefund &&
    verifiedPaymentAttempts.length === 0 &&
    (rawOrder.paymentStatus === "paid" || rawOrder.status === "payment_verified")
  ) {
    verifiedPaymentAmount = Number(rawOrder.total_amount) || 0;
  }

  const isFullyPaid = verifiedPaymentAmount > 0 && !isCancelled && !hasRefund;

  // Resolve overall payment status
  let overallPaymentStatus: "paid" | "pending" | "failed" | "unpaid" = "unpaid";
  if (isFullyPaid) {
    overallPaymentStatus = "paid";
  } else if (hasRefund) {
    overallPaymentStatus = "failed";
  } else if (isCancelled) {
    overallPaymentStatus = rawOrder.status === "payment_rejected" ? "failed" : "unpaid";
  } else if (
    rawPayments.some((p) => p.status === "pending") ||
    rawOrder.status === "payment_under_review"
  ) {
    overallPaymentStatus = "pending";
  } else if (
    rawPayments.some((p) => p.status === "failed") ||
    rawOrder.status === "payment_rejected"
  ) {
    overallPaymentStatus = "failed";
  }

  const primaryPayment = verifiedPaymentAttempts[0] || rawPayments[0] || null;
  const paymentMethod = primaryPayment?.method || rawOrder.paymentMethod || "Mobile Payment";
  const transactionReference = primaryPayment?.transaction_reference || null;

  const waiterName =
    (Array.isArray(rawOrder.staff_profiles)
      ? rawOrder.staff_profiles[0]?.full_name
      : rawOrder.staff_profiles?.full_name) || null;

  return {
    orderId: rawOrder.id,
    orderNumber: rawOrder.order_number || `#${String(rawOrder.id).slice(0, 4)}`,
    orderCreatedAt: rawOrder.created_at || new Date().toISOString(),
    orderStatus: (rawOrder.status as OrderStatus) || "received",
    orderMethod: (rawOrder.method as OrderMethod) || "dine-in",
    customerName: rawOrder.customer_name || "Guest Diner",
    customerPhone: rawOrder.customer_phone || "",
    tableNumber: rawOrder.table_number || null,
    deliveryAddress: rawOrder.delivery_address || null,
    orderSubtotal: Number(rawOrder.subtotal) || 0,
    discountAmount: Number(rawOrder.discount_amount) || 0,
    deliveryFee: Number(rawOrder.delivery_fee) || 0,
    orderTotal: Number(rawOrder.total_amount) || 0,
    verifiedPaymentAmount,
    paymentStatus: overallPaymentStatus,
    paymentMethod,
    transactionReference,
    paymentAttemptsCount: rawPayments.length,
    paymentAttempts: rawPayments.map((p: any) => ({
      id: p.id,
      orderId: p.order_id,
      method: p.method,
      status: p.status,
      amount: Number(p.amount) || 0,
      transactionReference: p.transaction_reference || null,
      paidAt: p.paid_at || null,
      createdAt: p.created_at || "",
    })),
    isFullyPaid,
    assignedWaiterName: waiterName,
    items,
  };
}

/**
 * Loads all authoritative records for Category 2: Sales and Financial Monitoring.
 */
export async function loadSalesMonitoringData(
  preset: FinancialDatePreset = "7days",
  customStart?: string,
  customEnd?: string,
): Promise<SalesMonitoringData> {
  const window = calculateFinancialDateWindows(preset, customStart, customEnd);

  // 1. Fetch Orders, Payment Proofs, and Payment Reviews concurrently from Supabase
  const [ordersRes, proofsRes, reviewsRes] = await Promise.allSettled([
    // Orders with joined historical order_items, payments, and waiter staff_profiles
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
        order_items (
          id,
          order_id,
          product_id,
          name,
          unit_price,
          quantity,
          line_total
        ),
        payments (
          id,
          order_id,
          method,
          status,
          amount,
          transaction_reference,
          paid_at,
          created_at
        )
      `,
      )
      .order("created_at", { ascending: false }),

    // Payment Proofs submitted by customers
    supabase
      .from("payment_proofs" as any)
      .select(
        `
        id,
        payment_id,
        order_id,
        submitted_by,
        screenshot_path,
        submitted_amount,
        transaction_reference,
        status,
        rejection_reason,
        reviewed_by,
        submitted_at,
        reviewed_at
      `,
      )
      .order("submitted_at", { ascending: false }),

    // Payment Reviews logged by cashiers
    supabase
      .from("payment_reviews" as any)
      .select(
        `
        id,
        payment_proof_id,
        cashier_id,
        decision,
        reason,
        reviewed_at
      `,
      )
      .order("reviewed_at", { ascending: false }),
  ]);

  let rawOrders: any[] =
    ordersRes.status === "fulfilled" && Array.isArray((ordersRes.value as any)?.data)
      ? (ordersRes.value as any).data
      : [];

  let rawProofs: any[] =
    proofsRes.status === "fulfilled" && Array.isArray((proofsRes.value as any)?.data)
      ? (proofsRes.value as any).data
      : [];

  let rawReviews: any[] =
    reviewsRes.status === "fulfilled" && Array.isArray((reviewsRes.value as any)?.data)
      ? (reviewsRes.value as any).data
      : [];

  const ordersError =
    ordersRes.status === "rejected"
      ? (ordersRes.reason instanceof Error ? ordersRes.reason.message : String(ordersRes.reason))
      : (ordersRes.value as any)?.error?.message;

  // Fallback: If direct client query returns 0 rows (due to restrictive RLS) or error,
  // fetch through authorized backend API endpoint /api/admin/sales-monitoring
  let apiFallbackError: string | null = null;
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
        if (Array.isArray(apiData?.orders)) {
          rawOrders = apiData.orders;
          if (Array.isArray(apiData.proofs)) {
            rawProofs = apiData.proofs;
          }
          if (Array.isArray(apiData.reviews)) {
            rawReviews = apiData.reviews;
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        apiFallbackError = errJson?.error || errJson?.message || `HTTP ${res.status}`;
      }
    } catch (apiErr) {
      apiFallbackError = apiErr instanceof Error ? apiErr.message : "API network error";
      console.warn(
        "[financial-monitoring] Fallback to /api/admin/sales-monitoring failed:",
        apiErr,
      );
    }
  }

  // If both direct client query and API fallback failed due to authorization or network error, surface it
  if (ordersError && rawOrders.length === 0 && apiFallbackError) {
    throw new Error(`Failed to load sales monitoring records: ${apiFallbackError || ordersError}`);
  }

  // Map raw orders to normalized sales rows
  const allOrderSalesRows = rawOrders.map(processOrderSalesRow);

  // 2. Filter into Current Window vs Previous Window
  const curStartMs = window.start.getTime();
  const curEndMs = window.end.getTime();

  const prevStartMs = window.prevStart.getTime();
  const prevEndMs = window.prevEnd.getTime();

  const isCurrent = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return t >= curStartMs && t <= curEndMs;
  };

  const isPrevious = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return t >= prevStartMs && t <= prevEndMs;
  };

  const currentOrders = allOrderSalesRows.filter((r) => isCurrent(r.orderCreatedAt));
  const previousOrders = allOrderSalesRows.filter((r) => isPrevious(r.orderCreatedAt));

  // Current Period Metrics
  const curRevenue = currentOrders.reduce((sum, r) => sum + r.verifiedPaymentAmount, 0);
  const curOrdersCount = currentOrders.length;
  const curPaidOrders = currentOrders.filter((r) => r.isFullyPaid);
  const curPaidCount = curPaidOrders.length;
  const curAov = curPaidCount > 0 ? curRevenue / curPaidCount : 0;

  // Previous Period Metrics
  const prevRevenue = previousOrders.reduce((sum, r) => sum + r.verifiedPaymentAmount, 0);
  const prevOrdersCount = previousOrders.length;
  const prevPaidOrders = previousOrders.filter((r) => r.isFullyPaid);
  const prevPaidCount = prevPaidOrders.length;
  const prevAov = prevPaidCount > 0 ? prevRevenue / prevPaidCount : 0;

  // Comparison Metrics
  const verifiedRevenue = calculateComparisonMetric(curRevenue, prevRevenue);
  const ordersPlacedCount = calculateComparisonMetric(curOrdersCount, prevOrdersCount);
  const ordersWithVerifiedPaymentsCount = calculateComparisonMetric(curPaidCount, prevPaidCount);
  const averageOrderValue = calculateComparisonMetric(curAov, prevAov);

  // 3. Payment Proof Audits & Reviews
  const reviewsByProofId = new Map<string, any>();
  rawReviews.forEach((rev) => {
    if (rev.payment_proof_id) {
      reviewsByProofId.set(rev.payment_proof_id, rev);
    }
  });

  const ordersById = new Map<string, OrderSalesRow>();
  allOrderSalesRows.forEach((r) => ordersById.set(r.orderId, r));

  const paymentProofAudits: PaymentProofAuditItem[] = rawProofs.map((p) => {
    const rev = reviewsByProofId.get(p.id);
    const linkedOrder = ordersById.get(p.order_id);

    return {
      id: p.id,
      orderId: p.order_id,
      orderNumber: linkedOrder?.orderNumber || (p.order_id ? `#${p.order_id.slice(0, 4)}` : "—"),
      customerName: linkedOrder?.customerName || "Customer",
      submittedAmount: Number(p.submitted_amount) || 0,
      transactionReference: p.transaction_reference || null,
      screenshotPath: p.screenshot_path || null,
      status: p.status || "pending",
      rejectionReason: p.rejection_reason || rev?.reason || null,
      submittedAt: p.submitted_at || new Date().toISOString(),
      reviewedAt: p.reviewed_at || rev?.reviewed_at || null,
      cashierDecision: rev?.decision || null,
      cashierReason: rev?.reason || null,
    };
  });

  const pendingPaymentReviewsCount = paymentProofAudits.filter(
    (p) => p.status === "pending",
  ).length;
  const rejectedPaymentProofsCount = paymentProofAudits.filter(
    (p) => p.status === "rejected",
  ).length;
  const failedPaymentsCount = currentOrders.filter((r) => r.paymentStatus === "failed").length;

  // 4. Daily Verified Sales Trend
  const dailySalesTrend: DailySalesTrendPoint[] = [];
  const dayMs = 24 * 3600000;
  const startDay = new Date(window.start);
  startDay.setHours(0, 0, 0, 0);

  const endDay = new Date(window.end);
  endDay.setHours(23, 59, 59, 999);

  let currentIter = new Date(startDay);

  if (window.isToday) {
    const buckets = [
      { startH: 7, endH: 10, label: "7am – 10am" },
      { startH: 10, endH: 13, label: "10am – 1pm" },
      { startH: 13, endH: 16, label: "1pm – 4pm" },
      { startH: 16, endH: 19, label: "4pm – 7pm" },
      { startH: 19, endH: 23, label: "7pm – 11pm" },
    ];

    buckets.forEach((b) => {
      const bOrders = currentOrders.filter((o) => {
        const h = new Date(o.orderCreatedAt).getHours();
        return h >= b.startH && h < b.endH;
      });
      const rev = bOrders.reduce((sum, o) => sum + o.verifiedPaymentAmount, 0);
      dailySalesTrend.push({
        dateKey: b.label,
        label: b.label,
        verifiedRevenue: rev,
        ordersPlacedCount: bOrders.length,
        paidOrdersCount: bOrders.filter((o) => o.isFullyPaid).length,
      });
    });
  } else {
    while (currentIter.getTime() <= endDay.getTime()) {
      const year = currentIter.getFullYear();
      const month = String(currentIter.getMonth() + 1).padStart(2, "0");
      const day = String(currentIter.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      const label = currentIter.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      const dayStartMs = new Date(`${dateKey}T00:00:00+03:00`).getTime();
      const dayEndMs = new Date(`${dateKey}T23:59:59+03:00`).getTime();

      const dayOrders = currentOrders.filter((o) => {
        const t = new Date(o.orderCreatedAt).getTime();
        return t >= dayStartMs && t <= dayEndMs;
      });

      const dayRev = dayOrders.reduce((sum, o) => sum + o.verifiedPaymentAmount, 0);

      dailySalesTrend.push({
        dateKey,
        label,
        verifiedRevenue: dayRev,
        ordersPlacedCount: dayOrders.length,
        paidOrdersCount: dayOrders.filter((o) => o.isFullyPaid).length,
      });

      currentIter = new Date(currentIter.getTime() + dayMs);
    }
  }

  // 5. Breakdowns by Payment Method and Order Method
  const methodMap = new Map<string, { amount: number; count: number }>();
  currentOrders
    .filter((o) => o.isFullyPaid)
    .forEach((o) => {
      const m = o.paymentMethod || "Mobile Payment";
      const existing = methodMap.get(m) || { amount: 0, count: 0 };
      methodMap.set(m, {
        amount: existing.amount + o.verifiedPaymentAmount,
        count: existing.count + 1,
      });
    });

  const paymentMethodBreakdown: MethodRevenueBreakdown[] = Array.from(methodMap.entries()).map(
    ([method, data]) => ({
      method,
      amount: data.amount,
      count: data.count,
      percentage: curRevenue > 0 ? Math.round((data.amount / curRevenue) * 1000) / 10 : 0,
    }),
  );

  const orderMethodMap = new Map<string, { amount: number; count: number }>();
  currentOrders
    .filter((o) => o.isFullyPaid)
    .forEach((o) => {
      const m = o.orderMethod || "dine-in";
      const existing = orderMethodMap.get(m) || { amount: 0, count: 0 };
      orderMethodMap.set(m, {
        amount: existing.amount + o.verifiedPaymentAmount,
        count: existing.count + 1,
      });
    });

  const orderMethodBreakdown: MethodRevenueBreakdown[] = Array.from(orderMethodMap.entries()).map(
    ([method, data]) => ({
      method,
      amount: data.amount,
      count: data.count,
      percentage: curRevenue > 0 ? Math.round((data.amount / curRevenue) * 1000) / 10 : 0,
    }),
  );

  return {
    window,
    verifiedRevenue,
    ordersPlacedCount,
    ordersWithVerifiedPaymentsCount,
    averageOrderValue,
    pendingPaymentReviewsCount,
    rejectedPaymentProofsCount,
    failedPaymentsCount,
    dailySalesTrend,
    paymentMethodBreakdown,
    orderMethodBreakdown,
    orderSalesRows: currentOrders,
    paymentProofAudits,
    lastRefreshedAt: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}
