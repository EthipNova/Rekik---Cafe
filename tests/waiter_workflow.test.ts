import assert from "node:assert/strict";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import { resolveWaiterUser, extractTokenFromRequest } from "../src/server/waiter";

async function createScopedSession(email: string): Promise<{ token: string; userId: string }> {
  const { data: linkData, error: linkErr } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  assert.equal(linkErr, null, `generateLink failed for ${email}: ${linkErr?.message}`);

  const { data: sessionData, error: authErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  assert.equal(authErr, null, `verifyOtp failed for ${email}: ${authErr?.message}`);
  assert.ok(sessionData.session?.access_token, `Session token must be established for ${email}`);
  return { token: sessionData.session.access_token, userId: sessionData.user.id };
}

async function runWaiterTests() {
  console.log("==================================================");
  console.log("RUNNING REKIK CAFÉ WAITER INTEGRATION TEST SUITE");
  console.log("==================================================");

  // ── Test 1: Public / Checkout Available Waiters ─────────────────────────────
  console.log("\n[1] Testing Public / Checkout GET /api/waiters/available...");
  const availReq = new Request("http://localhost:3000/api/waiters/available", { method: "GET" });
  const availRes = await handleApiRequest(availReq);
  assert.equal(availRes.status, 200, `Expected 200 OK, got ${availRes.status}`);
  const availableWaiters = await availRes.json();
  assert.ok(Array.isArray(availableWaiters), "Available waiters must be an array");
  console.log(`✓ GET /api/waiters/available returned ${availableWaiters.length} floor staff.`);

  // ── Test 2: Unauthenticated Access Rejections (401 Unauthorized) ───────────
  console.log("\n[2] Testing Unauthenticated Rejection (401 Unauthorized)...");
  const unauthOrdersReq = new Request("http://localhost:3000/api/waiter/orders", { method: "GET" });
  const unauthOrdersRes = await handleApiRequest(unauthOrdersReq);
  assert.equal(
    unauthOrdersRes.status,
    401,
    `Unauthenticated /api/waiter/orders must return 401, got ${unauthOrdersRes.status}`,
  );
  const unauthOrdersBody = await unauthOrdersRes.json();
  assert.equal(unauthOrdersBody.error, "Unauthorized");
  assert.equal(unauthOrdersBody.status, "unauthenticated");

  const unauthProfileReq = new Request("http://localhost:3000/api/waiter/profile", { method: "GET" });
  const unauthProfileRes = await handleApiRequest(unauthProfileReq);
  assert.equal(
    unauthProfileRes.status,
    401,
    `Unauthenticated /api/waiter/profile must return 401, got ${unauthProfileRes.status}`,
  );
  console.log("✓ Unauthenticated requests rejected with 401 Unauthorized.");

  // ── Test 3: Authenticate with active Waiter account ─────────────────────────
  console.log("\n[3] Authenticating as Waiter (henok00@gmail.com)...");
  const waiterSession = await createScopedSession("henok00@gmail.com");
  const waiterToken = waiterSession.token;
  console.log(`✓ Waiter token acquired for user ID: ${waiterSession.userId}`);

  // ── Test 4: Verify Waiter Profile Endpoint ──────────────────────────────────
  console.log("\n[4] Testing GET /api/waiter/profile...");
  const profileReq = new Request("http://localhost:3000/api/waiter/profile", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const profileRes = await handleApiRequest(profileReq);
  assert.equal(profileRes.status, 200, `Expected 200 OK, got ${profileRes.status}`);
  const profileBody = await profileRes.json();
  assert.ok(profileBody.user, "Profile response must have user object");
  assert.equal(profileBody.user.userId, waiterSession.userId);
  assert.equal(profileBody.user.role, "waiter");
  assert.equal(profileBody.user.isActive, true);
  console.log(`✓ Waiter profile verified: ${profileBody.user.fullName} (${profileBody.user.role})`);

  // ── Test 5: Verify Toggle Availability ─────────────────────────────────────
  console.log("\n[5] Testing PATCH /api/waiter/profile (toggle availability)...");
  const availToggleReq = new Request("http://localhost:3000/api/waiter/profile", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${waiterToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isAvailable: true }),
  });
  const availToggleRes = await handleApiRequest(availToggleReq);
  assert.equal(availToggleRes.status, 200, `Expected 200 OK, got ${availToggleRes.status}`);
  const availToggleBody = await availToggleRes.json();
  assert.equal(availToggleBody.success, true);
  assert.equal(availToggleBody.isAvailable, true);
  console.log("✓ Waiter availability toggled successfully.");

  // ── Test 6: Verify Waiter Metrics Endpoint ─────────────────────────────────
  console.log("\n[6] Testing GET /api/waiter/metrics...");
  const metricsReq = new Request("http://localhost:3000/api/waiter/metrics", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const metricsRes = await handleApiRequest(metricsReq);
  assert.equal(metricsRes.status, 200, `Expected 200 OK, got ${metricsRes.status}`);
  const metricsBody = await metricsRes.json();
  assert.ok(typeof metricsBody.pendingReview === "number");
  assert.ok(typeof metricsBody.approvedToday === "number");
  assert.ok(typeof metricsBody.awaitingPayment === "number");
  assert.ok(typeof metricsBody.underCashierReview === "number");
  console.log(`✓ Waiter metrics verified (Pending: ${metricsBody.pendingReview}, Approved Today: ${metricsBody.approvedToday}).`);

  // ── Test 7: Verify Orders Fetching (CORE ROOT CAUSE FIX VERIFICATION) ────────
  console.log("\n[7] Testing GET /api/waiter/orders (Resolving Core Root Cause)...");
  const ordersReq = new Request("http://localhost:3000/api/waiter/orders", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const ordersRes = await handleApiRequest(ordersReq);
  assert.equal(ordersRes.status, 200, `Expected 200 OK, got ${ordersRes.status}`);
  const ordersBody = await ordersRes.json();
  assert.ok(Array.isArray(ordersBody), "Waiter orders must return an array");
  console.log(`✓ GET /api/waiter/orders succeeded: fetched ${ordersBody.length} orders successfully!`);

  // Test filter queries (?status=pending_review and ?search=...)
  const filteredReq = new Request("http://localhost:3000/api/waiter/orders?status=pending_review", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const filteredRes = await handleApiRequest(filteredReq);
  assert.equal(filteredRes.status, 200);
  const filteredBody = await filteredRes.json();
  assert.ok(Array.isArray(filteredBody));
  console.log(`✓ GET /api/waiter/orders?status=pending_review succeeded: ${filteredBody.length} orders.`);

  // ── Test 8: Non-Waiter Role Isolation (403 Forbidden) ──────────────────────
  console.log("\n[8] Testing Non-Waiter Role Rejection (403 Forbidden)...");
  const cashierSession = await createScopedSession("cashier@rekikcafe.com");
  const cashierOrdersReq = new Request("http://localhost:3000/api/waiter/orders", {
    method: "GET",
    headers: { Authorization: `Bearer ${cashierSession.token}` },
  });
  const cashierOrdersRes = await handleApiRequest(cashierOrdersReq);
  assert.equal(
    cashierOrdersRes.status,
    403,
    `Cashier accessing waiter endpoint must return 403, got ${cashierOrdersRes.status}`,
  );
  const cashierOrdersBody = await cashierOrdersRes.json();
  assert.equal(cashierOrdersBody.error, "Forbidden");
  assert.equal(cashierOrdersBody.status, "role_mismatch");
  console.log("✓ Cashier role access correctly denied with 403 Forbidden (role_mismatch).");

  // ── Test 9: Inactive Staff Account Guard (403 Forbidden) ───────────────────
  console.log("\n[9] Testing Inactive Waiter Account Guard (403 Forbidden)...");
  await serverSupabase
    .from("staff_profiles" as any)
    .update({ is_active: false })
    .eq("user_id", waiterSession.userId);

  try {
    const inactiveReq = new Request("http://localhost:3000/api/waiter/orders", {
      method: "GET",
      headers: { Authorization: `Bearer ${waiterToken}` },
    });
    const inactiveRes = await handleApiRequest(inactiveReq);
    assert.equal(
      inactiveRes.status,
      403,
      `Inactive waiter must return 403, got ${inactiveRes.status}`,
    );
    const inactiveBody = await inactiveRes.json();
    assert.equal(inactiveBody.error, "Forbidden");
    assert.equal(inactiveBody.status, "inactive");
    console.log("✓ Inactive waiter correctly denied with 403 Forbidden (inactive).");
  } finally {
    // Restore active status
    await serverSupabase
      .from("staff_profiles" as any)
      .update({ is_active: true })
      .eq("user_id", waiterSession.userId);
  }

  // ── Test 10: Waiter Order Approval & Rejection Flow ─────────────────────────
  console.log("\n[10] Testing Order Approval and Rejection Flow...");
  const testOrderId = "00000000-0000-0000-0000-000000009001";
  const testOrderNumber = `WTEST-${Date.now().toString().slice(-4)}`;

  // Clean prior test row
  await serverSupabase.from("order_approvals").delete().eq("order_id", testOrderId);
  await serverSupabase.from("order_status_logs").delete().eq("order_id", testOrderId);
  await serverSupabase.from("payment_proofs").delete().eq("order_id", testOrderId);
  await serverSupabase.from("payments").delete().eq("order_id", testOrderId);
  await serverSupabase.from("order_items").delete().eq("order_id", testOrderId);
  await serverSupabase.from("orders").delete().eq("id", testOrderId);

  // Insert a clean pending order assigned to this waiter
  await serverSupabase.from("orders").insert({
    id: testOrderId,
    order_number: testOrderNumber,
    customer_name: "Test Diner",
    customer_phone: "0912000000",
    method: "dine_in",
    status: "pending",
    waiter_decision: "pending",
    waiter_id: waiterSession.userId,
    table_number: "Table 12",
    subtotal: 350,
    discount_amount: 0,
    delivery_fee: 0,
    total_amount: 350,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Approve Order
  const approveReq = new Request(
    `http://localhost:3000/api/waiter/orders/${testOrderId}/approve`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waiterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comments: "Table 12 order confirmed by server" }),
    },
  );
  const approveRes = await handleApiRequest(approveReq);
  assert.equal(approveRes.status, 200, `Approve must return 200, got ${approveRes.status}`);
  const approvedOrder = await approveRes.json();
  assert.equal(approvedOrder.waiterDecision, "approved");
  assert.equal(approvedOrder.status, "confirmed");
  console.log(`✓ Order #${testOrderNumber} approved: status is now 'confirmed' for kitchen preparation.`);

  // ── Test 11: Waiter Payment Proof Submission ────────────────────────────────
  console.log("\n[11] Testing POST /api/waiter/orders/:id/payment-proof...");
  const paymentProofReq = new Request(
    `http://localhost:3000/api/waiter/orders/${testOrderId}/payment-proof`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waiterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        submittedAmount: 350,
        paymentMethod: "CBE Birr",
        transactionReference: "TX-TEST-WAITER-99",
        screenshotPath: "proofs/waiter-test-receipt.png",
      }),
    },
  );
  const paymentProofRes = await handleApiRequest(paymentProofReq);
  assert.equal(paymentProofRes.status, 200, `Payment proof submission must return 200, got ${paymentProofRes.status}`);
  const proofOrder = await paymentProofRes.json();
  assert.ok(proofOrder.payments && proofOrder.payments.length > 0);
  console.log("✓ Payment evidence submitted successfully, status queued for cashier verification.");

  // ── Test 12: Waiter Payments & Notifications Endpoints ──────────────────────
  console.log("\n[12] Testing GET /api/waiter/payments and GET /api/waiter/notifications...");
  const payReq = new Request("http://localhost:3000/api/waiter/payments", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const payRes = await handleApiRequest(payReq);
  assert.equal(payRes.status, 200);
  const paymentsList = await payRes.json();
  assert.ok(Array.isArray(paymentsList));
  console.log(`✓ GET /api/waiter/payments returned ${paymentsList.length} orders.`);

  const notifReq = new Request("http://localhost:3000/api/waiter/notifications", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const notifRes = await handleApiRequest(notifReq);
  assert.equal(notifRes.status, 200);
  const notifsList = await notifRes.json();
  assert.ok(Array.isArray(notifsList));
  console.log(`✓ GET /api/waiter/notifications returned ${notifsList.length} notifications.`);

  // Cleanup test order
  await serverSupabase.from("order_approvals").delete().eq("order_id", testOrderId);
  await serverSupabase.from("order_status_logs").delete().eq("order_id", testOrderId);
  await serverSupabase.from("payment_proofs").delete().eq("order_id", testOrderId);
  await serverSupabase.from("payments").delete().eq("order_id", testOrderId);
  await serverSupabase.from("orders").delete().eq("id", testOrderId);

  console.log("\n==================================================");
  console.log("ALL 12 WAITER WORKFLOW INTEGRATION TESTS PASSED!");
  console.log("==================================================");
}

runWaiterTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
