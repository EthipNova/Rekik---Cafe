import assert from "node:assert/strict";
import { createOrder, getOrderById } from "../src/server/db";
import { getAvailableWaiters, getWaiterOrders } from "../src/server/waiter";
import { serverSupabase } from "../src/server/supabase";

async function runCustomerRefinementsTests() {
  console.log("=================================================================");
  console.log("TESTING REKIK CAFÉ CUSTOMER PAGE REFINEMENTS & WAITER WORKFLOW");
  console.log("=================================================================\n");

  // 1. Fetch available floor staff
  console.log("[1] Querying available floor staff...");
  const waiters = await getAvailableWaiters();
  assert.ok(waiters.length > 0, "There must be at least one active waiter for floor operations");
  const selectedWaiter = waiters[0]!;
  console.log(`✓ Active waiter verified: ${selectedWaiter.name} (ID: ${selectedWaiter.id})`);

  // 2. Fetch test product
  const { getProducts } = await import("../src/server/db");
  const products = await getProducts();
  assert.ok(products.length > 0, "Database must have menu products");
  const testProduct = products[0]!;
  console.log(`✓ Using test product: ${testProduct.name} @ ETB ${testProduct.price}`);

  // 3. Test Dine-In Order with QR Table Number
  console.log("\n[2] Testing Dine-In Order with QR Table Number (e.g. 'Table 14')...");
  const qrTableNumber = "14";
  const dineInOrder = await createOrder({
    lines: [{ productId: testProduct.id, quantity: 2 }],
    method: "dine-in",
    waiterId: selectedWaiter.id,
    paymentMethod: "Pending Waiter Settlement",
    paymentStatus: "pending",
    customer: {
      name: "Abebe Dine-In Guest",
      phone: "0911223344",
      table: qrTableNumber,
    },
    customerNotes: "Customer entered QR table number 14",
  });

  console.log(`✓ Dine-In order placed: #${dineInOrder.number} (ID: ${dineInOrder.id})`);
  assert.equal(dineInOrder.customer.table, qrTableNumber, "Dine-in order must preserve QR table number");
  assert.equal(dineInOrder.method, "dine-in");
  assert.equal(dineInOrder.paymentStatus, "pending", "Payment must be pending waiter settlement");

  // Verify in authoritative Supabase database row
  const { data: dbDineIn, error: dbErr1 } = await (serverSupabase.from("orders" as any) as any)
    .select("id, order_number, method, table_number, waiter_id, status, waiter_decision, total_amount")
    .eq("id", dineInOrder.id)
    .single();

  assert.equal(dbErr1, null, `Database query failed: ${dbErr1?.message}`);
  assert.equal(dbDineIn.table_number, qrTableNumber, "Supabase table_number column must match QR code");
  assert.equal(dbDineIn.waiter_id, selectedWaiter.id, "Order must be associated with the selected waiter");
  console.log(`✓ Confirmed in Supabase database: orders.table_number = '${dbDineIn.table_number}', waiter_id = '${dbDineIn.waiter_id}'`);

  // Verify waiter received notification with table number
  const { data: notif, error: notifErr } = await (serverSupabase.from("notifications" as any) as any)
    .select("recipient_user_id, order_id, title, message")
    .eq("order_id", dineInOrder.id)
    .maybeSingle();

  assert.equal(notifErr, null);
  assert.ok(notif, "Notification must be generated for the assigned waiter");
  assert.equal(notif.recipient_user_id, selectedWaiter.id);
  assert.ok(
    notif.message.includes(qrTableNumber) || notif.message.includes("Table"),
    `Notification should reference table: ${notif.message}`,
  );
  console.log(`✓ Waiter received notification: "${notif.message}"`);

  // Verify order appears on waiter's dashboard with table number
  const waiterOrders = await getWaiterOrders({ userId: selectedWaiter.id } as any);
  const foundWaiterOrder = waiterOrders.find((o) => o.id === dineInOrder.id);
  assert.ok(foundWaiterOrder, "Dine-in order must appear in assigned waiter's dashboard");
  assert.equal(foundWaiterOrder.tableNumber, qrTableNumber, "WaiterOrder.tableNumber must be populated");
  console.log(`✓ Waiter dashboard order verified: Table #${foundWaiterOrder.tableNumber}, Total: ETB ${foundWaiterOrder.totalAmount}`);

  // 4. Test Takeaway Order: Table Number MUST NOT be present
  console.log("\n[3] Testing Takeaway Order (Ensuring table number is omitted)...");
  const takeawayOrder = await createOrder({
    lines: [{ productId: testProduct.id, quantity: 1 }],
    method: "takeaway",
    waiterId: selectedWaiter.id,
    paymentMethod: "Pending Waiter Settlement",
    paymentStatus: "pending",
    customer: {
      name: "Tigist Pickup",
      phone: "0922334455",
      // Even if client had old table in state, it must be null for takeaway
      table: undefined,
    },
  });

  const { data: dbTakeaway, error: dbErr2 } = await (serverSupabase.from("orders" as any) as any)
    .select("id, method, table_number, waiter_id")
    .eq("id", takeawayOrder.id)
    .single();

  assert.equal(dbErr2, null);
  assert.equal(dbTakeaway.table_number, null, "Takeaway orders must have null table_number");
  assert.equal(dbTakeaway.waiter_id, selectedWaiter.id, "Takeaway orders must associate with selected waiter");
  console.log(`✓ Takeaway order placed: table_number is null, waiter_id = ${dbTakeaway.waiter_id}`);

  // 5. Test Delivery Order: Table Number MUST NOT be present
  console.log("\n[4] Testing Delivery Order (Ensuring table number is omitted)...");
  const { data: storeSettings } = await (serverSupabase.from("store_settings" as any) as any)
    .select("id, cafe_latitude, cafe_longitude, delivery_enabled")
    .limit(1)
    .maybeSingle();

  const hadCoords = Boolean(storeSettings?.cafe_latitude && storeSettings?.cafe_longitude);
  if (!hadCoords && storeSettings?.id) {
    await (serverSupabase.from("store_settings" as any) as any)
      .update({ cafe_latitude: 9.005, cafe_longitude: 38.763, delivery_enabled: true })
      .eq("id", storeSettings.id);
  }

  let deliveryOrder: any = null;
  try {
    deliveryOrder = await createOrder({
      lines: [{ productId: testProduct.id, quantity: 1 }],
      method: "delivery",
      waiterId: selectedWaiter.id,
      paymentMethod: "Pending Waiter Settlement",
      paymentStatus: "pending",
      customer: {
        name: "Dawit Delivery",
        phone: "0933445566",
        address: "Bole Medhanialem, Building A, 3rd Floor",
        latitude: 9.005401,
        longitude: 38.763611,
        table: undefined,
      },
    });

    const { data: dbDelivery, error: dbErr3 } = await (serverSupabase.from("orders" as any) as any)
      .select("id, method, table_number, waiter_id, delivery_address")
      .eq("id", deliveryOrder.id)
      .single();

    assert.equal(dbErr3, null);
    assert.equal(dbDelivery.table_number, null, "Delivery orders must have null table_number");
    assert.equal(dbDelivery.waiter_id, selectedWaiter.id, "Delivery orders must associate with selected waiter");
    assert.ok(dbDelivery.delivery_address, "Delivery address must be stored");
    console.log(`✓ Delivery order placed: table_number is null, waiter_id = ${dbDelivery.waiter_id}`);
  } finally {
    if (!hadCoords && storeSettings?.id) {
      await (serverSupabase.from("store_settings" as any) as any)
        .update({
          cafe_latitude: storeSettings.cafe_latitude,
          cafe_longitude: storeSettings.cafe_longitude,
          delivery_enabled: storeSettings.delivery_enabled,
        })
        .eq("id", storeSettings.id);
    }
  }

  // 6. Test Method Switching Sanitation: If method is not dine-in, table_number is forced null
  console.log("\n[5] Testing Method Switching Backend Guard...");
  const switchedOrder = await createOrder({
    lines: [{ productId: testProduct.id, quantity: 1 }],
    method: "takeaway",
    waiterId: selectedWaiter.id,
    customer: {
      name: "Switched Method Customer",
      phone: "0944556677",
      table: "ObsoleteTable99", // Simulating dirty table input sent with takeaway method
    },
  });

  const { data: dbSwitched } = await (serverSupabase.from("orders" as any) as any)
    .select("id, method, table_number")
    .eq("id", switchedOrder.id)
    .single();

  assert.equal(
    dbSwitched.table_number,
    null,
    "Backend must sanitize and force table_number = null when method is not dine-in",
  );
  console.log(`✓ Backend correctly sanitized obsolete table number on method change: table_number = null`);

  // 7. Clean up test records
  console.log("\n[6] Cleaning up test records from database...");
  for (const id of [dineInOrder.id, takeawayOrder.id, deliveryOrder?.id, switchedOrder.id].filter(Boolean)) {
    await (serverSupabase.from("payments" as any) as any).delete().eq("order_id", id);
    await (serverSupabase.from("order_items" as any) as any).delete().eq("order_id", id);
    await (serverSupabase.from("order_status_logs" as any) as any).delete().eq("order_id", id);
    await (serverSupabase.from("notifications" as any) as any).delete().eq("order_id", id);
    await (serverSupabase.from("orders" as any) as any).delete().eq("id", id);
  }
  console.log("✓ Test database cleanup completed successfully.");

  console.log("\n=================================================================");
  console.log("ALL CUSTOMER PAGE REFINEMENTS & WAITER WORKFLOW TESTS PASSED!");
  console.log("=================================================================");
}

runCustomerRefinementsTests().catch((err) => {
  console.error("\nTEST FAILED:", err);
  process.exit(1);
});
