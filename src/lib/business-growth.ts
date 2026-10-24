/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * Rekik Café — Category 5: Business Performance & Growth Engine
 * File: src/lib/business-growth.ts
 * ============================================================================
 * Provides authoritative business performance metrics, sales trends,
 * product/category volume and revenue analytics, customer dynamics,
 * inventory alignment, and schema gap disclosure for Rekik Café management.
 *
 * Core Calculation Principles:
 * 1. Revenue Consistency: Strictly reuse verified payment logic from Category 2.
 *    Multiple payment attempts never double-count; failed/pending attempts excluded.
 * 2. Timezone & Boundary Invariant: Compute all date ranges in EAT (UTC+3)
 *    with equivalent duration preceding windows.
 * 3. Customer Identification: Use customer_id if present; fallback to normalized
 *    phone number. Customers without ID/phone are categorized as "Unidentified Diners".
 * 4. Growth Insights: Generate strictly factual data observations from verified
 *    numbers; never invent AI predictions or simulate unrecorded transactions.
 * 5. Transparent Schema Gaps: Explicitly mark Promotion Attribution and Recipe
 *    BOM / COGS as unavailable with architectural reasons.
 */

import { supabase } from "@/lib/supabase";
import {
  calculateFinancialDateWindows,
  calculateComparisonMetric,
  processOrderSalesRow,
  type FinancialDatePreset,
  type FinancialDateWindow,
  type PeriodComparisonMetric,
  type OrderSalesRow,
} from "@/lib/financial-monitoring";
import {
  loadInventoryMonitoringData,
  FALLBACK_PRODUCTS,
  FALLBACK_CATEGORIES,
} from "@/lib/inventory-monitoring";
import { normalizePhone, maskPhone, formatETB } from "@/lib/customers";
import type { OrderStatus, OrderMethod } from "@/lib/orders";

export type { FinancialDatePreset, FinancialDateWindow, PeriodComparisonMetric };

export interface ProductPerformanceItem {
  productId: string;
  name: string;
  categoryName: string;
  categorySlug: string;
  unitPrice: number;
  quantitySold: number;
  totalRevenue: number;
  orderCount: number;
  percentOfTotalRevenue: number;
  isAvailable: boolean;
  physicalStockQuantity: number | null;
  trackInventory: boolean;
  trendDirection: "rising" | "declining" | "steady" | "new";
  trendDiffPct: number | null;
  prevQuantitySold: number;
  prevRevenue: number;
}

export interface CategoryPerformanceItem {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  totalRevenue: number;
  quantitySold: number;
  orderCount: number;
  productCount: number;
  percentOfTotalRevenue: number;
  topProduct: {
    name: string;
    quantity: number;
    revenue: number;
  } | null;
}

export interface FrequencyBracketItem {
  bracket: string;
  customerCount: number;
  percentage: number;
  description: string;
}

export interface LoyalCustomerItem {
  customerId: string;
  name: string;
  maskedPhone: string;
  orderCountInPeriod: number;
  totalSpentInPeriod: number;
  lifetimeOrderCount: number;
  lifetimeSpent: number;
  firstOrderDate: string;
  lastOrderDate: string;
}

export interface CustomerDynamicsData {
  totalCustomersIdentified: PeriodComparisonMetric;
  newCustomersCount: PeriodComparisonMetric;
  returningCustomersCount: PeriodComparisonMetric;
  unidentifiedDinersCount: PeriodComparisonMetric;
  returningCustomerRatePct: number;
  frequencyDistribution: FrequencyBracketItem[];
  topLoyalCustomers: LoyalCustomerItem[];
}

export interface PeriodSummaryKPIs {
  verifiedRevenue: PeriodComparisonMetric;
  totalOrdersPlaced: PeriodComparisonMetric;
  completedOrders: PeriodComparisonMetric;
  cancelledOrRejectedOrders: PeriodComparisonMetric;
  completionRatePct: PeriodComparisonMetric;
  averageOrderValue: PeriodComparisonMetric;
}

export interface DailyGrowthTrendPoint {
  dateKey: string;
  label: string;
  verifiedRevenue: number;
  ordersCount: number;
  completedOrdersCount: number;
}

export interface OperationalAlignmentSummary {
  totalMenuProducts: number;
  availableMenuProducts: number;
  unavailableMenuProducts: number;
  trackedProductsCount: number;
  uninitializedStockCount: number;
  physicalLowStockCount: number;
  physicalOutOfStockCount: number;
  catalogHealthNote: string;
}

export interface SchemaGapDetails {
  status: "unavailable";
  title: string;
  reason: string;
  technicalDetails: string;
  recommendedAction: string;
}

export interface SchemaGapAssessment {
  promotionAttribution: SchemaGapDetails;
  recipeBOMAndCOGS: SchemaGapDetails;
}

export interface GrowthInsight {
  id: string;
  type: "growth" | "warning" | "opportunity" | "info";
  title: string;
  description: string;
  metricBadge?: string;
}

export interface BusinessGrowthData {
  window: FinancialDateWindow;
  kpis: PeriodSummaryKPIs;
  dailyTrends: DailyGrowthTrendPoint[];
  productPerformance: ProductPerformanceItem[];
  topProductsByQuantity: ProductPerformanceItem[];
  topProductsByRevenue: ProductPerformanceItem[];
  risingProducts: ProductPerformanceItem[];
  decliningProducts: ProductPerformanceItem[];
  categoryPerformance: CategoryPerformanceItem[];
  customerDynamics: CustomerDynamicsData;
  operationalAlignment: OperationalAlignmentSummary;
  schemaGaps: SchemaGapAssessment;
  insights: GrowthInsight[];
  lastRefreshedAt: string;
}

/**
 * Standardized Schema Gap Assessment definitions.
 */
export const CATEGORY_5_SCHEMA_GAPS: SchemaGapAssessment = {
  promotionAttribution: {
    status: "unavailable",
    title: "Promotion Campaign Performance Attribution",
    reason: "Missing Order-Promotion Foreign Key / Attribution Ledger in Database Schema",
    technicalDetails:
      "The orders table records discount_amount but lacks promotion_id foreign key or promotion_redemptions ledger. Discounts cannot be deterministically mapped to specific marketing campaigns without schema extension.",
    recommendedAction:
      "Add promotion_id column to orders table and create promotion_redemptions audit table to capture promotion conversion and campaign ROI.",
  },
  recipeBOMAndCOGS: {
    status: "unavailable",
    title: "Recipe Bill of Materials (BOM) & Margin Analysis (COGS)",
    reason: "Pending Recipe Formulation & Ingredient Costing Schema",
    technicalDetails:
      "products.ingredients stores descriptive display text strings (e.g. ['Beef patty', 'Lettuce']). It does not define structured quantities, unit units of measure, or supplier purchase cost records required for Cost of Goods Sold (COGS) calculation.",
    recommendedAction:
      "Create recipe_items table linking menu products to inventory items with unit consumption metrics, enabling automated stock deduction and true gross margin analysis.",
  },
};

/**
 * Categorizes an order status into completed vs cancelled/rejected vs in-flight.
 */
export function classifyOrderStatus(
  status: OrderStatus | string,
): "completed" | "cancelled" | "in_flight" {
  const s = String(status || "").toLowerCase();
  if (s === "completed" || s === "delivered") {
    return "completed";
  }
  if (s === "cancelled" || s === "rejected" || s === "payment_rejected") {
    return "cancelled";
  }
  return "in_flight";
}

/**
 * Pure calculation: Computes Period Summary KPIs comparing current vs previous windows.
 */
export function calculatePeriodSummaryKPIs(
  currentSalesRows: OrderSalesRow[],
  prevSalesRows: OrderSalesRow[],
): PeriodSummaryKPIs {
  // Current period metrics
  const currTotalOrders = currentSalesRows.length;
  const currCompleted = currentSalesRows.filter(
    (r) => classifyOrderStatus(r.orderStatus) === "completed",
  ).length;
  const currCancelled = currentSalesRows.filter(
    (r) => classifyOrderStatus(r.orderStatus) === "cancelled",
  ).length;
  const currVerifiedRevenue = currentSalesRows.reduce((sum, r) => sum + r.verifiedPaymentAmount, 0);

  const currCompletionRate = currTotalOrders > 0 ? (currCompleted / currTotalOrders) * 100 : 0;
  // AOV: Verified revenue divided by completed orders (or paid orders if 0 completed)
  const currAovDenominator =
    currCompleted > 0 ? currCompleted : currentSalesRows.filter((r) => r.isFullyPaid).length;
  const currAOV = currAovDenominator > 0 ? currVerifiedRevenue / currAovDenominator : 0;

  // Previous period metrics
  const prevTotalOrders = prevSalesRows.length;
  const prevCompleted = prevSalesRows.filter(
    (r) => classifyOrderStatus(r.orderStatus) === "completed",
  ).length;
  const prevCancelled = prevSalesRows.filter(
    (r) => classifyOrderStatus(r.orderStatus) === "cancelled",
  ).length;
  const prevVerifiedRevenue = prevSalesRows.reduce((sum, r) => sum + r.verifiedPaymentAmount, 0);

  const prevCompletionRate = prevTotalOrders > 0 ? (prevCompleted / prevTotalOrders) * 100 : 0;
  const prevAovDenominator =
    prevCompleted > 0 ? prevCompleted : prevSalesRows.filter((r) => r.isFullyPaid).length;
  const prevAOV = prevAovDenominator > 0 ? prevVerifiedRevenue / prevAovDenominator : 0;

  return {
    verifiedRevenue: calculateComparisonMetric(currVerifiedRevenue, prevVerifiedRevenue),
    totalOrdersPlaced: calculateComparisonMetric(currTotalOrders, prevTotalOrders),
    completedOrders: calculateComparisonMetric(currCompleted, prevCompleted),
    cancelledOrRejectedOrders: calculateComparisonMetric(currCancelled, prevCancelled),
    completionRatePct: calculateComparisonMetric(
      Math.round(currCompletionRate * 10) / 10,
      Math.round(prevCompletionRate * 10) / 10,
    ),
    averageOrderValue: calculateComparisonMetric(
      Math.round(currAOV * 10) / 10,
      Math.round(prevAOV * 10) / 10,
    ),
  };
}

/**
 * Pure calculation: Aggregates product volume, revenue, and trends across current and previous periods.
 */
export function aggregateProductPerformance(
  currentSalesRows: OrderSalesRow[],
  prevSalesRows: OrderSalesRow[],
  inventoryProducts: Array<{
    id: string;
    name: string;
    categorySlug?: string;
    categoryName?: string;
    price: number;
    available?: boolean;
    stockQuantity?: number | null;
    trackInventory?: boolean;
  }> = [],
  categoriesCatalog: Array<{ id: string; slug: string; name: string }> = [],
): ProductPerformanceItem[] {
  const categoryNameBySlug = new Map(categoriesCatalog.map((c) => [c.slug, c.name]));
  const categoryNameById = new Map(categoriesCatalog.map((c) => [c.id, c.name]));

  // Index inventory products
  const productInfoMap = new Map<string, (typeof inventoryProducts)[0]>();
  for (const p of inventoryProducts) {
    productInfoMap.set(p.id, p);
  }

  // Aggregate current period quantities & revenues
  const currAgg = new Map<
    string,
    {
      productId: string;
      name: string;
      quantity: number;
      revenue: number;
      orderCount: number;
      unitPrice: number;
    }
  >();

  let totalPeriodRevenue = 0;

  for (const row of currentSalesRows) {
    for (const item of row.items) {
      const pid = item.productId || item.name;
      const existing = currAgg.get(pid) || {
        productId: pid,
        name: item.name,
        quantity: 0,
        revenue: 0,
        orderCount: 0,
        unitPrice: item.unitPrice,
      };

      existing.quantity += item.quantity;
      existing.revenue += item.lineTotal;
      existing.orderCount += 1;
      if (!existing.unitPrice && item.unitPrice) {
        existing.unitPrice = item.unitPrice;
      }
      currAgg.set(pid, existing);
      totalPeriodRevenue += item.lineTotal;
    }
  }

  // Aggregate previous period quantities & revenues
  const prevAgg = new Map<string, { quantity: number; revenue: number }>();
  for (const row of prevSalesRows) {
    for (const item of row.items) {
      const pid = item.productId || item.name;
      const existing = prevAgg.get(pid) || { quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.lineTotal;
      prevAgg.set(pid, existing);
    }
  }

  // Combine into ProductPerformanceItem list
  const results: ProductPerformanceItem[] = [];

  for (const [pid, curr] of currAgg.entries()) {
    const inv = productInfoMap.get(pid);
    const prev = prevAgg.get(pid) || { quantity: 0, revenue: 0 };

    const catSlug = inv?.categorySlug || "other";
    const catName =
      inv?.categoryName ||
      categoryNameBySlug.get(catSlug) ||
      (inv?.categorySlug && categoryNameById.get(inv.categorySlug)) ||
      "General";

    // Trend calculation
    let trendDirection: "rising" | "declining" | "steady" | "new" = "steady";
    let trendDiffPct: number | null = null;

    if (prev.quantity === 0) {
      trendDirection = curr.quantity > 0 ? "new" : "steady";
      trendDiffPct = curr.quantity > 0 ? 100 : 0;
    } else {
      const diff = curr.quantity - prev.quantity;
      const rawPct = (diff / prev.quantity) * 100;
      trendDiffPct = Math.round(rawPct * 10) / 10;
      if (diff > 0) {
        trendDirection = "rising";
      } else if (diff < 0) {
        trendDirection = "declining";
      } else {
        trendDirection = "steady";
      }
    }

    const percentOfTotalRevenue =
      totalPeriodRevenue > 0 ? Math.round((curr.revenue / totalPeriodRevenue) * 1000) / 10 : 0;

    results.push({
      productId: pid,
      name: curr.name || inv?.name || "Menu Item",
      categoryName: catName,
      categorySlug: catSlug,
      unitPrice: curr.unitPrice || inv?.price || 0,
      quantitySold: curr.quantity,
      totalRevenue: curr.revenue,
      orderCount: curr.orderCount,
      percentOfTotalRevenue,
      isAvailable: inv?.available ?? true,
      physicalStockQuantity: inv?.stockQuantity !== undefined ? inv.stockQuantity : null,
      trackInventory: Boolean(inv?.trackInventory ?? false),
      trendDirection,
      trendDiffPct,
      prevQuantitySold: prev.quantity,
      prevRevenue: prev.revenue,
    });
  }

  // Sort default: highest total revenue first
  results.sort((a, b) => b.totalRevenue - a.totalRevenue);
  return results;
}

/**
 * Pure calculation: Aggregates category performance from product items.
 */
export function aggregateCategoryPerformance(
  productItems: ProductPerformanceItem[],
  categoriesCatalog: Array<{ id: string; slug: string; name: string }> = [],
): CategoryPerformanceItem[] {
  const categoryMap = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      categorySlug: string;
      totalRevenue: number;
      quantitySold: number;
      orderCount: number;
      productCount: number;
      products: ProductPerformanceItem[];
    }
  >();

  // Initialize known categories
  for (const cat of categoriesCatalog) {
    categoryMap.set(cat.slug, {
      categoryId: cat.id,
      categoryName: cat.name,
      categorySlug: cat.slug,
      totalRevenue: 0,
      quantitySold: 0,
      orderCount: 0,
      productCount: 0,
      products: [],
    });
  }

  let grandTotalRevenue = 0;

  for (const item of productItems) {
    grandTotalRevenue += item.totalRevenue;
    const slug = item.categorySlug || "other";
    const existing = categoryMap.get(slug) || {
      categoryId: slug,
      categoryName: item.categoryName || "General",
      categorySlug: slug,
      totalRevenue: 0,
      quantitySold: 0,
      orderCount: 0,
      productCount: 0,
      products: [],
    };

    existing.totalRevenue += item.totalRevenue;
    existing.quantitySold += item.quantitySold;
    existing.orderCount += item.orderCount;
    existing.productCount += 1;
    existing.products.push(item);
    categoryMap.set(slug, existing);
  }

  const result: CategoryPerformanceItem[] = [];

  for (const cat of categoryMap.values()) {
    // Only return categories that have products or revenue, or are active
    if (cat.productCount === 0 && cat.totalRevenue === 0) continue;

    cat.products.sort((a, b) => b.totalRevenue - a.totalRevenue);
    const topProd = cat.products[0]
      ? {
          name: cat.products[0].name,
          quantity: cat.products[0].quantitySold,
          revenue: cat.products[0].totalRevenue,
        }
      : null;

    const percentOfTotalRevenue =
      grandTotalRevenue > 0 ? Math.round((cat.totalRevenue / grandTotalRevenue) * 1000) / 10 : 0;

    result.push({
      categoryId: cat.categoryId,
      categoryName: cat.categoryName,
      categorySlug: cat.categorySlug,
      totalRevenue: cat.totalRevenue,
      quantitySold: cat.quantitySold,
      orderCount: cat.orderCount,
      productCount: cat.productCount,
      percentOfTotalRevenue,
      topProduct: topProd,
    });
  }

  result.sort((a, b) => b.totalRevenue - a.totalRevenue);
  return result;
}

/**
 * Pure calculation: Computes customer dynamics (new vs returning, frequency distribution, top customers).
 * Distinguishes unidentified diners cleanly.
 */
export function calculateCustomerDynamics(
  allHistoricalOrders: Array<{
    id: string;
    customerId?: string | null;
    customerPhone?: string | null;
    customerName?: string | null;
    totalAmount: number;
    createdAt: string;
  }>,
  windowStart: Date,
  windowEnd: Date,
  prevStart: Date,
  prevEnd: Date,
): CustomerDynamicsData {
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  const prevStartMs = prevStart.getTime();
  const prevEndMs = prevEnd.getTime();

  // 1. Group all historical orders by authoritative customer identifier
  // Key: customer_id (preferred) or normalized phone. Unidentified if neither.
  interface CustomerProfileAccumulator {
    id: string;
    name: string;
    phone: string;
    earliestOrderDate: Date;
    latestOrderDate: Date;
    allOrders: Array<{ date: Date; amount: number }>;
  }

  const customerMap = new Map<string, CustomerProfileAccumulator>();
  let currUnidentifiedDiners = 0;
  let prevUnidentifiedDiners = 0;

  for (const o of allHistoricalOrders) {
    const oTime = new Date(o.createdAt).getTime();
    if (isNaN(oTime)) continue;

    const normPhone = normalizePhone(o.customerPhone);
    const identifier = o.customerId
      ? `id:${o.customerId}`
      : normPhone
        ? `phone:${normPhone}`
        : null;

    if (!identifier) {
      if (oTime >= startMs && oTime <= endMs) {
        currUnidentifiedDiners += 1;
      } else if (oTime >= prevStartMs && oTime <= prevEndMs) {
        prevUnidentifiedDiners += 1;
      }
      continue;
    }

    const orderDate = new Date(oTime);
    const existing = customerMap.get(identifier);

    if (!existing) {
      customerMap.set(identifier, {
        id: o.customerId || identifier,
        name: o.customerName || "Customer",
        phone: normPhone || o.customerPhone || "",
        earliestOrderDate: orderDate,
        latestOrderDate: orderDate,
        allOrders: [{ date: orderDate, amount: Number(o.totalAmount) || 0 }],
      });
    } else {
      if (orderDate < existing.earliestOrderDate) {
        existing.earliestOrderDate = orderDate;
      }
      if (orderDate > existing.latestOrderDate) {
        existing.latestOrderDate = orderDate;
      }
      if (o.customerName && existing.name === "Customer") {
        existing.name = o.customerName;
      }
      existing.allOrders.push({ date: orderDate, amount: Number(o.totalAmount) || 0 });
    }
  }

  // 2. Classify customers in Current Period [startMs, endMs]
  let currNewCount = 0;
  let currReturningCount = 0;
  const currActiveProfiles: Array<{
    profile: CustomerProfileAccumulator;
    periodOrdersCount: number;
    periodSpent: number;
  }> = [];

  for (const prof of customerMap.values()) {
    const periodOrders = prof.allOrders.filter((o) => {
      const t = o.date.getTime();
      return t >= startMs && t <= endMs;
    });

    if (periodOrders.length > 0) {
      const periodSpent = periodOrders.reduce((sum, o) => sum + o.amount, 0);
      currActiveProfiles.push({
        profile: prof,
        periodOrdersCount: periodOrders.length,
        periodSpent,
      });

      // Customer is "new" if their earliest lifetime order is inside current window
      if (prof.earliestOrderDate.getTime() >= startMs) {
        currNewCount += 1;
      } else {
        currReturningCount += 1;
      }
    }
  }

  // 3. Classify customers in Previous Period [prevStartMs, prevEndMs]
  let prevNewCount = 0;
  let prevReturningCount = 0;

  for (const prof of customerMap.values()) {
    const periodOrders = prof.allOrders.filter((o) => {
      const t = o.date.getTime();
      return t >= prevStartMs && t <= prevEndMs;
    });

    if (periodOrders.length > 0) {
      if (prof.earliestOrderDate.getTime() >= prevStartMs) {
        prevNewCount += 1;
      } else {
        prevReturningCount += 1;
      }
    }
  }

  const currTotalIdentified = currActiveProfiles.length;
  const prevTotalIdentified = prevNewCount + prevReturningCount;

  const returningRate =
    currTotalIdentified > 0
      ? Math.round((currReturningCount / currTotalIdentified) * 1000) / 10
      : 0;

  // 4. Order Frequency Distribution in Current Period
  let b1 = 0; // 1 order
  let b23 = 0; // 2-3 orders
  let b46 = 0; // 4-6 orders
  let b7plus = 0; // 7+ orders

  for (const item of currActiveProfiles) {
    const c = item.periodOrdersCount;
    if (c === 1) b1 += 1;
    else if (c <= 3) b23 += 1;
    else if (c <= 6) b46 += 1;
    else b7plus += 1;
  }

  const freqDist: FrequencyBracketItem[] = [
    {
      bracket: "1 Order",
      customerCount: b1,
      percentage: currTotalIdentified > 0 ? Math.round((b1 / currTotalIdentified) * 1000) / 10 : 0,
      description: "First-time or single-visit customers in selected period",
    },
    {
      bracket: "2–3 Orders",
      customerCount: b23,
      percentage: currTotalIdentified > 0 ? Math.round((b23 / currTotalIdentified) * 1000) / 10 : 0,
      description: "Developing regular diners with repeated visits",
    },
    {
      bracket: "4–6 Orders",
      customerCount: b46,
      percentage: currTotalIdentified > 0 ? Math.round((b46 / currTotalIdentified) * 1000) / 10 : 0,
      description: "High-frequency weekly loyal patrons",
    },
    {
      bracket: "7+ Orders",
      customerCount: b7plus,
      percentage:
        currTotalIdentified > 0 ? Math.round((b7plus / currTotalIdentified) * 1000) / 10 : 0,
      description: "VIP and daily regulars driving steady repeat volume",
    },
  ];

  // 5. Top Loyal Customers in Period (by period spend, fallback to lifetime spend)
  currActiveProfiles.sort((a, b) => b.periodSpent - a.periodSpent);
  const topLoyalCustomers: LoyalCustomerItem[] = currActiveProfiles.slice(0, 10).map((item) => {
    const p = item.profile;
    const lifetimeSpent = p.allOrders.reduce((sum, o) => sum + o.amount, 0);
    return {
      customerId: p.id,
      name: p.name || "Diner",
      maskedPhone: maskPhone(p.phone),
      orderCountInPeriod: item.periodOrdersCount,
      totalSpentInPeriod: item.periodSpent,
      lifetimeOrderCount: p.allOrders.length,
      lifetimeSpent,
      firstOrderDate: p.earliestOrderDate.toISOString(),
      lastOrderDate: p.latestOrderDate.toISOString(),
    };
  });

  return {
    totalCustomersIdentified: calculateComparisonMetric(currTotalIdentified, prevTotalIdentified),
    newCustomersCount: calculateComparisonMetric(currNewCount, prevNewCount),
    returningCustomersCount: calculateComparisonMetric(currReturningCount, prevReturningCount),
    unidentifiedDinersCount: calculateComparisonMetric(
      currUnidentifiedDiners,
      prevUnidentifiedDiners,
    ),
    returningCustomerRatePct: returningRate,
    frequencyDistribution: freqDist,
    topLoyalCustomers,
  };
}

/**
 * Pure calculation: Generates daily growth trend points within the selected window.
 */
export function generateDailyGrowthTrends(
  salesRows: OrderSalesRow[],
  window: FinancialDateWindow,
): DailyGrowthTrendPoint[] {
  const map = new Map<
    string,
    { label: string; revenue: number; totalCount: number; completedCount: number }
  >();

  // Determine date bounds
  const cur = new Date(window.start);
  const end = new Date(window.end);

  // Normalize cursor to day start in local time
  cur.setHours(0, 0, 0, 0);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const dateKey = `${y}-${m}-${d}`;

    const label = cur.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    map.set(dateKey, { label, revenue: 0, totalCount: 0, completedCount: 0 });
    cur.setDate(cur.getDate() + 1);
  }

  // Populate actual data
  for (const row of salesRows) {
    const dateStr = row.orderCreatedAt ? row.orderCreatedAt.split("T")[0] : null;
    if (!dateStr) continue;

    const point = map.get(dateStr);
    if (point) {
      point.totalCount += 1;
      point.revenue += row.verifiedPaymentAmount;
      if (classifyOrderStatus(row.orderStatus) === "completed") {
        point.completedCount += 1;
      }
    }
  }

  return Array.from(map.entries()).map(([dateKey, val]) => ({
    dateKey,
    label: val.label,
    verifiedRevenue: Math.round(val.revenue * 10) / 10,
    ordersCount: val.totalCount,
    completedOrdersCount: val.completedCount,
  }));
}

/**
 * Pure calculation: Produces factual, transparent growth observations directly from metrics.
 */
export function generateGrowthInsights(
  kpis: PeriodSummaryKPIs,
  topProducts: ProductPerformanceItem[],
  topCategories: CategoryPerformanceItem[],
  customerDynamics: CustomerDynamicsData,
  operationalAlignment: OperationalAlignmentSummary,
): GrowthInsight[] {
  const insights: GrowthInsight[] = [];

  // 1. Revenue trajectory insight
  const revDiff = kpis.verifiedRevenue.diff;
  const revPct = kpis.verifiedRevenue.percentageChange;
  if (kpis.verifiedRevenue.current > 0) {
    if (kpis.verifiedRevenue.trend === "up") {
      insights.push({
        id: "ins-rev-growth",
        type: "growth",
        title: "Revenue Expansion",
        description: `Verified sales revenue grew by ${revPct ?? 0}% (+${formatETB(revDiff)}) compared to the preceding period.`,
        metricBadge: `+${revPct}%`,
      });
    } else if (kpis.verifiedRevenue.trend === "down") {
      insights.push({
        id: "ins-rev-contraction",
        type: "warning",
        title: "Revenue Contraction",
        description: `Verified revenue contracted by ${Math.abs(revPct ?? 0)}% (-${formatETB(Math.abs(revDiff))}) relative to the prior period.`,
        metricBadge: `${revPct}%`,
      });
    }
  }

  // 2. Best-seller contribution
  const top = topProducts[0];
  if (top && top.totalRevenue > 0) {
    insights.push({
      id: "ins-top-product",
      type: "opportunity",
      title: "Hero Product Contribution",
      description: `"${top.name}" is the top revenue generator, contributing ${top.percentOfTotalRevenue}% (${formatETB(top.totalRevenue)}) across ${top.quantitySold} units sold.`,
      metricBadge: `${top.percentOfTotalRevenue}% Share`,
    });
  }

  // 3. Category dominance
  const leadCat = topCategories[0];
  if (leadCat && leadCat.totalRevenue > 0) {
    insights.push({
      id: "ins-lead-category",
      type: "info",
      title: "Category Dominance",
      description: `"${leadCat.categoryName}" leads category sales with ${formatETB(leadCat.totalRevenue)} (${leadCat.percentOfTotalRevenue}% of all menu sales).`,
      metricBadge: `${leadCat.percentOfTotalRevenue}% Cat Share`,
    });
  }

  // 4. Customer retention & loyalty insight
  if (customerDynamics.totalCustomersIdentified.current > 0) {
    const retRate = customerDynamics.returningCustomerRatePct;
    if (retRate >= 40) {
      insights.push({
        id: "ins-ret-healthy",
        type: "growth",
        title: "Strong Customer Retention",
        description: `${retRate}% of identified diners are returning patrons, reflecting healthy brand loyalty and consistent dining habits.`,
        metricBadge: `${retRate}% Repeat`,
      });
    } else {
      insights.push({
        id: "ins-ret-acquisition",
        type: "opportunity",
        title: "Acquisition-Leaning Mix",
        description: `New diners represent ${Math.round((100 - retRate) * 10) / 10}% of active customers. Consider targeted loyalty incentives to elevate return frequency.`,
        metricBadge: `${retRate}% Repeat`,
      });
    }
  }

  // 5. Order completion / friction alert
  if (kpis.cancelledOrRejectedOrders.current > 0 && kpis.totalOrdersPlaced.current > 0) {
    const cancelRate =
      Math.round((kpis.cancelledOrRejectedOrders.current / kpis.totalOrdersPlaced.current) * 1000) /
      10;
    if (cancelRate >= 10) {
      insights.push({
        id: "ins-high-cancel",
        type: "warning",
        title: "Order Friction Notice",
        description: `${cancelRate}% of placed orders (${kpis.cancelledOrRejectedOrders.current} orders) were cancelled or rejected during this period.`,
        metricBadge: `${cancelRate}% Cancelled`,
      });
    }
  }

  // 6. Operational Stock Readiness Alert
  if (operationalAlignment.uninitializedStockCount > 0) {
    insights.push({
      id: "ins-uninitialized-stock",
      type: "info",
      title: "Stock Initialization Pending",
      description: `${operationalAlignment.uninitializedStockCount} menu items are flagged for inventory tracking but have uninitialized opening balances (null quantity).`,
      metricBadge: `${operationalAlignment.uninitializedStockCount} Items`,
    });
  }

  return insights;
}

/**
 * Loads all authoritative records and computes Category 5: Business Performance & Growth.
 */
export async function loadBusinessGrowthData(
  preset: FinancialDatePreset = "7days",
  customStart?: string,
  customEnd?: string,
): Promise<BusinessGrowthData> {
  const window = calculateFinancialDateWindows(preset, customStart, customEnd);

  // 1. Fetch Orders, Inventory Data, and Products concurrently
  const [ordersRes, inventoryRes, categoriesRes] = await Promise.allSettled([
    supabase
      .from("orders" as any)
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        customer_id,
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

    loadInventoryMonitoringData(),

    supabase
      .from("categories" as any)
      .select("id, slug, name")
      .order("name", { ascending: true }),
  ]);

  // Extract orders
  const rawOrders: any[] =
    ordersRes.status === "fulfilled" && Array.isArray(ordersRes.value.data)
      ? ordersRes.value.data
      : [];

  // Extract categories
  let categoriesCatalog: Array<{ id: string; slug: string; name: string }> = [];
  if (categoriesRes.status === "fulfilled" && Array.isArray(categoriesRes.value.data)) {
    categoriesCatalog = categoriesRes.value.data.map((c: any) => ({
      id: String(c.id || ""),
      slug: String(c.slug || ""),
      name: String(c.name || ""),
    }));
  }
  if (categoriesCatalog.length === 0) {
    categoriesCatalog = FALLBACK_CATEGORIES;
  }

  // Extract inventory products & summary
  const inventoryData = inventoryRes.status === "fulfilled" ? inventoryRes.value.data : null;
  const inventoryProducts =
    inventoryData?.products.map((p) => ({
      id: p.id,
      name: p.name,
      categorySlug: p.categorySlug,
      categoryName: p.categoryName,
      price: p.price,
      available: p.available,
      stockQuantity: p.stockQuantity,
      trackInventory: p.trackInventory,
    })) ||
    FALLBACK_PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      categorySlug: p.categorySlug,
      categoryName: "Menu Category",
      price: p.price,
      available: p.available,
      stockQuantity: p.stockQuantity,
      trackInventory: p.trackInventory,
    }));

  const operationalAlignment: OperationalAlignmentSummary = {
    totalMenuProducts: inventoryData?.metrics.totalProducts ?? inventoryProducts.length,
    availableMenuProducts:
      inventoryData?.metrics.availableProducts ??
      inventoryProducts.filter((p) => p.available).length,
    unavailableMenuProducts:
      inventoryData?.metrics.unavailableProducts ??
      inventoryProducts.filter((p) => !p.available).length,
    trackedProductsCount:
      inventoryData?.metrics.trackedProductsCount ??
      inventoryProducts.filter((p) => p.trackInventory).length,
    uninitializedStockCount:
      inventoryData?.metrics.uninitializedTrackedCount ??
      inventoryProducts.filter((p) => p.trackInventory && p.stockQuantity === null).length,
    physicalLowStockCount: inventoryData?.metrics.physicalLowStockCount ?? 0,
    physicalOutOfStockCount: inventoryData?.metrics.physicalOutOfStockCount ?? 0,
    catalogHealthNote:
      (inventoryData?.metrics.uninitializedTrackedCount ?? 0) > 0
        ? `${inventoryData?.metrics.uninitializedTrackedCount} tracked items lack physical opening balance counts.`
        : "Menu availability synchronized with catalog records.",
  };

  // Convert raw orders into verified OrderSalesRow
  const allSalesRows: OrderSalesRow[] = rawOrders.map(processOrderSalesRow);

  // Time window filtering
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  const prevStartMs = window.prevStart.getTime();
  const prevEndMs = window.prevEnd.getTime();

  const currentSalesRows = allSalesRows.filter((row) => {
    const t = new Date(row.orderCreatedAt).getTime();
    return t >= startMs && t <= endMs;
  });

  const prevSalesRows = allSalesRows.filter((row) => {
    const t = new Date(row.orderCreatedAt).getTime();
    return t >= prevStartMs && t <= prevEndMs;
  });

  // 2. Compute KPIs
  const kpis = calculatePeriodSummaryKPIs(currentSalesRows, prevSalesRows);

  // 3. Compute Product & Category Aggregations
  const productPerformance = aggregateProductPerformance(
    currentSalesRows,
    prevSalesRows,
    inventoryProducts,
    categoriesCatalog,
  );

  const topProductsByRevenue = [...productPerformance].sort(
    (a, b) => b.totalRevenue - a.totalRevenue,
  );
  const topProductsByQuantity = [...productPerformance].sort(
    (a, b) => b.quantitySold - a.quantitySold,
  );
  const risingProducts = productPerformance.filter(
    (p) => p.trendDirection === "rising" || p.trendDirection === "new",
  );
  const decliningProducts = productPerformance.filter((p) => p.trendDirection === "declining");

  const categoryPerformance = aggregateCategoryPerformance(productPerformance, categoriesCatalog);

  // 4. Customer Dynamics
  const allRawForCustomers = rawOrders.map((o) => ({
    id: o.id,
    customerId: o.customer_id,
    customerPhone: o.customer_phone,
    customerName: o.customer_name,
    totalAmount: Number(o.total_amount) || 0,
    createdAt: o.created_at,
  }));

  const customerDynamics = calculateCustomerDynamics(
    allRawForCustomers,
    window.start,
    window.end,
    window.prevStart,
    window.prevEnd,
  );

  // 5. Daily Growth Trends
  const dailyTrends = generateDailyGrowthTrends(currentSalesRows, window);

  // 6. Growth Insights
  const insights = generateGrowthInsights(
    kpis,
    topProductsByRevenue,
    categoryPerformance,
    customerDynamics,
    operationalAlignment,
  );

  return {
    window,
    kpis,
    dailyTrends,
    productPerformance,
    topProductsByQuantity,
    topProductsByRevenue,
    risingProducts,
    decliningProducts,
    categoryPerformance,
    customerDynamics,
    operationalAlignment,
    schemaGaps: CATEGORY_5_SCHEMA_GAPS,
    insights,
    lastRefreshedAt: new Date().toISOString(),
  };
}
