import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase credentials in environment");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Import server order creator
import { createOrder } from "../src/server/db";
import { getWaiterOrders, getWaiterMetrics } from "../src/server/waiter";
import { getOrderPaymentStatus, isWaiterOrderCompleted } from "../src/lib/waiter";
import type { AuthenticatedStaff } from "../src/server/waiter";

async function runTests() {
  console.log("=================================================================");
  console.log("TESTING REKIK CAFÉ WAITER DASHBOARD REFINEMENTS");
  console.log("=================================================================");

  // 1. Identify active waiter
  const { data: staffList, error: staffErr } = await supabase
    .from("staff_profiles")
    .select("user_id, full_name, role, is_active, is_available")
    .eq("role", "waiter")
    .eq("is_active", true)
    .limit(1);

  assert.ok(!staffErr, `Failed to query staff: ${staffErr?.message}`);
  assert.ok(staffList && staffList.length > 0, "No active waiter found");
  const waiter = staffList[0]!;
  console.log(`✓ Active waiter verified: ${waiter.full_name} (${waiter.user_id})`);

  const mockStaff: AuthenticatedStaff = {
    userId: waiter.user_id,
    fullName: waiter.full_name,
    email: "waiter@rekikcafe.com",
    role: "waiter",
    isAvailable: true,
    isActive: true,
  };

  // 2. Identify active product
  const { getProducts } = await import("../src/server/db");
  const products = await getProducts();
  assert.ok(products && products.length > 0, "No active product found");
  const product = products[0]!;
  console.log(`✓ Using test product: ${product.name} @ ETB ${product.price}`);

  const createdOrderIds: string[] = [];

  try {
    // 3. Test 1: Submit new order -> verifies it is auto-approved, confirmed, and immediately in Current Orders
    console.log("\n[1] Testing customer order submission auto-approval & current orders...");
    const order = await createOrder({
      method: "dine-in",
      customer: {
        name: "Test Customer Floor",
        phone: "+251911223344",
        table: "22",
      },
      waiterId: waiter.user_id,
      customerNotes: "Extra hot coffee please",
      lines: [{ productId: product.id, quantity: 1, price: product.price }],
    });

    createdOrderIds.push(order.id);
    console.log(`✓ Order placed: #${order.orderNumber} (ID: ${order.id})`);

    // Fetch from Supabase
    const { data: dbOrder } = await supabase
      .from("orders")
      .select("id, status, waiter_decision, waiter_id, table_number")
      .eq("id", order.id)
      .single();

    assert.equal(dbOrder?.waiter_decision, "approved", "Order should be auto-approved without manual waiter approval step");
    assert.equal(dbOrder?.status, "confirmed", "Order should be confirmed upon placement");
    assert.equal(dbOrder?.waiter_id, waiter.user_id, "Order must be assigned to selected waiter");
    assert.equal(dbOrder?.table_number, "22", "Table number must be stored accurately");
    console.log("✓ Verified in database: status='confirmed', waiter_decision='approved', table_number='22'");

    // 4. Test 2: Verify order appears in Waiter's Active Orders query
    console.log("\n[2] Verifying order retrieval in Waiter's Active Orders...");
    const activeOrders = await getWaiterOrders(mockStaff, { status: "active" });
    const foundInActive = activeOrders.find((o) => o.id === order.id);
    assert.ok(foundInActive, "Newly submitted order must automatically appear in assigned waiter's active orders");
    assert.equal(foundInActive.tableNumber, "22", "Table number must match in waiter order");
    console.log(`✓ Order #${foundInActive.orderNumber} successfully retrieved in waiter active orders list`);

    // 5. Test 3: Verify Payment Status resolution on the order
    console.log("\n[3] Testing Order History payment status resolution...");
    const paymentStatusInitial = getOrderPaymentStatus(foundInActive);
    assert.equal(paymentStatusInitial.status, "Pending", "Initial payment status must be Pending");
    console.log(`✓ Initial payment status resolved correctly: ${paymentStatusInitial.label}`);

    // Simulate cashier recording/approving payment for this order
    const paymentId = crypto.randomUUID();
    await supabase.from("payments").insert({
      id: paymentId,
      order_id: order.id,
      method: "cash",
      amount: order.total,
      status: "paid",
      paid_at: new Date().toISOString(),
    });

    // Re-fetch orders for waiter
    const refreshedOrders = await getWaiterOrders(mockStaff);
    const settledOrder = refreshedOrders.find((o) => o.id === order.id);
    assert.ok(settledOrder, "Order must exist in waiter history");
    const paymentStatusSettled = getOrderPaymentStatus(settledOrder);
    assert.equal(paymentStatusSettled.status, "Paid", "Payment status must now resolve to Paid");
    console.log(`✓ Settled payment status resolved correctly: ${paymentStatusSettled.label}`);

    // 6. Test 4: Date-based filtering logic
    console.log("\n[4] Testing Date Filtering logic for Order History...");
    const todayOrders = await getWaiterOrders(mockStaff, { date: "today" });
    assert.ok(
      todayOrders.some((o) => o.id === order.id),
      "Order created today must appear in 'today' filter",
    );
    console.log(`✓ 'today' filter correctly includes newly placed order (${todayOrders.length} orders today)`);

    const yesterdayOrders = await getWaiterOrders(mockStaff, { date: "yesterday" });
    assert.ok(
      !yesterdayOrders.some((o) => o.id === order.id),
      "Order created today must NOT appear in 'yesterday' filter",
    );
    console.log(`✓ 'yesterday' filter correctly excludes today's order (${yesterdayOrders.length} orders yesterday)`);

    const weekOrders = await getWaiterOrders(mockStaff, { date: "week" });
    assert.ok(
      weekOrders.some((o) => o.id === order.id),
      "Order created today must appear in 'week' (Last 7 Days) filter",
    );
    console.log(`✓ 'week' filter correctly includes order (${weekOrders.length} orders in last 7 days)`);

    const monthOrders = await getWaiterOrders(mockStaff, { date: "month" });
    assert.ok(
      monthOrders.some((o) => o.id === order.id),
      "Order created today must appear in 'month' (Last 30 Days) filter",
    );
    console.log(`✓ 'month' filter correctly includes order (${monthOrders.length} orders in last 30 days)`);

    // Test custom date filter with today's calendar date
    const todayStr = new Date().toISOString().slice(0, 10);
    const customDateOrders = await getWaiterOrders(mockStaff, { date: todayStr });
    assert.ok(
      customDateOrders.some((o) => o.id === order.id),
      `Order created today must appear in custom date filter ${todayStr}`,
    );
    console.log(`✓ Custom date filter (${todayStr}) correctly matched order`);

    // 7. Test 5: Verify metrics computation
    console.log("\n[5] Testing Waiter Metrics computation...");
    const metrics = await getWaiterMetrics(mockStaff);
    assert.ok(typeof metrics.totalAssignedActive === "number", "totalAssignedActive must be a number");
    assert.ok(typeof metrics.completedToday === "number", "completedToday must be a number");
    console.log(`✓ Metrics computed successfully: active=${metrics.totalAssignedActive}, completed=${metrics.completedToday}, revenue=ETB ${metrics.todayTotalRevenue}`);

    console.log("\n=================================================================");
    console.log("ALL WAITER DASHBOARD REFINEMENT TESTS PASSED!");
    console.log("=================================================================");
  } finally {
    // Cleanup test order
    console.log("\nCleaning up test records...");
    for (const id of createdOrderIds) {
      await supabase.from("payments").delete().eq("order_id", id);
      await supabase.from("order_items").delete().eq("order_id", id);
      await supabase.from("orders").delete().eq("id", id);
    }
    console.log("✓ Test records cleaned up successfully.");
  }
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
