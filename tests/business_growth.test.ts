/**
 * ============================================================================
 * Rekik Café — Category 5: Business Performance & Growth Unit Tests
 * File: tests/business_growth.test.ts
 * ============================================================================
 * Verifies the authoritative metrics calculation engine, period comparisons,
 * product/category performance, customer dynamics, and transparent schema gaps.
 */

import assert from "node:assert/strict";
import {
  calculatePeriodSummaryKPIs,
  aggregateProductPerformance,
  aggregateCategoryPerformance,
  calculateCustomerDynamics,
  generateDailyGrowthTrends,
  generateGrowthInsights,
  classifyOrderStatus,
  CATEGORY_5_SCHEMA_GAPS,
  type OperationalAlignmentSummary,
} from "../src/lib/business-growth";
import {
  calculateFinancialDateWindows,
  calculateComparisonMetric,
  processOrderSalesRow,
  type OrderSalesRow,
} from "../src/lib/financial-monitoring";
import { normalizePhone, maskPhone } from "../src/lib/customers";

console.log("==========================================================");
console.log("RUNNING REKIK CAFÉ BUSINESS PERFORMANCE & GROWTH TESTS");
console.log("==========================================================");

// ── Test 1: Date Windows & EAT Preceding Period Duration Invariants ──────────
console.log("\n[1] Testing Date Windows & Preceding Equivalent Duration Invariant...");

const todayWin = calculateFinancialDateWindows("today");
assert.equal(todayWin.preset, "today");
const todaySpan = todayWin.end.getTime() - todayWin.start.getTime();
const prevTodaySpan = todayWin.prevEnd.getTime() - todayWin.prevStart.getTime();
assert.ok(
  Math.abs(todaySpan - prevTodaySpan) < 1000,
  "Today and yesterday durations must be equal",
);

const sevenDaysWin = calculateFinancialDateWindows("7days");
assert.equal(sevenDaysWin.preset, "7days");
const span7 = sevenDaysWin.end.getTime() - sevenDaysWin.start.getTime();
const prevSpan7 = sevenDaysWin.prevEnd.getTime() - sevenDaysWin.prevStart.getTime();
assert.ok(
  Math.abs(span7 - prevSpan7) < 5000,
  "7-day window and preceding 7-day window must have equal durations",
);

const thirtyDaysWin = calculateFinancialDateWindows("30days");
assert.equal(thirtyDaysWin.preset, "30days");
const span30 = thirtyDaysWin.end.getTime() - thirtyDaysWin.start.getTime();
const prevSpan30 = thirtyDaysWin.prevEnd.getTime() - thirtyDaysWin.prevStart.getTime();
assert.ok(
  Math.abs(span30 - prevSpan30) < 5000,
  "30-day window and preceding 30-day window must have equal durations",
);

console.log("✓ Date windows & equivalent comparison period tests passed!");

// ── Test 2: Verified Revenue Deduplication & Non-Double Counting ──────────────
console.log("\n[2] Testing Verified Revenue Deduplication...");

// Order with 1 failed attempt and 1 verified paid attempt
const orderWithRetry = {
  id: "order-101",
  order_number: "ORD-101",
  customer_name: "Abebe Bikila",
  customer_phone: "0911223344",
  status: "completed",
  method: "dine_in",
  subtotal: 500,
  total_amount: 500,
  created_at: new Date().toISOString(),
  payments: [
    {
      id: "pay-1",
      order_id: "order-101",
      method: "cbe_birr",
      status: "failed",
      amount: 500,
    },
    {
      id: "pay-2",
      order_id: "order-101",
      method: "telebirr",
      status: "paid",
      amount: 500,
      transaction_reference: "TLB998877",
    },
  ],
  order_items: [
    {
      id: "item-1",
      product_id: "p-1",
      name: "Classic Burger",
      unit_price: 250,
      quantity: 2,
      line_total: 500,
    },
  ],
};

const salesRow1 = processOrderSalesRow(orderWithRetry);
assert.equal(salesRow1.verifiedPaymentAmount, 500, "Failed payment attempt must NOT be counted");
assert.equal(salesRow1.isFullyPaid, true);
assert.equal(salesRow1.paymentStatus, "paid");

// Order with only pending proof upload
const orderWithPendingProof = {
  id: "order-102",
  order_number: "ORD-102",
  status: "payment_under_review",
  method: "delivery",
  total_amount: 300,
  created_at: new Date().toISOString(),
  payments: [
    {
      id: "pay-3",
      order_id: "order-102",
      status: "pending",
      amount: 300,
    },
  ],
  order_items: [],
};

const salesRow2 = processOrderSalesRow(orderWithPendingProof);
assert.equal(
  salesRow2.verifiedPaymentAmount,
  0,
  "Pending payment attempt must NOT count as verified revenue",
);
assert.equal(salesRow2.isFullyPaid, false);
assert.equal(salesRow2.paymentStatus, "pending");

console.log("✓ Verified revenue deduplication tests passed!");

// ── Test 3: Order Status Classification & Period Summary KPIs ────────────────
console.log("\n[3] Testing Order Status Classification & Period Summary KPIs...");

assert.equal(classifyOrderStatus("completed"), "completed");
assert.equal(classifyOrderStatus("delivered"), "completed");
assert.equal(classifyOrderStatus("cancelled"), "cancelled");
assert.equal(classifyOrderStatus("rejected"), "cancelled");
assert.equal(classifyOrderStatus("payment_rejected"), "cancelled");
assert.equal(classifyOrderStatus("confirmed"), "in_flight");
assert.equal(classifyOrderStatus("preparing"), "in_flight");

const currentRows: OrderSalesRow[] = [
  salesRow1, // completed, verifiedPayment = 500
  salesRow2, // in_flight (payment_under_review), verifiedPayment = 0
  {
    ...salesRow1,
    orderId: "order-103",
    orderStatus: "cancelled",
    verifiedPaymentAmount: 0,
    isFullyPaid: false,
  },
];

const prevRows: OrderSalesRow[] = [
  {
    ...salesRow1,
    orderId: "order-099",
    verifiedPaymentAmount: 400,
    orderStatus: "completed",
  },
];

const kpis = calculatePeriodSummaryKPIs(currentRows, prevRows);
assert.equal(kpis.verifiedRevenue.current, 500);
assert.equal(kpis.verifiedRevenue.previous, 400);
assert.equal(kpis.verifiedRevenue.diff, 100);
assert.equal(kpis.verifiedRevenue.percentageChange, 25);
assert.equal(kpis.verifiedRevenue.trend, "up");

assert.equal(kpis.totalOrdersPlaced.current, 3);
assert.equal(kpis.completedOrders.current, 1);
assert.equal(kpis.cancelledOrRejectedOrders.current, 1);

// Completion rate: 1/3 * 100 = 33.3%
assert.equal(kpis.completionRatePct.current, 33.3);

// AOV: 500 / 1 completed order = 500
assert.equal(kpis.averageOrderValue.current, 500);

// Zero division protection
const emptyKpis = calculatePeriodSummaryKPIs([], []);
assert.equal(emptyKpis.verifiedRevenue.current, 0);
assert.equal(emptyKpis.averageOrderValue.current, 0);
assert.equal(emptyKpis.completionRatePct.current, 0);
assert.ok(!isNaN(emptyKpis.averageOrderValue.current));
assert.ok(!isNaN(emptyKpis.completionRatePct.current));

console.log("✓ Period Summary KPIs & zero-division safety tests passed!");

// ── Test 4: Product Performance Aggregations & Trends ────────────────────────
console.log("\n[4] Testing Product Performance Aggregations & Trends...");

const sampleInventory = [
  {
    id: "p-1",
    name: "Classic Burger",
    categorySlug: "burgers",
    categoryName: "Burgers",
    price: 250,
    available: true,
    stockQuantity: null,
    trackInventory: true,
  },
  {
    id: "p-4",
    name: "Margherita Pizza",
    categorySlug: "pizza",
    categoryName: "Pizza",
    price: 420,
    available: true,
    stockQuantity: 12,
    trackInventory: true,
  },
  {
    id: "p-7",
    name: "Coca-Cola",
    categorySlug: "drinks",
    categoryName: "Soft Drinks",
    price: 50,
    available: false,
    stockQuantity: 0,
    trackInventory: true,
  },
];

const sampleCategories = [
  { id: "cat-1", slug: "burgers", name: "Burgers" },
  { id: "cat-2", slug: "pizza", name: "Pizza" },
  { id: "cat-4", slug: "drinks", name: "Soft Drinks" },
];

const currentProductRows: OrderSalesRow[] = [
  {
    ...salesRow1,
    items: [
      {
        id: "i-1",
        productId: "p-1",
        name: "Classic Burger",
        unitPrice: 250,
        quantity: 4,
        lineTotal: 1000,
      },
      {
        id: "i-2",
        productId: "p-7",
        name: "Coca-Cola",
        unitPrice: 50,
        quantity: 2,
        lineTotal: 100,
      },
    ],
  },
  {
    ...salesRow1,
    orderId: "order-104",
    items: [
      {
        id: "i-3",
        productId: "p-4",
        name: "Margherita Pizza",
        unitPrice: 420,
        quantity: 1,
        lineTotal: 420,
      },
    ],
  },
];

const prevProductRows: OrderSalesRow[] = [
  {
    ...salesRow1,
    items: [
      {
        id: "i-p1",
        productId: "p-1",
        name: "Classic Burger",
        unitPrice: 250,
        quantity: 2,
        lineTotal: 500,
      },
      {
        id: "i-p2",
        productId: "p-7",
        name: "Coca-Cola",
        unitPrice: 50,
        quantity: 5,
        lineTotal: 250,
      },
    ],
  },
];

const productPerf = aggregateProductPerformance(
  currentProductRows,
  prevProductRows,
  sampleInventory,
  sampleCategories,
);

assert.equal(productPerf.length, 3);
// Top by revenue: Classic Burger (1000 ETB)
assert.equal(productPerf[0]?.productId, "p-1");
assert.equal(productPerf[0]?.quantitySold, 4);
assert.equal(productPerf[0]?.totalRevenue, 1000);
// Classic Burger rose from 2 to 4 units (+100%)
assert.equal(productPerf[0]?.trendDirection, "rising");
assert.equal(productPerf[0]?.trendDiffPct, 100);
assert.equal(productPerf[0]?.physicalStockQuantity, null); // Uninitialized stock invariant

// Coca-Cola declined from 5 to 2 units (-60%)
const coke = productPerf.find((p) => p.productId === "p-7");
assert.ok(coke);
assert.equal(coke?.quantitySold, 2);
assert.equal(coke?.trendDirection, "declining");
assert.equal(coke?.trendDiffPct, -60);
assert.equal(coke?.isAvailable, false);

// Margherita Pizza was not sold in prev period -> "new"
const pizza = productPerf.find((p) => p.productId === "p-4");
assert.ok(pizza);
assert.equal(pizza?.trendDirection, "new");

console.log("✓ Product performance aggregations & trend tests passed!");

// ── Test 5: Category Performance Breakdown ───────────────────────────────────
console.log("\n[5] Testing Category Performance Breakdown...");

const catPerf = aggregateCategoryPerformance(productPerf, sampleCategories);
assert.equal(catPerf.length, 3);
// Burgers total: 1000 ETB
const burgerCat = catPerf.find((c) => c.categorySlug === "burgers");
assert.ok(burgerCat);
assert.equal(burgerCat?.totalRevenue, 1000);
assert.equal(burgerCat?.quantitySold, 4);
assert.equal(burgerCat?.topProduct?.name, "Classic Burger");

// Total revenue = 1000 + 420 + 100 = 1520
const totalCatRev = catPerf.reduce((sum, c) => sum + c.totalRevenue, 0);
assert.equal(totalCatRev, 1520);
console.log("✓ Category performance breakdown tests passed!");

// ── Test 6: Customer Segmentation (New vs Returning vs Unidentified) ─────────
console.log("\n[6] Testing Customer Dynamics Invariants...");

const now = new Date();
const windowStart = new Date(now.getTime() - 7 * 24 * 3600000);
const windowEnd = now;
const prevStart = new Date(windowStart.getTime() - 7 * 24 * 3600000);
const prevEnd = windowStart;

const historicalOrders = [
  // Customer A: First order was 20 days ago (prior to start). Order also placed today -> RETURNING
  {
    id: "ord-a1",
    customerId: "cust-a",
    customerPhone: "+251911223344",
    customerName: "Almaz Kebede",
    totalAmount: 400,
    createdAt: new Date(now.getTime() - 20 * 24 * 3600000).toISOString(),
  },
  {
    id: "ord-a2",
    customerId: "cust-a",
    customerPhone: "0911223344",
    customerName: "Almaz Kebede",
    totalAmount: 600,
    createdAt: new Date(now.getTime() - 2 * 24 * 3600000).toISOString(), // inside window
  },
  // Customer B: First order was 3 days ago -> NEW
  {
    id: "ord-b1",
    customerId: null,
    customerPhone: "0922334455", // identifies via normalized phone
    customerName: "Dawit Haile",
    totalAmount: 300,
    createdAt: new Date(now.getTime() - 3 * 24 * 3600000).toISOString(), // inside window
  },
  // Unidentified diner: No customerId and No phone
  {
    id: "ord-walkin",
    customerId: null,
    customerPhone: null,
    customerName: "Walk-in Diner",
    totalAmount: 150,
    createdAt: new Date(now.getTime() - 1 * 24 * 3600000).toISOString(), // inside window
  },
];

const custDyn = calculateCustomerDynamics(
  historicalOrders,
  windowStart,
  windowEnd,
  prevStart,
  prevEnd,
);

assert.equal(
  custDyn.totalCustomersIdentified.current,
  2,
  "Should identify 2 customers (cust-a and 0922334455)",
);
assert.equal(custDyn.newCustomersCount.current, 1, "Customer B should be classified as new");
assert.equal(
  custDyn.returningCustomersCount.current,
  1,
  "Customer A should be classified as returning",
);
assert.equal(
  custDyn.unidentifiedDinersCount.current,
  1,
  "Walk-in with no phone/ID must be counted as unidentified diner",
);
assert.equal(custDyn.returningCustomerRatePct, 50, "1 out of 2 identified is 50%");

// Check phone masking
assert.equal(maskPhone("0911223344"), "09••••••44");
assert.equal(maskPhone(null), "Not provided");
assert.equal(custDyn.topLoyalCustomers[0]?.maskedPhone, "09••••••44");

// Frequency distribution
const fDist = custDyn.frequencyDistribution;
assert.equal(fDist.find((f) => f.bracket === "1 Order")?.customerCount, 2);

console.log("✓ Customer dynamics & privacy masking tests passed!");

// ── Test 7: Transparent Schema Gap Disclosures ────────────────────────────────
console.log("\n[7] Testing Transparent Schema Gap Disclosures...");

assert.equal(CATEGORY_5_SCHEMA_GAPS.promotionAttribution.status, "unavailable");
assert.ok(CATEGORY_5_SCHEMA_GAPS.promotionAttribution.reason.includes("Missing Order-Promotion"));
assert.ok(CATEGORY_5_SCHEMA_GAPS.promotionAttribution.recommendedAction.includes("promotion_id"));

assert.equal(CATEGORY_5_SCHEMA_GAPS.recipeBOMAndCOGS.status, "unavailable");
assert.ok(CATEGORY_5_SCHEMA_GAPS.recipeBOMAndCOGS.title.includes("Recipe Bill of Materials"));
assert.ok(CATEGORY_5_SCHEMA_GAPS.recipeBOMAndCOGS.reason.includes("Recipe Formulation"));
assert.ok(CATEGORY_5_SCHEMA_GAPS.recipeBOMAndCOGS.recommendedAction.includes("recipe_items"));

console.log("✓ Schema gap disclosures tests passed!");

// ── Test 8: Factual Growth Insights Generation ────────────────────────────────
console.log("\n[8] Testing Growth Insights Generation...");

const dummyOperational: OperationalAlignmentSummary = {
  totalMenuProducts: 10,
  availableMenuProducts: 9,
  unavailableMenuProducts: 1,
  trackedProductsCount: 5,
  uninitializedStockCount: 2,
  physicalLowStockCount: 0,
  physicalOutOfStockCount: 0,
  catalogHealthNote: "Synchronized",
};

const insights = generateGrowthInsights(kpis, productPerf, catPerf, custDyn, dummyOperational);

assert.ok(insights.length >= 3, "Must generate at least 3 factual observations");
assert.ok(
  insights.some((i) => i.id === "ins-rev-growth"),
  "Must highlight revenue growth",
);
assert.ok(
  insights.some((i) => i.id === "ins-top-product"),
  "Must highlight top revenue generator",
);
assert.ok(
  insights.some((i) => i.id === "ins-uninitialized-stock"),
  "Must alert on uninitialized stock",
);

console.log("✓ Growth insights generation tests passed!");

console.log("\n==========================================================");
console.log("ALL CATEGORY 5: BUSINESS PERFORMANCE & GROWTH TESTS PASSED!");
console.log("==========================================================");
