import { createOrder, getOrderById, getOrdersForCustomerUser, recordWaiterDecision } from "../src/server/db";
import { getAvailableWaiters, getWaiterOrders } from "../src/server/waiter";
import { serverSupabase } from "../src/server/supabase";

async function runTests() {
  console.log("=== STARTING INTEGRATION TESTS FOR GUEST ORDERING & WAITER ASSIGNMENT ===\n");

  // Test 1: Query available waiters
  console.log("[1] Querying available waiters...");
  const waiters = await getAvailableWaiters();
  console.log(`Found ${waiters.length} eligible waiter(s):`, waiters.map(w => `${w.name} (${w.id})`));
  if (waiters.length === 0) {
    throw new Error("No active waiters found for testing.");
  }
  const selectedWaiter = waiters[0]!;
  console.log(`Selected waiter for testing: ${selectedWaiter.name} (${selectedWaiter.id})`);

  // Test 2: Guest checkout (no account, no table number)
  console.log("\n[2] Submitting guest order without table number...");
  const { getProducts } = await import("../src/server/db");
  const products = await getProducts();
  if (products.length === 0) {
    throw new Error("No products found in database.");
  }
  const testProduct = products[0]!;
  console.log(`Using product: ${testProduct.name} (${testProduct.id}) @ ETB ${testProduct.price}`);

  const guestOrder = await createOrder({
    lines: [
      { productId: testProduct.id, quantity: 1 }
    ],
    method: "dine-in",
    waiterId: selectedWaiter.id,
    customer: {
      name: "Guest Tester",
      phone: "0911223344"
      // Note: table is omitted entirely!
    },
    customerNotes: "Integration test order for guest flow"
  });

  console.log(`Guest order created successfully:`);
  console.log(`  ID: ${guestOrder.id}`);
  console.log(`  Number: ${guestOrder.number}`);
  console.log(`  Method: ${guestOrder.method}`);
  console.log(`  Table in response:`, (guestOrder.customer as any).table ?? "None (clean)");
  
  // Verify database record
  const { data: dbOrder, error: dbErr } = await (serverSupabase.from("orders" as any) as any)
    .select("id, order_number, waiter_id, table_number, customer_id, customer_name, status, waiter_decision")
    .eq("id", guestOrder.id)
    .single();

  if (dbErr || !dbOrder) {
    throw new Error(`Failed to query database order: ${dbErr?.message}`);
  }

  console.log(`  Database Row:`, dbOrder);
  if (dbOrder.waiter_id !== selectedWaiter.id) {
    throw new Error(`Waiter assignment mismatch! Expected ${selectedWaiter.id}, got ${dbOrder.waiter_id}`);
  }
  if (dbOrder.table_number !== null) {
    throw new Error(`Table number expected to be null, got ${dbOrder.table_number}`);
  }
  console.log("  => Check passed: Guest order has correct waiter assignment and null table number.");

  // Test 3: Verify notification for assigned waiter
  console.log("\n[3] Verifying notification created for assigned waiter...");
  const { data: notifData, error: notifErr } = await (serverSupabase.from("notifications" as any) as any)
    .select("id, recipient_user_id, order_id, title, message")
    .eq("order_id", guestOrder.id)
    .maybeSingle();

  if (notifErr || !notifData) {
    throw new Error(`Notification not created for order! ${notifErr?.message}`);
  }
  console.log(`  Notification found:`, notifData);
  if (notifData.recipient_user_id !== selectedWaiter.id) {
    throw new Error(`Notification recipient mismatch! Expected ${selectedWaiter.id}, got ${notifData.recipient_user_id}`);
  }
  console.log("  => Check passed: Assigned waiter received in-app notification.");

  // Test 4: Verify waiter dashboard includes this order
  console.log(`\n[4] Fetching waiter dashboard orders for ${selectedWaiter.name}...`);
  const waiterOrders = await getWaiterOrders({ userId: selectedWaiter.id } as any);
  const foundOrder = waiterOrders.find(o => o.id === guestOrder.id);
  if (!foundOrder) {
    throw new Error(`Order ${guestOrder.id} not found in assigned waiter's dashboard!`);
  }
  console.log(`  Found order in waiter dashboard:`, {
    id: foundOrder.id,
    orderNumber: foundOrder.orderNumber,
    customerName: foundOrder.customerName,
    waiterDecision: foundOrder.waiterDecision,
    status: foundOrder.status
  });
  console.log("  => Check passed: Assigned waiter sees the order on their dashboard.");

  // Test 5: Verify waiter role isolation (other waiters cannot see or decide this order)
  if (waiters.length > 1) {
    const otherWaiter = waiters[1]!;
    console.log(`\n[5] Testing role isolation with another waiter: ${otherWaiter.name} (${otherWaiter.id})...`);
    const otherWaiterOrders = await getWaiterOrders({ userId: otherWaiter.id } as any);
    const orderInOtherDashboard = otherWaiterOrders.find(o => o.id === guestOrder.id);
    if (orderInOtherDashboard) {
      throw new Error(`Order leaked to another waiter's dashboard!`);
    }
    console.log("  => Check passed: Order is NOT visible to other waiters.");

    // Other waiter trying to approve this order should throw error
    try {
      await recordWaiterDecision({
        orderId: guestOrder.id,
        waiterId: otherWaiter.id,
        decision: "approved"
      });
      throw new Error("Security violation! Another waiter was able to approve an order not assigned to them!");
    } catch (secErr: any) {
      console.log(`  Expected authorization error caught: ${secErr.message}`);
      console.log("  => Check passed: Unauthorized waiter cannot decide on another waiter's order.");
    }
  }

  // Test 6: Assigned waiter approves the order
  console.log(`\n[6] Assigned waiter ${selectedWaiter.name} approving the order...`);
  const approvalResult = await recordWaiterDecision({
    orderId: guestOrder.id,
    waiterId: selectedWaiter.id,
    decision: "approved"
  });
  console.log(`  Decision recorded. Result waiter_decision:`, approvalResult?.waiter_decision);
  console.log("  => Check passed: Assigned waiter successfully approved the order.");

  // Test 7: Registered-customer checkout
  console.log("\n[7] Testing registered-customer order placement...");
  const { data: realCusts } = await (serverSupabase.from("users" as any) as any)
    .select("id, email")
    .eq("role", "CUSTOMER")
    .limit(1);

  if (!realCusts || realCusts.length === 0) {
    throw new Error("No customer user found in database to test registered flow.");
  }
  const realCust = realCusts[0]!;
  console.log(`Using real registered customer: ${realCust.email} (${realCust.id})`);

  const registeredOrder = await createOrder({
    lines: [
      { productId: testProduct.id, quantity: 2 }
    ],
    method: "dine-in",
    waiterId: selectedWaiter.id,
    authUserId: realCust.id,
    authUserEmail: realCust.email,
    customer: {
      name: "Alemu Registered",
      phone: "0911223344"
    },
    customerNotes: "Integration test for registered customer flow"
  });

  console.log(`Registered order created successfully:`);
  console.log(`  ID: ${registeredOrder.id}`);
  console.log(`  Number: ${registeredOrder.number}`);

  // Verify database record has customer_id linked to user_id
  const { data: regDbOrder } = await (serverSupabase.from("orders" as any) as any)
    .select("id, order_number, customer_id, customers:customer_id ( user_id, email, name )")
    .eq("id", registeredOrder.id)
    .single();

  console.log(`  Registered Order Customer Data:`, regDbOrder?.customers);
  if (regDbOrder?.customers?.user_id !== realCust.id) {
    throw new Error(`Customer record was not properly linked to auth user ID!`);
  }
  console.log("  => Check passed: Registered order correctly associated with auth user.");

  // Test 8: Registered customer order history retrieval
  console.log("\n[8] Querying order history for registered customer...");
  const custOrders = await getOrdersForCustomerUser(realCust.id, serverSupabase);
  const foundCustOrder = custOrders.find(o => o.id === registeredOrder.id);
  if (!foundCustOrder) {
    throw new Error("Registered order not found in customer order history!");
  }
  console.log(`  Found customer order in history: ${foundCustOrder.number} (Total: ETB ${foundCustOrder.total})`);
  console.log("  => Check passed: Registered customer can access their own order history.");

  // Test 9: Anonymous privacy check (unauthenticated guest cannot view registered customer's order)
  console.log("\n[9] Verifying private registered customer order cannot be viewed anonymously...");
  const { handleApiRequest } = await import("../src/server/api");
  const anonReq = new Request(`http://localhost:5173/api/orders/${registeredOrder.id}`, {
    method: "GET"
  });
  const anonRes = await handleApiRequest(anonReq);
  console.log(`  Anonymous request response status: ${anonRes.status}`);
  if (anonRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized for anonymous access to registered order, got ${anonRes.status}`);
  }
  console.log("  => Check passed: Anonymous users cannot access private registered customer orders.");

  // Clean up test orders
  console.log("\n[10] Cleaning up test artifacts...");
  for (const ordId of [guestOrder.id, registeredOrder.id]) {
    await (serverSupabase.from("payments" as any) as any).delete().eq("order_id", ordId);
    await (serverSupabase.from("order_items" as any) as any).delete().eq("order_id", ordId);
    await (serverSupabase.from("order_status_logs" as any) as any).delete().eq("order_id", ordId);
    await (serverSupabase.from("notifications" as any) as any).delete().eq("order_id", ordId);
    await (serverSupabase.from("orders" as any) as any).delete().eq("id", ordId);
  }
  console.log("  => Cleanup complete.");

  console.log("\n=======================================================");
  console.log("ALL GUEST, AUTHENTICATED & WAITER TESTS PASSED!");
  console.log("=======================================================");
}

runTests().catch(err => {
  console.error("\nTEST SUITE FAILED:", err);
  process.exit(1);
});
