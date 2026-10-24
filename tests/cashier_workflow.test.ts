import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import {
  resolveCashierMe,
  getPendingPaymentReviews,
  getPaymentReviewHistory,
  getCashierOverviewMetrics,
  getProofSignedUrl,
  approvePaymentProof,
  rejectPaymentProof,
} from "../src/server/cashier";

async function ensureSeedData() {
  const pending = await getPendingPaymentReviews();
  if (pending.length >= 2) return;

  console.log("  [setup] Re-seeding demo pending payment proofs for test isolation...");
  const sampleImagePath = path.resolve(process.cwd(), "public/images/secure-payments.png");
  if (fs.existsSync(sampleImagePath)) {
    const sampleBuffer = fs.readFileSync(sampleImagePath);
    await serverSupabase.storage
      .from("payment-proofs")
      .upload("proofs/proof-rk-101.png", sampleBuffer, { contentType: "image/png", upsert: true });
    await serverSupabase.storage
      .from("payment-proofs")
      .upload("proofs/proof-rk-102.png", sampleBuffer, { contentType: "image/png", upsert: true });
  }

  const custId = "c1111111-1111-1111-1111-111111111111";
  await serverSupabase.from("customers").upsert({
    id: custId,
    name: "Almaz Kebede",
    phone: "0911556677",
    email: "almaz.kebede@example.com",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const order1Id = "00000000-0000-0000-0000-000000001001";
  const pay1Id = "00000000-0000-0000-0000-000000002001";
  const proof1Id = "00000000-0000-0000-0000-000000003001";

  await serverSupabase.from("payment_reviews").delete().eq("payment_proof_id", proof1Id);
  await serverSupabase.from("payment_proofs").delete().eq("id", proof1Id);

  await serverSupabase.from("orders").upsert({
    id: order1Id,
    order_number: "RK-1001",
    customer_id: custId,
    customer_name: "Almaz Kebede",
    customer_phone: "0911556677",
    method: "dine_in",
    status: "pending",
    waiter_decision: "approved",
    table_number: "Table 4",
    subtotal: 450,
    discount_amount: 0,
    delivery_fee: 0,
    total_amount: 450,
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
  });

  await serverSupabase.from("order_items").upsert([
    {
      id: "00000000-0000-0000-0000-000000004001",
      order_id: order1Id,
      name: "Rekik Signature Special Roast",
      quantity: 2,
      unit_price: 120,
      line_total: 240,
    },
  ]);

  await serverSupabase.from("payments").upsert({
    id: pay1Id,
    order_id: order1Id,
    method: "Telebirr",
    status: "pending",
    amount: 450,
    transaction_reference: "TLB-78239104",
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 60000).toISOString(),
  });

  await serverSupabase.from("payment_proofs").upsert({
    id: proof1Id,
    payment_id: pay1Id,
    order_id: order1Id,
    screenshot_path: "proofs/proof-rk-101.png",
    submitted_amount: 450,
    transaction_reference: "TLB-78239104",
    status: "pending",
    submitted_at: new Date(Date.now() - 10 * 60000).toISOString(),
  });

  const order2Id = "00000000-0000-0000-0000-000000001002";
  const pay2Id = "00000000-0000-0000-0000-000000002002";
  const proof2Id = "00000000-0000-0000-0000-000000003002";

  await serverSupabase.from("payment_reviews").delete().eq("payment_proof_id", proof2Id);
  await serverSupabase.from("payment_proofs").delete().eq("id", proof2Id);

  await serverSupabase.from("orders").upsert({
    id: order2Id,
    order_number: "RK-1002",
    customer_name: "Dawit Haile",
    customer_phone: "0922334455",
    method: "delivery",
    status: "pending",
    waiter_decision: "approved",
    delivery_address: "Bole Medhanialem",
    subtotal: 620,
    discount_amount: 0,
    delivery_fee: 50,
    total_amount: 670,
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60000).toISOString(),
  });

  await serverSupabase.from("payments").upsert({
    id: pay2Id,
    order_id: order2Id,
    method: "CBE Birr",
    status: "pending",
    amount: 670,
    transaction_reference: "CBE-99482103",
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 25 * 60000).toISOString(),
  });

  await serverSupabase.from("payment_proofs").upsert({
    id: proof2Id,
    payment_id: pay2Id,
    order_id: order2Id,
    screenshot_path: "proofs/proof-rk-102.png",
    submitted_amount: 670,
    transaction_reference: "CBE-99482103",
    status: "pending",
    submitted_at: new Date(Date.now() - 25 * 60000).toISOString(),
  });
}

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

  // ── Test 2: Live Route /api/cashier/me Authorization via handleApiRequest ───
  console.log("\n[2] Testing Live HTTP /api/cashier/me Endpoint via handleApiRequest...");
  const meReq = new Request("http://localhost:3000/api/cashier/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const meRes = await handleApiRequest(meReq);
  assert.equal(meRes.status, 200, `Expected 200 OK from /api/cashier/me, got ${meRes.status}`);

  const meBody = await meRes.json();
  assert.equal(meBody.success, true, "/api/cashier/me must return success: true");
  assert.equal(meBody.role, "cashier", "Role must be 'cashier'");
  assert.ok(meBody.profile, "profile object must be returned");
  assert.equal(meBody.profile.role, "cashier", "Profile role must be 'cashier'");
  assert.equal(meBody.profile.is_active, true, "Profile must be active");
  assert.equal(meBody.profile.user_id, authData.user.id, "Profile user_id must match authenticated user");
  // Security check: ensure passwords/secrets are not leaked
  assert.equal(meBody.profile.password, undefined, "Password must never be exposed");
  assert.equal(meBody.profile.secret, undefined, "Secrets must never be exposed");
  console.log(`✓ /api/cashier/me verified: ${meBody.profile.full_name} (${meBody.role})`);

  // Also test direct function resolveCashierMe
  const directMeResult = await resolveCashierMe(meReq);
  assert.equal(directMeResult.success, true);

  // ── Test 3: Unauthenticated Access Rejection (401 Unauthorized) ────────────
  console.log("\n[3] Testing Unauthorized Access Rejection (401)...");
  const unauthReq = new Request("http://localhost:3000/api/cashier/me", { method: "GET" });
  const unauthRes = await handleApiRequest(unauthReq);
  assert.equal(unauthRes.status, 401, `Unauthenticated request must return 401, got ${unauthRes.status}`);
  const unauthBody = await unauthRes.json();
  assert.equal(unauthBody.success, false);
  assert.equal(unauthBody.status, "unauthenticated");

  const invalidTokenReq = new Request("http://localhost:3000/api/cashier/me", {
    method: "GET",
    headers: { Authorization: "Bearer invalid.expired.token" },
  });
  const invalidTokenRes = await handleApiRequest(invalidTokenReq);
  assert.equal(invalidTokenRes.status, 401, `Invalid token request must return 401, got ${invalidTokenRes.status}`);
  console.log("✓ Unauthenticated and invalid token requests correctly rejected with 401.");

  // ── Test 4: Role-Based Access Control Rejection (403 Forbidden) ────────────
  console.log("\n[4] Testing Non-Cashier Role Rejection (403 Forbidden)...");
  // Sign in as admin user
  const adminEmail = "kbstar77sisay@gmail.com";
  const { data: adminAuthData } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: adminEmail,
  });
  if (adminAuthData?.properties?.hashed_token) {
    const { data: adminSession } = await supabase.auth.verifyOtp({
      token_hash: adminAuthData.properties.hashed_token,
      type: "magiclink",
    });
    if (adminSession?.session?.access_token) {
      const adminReq = new Request("http://localhost:3000/api/cashier/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminSession.session.access_token}` },
      });
      const adminRes = await handleApiRequest(adminReq);
      assert.equal(adminRes.status, 403, `Admin user must receive 403 Forbidden on cashier endpoint, got ${adminRes.status}`);
      const adminBody = await adminRes.json();
      assert.equal(adminBody.success, false);
      assert.equal(adminBody.status, "role_mismatch");
      assert.equal(adminBody.role, "admin");
      console.log("✓ Administrator correctly denied cashier access (403 role_mismatch).");
    }
  }

  // Sign in as customer user
  const custEmail = "alemu00@gmail.com";
  const { data: custAuthData } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: custEmail,
  });
  if (custAuthData?.properties?.hashed_token) {
    const { data: custSession } = await supabase.auth.verifyOtp({
      token_hash: custAuthData.properties.hashed_token,
      type: "magiclink",
    });
    if (custSession?.session?.access_token) {
      const custReq = new Request("http://localhost:3000/api/cashier/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${custSession.session.access_token}` },
      });
      const custRes = await handleApiRequest(custReq);
      assert.equal(custRes.status, 403, `Customer user must receive 403 Forbidden on cashier endpoint, got ${custRes.status}`);
      const custBody = await custRes.json();
      assert.equal(custBody.success, false);
      assert.equal(custBody.status, "no_profile");
      console.log("✓ Customer user correctly denied cashier access (403 no_profile).");
    }
  }

  // Restore cashier session
  await supabase.auth.signInWithPassword({
    email: cashierEmail,
    password: cashierPassword,
  });

  // Ensure seed data is populated
  await ensureSeedData();

  // ── Test 5: Protected Cashier Endpoints via handleApiRequest ───────────────
  console.log("\n[5] Testing Protected Cashier Routes (/api/cashier/*)...");
  // 5a. GET /api/cashier/pending
  const pendingReq = new Request("http://localhost:3000/api/cashier/pending", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const pendingRes = await handleApiRequest(pendingReq);
  assert.equal(pendingRes.status, 200, "GET /api/cashier/pending must return 200");
  const pendingItems = await pendingRes.json();
  assert.ok(Array.isArray(pendingItems), "Pending reviews must be an array");
  assert.ok(pendingItems.length >= 1, "Must have at least 1 pending review");
  console.log(`✓ /api/cashier/pending returned ${pendingItems.length} review(s).`);

  // 5b. GET /api/cashier/metrics
  const metricsReq = new Request("http://localhost:3000/api/cashier/metrics", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const metricsRes = await handleApiRequest(metricsReq);
  assert.equal(metricsRes.status, 200, "GET /api/cashier/metrics must return 200");
  const metricsData = await metricsRes.json();
  assert.ok("pendingCount" in metricsData, "Metrics must include pendingCount");
  assert.ok("todayVerifiedCount" in metricsData, "Metrics must include todayVerifiedCount");
  console.log(`✓ /api/cashier/metrics verified: ${metricsData.pendingCount} pending reviews.`);

  // 5c. GET /api/cashier/history
  const historyReq = new Request("http://localhost:3000/api/cashier/history", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const historyRes = await handleApiRequest(historyReq);
  assert.equal(historyRes.status, 200, "GET /api/cashier/history must return 200");
  const historyData = await historyRes.json();
  assert.ok(Array.isArray(historyData), "History must be an array");
  console.log(`✓ /api/cashier/history verified: ${historyData.length} records.`);

  // 5d. GET /api/cashier/notifications
  const notifReq = new Request("http://localhost:3000/api/cashier/notifications", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const notifRes = await handleApiRequest(notifReq);
  assert.equal(notifRes.status, 200, "GET /api/cashier/notifications must return 200");
  console.log("✓ /api/cashier/notifications verified.");

  // 5e. Unauthenticated requests to protected endpoints must return 401
  const unauthPending = await handleApiRequest(new Request("http://localhost:3000/api/cashier/pending"));
  assert.equal(unauthPending.status, 401, "Unauthenticated pending reviews must be 401");
  const unauthMetrics = await handleApiRequest(new Request("http://localhost:3000/api/cashier/metrics"));
  assert.equal(unauthMetrics.status, 401, "Unauthenticated metrics must be 401");
  console.log("✓ Protected endpoints strictly enforce 401 for unauthenticated clients.");

  // ── Test 6: Storage Proof Signed URL ───────────────────────────────────────
  console.log("\n[6] Testing Storage Signed URL Generation via API...");
  const testItem = pendingItems[0]!;
  const proofUrlReq = new Request("http://localhost:3000/api/cashier/proof-url", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ proofId: testItem.proof_id }),
  });
  const proofUrlRes = await handleApiRequest(proofUrlReq);
  assert.equal(proofUrlRes.status, 200, "POST /api/cashier/proof-url must return 200");
  const { signedUrl } = await proofUrlRes.json();
  assert.ok(signedUrl.startsWith("http"), "Signed URL must be HTTP(S)");
  assert.ok(signedUrl.includes("token="), "Signed URL must include security token");

  const imgRes = await fetch(signedUrl);
  assert.equal(imgRes.status, 200, "Signed URL must be accessible via HTTP GET");
  console.log(`✓ Signed URL generated and accessible (HTTP 200, ${imgRes.headers.get("content-type")})`);

  // ── Test 7: Approve Payment Workflow via handleApiRequest ──────────────────
  console.log("\n[7] Testing Payment Approval Workflow via /api/cashier/reviews/approve...");
  const approveReq = new Request("http://localhost:3000/api/cashier/reviews/approve", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      proofId: testItem.proof_id,
      notes: "Verified via integration test suite",
    }),
  });
  const approveRes = await handleApiRequest(approveReq);
  assert.equal(approveRes.status, 200, "Approval endpoint must return 200");
  const approveResult = await approveRes.json();
  assert.equal(approveResult.success, true);
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

  // Order must transition to 'confirmed' (authorized for kitchen)
  const { data: updatedOrder } = await serverSupabase
    .from("orders")
    .select("status")
    .eq("id", testItem.order_id)
    .single();
  assert.equal(updatedOrder?.status, "confirmed", "orders.status must be 'confirmed' (authorized for kitchen)");

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
  console.log("✓ Atomic database verification passed for Approval & Kitchen Authorization!");

  // ── Test 8: Duplicate Decision Prevention ──────────────────────────────────
  console.log("\n[8] Testing Duplicate Decision Prevention...");
  const dupApproveReq = new Request("http://localhost:3000/api/cashier/reviews/approve", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ proofId: testItem.proof_id, notes: "Duplicate attempt" }),
  });
  const dupRes = await handleApiRequest(dupApproveReq);
  assert.equal(dupRes.status, 400, "Duplicate approval must be blocked with 400 Bad Request");
  const dupBody = await dupRes.json();
  assert.ok(dupBody.message.includes("already been reviewed"), "Error message must state already reviewed");
  console.log("✓ Duplicate approval prevented as required.");

  // ── Test 9: Reject Payment Workflow via handleApiRequest ───────────────────
  console.log("\n[9] Testing Payment Rejection Workflow via /api/cashier/reviews/reject...");
  const remainingPending = await getPendingPaymentReviews();
  assert.ok(remainingPending.length >= 1, "Must have second pending item for rejection test");
  const rejectItem = remainingPending[0]!;

  // Missing reason must fail
  const blankRejectReq = new Request("http://localhost:3000/api/cashier/reviews/reject", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ proofId: rejectItem.proof_id, reason: "" }),
  });
  const blankRes = await handleApiRequest(blankRejectReq);
  assert.equal(blankRes.status, 400, "Blank rejection reason must fail with 400");

  const rejectReason = "Screenshot does not match transfer amount";
  const rejectReq = new Request("http://localhost:3000/api/cashier/reviews/reject", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ proofId: rejectItem.proof_id, reason: rejectReason }),
  });
  const rejectRes = await handleApiRequest(rejectReq);
  assert.equal(rejectRes.status, 200, "Rejection must return 200 OK");
  const rejectResult = await rejectRes.json();
  assert.equal(rejectResult.success, true);

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
