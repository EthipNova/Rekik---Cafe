import assert from "node:assert/strict";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import { isWaiterOrderCompleted } from "../src/lib/waiter";
import type { WaiterOrder } from "@/types/waiter";

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

async function runTests() {
  console.log("====================================================================");
  console.log("RUNNING CHECKOUT & WAITER ORDER HISTORY VERIFICATION TEST SUITE");
  console.log("====================================================================");

  // ── TEST 1: ISSUE 1 FIX VERIFICATION — CHECKOUT ORDER CREATION ────────────────
  console.log("\n[Test 1] Testing Customer Checkout Order Creation (No delivery_distance_km error)...");

  // Fetch a product ID from public.products to use in checkout
  const { data: products, error: prodErr } = await serverSupabase
    .from("products")
    .select("id, name, price")
    .limit(1);

  assert.equal(prodErr, null, "Should fetch product");
  assert.ok(products && products.length > 0, "At least one product must exist");
  const testProduct = products[0];

  const checkoutPayload = {
    lines: [
      {
        productId: testProduct.id,
        name: testProduct.name,
        quantity: 2,
        price: testProduct.price,
      },
    ],
    method: "delivery",
    paymentMethod: "Cash on Delivery",
    paymentStatus: "pending",
    customer: {
      name: "Integration Test Customer",
      phone: "0911223344",
      address: "Bole Medhanialem, House 123",
      latitude: 8.995,
      longitude: 38.785,
    },
  };

  const checkoutReq = new Request("http://localhost:3000/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(checkoutPayload),
  });

  const checkoutRes = await handleApiRequest(checkoutReq);
  const checkoutBody = await checkoutRes.json();

  assert.equal(
    checkoutRes.status,
    201,
    `Checkout failed with status ${checkoutRes.status}: ${JSON.stringify(checkoutBody)}`,
  );
  assert.ok(checkoutBody.id, "Created order must have an id");
  assert.ok(checkoutBody.number, "Created order must have an order number");
  assert.equal(checkoutBody.customer.address, "Bole Medhanialem, House 123");
  assert.ok(checkoutBody.delivery >= 0, "Delivery fee must be calculated");
  console.log(`✓ Order #${checkoutBody.number} created successfully without delivery_distance_km error!`);

  // Clean up test order
  await serverSupabase.from("order_items").delete().eq("order_id", checkoutBody.id);
  await serverSupabase.from("payments").delete().eq("order_id", checkoutBody.id);
  await serverSupabase.from("orders").delete().eq("id", checkoutBody.id);
  console.log("✓ Cleaned up checkout test order.");

  // ── TEST 2: ISSUE 2 FIX VERIFICATION — WAITER ORDER HISTORY ─────────────────
  console.log("\n[Test 2] Testing Waiter Order History (Henok - henok00@gmail.com)...");
  const waiterSession = await createScopedSession("henok00@gmail.com");
  const waiterToken = waiterSession.token;

  const historyReq = new Request("http://localhost:3000/api/waiter/orders", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const historyRes = await handleApiRequest(historyReq);
  assert.equal(historyRes.status, 200, "History orders fetch must return 200 OK");
  const waiterOrders: WaiterOrder[] = await historyRes.json();
  assert.ok(Array.isArray(waiterOrders), "Orders must be an array");
  console.log(`✓ Fetched ${waiterOrders.length} total orders for waiter Henok.`);

  // Verify completed orders filter
  const completedOrders = waiterOrders.filter((o) => isWaiterOrderCompleted(o));
  console.log(`✓ Completed/Delivered orders detected: ${completedOrders.length}`);
  assert.ok(
    completedOrders.length > 0,
    "Waiter Henok must have historical completed orders (expected >= 15)",
  );

  // Verify Historical Completed Value calculation
  const totalCompletedValue = completedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  console.log(`✓ Historical Completed Value: ${totalCompletedValue} ETB`);
  assert.ok(
    totalCompletedValue > 0,
    `Historical Completed Value must be greater than 0 ETB (got ${totalCompletedValue} ETB)`,
  );

  // Verify rejected orders filter
  const rejectedOrders = waiterOrders.filter(
    (o) => o.status === "rejected" || o.status === "cancelled" || o.waiterDecision === "rejected",
  );
  console.log(`✓ Rejected/Cancelled orders detected: ${rejectedOrders.length}`);
  assert.ok(rejectedOrders.length > 0, "Waiter Henok must have rejected orders (expected >= 8)");

  // Verify all outcomes filter (historical closed orders: completed + rejected)
  const allOutcomes = waiterOrders.filter(
    (o) =>
      isWaiterOrderCompleted(o) ||
      o.status === "rejected" ||
      o.status === "cancelled" ||
      o.waiterDecision === "rejected",
  );
  console.log(`✓ All Outcomes total records: ${allOutcomes.length}`);
  assert.equal(
    allOutcomes.length,
    completedOrders.length + rejectedOrders.length,
    "All outcomes must equal sum of completed and rejected orders",
  );

  // ── TEST 3: API ENDPOINT STATUS=COMPLETED FILTER ────────────────────────────
  console.log("\n[Test 3] Testing GET /api/waiter/orders?status=completed...");
  const apiCompletedReq = new Request("http://localhost:3000/api/waiter/orders?status=completed", {
    method: "GET",
    headers: { Authorization: `Bearer ${waiterToken}` },
  });
  const apiCompletedRes = await handleApiRequest(apiCompletedReq);
  assert.equal(apiCompletedRes.status, 200);
  const apiCompletedOrders: WaiterOrder[] = await apiCompletedRes.json();
  assert.ok(apiCompletedOrders.length > 0, "API ?status=completed must return completed orders");
  assert.equal(
    apiCompletedOrders.length,
    completedOrders.length,
    "API ?status=completed count must match isWaiterOrderCompleted count",
  );
  console.log(`✓ GET /api/waiter/orders?status=completed returned ${apiCompletedOrders.length} orders.`);

  console.log("\n====================================================================");
  console.log("ALL TESTS PASSED SUCCESSFULLY!");
  console.log("====================================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
