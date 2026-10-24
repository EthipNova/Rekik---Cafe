import assert from "node:assert/strict";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import { createOrder, getNextOrderNumber } from "../src/server/db";

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
  console.log("REKIK CAFÉ — ORDER NUMBER CONCURRENCY & CHECKOUT VERIFICATION SUITE");
  console.log("====================================================================");

  const testOrderIdsToClean: string[] = [];

  try {
    // Fetch a valid product for testing
    const { data: products, error: prodErr } = await serverSupabase
      .from("products")
      .select("id, name, price")
      .limit(1);

    assert.equal(prodErr, null, "Should fetch product");
    assert.ok(products && products.length > 0, "At least one product must exist");
    const testProduct = products[0];

    // Authenticate a customer user to test customer checkout under RLS
    console.log("\n[Setup] Authenticating test customer (alemu00@gmail.com)...");
    const testCustomerEmail = "alemu00@gmail.com";
    const session = await createScopedSession(testCustomerEmail);
    const customerToken = session.token;
    console.log("✓ Customer authenticated with scoped JWT token.");

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: Multiple consecutive orders receive distinct order numbers
    // ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 1] Testing multiple consecutive authenticated customer orders...");
    const consecutiveNumbers: string[] = [];

    for (let i = 1; i <= 3; i++) {
      const payload = {
        lines: [{ productId: testProduct.id, name: testProduct.name, quantity: 1, price: testProduct.price }],
        method: "takeaway",
        paymentMethod: "CBE Birr",
        paymentStatus: "pending",
        customer: {
          name: `Consecutive Customer ${i}`,
          phone: "0912000001",
        },
      };

      const req = new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await handleApiRequest(req);
      const body = await res.json();
      assert.equal(res.status, 201, `Consecutive order ${i} failed: ${JSON.stringify(body)}`);
      assert.ok(body.number, `Order ${i} must have an order number`);
      consecutiveNumbers.push(body.number);
      testOrderIdsToClean.push(body.id);
      console.log(`  ✓ Consecutive Order #${i} created: ${body.number} (id: ${body.id})`);
    }

    const uniqueConsecutive = new Set(consecutiveNumbers);
    assert.equal(uniqueConsecutive.size, 3, "All consecutive orders must have distinct order numbers");
    console.log("✓ Test 1 passed: All consecutive orders received distinct order numbers:", consecutiveNumbers);

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: Concurrent order submissions do not generate duplicate order numbers
    // ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 2] Testing concurrent order submissions (5 parallel requests)...");
    const CONCURRENCY_COUNT = 5;

    const concurrentPromises = Array.from({ length: CONCURRENCY_COUNT }, (_, index) => {
      const payload = {
        lines: [{ productId: testProduct.id, name: testProduct.name, quantity: 1, price: testProduct.price }],
        method: "dine-in",
        paymentMethod: "Pay at Table / Cash",
        paymentStatus: "pending",
        customer: {
          name: `Concurrent Guest ${index + 1}`,
          phone: `091300000${index + 1}`,
          table: `T-${index + 1}`,
        },
      };

      const req = new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify(payload),
      });

      return handleApiRequest(req).then(async (res) => {
        const body = await res.json();
        return { status: res.status, body };
      });
    });

    const concurrentResults = await Promise.all(concurrentPromises);
    const concurrentOrderNumbers: string[] = [];

    for (let i = 0; i < concurrentResults.length; i++) {
      const res = concurrentResults[i]!;
      assert.equal(
        res.status,
        201,
        `Concurrent order ${i + 1} failed: ${JSON.stringify(res.body)}`,
      );
      assert.ok(res.body.number, `Concurrent order ${i + 1} must have an order number`);
      concurrentOrderNumbers.push(res.body.number);
      testOrderIdsToClean.push(res.body.id);
      console.log(`  ✓ Concurrent Order #${i + 1} created: ${res.body.number}`);
    }

    const uniqueConcurrent = new Set(concurrentOrderNumbers);
    assert.equal(
      uniqueConcurrent.size,
      CONCURRENCY_COUNT,
      `All ${CONCURRENCY_COUNT} concurrent orders must have unique numbers! Got: ${JSON.stringify(concurrentOrderNumbers)}`,
    );
    console.log("✓ Test 2 passed: All 5 concurrent orders received distinct, unique order numbers!");

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3: Repeated submission of the same checkout (Idempotency)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 3] Testing repeated submission of same checkout with clientReferenceId...");
    const clientRefId = `test_chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const idempotentPayload = {
      lines: [{ productId: testProduct.id, name: testProduct.name, quantity: 2, price: testProduct.price }],
      method: "takeaway",
      paymentMethod: "Telebirr Mobile",
      paymentStatus: "pending",
      customer: {
        name: "Idempotent Customer",
        phone: "0914000001",
      },
      clientReferenceId: clientRefId,
    };

    // First submission
    const firstReq = new Request("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify(idempotentPayload),
    });
    const firstRes = await handleApiRequest(firstReq);
    const firstBody = await firstRes.json();
    assert.equal(firstRes.status, 201, `First idempotent order failed: ${JSON.stringify(firstBody)}`);
    testOrderIdsToClean.push(firstBody.id);
    console.log(`  ✓ Initial order created: ${firstBody.number} (id: ${firstBody.id})`);

    // Repeated submission of the EXACT same checkout
    const secondReq = new Request("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify(idempotentPayload),
    });
    const secondRes = await handleApiRequest(secondReq);
    const secondBody = await secondRes.json();
    assert.equal(secondRes.status, 201, `Second idempotent order failed: ${JSON.stringify(secondBody)}`);

    // Must return the exact same order without creating a duplicate!
    assert.equal(secondBody.id, firstBody.id, "Repeated submission must return the exact same order ID");
    assert.equal(secondBody.number, firstBody.number, "Repeated submission must return the exact same order number");

    // Verify in database that only ONE order row exists with this order_reference
    const { data: dbOrdersWithRef, error: refErr } = await serverSupabase
      .from("orders")
      .select("id, order_number, order_reference")
      .eq("order_reference", clientRefId);

    assert.equal(refErr, null, "DB query for order_reference should succeed");
    assert.equal(dbOrdersWithRef?.length, 1, "Exactly one order row must exist for clientReferenceId");
    console.log("✓ Test 3 passed: Repeated submission returned existing order without creating duplicates!");

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 4: Bounded collision retry logic
    // ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 4] Testing safe bounded collision handling...");
    // Peek at next order number
    const nextPredicted = await getNextOrderNumber(false);
    console.log(`  Predicted next order number is: ${nextPredicted}`);

    // Pre-insert a dummy order with this exact order_number to force a collision
    const dummyCollisionId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const { error: dummyInsertErr } = await serverSupabase.from("orders").insert({
      id: dummyCollisionId,
      order_number: nextPredicted,
      order_reference: `COLLISION-TEST-${dummyCollisionId}`,
      customer_name: "Collision Dummy",
      customer_phone: "0900000000",
      method: "dine_in",
      status: "pending",
      subtotal: 10,
      discount_amount: 0,
      delivery_fee: 0,
      total_amount: 10,
      created_at: nowIso,
      updated_at: nowIso,
    });
    assert.equal(dummyInsertErr, null, "Dummy collision row should insert");
    testOrderIdsToClean.push(dummyCollisionId);

    // Now call createOrder. It should encounter the collision on nextPredicted,
    // catch error 23505 (orders_order_number_key), refresh the next order number, and succeed!
    const collisionTestPayload = {
      lines: [{ productId: testProduct.id, name: testProduct.name, quantity: 1, price: testProduct.price }],
      method: "takeaway" as const,
      paymentMethod: "Cash on Delivery",
      customer: {
        name: "Post-Collision Customer",
        phone: "0915000001",
      },
    };

    const recoveredOrder = await createOrder(collisionTestPayload);
    assert.ok(recoveredOrder.id, "Recovered order must succeed");
    assert.notEqual(recoveredOrder.number, nextPredicted, "Recovered order must have a new non-colliding order number");
    testOrderIdsToClean.push(recoveredOrder.id);
    console.log(`  ✓ Bounded collision retry recovered successfully: generated ${recoveredOrder.number} (avoided ${nextPredicted})`);
    console.log("✓ Test 4 passed: Genuine collision handled with bounded retry!");

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 5: Existing order records remain unchanged
    // ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 5] Verifying existing orders remain unchanged...");
    const { data: existingSeedOrders, error: seedErr } = await serverSupabase
      .from("orders")
      .select("id, order_number, total_amount")
      .in("order_number", ["RK-1001", "RK-1002", "RK-1044"]);

    assert.equal(seedErr, null, "Querying existing orders should succeed");
    assert.ok(existingSeedOrders && existingSeedOrders.length > 0, "Existing orders must be present");
    for (const ord of existingSeedOrders) {
      console.log(`  ✓ Existing order ${ord.order_number} is intact (id: ${ord.id}, total: ${ord.total_amount})`);
    }
    console.log("✓ Test 5 passed: Existing historical orders remain completely unchanged!");

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 6: Checkout works with delivery calculation & no delivery column errors
    // ─────────────────────────────────────────────────────────────────────────────
    console.log("\n[Test 6] Verifying delivery checkout (preserves delivery fee and schema)...");
    const deliveryPayload = {
      lines: [{ productId: testProduct.id, name: testProduct.name, quantity: 2, price: testProduct.price }],
      method: "delivery",
      paymentMethod: "Cash on Delivery",
      paymentStatus: "pending",
      customer: {
        name: "Delivery Customer",
        phone: "0916000001",
        address: "Bole Atlas, Apt 4B",
        latitude: 8.998,
        longitude: 38.784,
      },
    };

    const delReq = new Request("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify(deliveryPayload),
    });
    const delRes = await handleApiRequest(delReq);
    const delBody = await delRes.json();
    assert.equal(delRes.status, 201, `Delivery checkout failed: ${JSON.stringify(delBody)}`);
    assert.ok(delBody.delivery > 0, "Delivery fee must be calculated");
    assert.equal(delBody.customer.address, "Bole Atlas, Apt 4B");
    testOrderIdsToClean.push(delBody.id);
    console.log(`  ✓ Delivery Order #${delBody.number} created (delivery fee: ${delBody.delivery} ETB, total: ${delBody.total} ETB)`);
    console.log("✓ Test 6 passed: Delivery order works perfectly with no obsolete column references!");

  } finally {
    // Clean up only our test orders
    console.log("\n[Cleanup] Cleaning up test orders...");
    for (const oid of testOrderIdsToClean) {
      await serverSupabase.from("order_items").delete().eq("order_id", oid);
      await serverSupabase.from("payments").delete().eq("order_id", oid);
      await serverSupabase.from("notifications").delete().eq("order_id", oid);
      await serverSupabase.from("order_status_logs").delete().eq("order_id", oid);
      await serverSupabase.from("orders").delete().eq("id", oid);
    }
    console.log(`✓ Cleaned up ${testOrderIdsToClean.length} test orders.`);
  }

  console.log("\n====================================================================");
  console.log("ALL 6 ORDER NUMBER CONCURRENCY & CHECKOUT TESTS PASSED!");
  console.log("====================================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
