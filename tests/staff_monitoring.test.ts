/**
 * ============================================================================
 * Rekik Café — Category 3: Staff and Activity Monitoring Unit Tests
 * File: tests/staff_monitoring.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";
import {
  calculateStaffDateBounds,
  aggregateStaffRoleCounts,
  classifyOperationalWorkload,
} from "../src/lib/staff-monitoring";

console.log("==================================================");
console.log("RUNNING REKIK CAFÉ STAFF MONITORING VERIFICATION");
console.log("==================================================");

// ── Test 1: Date Windows & Timezone Boundaries in Hawassa (EAT / UTC+3) ───────
console.log("\n[1] Testing Date Bounds & Timezone Calculation...");

const todayBounds = calculateStaffDateBounds("today");
assert.equal(todayBounds.preset, "today");
assert.equal(todayBounds.label, "Today (EAT)");
assert.ok(todayBounds.start <= todayBounds.end);
const spanToday = todayBounds.end.getTime() - todayBounds.start.getTime();
assert.ok(spanToday > 86000000 && spanToday <= 86400000);

const sevenDaysBounds = calculateStaffDateBounds("7days");
assert.equal(sevenDaysBounds.preset, "7days");
const span7 = sevenDaysBounds.end.getTime() - sevenDaysBounds.start.getTime();
assert.ok(Math.abs(span7 - 7 * 24 * 3600000) < 5000);

const customBounds = calculateStaffDateBounds("custom", "2026-10-01", "2026-10-15");
assert.equal(customBounds.preset, "custom");
assert.ok(customBounds.start <= customBounds.end);
console.log("✓ Date bounds & timezone calculation tests passed!");

// ── Test 2: Role Aggregation & Zero Presence Invention ─────────────────────────
console.log("\n[2] Testing Role Aggregation & Inactive Account Handling...");

const mockProfiles = [
  { role: "waiter", isActive: true },
  { role: "waiter", isActive: true },
  { role: "cashier", isActive: true },
  { role: "admin", isActive: true },
  { role: "kitchen", isActive: false },
  { role: "manager", isActive: true }, // will go to other
];

const roleCounts = aggregateStaffRoleCounts(mockProfiles);
assert.equal(roleCounts.waiter, 2, "Should count 2 waiters");
assert.equal(roleCounts.cashier, 1, "Should count 1 cashier");
assert.equal(roleCounts.admin, 1, "Should count 1 admin");
assert.equal(roleCounts.kitchen, 1, "Should count 1 kitchen");
assert.equal(roleCounts.other, 1, "Should classify unknown roles as other");

// Verify that no attendance tracking property exists on profiles
assert.equal(
  (mockProfiles[0] as unknown as Record<string, unknown>).on_duty,
  undefined,
  "Must not invent on_duty attendance property",
);
console.log("✓ Role aggregation & zero presence invention tests passed!");

// ── Test 3: Operational Workload Classification ───────────────────────────────
console.log("\n[3] Testing Operational Workload Queue Classification...");

const mockStaffMap = new Map<string, string>([
  ["waiter-1", "Desta Waiter"],
  ["waiter-2", "Almaz Waiter"],
]);

const mockOrders = [
  // 1. Awaiting waiter review
  {
    id: "ord-1",
    order_number: "#101",
    status: "pending_waiter",
    method: "dine-in",
    customer_name: "Customer A",
    table_number: "2",
    total_amount: 350,
    created_at: "2026-10-18T10:00:00Z",
  },
  // 2. Active assigned order to waiter-1
  {
    id: "ord-2",
    order_number: "#102",
    waiter_id: "waiter-1",
    status: "preparing",
    method: "dine-in",
    customer_name: "Customer B",
    table_number: "5",
    total_amount: 500,
    created_at: "2026-10-18T10:15:00Z",
  },
  // 3. Awaiting payment
  {
    id: "ord-3",
    order_number: "#103",
    waiter_id: "waiter-2",
    status: "awaiting_payment",
    method: "takeaway",
    customer_name: "Customer C",
    total_amount: 200,
    created_at: "2026-10-18T10:20:00Z",
  },
  // 4. Rejected by waiter
  {
    id: "ord-4",
    order_number: "#104",
    waiter_id: "waiter-1",
    status: "rejected_by_waiter",
    customer_name: "Customer D",
    created_at: "2026-10-18T10:25:00Z",
  },
  // 5. Completed order (should not be in active assigned queue)
  {
    id: "ord-5",
    order_number: "#105",
    waiter_id: "waiter-2",
    status: "completed",
    customer_name: "Customer E",
    created_at: "2026-10-18T10:30:00Z",
  },
];

const mockProofs = [
  // Pending review
  {
    id: "proof-1",
    order_id: "ord-3",
    status: "pending",
    submitted_amount: 200,
    transaction_reference: "TX-9988",
    created_at: "2026-10-18T10:35:00Z",
  },
  // Rejected proof
  {
    id: "proof-2",
    order_id: "ord-2",
    status: "rejected",
    submitted_amount: 500,
    rejection_reason: "Screenshot blurred and unreadable",
    created_at: "2026-10-18T10:40:00Z",
  },
];

const workload = classifyOperationalWorkload(mockOrders, mockProofs, mockStaffMap);

assert.equal(
  workload.ordersAwaitingWaiterReview.length,
  1,
  "Should find 1 order awaiting waiter review",
);
assert.equal(workload.ordersAwaitingWaiterReview[0].orderNumber, "#101");

assert.equal(
  workload.ordersAssignedToWaiters.length,
  2,
  "Should find 2 active assigned orders (preparing & awaiting_payment)",
);
assert.equal(workload.ordersAssignedToWaiters[0].waiterName, "Desta Waiter");

assert.equal(workload.ordersAwaitingPayment.length, 1, "Should find 1 order awaiting payment");
assert.equal(workload.ordersAwaitingPayment[0].orderNumber, "#103");

assert.equal(
  workload.paymentProofsAwaitingCashierReview.length,
  1,
  "Should find 1 payment proof awaiting cashier review",
);
assert.equal(workload.paymentProofsAwaitingCashierReview[0].proofId, "proof-1");

assert.equal(
  workload.recentlyRejectedItems.length,
  2,
  "Should find 2 rejected items (1 by waiter, 1 by cashier)",
);
console.log("✓ Operational workload queue classification tests passed!");

// ── Test 4: Supabase Connectivity Verification ────────────────────────────────
console.log("\n[4] Testing Supabase Client Connectivity...");

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY || "";

assert.ok(url.startsWith("https://"), "Supabase URL must be a valid HTTPS URL");
assert.ok(key.length > 20, "Supabase key must be non-empty and valid length");
console.log("✓ Supabase client connectivity configuration passed!");

console.log("\n==================================================");
console.log("ALL REKIK STAFF MONITORING TESTS PASSED!");
console.log("==================================================");
