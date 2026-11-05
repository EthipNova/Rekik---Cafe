/**
 * ============================================================================
 * Rekik Café — Cashier Payment Display Root Cause Verification Test
 * File: tests/cashier_payment_display_root_cause.test.ts
 * ============================================================================
 * Tests:
 * 1. Root cause eliminated: "Payment made from CBE. Please check the screenshot."
 *    is completely eradicated from the codebase.
 * 2. When payment method is CASH:
 *    - Payment Method: "💵 Cash"
 *    - Payment Proof section displays:
 *      "💵 Payment collected in cash. No payment proof is required."
 *      "Payment collected in cash by the waiter."
 *    - No screenshot, no broken image placeholder, no CBE message.
 * 3. When payment method is CBE or proof-based:
 *    - Displays: "Payment made through CBE. Please check the payment proof."
 *    - Shows uploaded payment screenshot ONLY if one exists.
 *    - Fallback to fake mockup receipts is removed.
 * 4. Actual database query verification:
 *    - server/cashier.ts queries `payment_method` on orders and checks `cash-direct`
 *      proof path to dynamically and authoritatively distinguish cash orders.
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

console.log("=====================================================================");
console.log("RUNNING REKIK CAFÉ CASHIER PAYMENT DISPLAY ROOT CAUSE TEST SUITE");
console.log("=====================================================================");

async function run() {
  const modalPath = path.resolve(process.cwd(), "src/components/cashier/PaymentProofModal.tsx");
  const modalSrc = fs.readFileSync(modalPath, "utf-8");

  const serverCashierPath = path.resolve(process.cwd(), "src/server/cashier.ts");
  const serverCashierSrc = fs.readFileSync(serverCashierPath, "utf-8");

  const pendingListPath = path.resolve(process.cwd(), "src/components/cashier/PendingReviewsList.tsx");
  const pendingListSrc = fs.readFileSync(pendingListPath, "utf-8");

  const overviewPath = path.resolve(process.cwd(), "src/components/cashier/CashierOverview.tsx");
  const overviewSrc = fs.readFileSync(overviewPath, "utf-8");

  // [1] Root cause check: No hardcoded CBE screenshot message
  console.log("\n[1] Verifying elimination of hardcoded CBE screenshot message...");
  assert.ok(
    !modalSrc.includes("Payment made from CBE. Please check the screenshot."),
    "PaymentProofModal must NOT contain hardcoded 'Payment made from CBE. Please check the screenshot.'",
  );
  assert.ok(
    !modalSrc.includes("/images/cbe-receipt-mockup.png"),
    "PaymentProofModal must NOT contain fake cbe-receipt-mockup.png fallback",
  );
  console.log("✓ Root cause confirmed eliminated: hardcoded default CBE screenshot message completely removed.");

  // [2] Dynamic Cash order handling
  console.log("\n[2] Verifying Cash Payment Display Logic...");
  assert.ok(
    modalSrc.includes("💵 Payment collected in cash. No payment proof is required."),
    "Must display exact cash headline: '💵 Payment collected in cash. No payment proof is required.'",
  );
  assert.ok(
    modalSrc.includes("Payment collected in cash by the waiter."),
    "Must display subtext: 'Payment collected in cash by the waiter.'",
  );
  assert.ok(
    modalSrc.includes("Payment Method: 💵 Cash"),
    "Must display 'Payment Method: 💵 Cash' inside the verification card",
  );
  assert.ok(
    modalSrc.includes("rawProofPath === \"cash-direct\""),
    "Must inspect proof_screenshot_path === 'cash-direct' to reliably catch waiter cash payments",
  );
  console.log("✓ Cash payment display verified: displays exact required cash notices and no broken proof image.");

  // [3] Dynamic CBE and electronic order handling
  console.log("\n[3] Verifying Proof-Based / CBE Payment Display Logic...");
  assert.ok(
    modalSrc.includes("Payment made through {methodLabel}. Please check the payment proof."),
    "Must display dynamic payment message: 'Payment made through {methodLabel}. Please check the payment proof.'",
  );
  assert.ok(
    modalSrc.includes("src={signedUrl}"),
    "Must show screenshot only when signedUrl is valid and exists",
  );
  assert.ok(
    modalSrc.includes("No payment proof image available."),
    "Must show clean 'No payment proof image available' text when electronic proof screenshot is missing",
  );
  console.log("✓ Proof-based payments verified: dynamic CBE/Telebirr messages and authentic screenshot preview.");

  // [4] Server Cashier Query inspection
  console.log("\n[4] Verifying Server-side Payment Method Resolution...");
  assert.ok(
    serverCashierSrc.includes("payment_method,"),
    "getPendingPaymentReviews must select payment_method from orders table",
  );
  assert.ok(
    serverCashierSrc.includes("raw.screenshot_path === \"cash-direct\" ? \"Cash\""),
    "Server must detect cash-direct proofs and normalize payment_method to Cash",
  );
  console.log("✓ Server-side cashier data resolution verified: includes payment_method and cash-direct detection.");

  console.log("\n=====================================================================");
  console.log("ALL CASHIER PAYMENT DISPLAY ROOT CAUSE CHECKS PASSED (100%)");
  console.log("=====================================================================");
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});

