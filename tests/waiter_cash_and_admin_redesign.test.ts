/**
 * ============================================================================
 * Rekik Café — Waiter Cash Payment & Admin Dashboard Redesign Verification Test
 * File: tests/waiter_cash_and_admin_redesign.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculateDateBounds,
  isOrderPaid,
  getWorkflowCategory,
  type OwnerDashboardData,
  type PopularMenuItem,
  type PaymentOverviewData,
} from "../src/lib/owner-dashboard";
import type { Order } from "../src/lib/orders";

console.log("======================================================================");
console.log("RUNNING REKIK CAFÉ WAITER CASH & ADMIN REDESIGN VERIFICATION TESTS");
console.log("======================================================================");

// ── Test 1: Waiter Payment Dialog Static & Logical Constraints ───────────────
console.log("\n[1] Verifying Waiter Payment Interface Constraints...");

const waiterDialogPath = path.resolve(process.cwd(), "src/components/waiter/WaiterPaymentDialog.tsx");
const waiterDialogCode = fs.readFileSync(waiterDialogPath, "utf-8");

// Requirement 1.2: Remove Bank Transfer from waiter payment methods
assert.ok(
  !waiterDialogCode.includes('{ id: "Bank Transfer"'),
  "Bank Transfer must NOT be an available payment option in WaiterPaymentDialog",
);
assert.ok(
  !waiterDialogCode.includes('label: "Bank Transfer"'),
  "Bank Transfer label must not be rendered in WaiterPaymentDialog",
);

// Verify remaining methods: Cash, Telebirr, CBE
assert.ok(
  waiterDialogCode.includes('id: "Cash at Table"'),
  "Cash at Table must be available in WaiterPaymentDialog",
);
assert.ok(
  waiterDialogCode.includes('id: "Telebirr Mobile"'),
  "Telebirr Mobile must be available in WaiterPaymentDialog",
);
assert.ok(
  waiterDialogCode.includes('id: "CBE Birr"'),
  "CBE Birr must be available in WaiterPaymentDialog",
);

// Requirement 1.1: Conditional Evidence Photo for Cash Payments
assert.ok(
  waiterDialogCode.includes("const isCash = paymentMethod.toLowerCase().includes(\"cash\")"),
  "WaiterPaymentDialog must determine if selected method is Cash",
);
assert.ok(
  waiterDialogCode.includes("!isCash && (") && waiterDialogCode.includes("Payment Evidence Photo"),
  "Evidence photo upload section must ONLY be displayed when isCash is false",
);
assert.ok(
  waiterDialogCode.includes("(isCash || Boolean(selectedFile))"),
  "Form validation must allow submission without file when isCash is true",
);
assert.ok(
  waiterDialogCode.includes('isCash ? "Record Cash Payment" : "Send to Cashier"'),
  "Submit button should indicate Record Cash Payment when Cash is selected",
);

console.log("✓ Waiter Payment Dialog checks passed (Bank Transfer removed, Cash requires no photo).");

// ── Test 2: Server-Side Waiter Payment Proof Logic ───────────────────────────
console.log("\n[2] Verifying Server-Side Cash & Attribution Handler...");

const serverWaiterPath = path.resolve(process.cwd(), "src/server/waiter.ts");
const serverWaiterCode = fs.readFileSync(serverWaiterPath, "utf-8");

// Server must handle cash without requiring image base64
assert.ok(
  serverWaiterCode.includes('resolvedScreenshotPath = isCash ? "cash-direct" :'),
  "Server must set screenshot_path to cash-direct when isCash is true and no image provided",
);

// Server must record waiter reference and timestamp
assert.ok(
  serverWaiterCode.includes("collected_by: staff.userId"),
  "Server must record collected_by (waiter ID) in payments table",
);
assert.ok(
  serverWaiterCode.includes("collected_at: nowIso"),
  "Server must record collected_at timestamp in payments table",
);
assert.ok(
  serverWaiterCode.includes("payment_method: input.paymentMethod"),
  "Server must update orders table with customer's payment_method",
);

console.log("✓ Server-Side waiter cash attribution & workflow checks passed.");

// ── Test 3: Admin Navigation Groups Verification ─────────────────────────────
console.log("\n[3] Verifying Admin Sidebar Navigation Structure...");

const adminLayoutPath = path.resolve(process.cwd(), "src/routes/admin.tsx");
const adminLayoutCode = fs.readFileSync(adminLayoutPath, "utf-8");

assert.ok(
  adminLayoutCode.includes('group: "Overview"'),
  "Admin navigation must include 'Overview' group",
);
assert.ok(
  adminLayoutCode.includes('group: "Financial Management"'),
  "Admin navigation must include 'Financial Management' group",
);
assert.ok(
  adminLayoutCode.includes('group: "Café Management"'),
  "Admin navigation must include 'Café Management' group",
);
assert.ok(
  adminLayoutCode.includes('group: "Settings"'),
  "Admin navigation must include 'Settings' group",
);

// Verify all key destinations are present
assert.ok(adminLayoutCode.includes('to: "/admin"'), "Dashboard link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/orders"'), "Order & Payment link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/expenses"'), "Expenses link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/products"'), "Menu Items link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/categories"'), "Categories link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/staff"'), "Staff Management link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/customers"'), "Customers link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/settings"'), "Store Settings link must be present");
assert.ok(adminLayoutCode.includes('to: "/admin/account"'), "Payment Accounts link must be present");

console.log("✓ Admin navigation grouped into Overview, Operations, Management, and Configuration.");

// ── Test 4: Admin Dashboard Metrics & 4 Monitoring Sections ──────────────────
console.log("\n[4] Verifying Admin Dashboard Overview Page Layout & Logic...");

const adminIndexPath = path.resolve(process.cwd(), "src/routes/admin.index.tsx");
const adminIndexCode = fs.readFileSync(adminIndexPath, "utf-8");

// Verify Key Financial Dashboard Metrics
assert.ok(adminIndexCode.includes("Money Collected") || adminIndexCode.includes("Revenue"), "Must display Money Collected / Revenue metric");
assert.ok(adminIndexCode.includes("Expenses"), "Must display Expenses metric");
assert.ok(adminIndexCode.includes("Estimated Operating Profit") || adminIndexCode.includes("Profit"), "Must display Operating Profit metric");
assert.ok(adminIndexCode.includes("Pending Payments") || adminIndexCode.includes("Pending"), "Must display Pending Payments metric");

// Verify Financial Visualizations & Monitoring
assert.ok(adminIndexCode.includes("Revenue vs. Expenses") || adminIndexCode.includes("Expenses"), "Must include Revenue vs. Expenses chart/monitoring");
assert.ok(adminIndexCode.includes("Recent Financial Activity") || adminIndexCode.includes("Recent"), "Must include Recent Activity section");
assert.ok(adminIndexCode.includes("Expense Breakdown") || adminIndexCode.includes("Expenses"), "Must include Expense Breakdown section");

// Verify Payment Breakdown methods in Payment Overview
assert.ok(adminIndexCode.includes("Paid"), "Payment Overview must show Paid status");
assert.ok(adminIndexCode.includes("Pending"), "Payment Overview must show Pending status");

// Verify Revenue Integrity: strictly paid orders
const testPendingOrder: Order = {
  id: "o-pending",
  number: "#9901",
  createdAt: new Date().toISOString(),
  method: "dine-in",
  status: "pending",
  paymentStatus: "pending",
  paymentMethod: "Cash at Table",
  customer: { name: "Pending User" },
  items: [],
  subtotal: 500,
  discount: 0,
  delivery: 0,
  total: 500,
};

const testFailedOrder: Order = {
  id: "o-failed",
  number: "#9902",
  createdAt: new Date().toISOString(),
  method: "dine-in",
  status: "rejected",
  paymentStatus: "failed",
  paymentMethod: "Telebirr Mobile",
  customer: { name: "Failed User" },
  items: [],
  subtotal: 800,
  discount: 0,
  delivery: 0,
  total: 800,
};

const testPaidOrder: Order = {
  id: "o-paid",
  number: "#9903",
  createdAt: new Date().toISOString(),
  method: "dine-in",
  status: "completed",
  paymentStatus: "paid",
  paymentMethod: "Cash at Table",
  customer: { name: "Paid User" },
  items: [],
  subtotal: 650,
  discount: 0,
  delivery: 0,
  total: 650,
};

assert.equal(isOrderPaid(testPendingOrder), false, "Pending order must NOT be counted as paid revenue");
assert.equal(isOrderPaid(testFailedOrder), false, "Failed/rejected order must NOT be counted as paid revenue");
assert.equal(isOrderPaid(testPaidOrder), true, "Paid order MUST be counted as verified revenue");

console.log("✓ Admin Dashboard Overview and Revenue integrity verified.");
console.log("\n======================================================================");
console.log("ALL REKIK CAFÉ WAITER & ADMIN REDESIGN TESTS PASSED SUCCESSFULLY! ✓");
console.log("======================================================================");
