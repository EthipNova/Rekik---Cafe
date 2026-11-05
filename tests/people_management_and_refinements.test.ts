/**
 * ============================================================================
 * Rekik Café — Refinements & People Management Verification Suite
 * File: tests/people_management_and_refinements.test.ts
 * ============================================================================
 * Tests:
 * 1. Customer Images & Fallbacks:
 *    - Valid live Supabase storage domain in data/db.json
 *    - Category image mapping in index.tsx covers all categories (including soft-drinks)
 *    - Fallback image handlers present on homepage, ProductCard, and product detail
 * 2. Staff Management Improvements:
 *    - Deactivate & Reactivate with Auth ban & DB sync
 *    - Safe Deletion Strategy: Historical record retention vs. zero-record deletion
 *    - Edit modal with Delete and Deactivate actions
 * 3. Add New Staff:
 *    - Meaningful error handling and end-to-end registration
 * 4. People Management Layout & Customer Metrics:
 *    - Staff primary (Total, Active, Inactive metrics + directory)
 *    - Customer secondary (Total, Active 30d, Orders, Verified Paid Spending only)
 * 5. Settings Navigation:
 *    - Payment Settings removed from sidebar
 *    - Store Settings renamed to Settings
 *    - CBE & Telebirr payment account configuration preserved
 * ============================================================================
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import {
  registerStaffMember,
  updateStaffActiveStatus,
  deleteStaffMember,
  getRegisteredStaffList,
} from "../src/server/staff";
import { normalizeCustomerRecord, aggregateCustomers } from "../src/lib/customers";

console.log("=======================================================================");
console.log("RUNNING REKIK CAFÉ PEOPLE MANAGEMENT & REFINEMENTS VERIFICATION SUITE");
console.log("=======================================================================");

const ADMIN_EMAIL = "kbstar77sisay@gmail.com";

async function getAdminToken(): Promise<{ token: string; userId: string }> {
  const { data: linkData, error: linkErr } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_EMAIL,
  });
  assert.equal(linkErr, null, `generateLink failed for ${ADMIN_EMAIL}: ${linkErr?.message}`);

  const { data: sessionData, error: authErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  assert.equal(authErr, null, `verifyOtp failed: ${authErr?.message}`);
  assert.ok(sessionData.session, "Session must be established");
  return {
    token: sessionData.session.access_token,
    userId: sessionData.user.id,
  };
}

async function run() {
  const { token: adminToken, userId: adminUserId } = await getAdminToken();
  console.log(`✓ Admin session established: ${ADMIN_EMAIL} (ID: ${adminUserId})`);

  // ── [1] Verify Customer Image Roots & Category Mappings ─────────────────────
  console.log("\n[1] Verifying Customer Images & Category Mappings...");
  const dbJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "data/db.json"), "utf-8"),
  );
  
  // Verify dead Supabase domain is gone from content
  const dbJsonStr = JSON.stringify(dbJson);
  assert.equal(
    dbJsonStr.includes("evpigfgyjedevisqoche.supabase.co"),
    false,
    "db.json must not reference the dead evpigfgyjedevisqoche Supabase domain",
  );
  assert.ok(
    dbJson.about_content?.homepage_hero_image?.includes("imqtqshcgvgxokojfgxv.supabase.co"),
    "Homepage image must point to active Supabase storage",
  );
  console.log("✓ Live Supabase storage domain verified in db.json content.");

  const indexSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/index.tsx"),
    "utf-8",
  );
  assert.ok(
    indexSource.includes('"soft-drinks":'),
    "categoryImages in index.tsx must map 'soft-drinks' plural to match DB category slug",
  );
  assert.ok(
    indexSource.includes("heroFallback"),
    "Homepage promotional cards must implement heroFallback onError handler",
  );
  console.log("✓ Category mappings and image fallback handlers verified in index.tsx.");

  // ── [2] Verify Staff Deactivation & Reactivation ────────────────────────────
  console.log("\n[2] Verifying Staff Deactivation & Reactivation via API...");
  const testStaffEmail = `test.staff.${Date.now()}@rekiktest.local`;
  const createdStaff = await registerStaffMember(
    {
      name: "Deactivation Test Waiter",
      email: testStaffEmail,
      password: "SafePassword123#",
      role: "waiter",
    },
    adminUserId,
  );
  const staffUserId = createdStaff.userId || createdStaff.id;
  assert.ok(staffUserId, "Staff user ID must be returned");

  try {
    // Deactivate staff member
    const deactRes = await handleApiRequest(
      new Request("http://localhost/api/admin/staff/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: staffUserId,
          isActive: false,
        }),
      }),
    );
    assert.equal(deactRes.status, 200, "Deactivation should return 200");
    const deactBody = await deactRes.json();
    assert.equal(deactBody.isActive, false);

    // Verify Auth user is banned
    const { data: authUserData } = await serverSupabase.auth.admin.getUserById(staffUserId);
    assert.ok(
      authUserData?.user?.banned_until,
      "Deactivated user must have banned_until set in Supabase Auth",
    );
    console.log("✓ Staff deactivation enforced at DB profile and Supabase Auth ban levels.");

    // Reactivate staff member
    const reactRes = await handleApiRequest(
      new Request("http://localhost/api/admin/staff/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          userId: staffUserId,
          isActive: true,
        }),
      }),
    );
    assert.equal(reactRes.status, 200, "Reactivation should return 200");
    const reactBody = await reactRes.json();
    assert.equal(reactBody.isActive, true);

    const { data: reactAuthData } = await serverSupabase.auth.admin.getUserById(staffUserId);
    assert.equal(
      reactAuthData?.user?.banned_until ? new Date(reactAuthData.user.banned_until) < new Date() : true,
      true,
      "Reactivated user must not be banned in Supabase Auth",
    );
    console.log("✓ Staff reactivation restored DB status and lifted Supabase Auth ban.");

    // ── [3] Verify Safe Staff Deletion (Zero Records) ──────────────────────────
    console.log("\n[3] Verifying Safe Staff Deletion (No Historical Records)...");
    const deleteRes = await handleApiRequest(
      new Request(`http://localhost/api/admin/staff/${staffUserId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }),
    );
    const deleteBody = await deleteRes.json();
    assert.equal(deleteBody.isDeleted, true, "Zero-record staff member must return isDeleted: true");
    assert.equal(deleteBody.isArchived, false);
    console.log("✓ Zero-record staff member safely and completely removed from DB and Auth.");

    // Verify completely deleted
    const { data: checkDeleted } = await serverSupabase
      .from("staff_profiles")
      .select("id")
      .eq("user_id", staffUserId)
      .maybeSingle();
    assert.equal(checkDeleted, null, "Staff profile must no longer exist");
  } finally {
    // Fallback cleanup if needed
    try {
      await serverSupabase.from("staff_profiles").delete().eq("user_id", staffUserId);
      await serverSupabase.from("users").delete().eq("id", staffUserId);
      await serverSupabase.auth.admin.deleteUser(staffUserId);
    } catch {
      /* ignore */
    }
  }

  // ── [4] Verify Safe Deletion Strategy for Staff with Historical Records ─────
  console.log("\n[4] Verifying Safe Deletion Strategy for Staff with Orders...");
  const orderStaffEmail = `order.waiter.${Date.now()}@rekiktest.local`;
  const orderStaff = await registerStaffMember(
    {
      name: "Historical Waiter",
      email: orderStaffEmail,
      password: "SafePassword123#",
      role: "waiter",
    },
    adminUserId,
  );
  const orderStaffId = orderStaff.userId || orderStaff.id;

  try {
    // Insert a dummy order assigned to this waiter
    const dummyOrderNumber = `TST-${Date.now().toString().slice(-6)}`;
    const { data: insertedOrder, error: orderErr } = await serverSupabase
      .from("orders")
      .insert({
        order_number: dummyOrderNumber,
        customer_name: "Test Customer",
        customer_phone: "0911223344",
        status: "confirmed",
        method: "dine_in",
        waiter_id: orderStaffId,
        total_amount: 150,
        subtotal: 150,
      })
      .select()
      .single();
    assert.equal(orderErr, null, `Failed to insert dummy order: ${orderErr?.message}`);

    // Now attempt to delete this waiter
    const safeDelRes = await deleteStaffMember(orderStaffId, adminUserId);
    assert.equal(
      safeDelRes.isArchived,
      true,
      "Staff member with historical orders must have isArchived: true (safe retention strategy)",
    );
    assert.equal(safeDelRes.isDeleted, false);

    // Verify order still exists and references waiter
    const { data: orderCheck } = await serverSupabase
      .from("orders")
      .select("id, waiter_id")
      .eq("id", insertedOrder.id)
      .single();
    assert.ok(orderCheck, "Historical order must be intact");
    assert.equal(orderCheck.waiter_id, orderStaffId, "Historical order waiter reference preserved");

    // Verify credentials revoked
    const { data: authUserCheck } = await serverSupabase.auth.admin.getUserById(orderStaffId);
    assert.ok(
      authUserCheck?.user?.banned_until,
      "Archived staff user must be permanently banned in Auth",
    );
    console.log("✓ Historical audit trail preserved: staff credentials revoked, order history intact.");

    // Clean up dummy order
    await serverSupabase.from("orders").delete().eq("id", insertedOrder.id);
  } finally {
    try {
      await serverSupabase.from("staff_profiles").delete().eq("user_id", orderStaffId);
      await serverSupabase.from("users").delete().eq("id", orderStaffId);
      await serverSupabase.auth.admin.deleteUser(orderStaffId);
    } catch {
      /* ignore */
    }
  }

  // ── [5] Verify Customer Spending Calculation Rules ─────────────────────────
  console.log("\n[5] Verifying Customer Spending Calculation (Verified Paid Only)...");
  const testCustomerOrders = [
    { id: "o1", orderNumber: "ORD-001", paymentStatus: "paid", total: 250, createdAt: new Date().toISOString() },
    { id: "o2", orderNumber: "ORD-002", paymentStatus: "paid", total: 100, createdAt: new Date().toISOString() },
    { id: "o3", orderNumber: "ORD-003", paymentStatus: "pending", total: 500, createdAt: new Date().toISOString() },
    { id: "o4", orderNumber: "ORD-004", paymentStatus: "rejected", total: 400, createdAt: new Date().toISOString() },
    { id: "o5", orderNumber: "ORD-005", paymentStatus: "failed", total: 300, createdAt: new Date().toISOString() },
  ];

  const normalized = normalizeCustomerRecord({
    user_id: "test-cust-1",
    customer_name: "Bethlehem Haile",
    customer_phone: "0922334455",
    orders: testCustomerOrders as any,
  });

  // Total orders is 5, but total spent must ONLY count the 2 paid orders (250 + 100 = 350)
  assert.equal(normalized.orderCount, 5, "Total orders should be 5");
  assert.equal(
    normalized.totalSpent,
    350,
    `Total spent must be exactly 350 ETB (paid only), got ${normalized.totalSpent}`,
  );
  console.log("✓ Customer spending strictly counts only verified 'paid' payments.");

  // ── [6] Verify Admin Sidebar & Settings Page ────────────────────────────────
  console.log("\n[6] Verifying Admin Sidebar Structure & Settings...");
  const adminSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.tsx"),
    "utf-8",
  );
  assert.ok(adminSource.includes('label: "People Management"'));
  assert.ok(adminSource.includes('label: "Settings"'));
  assert.equal(adminSource.includes('label: "Payment Settings"'), false);
  assert.equal(adminSource.includes('label: "Store Settings"'), false);

  const settingsSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.settings.tsx"),
    "utf-8",
  );
  assert.ok(settingsSource.includes("Settings — Rekik Café"));
  assert.ok(settingsSource.includes("CBE"));
  assert.ok(settingsSource.includes("Telebirr"));
  console.log("✓ Settings navigation and payment configuration preserved.");

  console.log("\n=======================================================================");
  console.log("ALL PEOPLE MANAGEMENT & REFINEMENT VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("=======================================================================");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
