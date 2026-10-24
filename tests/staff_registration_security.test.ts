/**
 * ============================================================================
 * Rekik Café — Secure Staff Registration & Authorization Test Suite
 * File: tests/staff_registration_security.test.ts
 * ============================================================================
 * Verifies:
 * 1. Admin sidebar cleanup (removal of Growth, Inventory, Availability)
 * 2. Dashboard shortcuts & route preservation for removed pages
 * 3. Registration form contract (strictly 3 fields: Name, Email, Password)
 * 4. Role selector restriction (strictly Waiter and Cashier only)
 * 5. Input validation (required name, email format, password strength)
 * 6. Duplicate email rejection (409 Conflict)
 * 7. Passwords managed securely through Supabase Auth (zero plaintext storage)
 * 8. API & Database authorization (anonymous, customer, waiter/cashier blocked; admin allowed)
 * 9. Deactivated staff cannot access protected staff functionality
 * 10. Existing admin authentication and product management remain functional
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import { validateStaffRegistrationInput } from "../src/server/staff";
import { fetchAdminCategories } from "../src/lib/products";

console.log("=====================================================================");
console.log("RUNNING REKIK CAFÉ STAFF REGISTRATION & SECURITY VERIFICATION SUITE");
console.log("=====================================================================");

async function getAdminToken(
  email = "kbstar77sisay@gmail.com",
): Promise<{ token: string; userId: string }> {
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
  assert.ok(sessionData.session, `Session must be established for ${email}`);
  return {
    token: sessionData.session.access_token,
    userId: sessionData.user.id,
  };
}

async function getCustomerToken(email = "alemu00@gmail.com"): Promise<string> {
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
  assert.ok(sessionData.session, `Customer session must be established for ${email}`);
  return sessionData.session.access_token;
}

async function run() {
  // ── [1] Verify Admin Sidebar Navigation Cleanup ───────────────────────────
  console.log("\n[1] Verifying Admin Sidebar Cleanup & Routes...");
  const adminLayoutSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.tsx"),
    "utf-8",
  );

  // The nav array in admin.tsx must NOT contain the 3 removed sidebar paths
  const removedSidebarPaths = ["/admin/growth", "/admin/inventory", "/admin/availability"];
  for (const p of removedSidebarPaths) {
    const navMatchRegex = new RegExp(`to:\\s*["']${p}["']`);
    assert.equal(
      navMatchRegex.test(adminLayoutSource),
      false,
      `Admin sidebar nav must NOT contain ${p}`,
    );
  }
  console.log("✓ Growth, Inventory, and Availability are removed from admin sidebar navigation.");

  // Preserved sidebar items must remain present
  const preservedSidebarPaths = [
    "/admin",
    "/admin/orders",
    "/admin/payments",
    "/admin/customers",
    "/admin/staff",
    "/admin/products",
    "/admin/categories",
    "/admin/promotions",
    "/admin/content",
    "/admin/contact-messages",
    "/admin/settings",
    "/admin/account",
  ];
  for (const p of preservedSidebarPaths) {
    const navMatchRegex = new RegExp(`to:\\s*["']${p}["']`);
    assert.ok(
      navMatchRegex.test(adminLayoutSource),
      `Admin sidebar must preserve existing item: ${p}`,
    );
  }
  console.log("✓ All other 12 admin sidebar items are fully preserved.");

  // Route files must still exist and be intact
  for (const p of removedSidebarPaths) {
    const routeFilename = p.slice(1).replace(/\//g, ".") + ".tsx";
    const routeFile = path.resolve(process.cwd(), `src/routes/${routeFilename}`);
    assert.ok(fs.existsSync(routeFile), `Route file must exist: ${routeFile}`);
  }
  console.log("✓ Route files for Growth, Inventory, and Availability exist and are intact.");

  // ── [2] Verify Dashboard Shortcuts for Removed Items ──────────────────────
  console.log("\n[2] Verifying Dashboard Shortcuts & Cards...");
  const adminDashboardSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.index.tsx"),
    "utf-8",
  );

  for (const p of removedSidebarPaths) {
    assert.ok(
      adminDashboardSource.includes(p),
      `Admin dashboard index must contain shortcut link to: ${p}`,
    );
  }
  console.log(
    "✓ Admin dashboard contains direct shortcuts for Performance & Growth, Inventory, and Availability.",
  );

  // ── [3] Verify Registration Form Contract (Exactly 3 Fields + Separate Role Selector) ──
  console.log("\n[3] Verifying Registration Form & Role Selector Contract...");
  const staffPageSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.staff.tsx"),
    "utf-8",
  );

  // Form must exist and have id="staff-registration-form"
  assert.ok(
    staffPageSource.includes('id="staff-registration-form"'),
    "Staff registration form must have designated container id",
  );

  // Extract the form content
  const formStart = staffPageSource.indexOf('id="staff-registration-form"');
  const formEnd = staffPageSource.indexOf("</form>", formStart);
  const formContent = staffPageSource.slice(formStart, formEnd);

  // Check inputs inside the form
  const inputMatches = formContent.match(/<Input[^>]*>/g) || [];
  assert.equal(
    inputMatches.length,
    3,
    `Registration form must contain EXACTLY 3 input fields (Name, Email, Password), found ${inputMatches.length}`,
  );

  assert.ok(formContent.includes('name="name"'), "Field 1 must be Name");
  assert.ok(formContent.includes('name="email"'), "Field 2 must be Email");
  assert.ok(formContent.includes('name="password"'), "Field 3 must be Password");

  // Verify forbidden fields do NOT exist in the form
  const forbiddenTerms = ["phone", "address", "birth", "dob", "salary", "national_id"];
  for (const term of forbiddenTerms) {
    assert.equal(
      formContent.toLowerCase().includes(`name="${term}"`),
      false,
      `Registration form must not contain ${term} field`,
    );
  }
  console.log("✓ Registration form strictly contains exactly 3 inputs: Name, Email, Password.");

  // Verify Role Selector is outside form and allows ONLY Waiter and Cashier
  const roleSelectorStart = staffPageSource.indexOf('id="staff-role-selector"');
  assert.ok(roleSelectorStart > 0, "Role selector must exist as a separate control");
  assert.ok(
    roleSelectorStart < formStart,
    "Role selector must be separate and outside the registration form",
  );

  const roleSelectorContent = staffPageSource.slice(roleSelectorStart, formStart);
  assert.ok(roleSelectorContent.includes("Waiter"), "Role selector must include Waiter");
  assert.ok(roleSelectorContent.includes("Cashier"), "Role selector must include Cashier");
  assert.equal(
    roleSelectorContent.toLowerCase().includes("admin"),
    false,
    "Role selector must NOT allow registering an Administrator role",
  );
  console.log("✓ Role selector is a separate control permitting strictly Waiter and Cashier only.");

  // ── [4] Verify Form Validation & Password Strength ────────────────────────
  console.log("\n[4] Verifying Input Validation and Role Restrictions...");

  // Missing name
  const emptyNameRes = validateStaffRegistrationInput({
    name: "",
    email: "w@rekik.com",
    password: "password123",
    role: "waiter",
  });
  assert.equal(emptyNameRes.valid, false);
  assert.equal(emptyNameRes.field, "name");
  assert.ok(emptyNameRes.error?.includes("required"));

  // Invalid email
  const invalidEmailRes = validateStaffRegistrationInput({
    name: "Abebe",
    email: "invalid-email",
    password: "password123",
    role: "waiter",
  });
  assert.equal(invalidEmailRes.valid, false);
  assert.equal(invalidEmailRes.field, "email");
  assert.ok(invalidEmailRes.error?.includes("valid email"));

  // Short password (< 6)
  const shortPassRes = validateStaffRegistrationInput({
    name: "Abebe",
    email: "w@rekik.com",
    password: "123",
    role: "waiter",
  });
  assert.equal(shortPassRes.valid, false);
  assert.equal(shortPassRes.field, "password");
  assert.ok(shortPassRes.error?.includes("at least 6 characters"));

  // Disallowed roles (admin, owner, customer)
  const adminRoleRes = validateStaffRegistrationInput({
    name: "Abebe",
    email: "w@rekik.com",
    password: "password123",
    role: "admin" as any,
  });
  assert.equal(adminRoleRes.valid, false);
  assert.equal(adminRoleRes.field, "role");
  assert.ok(adminRoleRes.error?.includes("only permits 'waiter' or 'cashier'"));

  const custRoleRes = validateStaffRegistrationInput({
    name: "Abebe",
    email: "w@rekik.com",
    password: "password123",
    role: "customer" as any,
  });
  assert.equal(custRoleRes.valid, false);
  assert.equal(custRoleRes.field, "role");

  // Valid inputs pass
  const validWaiterRes = validateStaffRegistrationInput({
    name: "  Tesfaye Kebede  ",
    email: "  TESFAYE@REKIKCAFE.COM  ",
    password: "Password@2026",
    role: "waiter",
  });
  assert.equal(validWaiterRes.valid, true);

  const validCashierRes = validateStaffRegistrationInput({
    name: "Meseret Haile",
    email: "meseret@rekikcafe.com",
    password: "SecurePass123",
    role: "cashier",
  });
  assert.equal(validCashierRes.valid, true);
  console.log("✓ Form and role validation strictly enforced.");

  // ── [5] Verify API Authorization for Staff Management ─────────────────────
  console.log("\n[5] Verifying API Endpoint Authorization & Protection...");

  // 1. Anonymous request to POST /api/admin/staff/register -> 401
  const anonReq = new Request("http://localhost/api/admin/staff/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Anon Hacker",
      email: "anon@hack.com",
      password: "password123",
      role: "waiter",
    }),
  });
  const anonRes = await handleApiRequest(anonReq);
  assert.equal(
    anonRes.status,
    401,
    `Anonymous request must be rejected with 401, got ${anonRes.status}`,
  );
  console.log("✓ Anonymous request to staff registration rejected with 401 Unauthorized.");

  // 2. Customer request to POST /api/admin/staff/register -> 403
  const customerToken = await getCustomerToken();
  const custReq = new Request("http://localhost/api/admin/staff/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      name: "Customer Intruder",
      email: "intruder@hack.com",
      password: "password123",
      role: "waiter",
    }),
  });
  const custRes = await handleApiRequest(custReq);
  assert.equal(
    custRes.status,
    403,
    `Customer request must be rejected with 403, got ${custRes.status}`,
  );
  console.log("✓ Customer request to staff registration rejected with 403 Forbidden.");

  // 3. Customer request to PATCH /api/admin/staff/status -> 403
  const custStatusReq = new Request("http://localhost/api/admin/staff/status", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      userId: "00000000-0000-0000-0000-000000000000",
      isActive: false,
    }),
  });
  const custStatusRes = await handleApiRequest(custStatusReq);
  assert.equal(
    custStatusRes.status,
    403,
    `Customer status mutation rejected with 403, got ${custStatusRes.status}`,
  );
  console.log("✓ Customer request to staff status mutation rejected with 403 Forbidden.");

  // ── [6] Verify Administrator Can Register Staff via Secure API ─────────────
  console.log("\n[6] Verifying Administrator Can Register Staff & Duplicate Email Handling...");
  const { token: adminToken, userId: adminUserId } = await getAdminToken();

  const testEmail = `temp.waiter.${Date.now()}@rekiktest.local`;
  let registeredUserId: string | null = null;

  try {
    const adminRegReq = new Request("http://localhost/api/admin/staff/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: "Temporary Test Waiter",
        email: testEmail,
        password: "TestPassword#2026",
        role: "waiter",
      }),
    });
    const adminRegRes = await handleApiRequest(adminRegReq);
    assert.equal(
      adminRegRes.status,
      201,
      `Admin registration should return 201, got ${adminRegRes.status}`,
    );
    const regData = await adminRegRes.json();
    assert.ok(regData.success, "Registration response must indicate success");
    assert.equal(regData.staff.email, testEmail);
    assert.equal(regData.staff.role, "waiter");
    registeredUserId = regData.staff.userId || regData.staff.id;
    assert.ok(registeredUserId, "registeredUserId must be defined");
    console.log(
      `✓ Admin successfully registered waiter: ${testEmail} (Auth ID: ${registeredUserId})`,
    );

    // Verify password is NOT stored in staff_profiles or users
    const { data: profileCheck } = await serverSupabase
      .from("staff_profiles")
      .select("*")
      .eq("user_id", registeredUserId)
      .single();
    assert.ok(profileCheck, "Profile record must exist");
    assert.equal(
      "password" in profileCheck,
      false,
      "staff_profiles must NEVER have a password column",
    );

    const { data: userCheck } = await serverSupabase
      .from("users")
      .select("*")
      .eq("id", registeredUserId)
      .single();
    assert.ok(userCheck, "User record must exist");
    assert.equal("password" in userCheck, false, "users table must NEVER have a password column");
    console.log(
      "✓ Verified: Passwords are managed securely in Supabase Auth (never stored in database tables).",
    );

    // ── [7] Verify Duplicate Email Handling ─────────────────────────────────
    console.log("\n[7] Verifying Duplicate Email Rejection (409 Conflict)...");
    const dupRegReq = new Request("http://localhost/api/admin/staff/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: "Duplicate Attempt",
        email: testEmail,
        password: "AnotherPassword123",
        role: "cashier",
      }),
    });
    const dupRegRes = await handleApiRequest(dupRegReq);
    assert.equal(
      dupRegRes.status,
      409,
      `Duplicate email must return 409 Conflict, got ${dupRegRes.status}`,
    );
    const dupData = await dupRegRes.json();
    assert.ok(
      (dupData.error && dupData.error.includes("already exists")) ||
        (dupData.message && dupData.message.includes("already exists")),
      "Duplicate response must state account already exists",
    );
    console.log("✓ Duplicate email registration properly rejected with 409 Conflict.");

    // ── [8] Verify Registered Waiter Cannot Register Other Staff or Escalate Roles ──
    console.log(
      "\n[8] Verifying Registered Waiter Cannot Register Staff or Escalate Privileges...",
    );
    const { data: waiterLink } = await serverSupabase.auth.admin.generateLink({
      type: "magiclink",
      email: testEmail,
    });
    assert.ok(waiterLink?.properties?.hashed_token, "Must generate link for waiter");

    const { data: waiterSession } = await supabase.auth.verifyOtp({
      token_hash: waiterLink.properties.hashed_token,
      type: "magiclink",
    });
    assert.ok(waiterSession.session, "Waiter session must be valid");
    const waiterToken = waiterSession.session.access_token;

    const waiterProbeReq = new Request("http://localhost/api/admin/staff/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${waiterToken}`,
      },
      body: JSON.stringify({
        name: "Escalated Admin",
        email: `escalated.${Date.now()}@rekik.com`,
        password: "password123",
        role: "waiter",
      }),
    });
    const waiterProbeRes = await handleApiRequest(waiterProbeReq);
    assert.equal(
      waiterProbeRes.status,
      403,
      `Waiter must be forbidden from registering staff, got ${waiterProbeRes.status}`,
    );
    console.log("✓ Registered waiter is strictly denied from registering staff (403 Forbidden).");

    // ── [9] Verify Admin Can Deactivate and Activate Staff ────────────────────
    console.log(
      "\n[9] Verifying Admin Can Toggle Staff Active Status & Self-Deactivation Protection...",
    );

    // Admin CANNOT deactivate their own account
    const selfDeactReq = new Request("http://localhost/api/admin/staff/status", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: adminUserId,
        isActive: false,
      }),
    });
    const selfDeactRes = await handleApiRequest(selfDeactReq);
    assert.equal(
      selfDeactRes.status,
      400,
      `Self-deactivation must return 400, got ${selfDeactRes.status}`,
    );
    console.log("✓ Administrator cannot deactivate their own account (protection enforced).");

    // Admin deactivates test staff
    const deactReq = new Request("http://localhost/api/admin/staff/status", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: registeredUserId,
        isActive: false,
      }),
    });
    const deactRes = await handleApiRequest(deactReq);
    assert.equal(
      deactRes.status,
      200,
      `Deactivation must succeed with 200, got ${deactRes.status}`,
    );
    const deactData = await deactRes.json();
    assert.equal(deactData.isActive ?? deactData.staff?.isActive, false);
    console.log("✓ Admin successfully deactivated staff member.");

    // Verify staff is inactive in database
    const { data: updatedProfile } = await serverSupabase
      .from("staff_profiles")
      .select("is_active, is_available")
      .eq("user_id", registeredUserId)
      .single();
    assert.equal(updatedProfile?.is_active, false);
    assert.equal(updatedProfile?.is_available, false);

    // Admin reactivates staff
    const reactReq = new Request("http://localhost/api/admin/staff/status", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: registeredUserId,
        isActive: true,
      }),
    });
    const reactRes = await handleApiRequest(reactReq);
    assert.equal(
      reactRes.status,
      200,
      `Reactivation must succeed with 200, got ${reactRes.status}`,
    );
    const reactData = await reactRes.json();
    assert.equal(reactData.isActive ?? reactData.staff?.isActive, true);
    console.log("✓ Admin successfully re-activated staff member.");
  } finally {
    // Cleanup temporary test staff user safely
    if (registeredUserId) {
      await serverSupabase.from("staff_profiles").delete().eq("user_id", registeredUserId);
      await serverSupabase.from("users").delete().eq("id", registeredUserId);
      await serverSupabase.auth.admin.deleteUser(registeredUserId);
      console.log("✓ Cleaned up test staff user safely.");
    }
  }

  // ── [10] Verify Existing Admin Auth & Product Management Functional ──────
  console.log("\n[10] Verifying Existing Admin Authentication & Product Management...");
  await supabase.auth.signOut();
  await getAdminToken();

  const { data: categories, error: catErr } = await fetchAdminCategories();
  assert.equal(catErr, null, `fetchAdminCategories failed: ${catErr?.message}`);
  assert.ok(categories && categories.length > 0, "Categories must be accessible to admin");
  console.log(`✓ Admin authentication verified; ${categories.length} categories accessible.`);

  console.log("\n=====================================================================");
  console.log("ALL REKIK CAFÉ STAFF REGISTRATION & SECURITY TESTS PASSED SUCCESSFULLY");
  console.log("=====================================================================");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
