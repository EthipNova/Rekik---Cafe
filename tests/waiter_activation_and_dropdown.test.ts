/**
 * ============================================================================
 * Rekik Café — Admin-Controlled Waiter Activation & Dropdown Filtering Test
 * File: tests/waiter_activation_and_dropdown.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";

// Polyfill window & localStorage for Node test runner before importing supabase
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = String(val);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  },
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: (i: number) => Object.keys(mockStorage)[i] ?? null,
};

(globalThis as any).window = {
  location: { pathname: "/admin/staff" },
  localStorage: mockLocalStorage,
};
(globalThis as any).localStorage = mockLocalStorage;

import { serverSupabase } from "../src/server/supabase";
import { supabase } from "../src/lib/supabase";
import { handleApiRequest, DESIGNATED_ADMIN_ID } from "../src/server/api";
import { getAvailableWaiters } from "../src/server/waiter";
import { updateStaffActiveStatus } from "../src/server/staff";
import { createOrder, getOrderById, getProducts } from "../src/server/db";

console.log("================================================================================");
console.log("REKIK CAFÉ: ADMIN-CONTROLLED WAITER ACTIVATION & DROPDOWN FILTERING TEST SUITE");
console.log("================================================================================");

async function run() {
  // ── [1] Test Initial Available Waiters List ──────────────────────────────────
  console.log("\n[1] Testing getAvailableWaiters() filtering...");
  const initialWaiters = await getAvailableWaiters();
  console.log(`✓ Fetched ${initialWaiters.length} active waiters from server.`);
  assert.ok(Array.isArray(initialWaiters), "getAvailableWaiters must return an array");

  // Verify all returned waiters are active and role === 'waiter'
  for (const w of initialWaiters) {
    assert.equal(w.role, "waiter", `Waiter ${w.name} must have role === 'waiter'`);
    assert.equal(w.isActive, true, `Waiter ${w.name} in dropdown must be active`);
  }
  console.log("✓ Every waiter in the customer floor list is strictly active with role 'waiter'.");

  // ── [2] Security: Unauthorized / Non-Admin Status Mutation Rejection ─────────
  console.log("\n[2] Testing Security: Non-Admin Status Update Rejection...");

  // 2a. Anonymous PATCH /api/admin/staff/status must return 401
  const anonRes = await handleApiRequest(
    new Request("http://localhost/api/admin/staff/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "e9504215-7be6-489d-8471-83a86eb9ef4e", isActive: false }),
    }),
  );
  assert.equal(anonRes.status, 401, "Anonymous user cannot update staff status");
  console.log("✓ Anonymous request to change staff status blocked with 401 Unauthorized.");

  // 2b. Customer token PATCH /api/admin/staff/status must return 403
  // Generate magic link for customer alemu00@gmail.com
  const { data: custLink } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: "alemu00@gmail.com",
  });
  if (custLink) {
    const custRes = await handleApiRequest(
      new Request("http://localhost/api/admin/staff/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${custLink.properties.hashed_token}`,
        },
        body: JSON.stringify({ userId: "e9504215-7be6-489d-8471-83a86eb9ef4e", isActive: false }),
      }),
    );
    assert.ok(
      custRes.status === 401 || custRes.status === 403,
      `Customer cannot update staff status, got status ${custRes.status}`,
    );
    console.log("✓ Customer request to change staff status blocked with 401/403.");
  }

  // ── [3] Admin Deactivation of a Waiter ───────────────────────────────────────
  console.log("\n[3] Testing Admin Deactivation of Waiter...");
  // Use known registered waiter Henok (e9504215-7be6-489d-8471-83a86eb9ef4e)
  const targetWaiterId = "e9504215-7be6-489d-8471-83a86eb9ef4e";

  // Step 3a: Admin deactivates waiter
  const deactivateResult = await updateStaffActiveStatus(targetWaiterId, false, DESIGNATED_ADMIN_ID);
  assert.equal(deactivateResult.success, true);
  assert.equal(deactivateResult.isActive, false);

  // Verify in database
  const { data: profileAfterDeact } = await (serverSupabase.from("staff_profiles" as any) as any)
    .select("user_id, full_name, is_active, role")
    .eq("user_id", targetWaiterId)
    .single();

  assert.equal(profileAfterDeact.is_active, false, "Waiter must be inactive in staff_profiles");
  console.log(`✓ Waiter ${profileAfterDeact.full_name} (${targetWaiterId}) successfully deactivated in DB.`);

  // Step 3b: Verify waiter NO LONGER appears in getAvailableWaiters()
  const waitersAfterDeact = await getAvailableWaiters();
  const foundDeactivated = waitersAfterDeact.find((w) => w.id === targetWaiterId || w.userId === targetWaiterId);
  assert.equal(
    foundDeactivated,
    undefined,
    "Deactivated waiter must NOT appear in available customer waiters list",
  );
  console.log("✓ Deactivated waiter is completely excluded from customer waiter dropdown.");

  // ── [4] Server-Side Order Submission Validation with Inactive Waiter ─────────
  console.log("\n[4] Testing Server-Side Order Validation for Inactive Waiter...");

  const allMenuProducts = await getProducts();
  const sampleProduct = allMenuProducts.find((p) => p.available !== false) || allMenuProducts[0];
  const validProductId = sampleProduct ? sampleProduct.id : "p-1";

  // Customer attempts to submit an order assigning the deactivated waiter
  let orderError: Error | null = null;
  try {
    await createOrder({
      lines: [{ productId: validProductId, quantity: 1 }],
      method: "dine-in",
      waiterId: targetWaiterId,
      customer: { name: "Test Diner", phone: "0911001122" },
    });
  } catch (err: unknown) {
    orderError = err instanceof Error ? err : new Error(String(err));
  }

  assert.ok(orderError !== null, "Server must REJECT order assignment to inactive waiter");
  assert.ok(
    orderError.message.toLowerCase().includes("inactive") ||
      orderError.message.toLowerCase().includes("unavailable"),
    `Error message must clearly inform customer waiter is inactive, got: ${orderError.message}`,
  );
  console.log(`✓ Server safely rejected order for inactive waiter with message: "${orderError.message}"`);

  // ── [5] Admin Reactivation of the Waiter ─────────────────────────────────────
  console.log("\n[5] Testing Admin Reactivation of Waiter...");
  const activateResult = await updateStaffActiveStatus(targetWaiterId, true, DESIGNATED_ADMIN_ID);
  assert.equal(activateResult.success, true);
  assert.equal(activateResult.isActive, true);

  // Verify in database
  const { data: profileAfterAct } = await (serverSupabase.from("staff_profiles" as any) as any)
    .select("user_id, full_name, is_active, role")
    .eq("user_id", targetWaiterId)
    .single();

  assert.equal(profileAfterAct.is_active, true, "Waiter must be active in staff_profiles");
  console.log(`✓ Waiter ${profileAfterAct.full_name} (${targetWaiterId}) reactivated in DB.`);

  // Verify waiter RE-APPEARS in getAvailableWaiters()
  const waitersAfterAct = await getAvailableWaiters();
  const foundReactivated = waitersAfterAct.find((w) => w.id === targetWaiterId || w.userId === targetWaiterId);
  assert.ok(foundReactivated, "Reactivated waiter MUST re-appear in customer dropdown");
  assert.equal(foundReactivated.isActive, true);
  console.log(`✓ Newly reactivated waiter ${foundReactivated.name} is now available in customer dropdown.`);

  // ── [6] Successful Order Creation with Active Waiter ─────────────────────────
  console.log("\n[6] Testing Successful Order Assignment to Active Waiter...");
  const createdOrder = await createOrder({
    lines: [{ productId: validProductId, quantity: 2 }],
    method: "dine-in",
    waiterId: targetWaiterId,
    customer: { name: "Satisfied Customer", phone: "0911001122" },
  });

  assert.ok(createdOrder && createdOrder.id, "Order should be created successfully");
  assert.equal(createdOrder.waiterId, targetWaiterId, "Order must be assigned to the active waiter");
  console.log(`✓ Order #${createdOrder.orderNumber} successfully created and assigned to waiter ${targetWaiterId}.`);

  // ── [7] Historical Order Preservation When Waiter Deactivated Later ──────────
  console.log("\n[7] Testing Historical Order Preservation...");
  // Deactivate waiter again
  await updateStaffActiveStatus(targetWaiterId, false, DESIGNATED_ADMIN_ID);

  // Retrieve the historical order
  const historicalOrder = await getOrderById(createdOrder.id);
  assert.ok(historicalOrder, "Historical order must continue to exist");
  assert.equal(
    historicalOrder.waiterId,
    targetWaiterId,
    "Historical order waiter_id must NOT be altered or erased by waiter deactivation",
  );
  console.log("✓ Historical order record preserved with correct waiter assignment intact.");

  // Clean up order and restore waiter to active
  await (serverSupabase.from("orders" as any) as any).delete().eq("id", createdOrder.id);
  await updateStaffActiveStatus(targetWaiterId, true, DESIGNATED_ADMIN_ID);
  console.log("✓ Cleaned up test order and restored waiter to active status.");

  console.log("\n================================================================================");
  console.log("ALL ADMIN-CONTROLLED WAITER ACTIVATION & DROPDOWN FILTERING TESTS PASSED!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
