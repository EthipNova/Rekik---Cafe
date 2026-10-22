/**
 * ============================================================================
 * Rekik Café — Category 2: Financial Monitoring Unit Tests
 * File: tests/financial_monitoring.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";
import {
  calculateFinancialDateWindows,
  calculateComparisonMetric,
  processOrderSalesRow,
} from "../src/lib/financial-monitoring";

console.log("==================================================");
console.log("RUNNING REKIK CAFÉ FINANCIAL MONITORING VERIFICATION");
console.log("==================================================");

// ── Test 1: Date Windows & Preceding Equivalent Period Boundaries ────────────
console.log("\n[1] Testing Date Windows & Preceding Comparison Periods...");

const todayWin = calculateFinancialDateWindows("today");
assert.equal(todayWin.preset, "today");
assert.equal(todayWin.isToday, true);
assert.equal(todayWin.label, "Today");
assert.equal(todayWin.prevLabel, "Yesterday");
// Check duration of previous window matches current window (1 day = 24h)
const todaySpan = todayWin.end.getTime() - todayWin.start.getTime();
const prevSpan = todayWin.prevEnd.getTime() - todayWin.prevStart.getTime();
assert.ok(Math.abs(todaySpan - prevSpan) < 1000, "Today and Yesterday spans must be identical");

const sevenDaysWin = calculateFinancialDateWindows("7days");
assert.equal(sevenDaysWin.preset, "7days");
const span7 = sevenDaysWin.end.getTime() - sevenDaysWin.start.getTime();
const prevSpan7 = sevenDaysWin.prevEnd.getTime() - sevenDaysWin.prevStart.getTime();
assert.ok(Math.abs(span7 - prevSpan7) < 5000, "7 Days and Prior 7 Days spans must be identical");

const customWin = calculateFinancialDateWindows("custom", "2026-10-01", "2026-10-10");
assert.equal(customWin.preset, "custom");
assert.ok(customWin.start <= customWin.end);
assert.ok(customWin.prevStart <= customWin.prevEnd);
console.log("✓ Financial date windows & preceding period tests passed!");

// ── Test 2: Period Comparison Percentage & Direction ─────────────────────────
console.log("\n[2] Testing Period Comparison Metrics & Trends...");

// Revenue increased from 1000 to 1500 (+50%)
const comp1 = calculateComparisonMetric(1500, 1000);
assert.equal(comp1.diff, 500);
assert.equal(comp1.percentageChange, 50);
assert.equal(comp1.trend, "up");

// Revenue decreased from 2000 to 1500 (-25%)
const comp2 = calculateComparisonMetric(1500, 2000);
assert.equal(comp2.diff, -500);
assert.equal(comp2.percentageChange, -25);
assert.equal(comp2.trend, "down");

// Previous was 0, now 1000 (+100%)
const comp3 = calculateComparisonMetric(1000, 0);
assert.equal(comp3.diff, 1000);
assert.equal(comp3.percentageChange, 100);
assert.equal(comp3.trend, "up");

// Both 0 (0% flat)
const comp4 = calculateComparisonMetric(0, 0);
assert.equal(comp4.diff, 0);
assert.equal(comp4.percentageChange, 0);
assert.equal(comp4.trend, "flat");
console.log("✓ Comparison metrics & trends tests passed!");

// ── Test 3: Multiple Payment Attempts & Duplicate Deduplication ──────────────
console.log("\n[3] Testing Multiple Payment Attempts & Non-Double Counting...");

const rawOrderWithDuplicateAttempts = {
  id: "order-mult-1",
  order_number: "#1099",
  created_at: "2026-10-18T10:00:00Z",
  status: "completed",
  method: "dine-in",
  customer_name: "Abebe B.",
  customer_phone: "0911223344",
  table_number: "4",
  subtotal: 500,
  discount_amount: 0,
  delivery_fee: 0,
  total_amount: 500,
  order_items: [
    {
      id: "item-1",
      product_id: "prod-burger",
      name: "Classic Burger",
      unit_price: 250,
      quantity: 2,
      line_total: 500,
    },
  ],
  payments: [
    // Attempt 1: Failed
    {
      id: "pay-1",
      order_id: "order-mult-1",
      method: "Telebirr",
      status: "failed",
      amount: 500,
      created_at: "2026-10-18T10:01:00Z",
    },
    // Attempt 2: Pending
    {
      id: "pay-2",
      order_id: "order-mult-1",
      method: "CBE Birr",
      status: "pending",
      amount: 500,
      created_at: "2026-10-18T10:02:00Z",
    },
    // Attempt 3: Verified Paid
    {
      id: "pay-3",
      order_id: "order-mult-1",
      method: "CBE Birr",
      status: "paid",
      amount: 500,
      transaction_reference: "CBE-TX-9988",
      paid_at: "2026-10-18T10:05:00Z",
      created_at: "2026-10-18T10:05:00Z",
    },
  ],
};

const processedRow = processOrderSalesRow(rawOrderWithDuplicateAttempts);

// CRITICAL VERIFICATION:
// Despite 3 payment attempts totaling 1500 ETB on the records,
// ONLY the 1 verified paid attempt of 500 ETB must be counted as verified payment amount!
assert.equal(
  processedRow.verifiedPaymentAmount,
  500,
  `Expected verified payment amount to be 500 ETB, got ${processedRow.verifiedPaymentAmount}`,
);
assert.equal(processedRow.isFullyPaid, true);
assert.equal(processedRow.paymentStatus, "paid");
assert.equal(processedRow.paymentAttemptsCount, 3, "Total attempt records tracked");
assert.equal(processedRow.transactionReference, "CBE-TX-9988");
assert.equal(processedRow.items.length, 1);
assert.equal(processedRow.items[0].unitPrice, 250, "Historical snapshot preserved");
assert.equal(processedRow.items[0].lineTotal, 500, "Historical line total preserved");
console.log("✓ Multiple payment attempts & deduplication tests passed!");

// ── Test 4: Failed & Pending Orders Financial Exclusion ──────────────────────
console.log("\n[4] Testing Failed & Pending Payment Exclusion from Revenue...");

const failedOrder = {
  id: "order-failed-1",
  order_number: "#1098",
  total_amount: 750,
  status: "payment_rejected",
  payments: [
    {
      id: "pay-f1",
      status: "failed",
      amount: 750,
    },
  ],
};

const processedFailed = processOrderSalesRow(failedOrder);
assert.equal(
  processedFailed.verifiedPaymentAmount,
  0,
  "Failed order must yield 0 verified revenue",
);
assert.equal(processedFailed.isFullyPaid, false);
assert.equal(processedFailed.paymentStatus, "failed");

const pendingOrder = {
  id: "order-pending-1",
  order_number: "#1097",
  total_amount: 320,
  status: "payment_under_review",
  payments: [
    {
      id: "pay-p1",
      status: "pending",
      amount: 320,
    },
  ],
};

const processedPending = processOrderSalesRow(pendingOrder);
assert.equal(
  processedPending.verifiedPaymentAmount,
  0,
  "Pending order must yield 0 verified revenue",
);
assert.equal(processedPending.isFullyPaid, false);
assert.equal(processedPending.paymentStatus, "pending");
console.log("✓ Financial exclusion of unverified payments passed!");

console.log("\n==================================================");
console.log("ALL REKIK FINANCIAL MONITORING TESTS PASSED!");
console.log("==================================================");
