import assert from "node:assert/strict";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING REKIK CAFÉ CASHIER INTEGRATION TESTS");
  console.log("==================================================");

  const cashierEmail = "cashier@rekikcafe.com";
  const cashierPassword = "Password123!";

  // ── Test 1: Sign in with valid Cashier credentials ─────────────────────────
  console.log("\n[1] Testing Cashier Authentication via Supabase Auth...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: cashierEmail,
    password: cashierPassword,
  });

  assert.equal(authError, null, `Sign in failed: ${authError?.message}`);
  assert.ok(authData.session?.access_token, "Access token must be present in session");
  const token = authData.session.access_token;
  console.log("✓ Signed in successfully. Token acquired.");

  // ── Test 2: Verify /api/cashier/me Authorization ───────────────────────────
  console.log("\n[2] Testing /api/cashier/me Role Verification...");
  const { resolveCashierMe } = await import("../src/server/cashier");
  const meReq = new Request("http://localhost:3000/api/cashier/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meResult = await resolveCashierMe(meReq);

  assert.equal(meResult.success, true, "resolveCashierMe must return success: true");
  if (meResult.success) {
    assert.equal(meResult.role, "cashier", "Role must be 'cashier'");
    assert.equal(meResult.profile.is_active, true, "Account must be active");
    console.log(`✓ Cashier profile verified: ${meResult.profile.full_name} (${meResult.role})`);
  }

  // ── Test 3: Unauthenticated Access Rejection ──────────────────────────────
  console.log("\n[3] Testing Unauthorized Access Rejection...");
  const unauthReq = new Request("http://localhost:3000/api/cashier/me");
  const unauthResult = await resolveCashierMe(unauthReq);
  assert.equal(unauthResult.success, false, "Unauthenticated request must fail");
  console.log("✓ Unauthenticated access correctly rejected.");

  // ── Test 4: Pending Reviews Retrieval ──────────────────────────────────────
  console.log("\n[4] Testing Pending Reviews Retrieval from Supabase...");
  const { getPendingPaymentReviews } = await import("../src/server/cashier");
  const pendingItems = await getPendingPaymentReviews();

  assert.ok(Array.isArray(pendingItems), "Pending reviews must be an array");
  console.log(`✓ Retrieved ${pendingItems.length} pending review(s) from Supabase.`);
  assert.ok(pendingItems.length >= 1, "Must have at least 1 pending review from seed data");

  const testItem = pendingItems[0]!;
  assert.ok(testItem.proof_id, "Proof ID must be present");
  assert.ok(testItem.order_number, "Order number must be present");
  assert.ok(testItem.proof_submitted_amount > 0, "Submitted amount must be > 0");
  assert.ok(testItem.items.length > 0, "Order items must be populated");
  console.log(`✓ Sample item verified: Order ${testItem.order_number}, Amount: ${testItem.proof_submitted_amount} ETB, Items: ${testItem.items.length}`);

  // ── Test 5: Storage Proof Signed URL ───────────────────────────────────────
  console.log("\n[5] Testing Storage Signed URL Generation...");
  const { getProofSignedUrl } = await import("../src/server/cashier");
  const signedUrl = await getProofSignedUrl(testItem.proof_id);

  assert.ok(signedUrl.startsWith("http"), "Signed URL must be a valid HTTP URL");
  assert.ok(signedUrl.includes("token="), "Signed URL must contain secure access token");

  const fetchRes = await fetch(signedUrl);
  assert.equal(fetchRes.status, 200, "Signed URL must be accessible via HTTP GET");
  console.log(`✓ Signed URL successfully verified (HTTP 200, content-type: ${fetchRes.headers.get("content-type")})`);

  // ── Test 6: Approve Payment Workflow ───────────────────────────────────────
  console.log("\n[6] Testing Payment Approval Workflow...");
  const { approvePaymentProof } = await import("../src/server/cashier");
  const approveResult = await approvePaymentProof(
    testItem.proof_id,
    authData.user.id,
    "Verified via integration test suite",
  );

  assert.equal(approveResult.success, true, "Approval must succeed");
  console.log(`✓ Payment approved: ${approveResult.message}`);

  // Verify DB state after approval
  const { data: updatedProof } = await serverSupabase
    .from("payment_proofs")
    .select("status, reviewed_by")
    .eq("id", testItem.proof_id)
    .single();
  assert.equal(updatedProof?.status, "approved", "payment_proofs.status must be 'approved'");

  const { data: updatedPayment } = await serverSupabase
    .from("payments")
    .select("status, paid_at")
    .eq("id", testItem.payment_id)
    .single();
  assert.equal(updatedPayment?.status, "paid", "payments.status must be 'paid'");
  assert.ok(updatedPayment?.paid_at, "paid_at must be populated");

  const { data: updatedOrder } = await serverSupabase
    .from("orders")
    .select("status")
    .eq("id", testItem.order_id)
    .single();
  assert.equal(updatedOrder?.status, "confirmed", "orders.status must be 'confirmed'");

  const { data: reviewRecord } = await serverSupabase
    .from("payment_reviews")
    .select("decision, reason")
    .eq("payment_proof_id", testItem.proof_id)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assert.equal(reviewRecord?.decision, "approved", "payment_reviews decision must be 'approved'");

  const { data: auditRecord } = await serverSupabase
    .from("audit_logs")
    .select("action")
    .eq("payment_proof_id", testItem.proof_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assert.equal(auditRecord?.action, "PAYMENT_APPROVED", "audit_logs entry must be recorded");
  console.log("✓ Atomic database verification passed for Approval!");

  // ── Test 7: Duplicate Decision Prevention ──────────────────────────────────
  console.log("\n[7] Testing Duplicate Decision Prevention...");
  await assert.rejects(
    async () => {
      await approvePaymentProof(testItem.proof_id, authData.user.id, "Second attempt");
    },
    (err: Error) => err.message.includes("already been reviewed"),
    "Second approval attempt must be blocked",
  );
  console.log("✓ Duplicate approval prevented as required.");

  // ── Test 8: Reject Payment Workflow ────────────────────────────────────────
  console.log("\n[8] Testing Payment Rejection Workflow...");
  // Use second pending item (RK-1002) for rejection
  const remainingPending = await getPendingPaymentReviews();
  assert.ok(remainingPending.length >= 1, "Must have second pending item for rejection test");
  const rejectItem = remainingPending[0]!;

  const { rejectPaymentProof } = await import("../src/server/cashier");

  // Missing reason must fail
  await assert.rejects(
    async () => {
      await rejectPaymentProof(rejectItem.proof_id, authData.user.id, "");
    },
    (err: Error) => err.message.includes("rejection reason is required"),
    "Blank rejection reason must fail",
  );

  const rejectReason = "Screenshot does not match transfer amount";
  const rejectResult = await rejectPaymentProof(
    rejectItem.proof_id,
    authData.user.id,
    rejectReason,
  );
  assert.equal(rejectResult.success, true, "Rejection must succeed");

  // Verify DB state after rejection
  const { data: rejectedProof } = await serverSupabase
    .from("payment_proofs")
    .select("status, rejection_reason")
    .eq("id", rejectItem.proof_id)
    .single();
  assert.equal(rejectedProof?.status, "rejected", "payment_proofs.status must be 'rejected'");
  assert.equal(rejectedProof?.rejection_reason, rejectReason, "rejection_reason must match");

  const { data: rejectedPayment } = await serverSupabase
    .from("payments")
    .select("status")
    .eq("id", rejectItem.payment_id)
    .single();
  assert.equal(rejectedPayment?.status, "failed", "payments.status must be 'failed'");

  const { data: rejectedOrder } = await serverSupabase
    .from("orders")
    .select("status")
    .eq("id", rejectItem.order_id)
    .single();
  assert.equal(rejectedOrder?.status, "rejected", "orders.status must be 'rejected'");
  console.log("✓ Atomic database verification passed for Rejection!");

  // ── Test 9: Review History Retrieval ───────────────────────────────────────
  console.log("\n[9] Testing Review History Retrieval...");
  const { getPaymentReviewHistory } = await import("../src/server/cashier");
  const history = await getPaymentReviewHistory();
  assert.ok(history.length >= 2, "History must contain both approved and rejected items");
  console.log(`✓ History contains ${history.length} recorded review(s).`);

  // ── Test 10: Sign Out Cleanup ──────────────────────────────────────────────
  console.log("\n[10] Testing Sign Out...");
  await supabase.auth.signOut();
  console.log("✓ Signed out successfully.");

  console.log("\n==================================================");
  console.log("ALL 10 CASHIER WORKFLOW INTEGRATION TESTS PASSED!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("FATAL TEST FAILURE:", err);
  process.exit(1);
});
