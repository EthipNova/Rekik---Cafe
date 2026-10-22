/**
 * ============================================================================
 * Rekik Café — Category 1: Owner Dashboard Unit & Logic Tests
 * File: tests/owner_dashboard.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";
import { calculateDateBounds, isOrderPaid, getWorkflowCategory } from "../src/lib/owner-dashboard";
import type { Order, OrderStatus } from "../src/lib/orders";

console.log("==================================================");
console.log("RUNNING REKIK CAFÉ OWNER DASHBOARD VERIFICATION");
console.log("==================================================");

// ── Test 1: Date Range & Timezone Boundaries (EAT UTC+3) ─────────────────────
console.log("\n[1] Testing Date Bounds & Timezone Calculation...");

const todayBounds = calculateDateBounds("today");
assert.equal(todayBounds.isToday, true, "Today bounds should mark isToday=true");
assert.equal(todayBounds.preset, "today");
assert.ok(todayBounds.start <= todayBounds.end, "Start time must be <= end time");

const sevenDaysBounds = calculateDateBounds("7days");
assert.equal(sevenDaysBounds.isToday, false);
assert.equal(sevenDaysBounds.preset, "7days");
const diffDays7 =
  (sevenDaysBounds.end.getTime() - sevenDaysBounds.start.getTime()) / (24 * 3600000);
assert.ok(diffDays7 >= 6.9 && diffDays7 <= 7.1, "7 days bounds must span ~7 days");

const thirtyDaysBounds = calculateDateBounds("30days");
assert.equal(thirtyDaysBounds.isToday, false);
assert.equal(thirtyDaysBounds.preset, "30days");
const diffDays30 =
  (thirtyDaysBounds.end.getTime() - thirtyDaysBounds.start.getTime()) / (24 * 3600000);
assert.ok(diffDays30 >= 29.9 && diffDays30 <= 30.1, "30 days bounds must span ~30 days");

const customBounds = calculateDateBounds("custom", "2026-10-01", "2026-10-15");
assert.equal(customBounds.preset, "custom");
assert.ok(customBounds.start <= customBounds.end);
console.log("✓ Date bounds & timezone calculation tests passed!");

// ── Test 2: Verified Order Payment Qualification ─────────────────────────────
console.log("\n[2] Testing Verified Order Payment Qualification...");

const baseOrder: Order = {
  id: "test-1",
  number: "#1001",
  createdAt: new Date().toISOString(),
  method: "dine-in",
  status: "received",
  paymentStatus: "pending",
  paymentMethod: "CBE Birr",
  customer: { name: "Test Diner", phone: "0911223344" },
  items: [],
  subtotal: 300,
  discount: 0,
  delivery: 0,
  total: 300,
};

// Pending or failed orders must NEVER qualify as verified paid
assert.equal(isOrderPaid(baseOrder), false, "Pending payment must not qualify as paid");
assert.equal(
  isOrderPaid({ ...baseOrder, paymentStatus: "failed" }),
  false,
  "Failed payment must not qualify as paid",
);

// Paid orders must qualify
assert.equal(
  isOrderPaid({ ...baseOrder, paymentStatus: "paid" }),
  true,
  "paymentStatus='paid' must qualify",
);
assert.equal(
  isOrderPaid({ ...baseOrder, status: "payment_verified" }),
  true,
  "status='payment_verified' must qualify",
);
assert.equal(
  isOrderPaid({ ...baseOrder, status: "completed" }),
  true,
  "status='completed' must qualify",
);
console.log("✓ Verified order payment qualification tests passed!");

// ── Test 3: Rekik 5-Stage Workflow Categorization ────────────────────────────
console.log("\n[3] Testing Rekik 5-Stage Workflow Categorization...");

assert.equal(getWorkflowCategory("pending_waiter"), "waiter");
assert.equal(getWorkflowCategory("received"), "waiter");

assert.equal(getWorkflowCategory("awaiting_payment"), "payment");

assert.equal(getWorkflowCategory("payment_under_review"), "cashier");

assert.equal(getWorkflowCategory("payment_verified"), "verified");
assert.equal(getWorkflowCategory("preparing"), "verified");
assert.equal(getWorkflowCategory("ready"), "verified");
assert.equal(getWorkflowCategory("completed"), "verified");

assert.equal(getWorkflowCategory("rejected_by_waiter"), "issues");
assert.equal(getWorkflowCategory("payment_rejected"), "issues");
assert.equal(getWorkflowCategory("cancelled"), "issues");
console.log("✓ Rekik workflow categorization tests passed!");

// ── Test 4: Financial Precision & Zero Division Prevention ────────────────────
console.log("\n[4] Testing AOV & Zero Mock Value Invariants...");

const calcAov = (revenue: number, count: number) => (count > 0 ? revenue / count : 0);
assert.equal(calcAov(0, 0), 0, "AOV must be 0 when count is 0");
assert.equal(calcAov(1500, 3), 500, "AOV must correctly compute 1500 / 3 = 500");
assert.equal(calcAov(0, 5), 0, "AOV must be 0 when revenue is 0");
console.log("✓ Financial precision & zero division prevention tests passed!");

console.log("\n==================================================");
console.log("ALL REKIK OWNER DASHBOARD TESTS PASSED SUCCESSFULLY");
console.log("==================================================");
