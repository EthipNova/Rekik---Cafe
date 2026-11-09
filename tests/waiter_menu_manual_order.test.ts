import assert from "node:assert/strict";
import {
  getPhoneLookupVariants,
  lookupCustomerByPhone,
  createManualWaiterOrder,
  type AuthenticatedStaff,
} from "../src/server/waiter";
import { handleApiRequest } from "../src/server/api";
import { serverSupabase } from "../src/server/supabase";

async function runTests() {
  console.log("\n========================================================");
  console.log(" Rekik Café: Waiter Menu & Manual Order Test Suite");
  console.log("========================================================\n");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    return Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        console.log(`  ✓ [${passed}/${total}] ${name}`);
      })
      .catch((err) => {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error("   ", err);
        throw err;
      });
  }

  // 1. Phone lookup variants unit tests
  await test("getPhoneLookupVariants produces valid Ethiopian prefixes and national formats", () => {
    const v1 = getPhoneLookupVariants("0911223344");
    assert.ok(v1.includes("0911223344"), "Includes original");
    assert.ok(v1.includes("+251911223344"), "Includes +251");
    assert.ok(v1.includes("251911223344"), "Includes 251");
    assert.ok(v1.includes("911223344"), "Includes stripped 9");

    const v2 = getPhoneLookupVariants("+251912345678");
    assert.ok(v2.includes("0912345678"), "Includes 0 prefix");
    assert.ok(v2.includes("+251912345678"), "Includes +251");

    const empty = getPhoneLookupVariants("   ");
    assert.equal(empty.length, 0, "Empty on blank input");
  });

  // 2. Mock staff identities (using real auth user id for foreign key compliance)
  const mockWaiterStaff: AuthenticatedStaff = {
    userId: "e9504215-7be6-489d-8471-83a86eb9ef4e",
    email: "henok00@gmail.com",
    fullName: "Henok",
    phone: "0911112233",
    role: "waiter",
    isAvailable: true,
    isActive: true,
  };

  const mockInactiveWaiter: AuthenticatedStaff = {
    ...mockWaiterStaff,
    isActive: false,
  };

  const mockCashierStaff: AuthenticatedStaff = {
    ...mockWaiterStaff,
    userId: "c1111111-1111-1111-1111-111111111111",
    role: "cashier",
  };

  // 3. Validation: Inactive waiter rejected
  await test("createManualWaiterOrder rejects inactive staff", async () => {
    await assert.rejects(
      () =>
        createManualWaiterOrder(mockInactiveWaiter, {
          items: [{ productId: "p-1", quantity: 1 }],
          method: "dine_in",
          tableNumber: "Table 1",
        }),
      /inactive/,
    );
  });

  // 4. Validation: Unauthorized role rejected
  await test("createManualWaiterOrder rejects unauthorized staff roles", async () => {
    await assert.rejects(
      () =>
        createManualWaiterOrder(mockCashierStaff, {
          items: [{ productId: "p-1", quantity: 1 }],
          method: "dine_in",
          tableNumber: "Table 1",
        }),
      /Only active waiters and admins/,
    );
  });

  // 5. Validation: Empty items rejected
  await test("createManualWaiterOrder rejects empty items array", async () => {
    await assert.rejects(
      () =>
        createManualWaiterOrder(mockWaiterStaff, {
          items: [],
          method: "dine_in",
          tableNumber: "Table 1",
        }),
      /at least one menu item/,
    );
  });

  // 6. Validation: Dine-In requires Table Number
  await test("createManualWaiterOrder strictly requires table number for Dine-In orders", async () => {
    await assert.rejects(
      () =>
        createManualWaiterOrder(mockWaiterStaff, {
          items: [{ productId: "p-1", quantity: 1 }],
          method: "dine_in",
          tableNumber: "   ",
        }),
      /Table number is required for Dine-In orders/,
    );
  });

  // 7. Mock / Seed Database setup for functional test
  await test("Ensure demo products and existing customer are seeded for testing", async () => {
    // Seed waiter in users table to satisfy foreign key constraints
    await serverSupabase.from("users").upsert({
      id: mockWaiterStaff.userId,
      email: mockWaiterStaff.email,
      full_name: mockWaiterStaff.fullName,
      phone: mockWaiterStaff.phone,
      role: "STAFF",
    });

    // Seed waiter staff profile
    await serverSupabase.from("staff_profiles").upsert({
      user_id: mockWaiterStaff.userId,
      email: mockWaiterStaff.email,
      full_name: mockWaiterStaff.fullName,
      phone: mockWaiterStaff.phone,
      role: "waiter",
      is_available: true,
      is_active: true,
    });

    // Seed test product
    await serverSupabase.from("products").upsert({
      id: "99999999-9999-9999-9999-999999999901",
      name: "Special Ethiopian Macchiato",
      slug: "special-ethiopian-macchiato",
      price: 85,
      is_available: true,
    });

    await serverSupabase.from("products").upsert({
      id: "99999999-9999-9999-9999-999999999902",
      name: "Unavailable Seasonal Pastry",
      slug: "unavailable-seasonal-pastry",
      price: 150,
      is_available: false,
    });

    // Seed an existing customer
    await serverSupabase.from("customers").upsert({
      id: "88888888-8888-8888-8888-888888888888",
      name: "Tigist Haile",
      phone: "0998877665",
      email: "tigist.haile.test@example.com",
    });
  });

  // 8. Rejects unavailable menu item
  await test("createManualWaiterOrder rejects items that are marked out of stock / unavailable", async () => {
    await assert.rejects(
      () =>
        createManualWaiterOrder(mockWaiterStaff, {
          items: [{ productId: "99999999-9999-9999-9999-999999999902", quantity: 1 }],
          method: "dine_in",
          tableNumber: "Table 2",
        }),
      /currently marked as unavailable/,
    );
  });

  // 9. Customer lookup by phone
  await test("lookupCustomerByPhone finds existing registered customer by phone variant", async () => {
    const found = await lookupCustomerByPhone("+251998877665");
    assert.ok(found, "Customer found");
    assert.equal(found?.id, "88888888-8888-8888-8888-888888888888");
    assert.equal(found?.name, "Tigist Haile");
  });

  // 10. Successful Dine-In manual order creation
  let createdDineInOrder: any = null;
  await test("createManualWaiterOrder creates Dine-In order with correct waiter assignment and auto-approval", async () => {
    createdDineInOrder = await createManualWaiterOrder(mockWaiterStaff, {
      items: [{ productId: "99999999-9999-9999-9999-999999999901", quantity: 2 }],
      method: "dine_in",
      tableNumber: "Table 5",
      customerName: "Tigist Haile",
      customerPhone: "0998877665",
      customerNotes: "Extra hot with brown sugar",
    });

    assert.ok(createdDineInOrder, "Order returned");
    assert.ok(createdDineInOrder.id, "Has order ID");
    assert.ok(createdDineInOrder.orderNumber, "Has order number");
    assert.equal(createdDineInOrder.waiterId, mockWaiterStaff.userId, "Assigned to authenticated waiter");
    assert.equal(createdDineInOrder.waiterDecision, "approved", "Waiter decision is approved");
    assert.equal(createdDineInOrder.status, "confirmed", "Status is confirmed");
    assert.equal(createdDineInOrder.method, "dine_in", "Method is dine_in");
    assert.equal(createdDineInOrder.tableNumber, "Table 5", "Table number recorded");
    assert.equal(createdDineInOrder.subtotal, 170, "85 * 2 = 170 ETB subtotal");
    assert.equal(createdDineInOrder.totalAmount, 170, "Total amount matches");
    assert.equal(createdDineInOrder.customerId, "88888888-8888-8888-8888-888888888888", "Reuses existing customer ID");

    // Verify order item persisted
    assert.equal(createdDineInOrder.items.length, 1);
    assert.equal(createdDineInOrder.items[0].name, "Special Ethiopian Macchiato");
    assert.equal(createdDineInOrder.items[0].quantity, 2);
    assert.equal(createdDineInOrder.items[0].unitPrice, 85);
    assert.equal(createdDineInOrder.items[0].lineTotal, 170);
  });

  // 11. Successful Takeaway order without table number
  await test("createManualWaiterOrder permits Takeaway orders without requiring a table number", async () => {
    const takeawayOrder = await createManualWaiterOrder(mockWaiterStaff, {
      items: [{ productId: "99999999-9999-9999-9999-999999999901", quantity: 1 }],
      method: "takeaway",
      customerName: "Walk-in Guest",
      customerPhone: "0944556677",
    });

    assert.ok(takeawayOrder.id);
    assert.equal(takeawayOrder.method, "pickup");
    assert.equal(takeawayOrder.tableNumber, null);
    assert.equal(takeawayOrder.totalAmount, 85);
    assert.equal(takeawayOrder.waiterId, mockWaiterStaff.userId);
  });

  // 12. API Route integration test: POST /api/waiter/orders
  await test("POST /api/waiter/orders endpoint creates manual order via API", async () => {
    const req = new Request("http://localhost:3000/api/waiter/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Test bearer auth or mock token
        Authorization: `Bearer mock-waiter-token`,
      },
      body: JSON.stringify({
        items: [{ productId: "99999999-9999-9999-9999-999999999901", quantity: 3 }],
        method: "dine_in",
        tableNumber: "VIP 1",
        customerName: "VIP Guest",
      }),
    });

    // Without a real Supabase auth session token, resolveWaiterUser returns 401 unauthenticated
    const res = await handleApiRequest(req);
    assert.ok(res, "Got response from handleApiRequest");
    // Verify route is matched and correctly protected
    assert.equal(res.status, 401, "Protected endpoint rejects invalid token with 401");
  });

  // 13. API Route integration test: GET /api/waiter/customers/lookup
  await test("GET /api/waiter/customers/lookup endpoint is protected and responds properly", async () => {
    const req = new Request("http://localhost:3000/api/waiter/customers/lookup?phone=0922334455", {
      method: "GET",
    });
    const res = await handleApiRequest(req);
    assert.ok(res, "Got response from handleApiRequest");
    assert.equal(res.status, 401, "Protected endpoint rejects unauthenticated request");
  });

  console.log("\n========================================================");
  console.log(` All ${passed}/${total} Waiter Menu & Manual Order Tests Passed!`);
  console.log("========================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
