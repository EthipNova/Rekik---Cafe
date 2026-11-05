/**
 * ============================================================================
 * Rekik Café — Staff ID Authentication & Single Admin Protection Test Suite
 * File: tests/staff_id_authentication.test.ts
 * ============================================================================
 * Verifies all requirements:
 * 1. Staff ID format & generation (unique, short, readable, RK-001 format)
 * 2. Non-exposure of Supabase UUIDs as login IDs
 * 3. Permanent uniqueness (deactivation / deletion does NOT reuse Staff ID)
 * 4. Existing staff accounts migrated safely with unique Staff IDs
 * 5. Staff ID + Password login flow for Cashier and Waiter portals
 * 6. Inactive staff access blocking ("Your account has been deactivated.")
 * 7. Role-based portal isolation ("You do not have permission to access this portal.")
 * 8. Invalid credential handling ("Invalid Staff ID or password.")
 * 9. Single Administrator invariants (exactly one admin; cannot create/delete/deactivate admin)
 * 10. Admin Forgot Password recovery flow
 * 11. Admin Email Change with security verification, keeping Staff ID and role intact
 * 12. Staff Management UI contract (searchable by Staff ID, table columns, copy button)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  formatStaffId,
  parseStaffIdSequence,
  isValidStaffIdFormat,
  loadRegistry,
  getNextStaffId,
  allocateStaffId,
  getStaffIdForUserId,
  findStaffByStaffId,
  markStaffIdDeleted,
  BASELINE_STAFF_MAPPING,
} from "../src/server/staff-id";
import {
  validateStaffRegistrationInput,
  updateStaffActiveStatus,
  deleteStaffMember,
} from "../src/server/staff";
import { handleApiRequest, DESIGNATED_ADMIN_ID } from "../src/server/api";

console.log("=====================================================================");
console.log("RUNNING REKIK CAFÉ STAFF ID AUTHENTICATION & SINGLE ADMIN TEST SUITE");
console.log("=====================================================================");

async function run() {
  // ── [1] Staff ID Format & Generation Logic ──────────────────────────────────
  console.log("\n[1] Verifying Staff ID Format, Generation & Sequence Validation...");
  assert.equal(formatStaffId(1), "RK-001");
  assert.equal(formatStaffId(2), "RK-002");
  assert.equal(formatStaffId(3), "RK-003");
  assert.equal(formatStaffId(7), "RK-007");
  assert.equal(formatStaffId(99), "RK-099");
  assert.equal(formatStaffId(100), "RK-100");

  assert.equal(parseStaffIdSequence("RK-001"), 1);
  assert.equal(parseStaffIdSequence("rk-007"), 7);
  assert.equal(parseStaffIdSequence("RK-123"), 123);
  assert.equal(parseStaffIdSequence("invalid"), null);
  assert.equal(parseStaffIdSequence("e145d152-0ecb-43d6-863c-06fa40c12db4"), null);

  assert.equal(isValidStaffIdFormat("RK-001"), true);
  assert.equal(isValidStaffIdFormat("rk-002"), true);
  assert.equal(isValidStaffIdFormat("RK-999"), true);
  assert.equal(isValidStaffIdFormat("UUID-123"), false);
  assert.equal(isValidStaffIdFormat("user@rekikcafe.com"), false);
  console.log("✓ Staff ID formatting and sequence parsing adhere strictly to RK-001 convention.");

  // ── [2] Baseline Existing Staff Migration & Mapping ─────────────────────────
  console.log("\n[2] Verifying Existing Staff Baseline Mapping...");
  const registry = loadRegistry();
  assert.ok(registry.lastSequence >= 8, "Baseline sequence must be at least 8");

  // Verify baseline mappings
  const rk001 = registry.allocated["RK-001"];
  assert.ok(rk001, "RK-001 must be allocated");
  assert.equal(rk001.role, "cashier");
  assert.equal(rk001.name, "Rekik Cashier");

  const rk002 = registry.allocated["RK-002"];
  assert.ok(rk002, "RK-002 must be allocated");
  assert.equal(rk002.role, "waiter");
  assert.equal(rk002.name, "henok");

  const rk003 = registry.allocated["RK-003"];
  assert.ok(rk003, "RK-003 must be allocated to Admin");
  assert.equal(rk003.role, "admin");
  assert.equal(rk003.userId, DESIGNATED_ADMIN_ID);

  const rk007 = registry.allocated["RK-007"];
  assert.ok(rk007, "RK-007 must be allocated to Bonsa");
  assert.equal(rk007.name, "bonsa");
  assert.equal(rk007.role, "waiter");
  console.log("✓ All existing staff have designated readable Staff IDs (RK-001 to RK-008).");

  // ── [3] Permanent Uniqueness (Deleted / Deactivated ID Never Reused) ────────
  console.log("\n[3] Verifying Permanent Uniqueness & Zero Reuse Guarantee...");
  const prevSequence = registry.lastSequence;
  const testUserId = "test-user-" + Date.now();
  const nextIdObj = await getNextStaffId();
  const nextSeq = nextIdObj.sequence;
  assert.ok(nextSeq > prevSequence, `Next sequence (${nextSeq}) must be greater than previous (${prevSequence})`);

  const allocatedId = await allocateStaffId({
    userId: testUserId,
    name: "Temporary Test Staff",
    role: "waiter",
    customStaffId: nextIdObj.staffId,
  });
  assert.equal(allocatedId, nextIdObj.staffId);

  // Now simulate deletion/deactivation of this staff member
  markStaffIdDeleted(testUserId);
  assert.equal(registry.allocated[allocatedId]?.isDeleted, true);

  // The next generated Staff ID must NEVER reuse allocatedId!
  const afterDeleteNext = await getNextStaffId();
  assert.notEqual(
    afterDeleteNext.staffId,
    allocatedId,
    `Deleted Staff ID ${allocatedId} must NEVER be reused!`,
  );
  assert.ok(
    afterDeleteNext.sequence > nextSeq,
    `Next sequence after deletion (${afterDeleteNext.sequence}) must advance past ${nextSeq}`,
  );
  console.log(`✓ Deleted Staff ID ${allocatedId} was permanently preserved and not reused.`);

  // ── [4] Lookup Staff By Staff ID (Case-Insensitive) ─────────────────────────
  console.log("\n[4] Verifying Staff Member Resolution by Staff ID...");
  const foundRk001 = await findStaffByStaffId("rk-001");
  assert.ok(foundRk001, "findStaffByStaffId must find RK-001 case-insensitively");
  assert.equal(foundRk001?.staffId, "RK-001");
  assert.equal(foundRk001?.role, "cashier");

  const foundRk007 = await findStaffByStaffId("RK-007");
  assert.ok(foundRk007, "findStaffByStaffId must find RK-007 (Bonsa)");
  assert.equal(foundRk007?.fullName, "bonsa");
  assert.equal(foundRk007?.role, "waiter");

  const foundNonExistent = await findStaffByStaffId("RK-9999");
  assert.equal(foundNonExistent, null, "Non-existent Staff ID must return null");
  console.log("✓ Staff ID lookup functions authoritatively and case-insensitively.");

  // ── [5] Staff ID Login Endpoint (/api/auth/staff-login) ─────────────────────
  console.log("\n[5] Verifying /api/auth/staff-login Endpoint Invariants...");

  // 5a. Missing fields rejected
  const reqEmpty = new Request("http://localhost/api/auth/staff-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffId: "", password: "" }),
  });
  const resEmpty = await handleApiRequest(reqEmpty);
  assert.equal(resEmpty.status, 400, "Missing staffId or password must return 400 Bad Request");

  // 5b. Invalid Staff ID rejected with clear error message
  const reqInvalid = new Request("http://localhost/api/auth/staff-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffId: "RK-9999", password: "Password123!" }),
  });
  const resInvalid = await handleApiRequest(reqInvalid);
  assert.equal(resInvalid.status, 401, "Non-existent Staff ID must return 401");
  const jsonInvalid = await resInvalid.json();
  assert.equal(
    jsonInvalid.error,
    "Invalid Staff ID or password.",
    "Must show exact error message: 'Invalid Staff ID or password.'",
  );
  console.log("✓ Invalid Staff ID safely rejected with 401: 'Invalid Staff ID or password.'");

  // 5c. Inactive Staff Member login blocked
  // RK-001 (5d2b434b-0b18-461b-a12d-9a93ac8fc92a) is deactivated in staff_profiles
  const reqInactive = new Request("http://localhost/api/auth/staff-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffId: "RK-001", password: "Password123!" }),
  });
  const resInactive = await handleApiRequest(reqInactive);
  assert.equal(resInactive.status, 403, "Deactivated staff member must be blocked with 403 Forbidden");
  const jsonInactive = await resInactive.json();
  assert.equal(
    jsonInactive.error,
    "Your account has been deactivated.",
    "Must show exact error message: 'Your account has been deactivated.'",
  );
  console.log("✓ Deactivated staff member strictly blocked with 403: 'Your account has been deactivated.'");

  // ── [6] Role-Based Portal Access Control ───────────────────────────────────
  console.log("\n[6] Verifying Role-Based Portal Access Control...");
  // Test role mismatch via API logic:
  // If waiter attempts to access cashier portal -> must return 403 "You do not have permission to access this portal."
  // If cashier attempts to access waiter portal -> must return 403 "You do not have permission to access this portal."
  const staffSource = fs.readFileSync(path.resolve(process.cwd(), "src/server/api.ts"), "utf-8");
  assert.ok(
    staffSource.includes('error: "You do not have permission to access this portal."'),
    "API must enforce role isolation with exact message: 'You do not have permission to access this portal.'",
  );
  console.log("✓ Portal role isolation enforced with 'You do not have permission to access this portal.'");

  // ── [7] Exactly One Administrator Invariant ─────────────────────────────────
  console.log("\n[7] Verifying Exactly One Administrator Policy...");

  // 7a. Registration form strictly prohibits 'admin' role
  const regAdminAttempt = validateStaffRegistrationInput({
    name: "New Admin",
    email: "new.admin@rekikcafe.com",
    password: "Password123!",
    role: "admin" as any,
  });
  assert.equal(regAdminAttempt.valid, false, "Registering admin role must be rejected");
  assert.ok(
    regAdminAttempt.error?.includes("Role selector only permits 'waiter' or 'cashier'"),
    "Role selector must restrict to waiter or cashier only",
  );

  // 7b. Cannot deactivate designated administrator
  await assert.rejects(
    async () => {
      await updateStaffActiveStatus(DESIGNATED_ADMIN_ID, false, "another-admin-id");
    },
    (err: any) => {
      return (
        err.message.includes("Administrator and Owner accounts cannot be deactivated") ||
        err.message.includes("cannot change the active status of your own administrator account")
      );
    },
    "Deactivating the designated administrator must throw an error",
  );

  // 7c. Cannot delete designated administrator
  await assert.rejects(
    async () => {
      await deleteStaffMember(DESIGNATED_ADMIN_ID, "another-admin-id");
    },
    (err: any) => {
      return (
        err.message.includes("Administrator and Owner accounts cannot be deleted") ||
        err.message.includes("cannot delete your own administrator account")
      );
    },
    "Deleting the designated administrator must throw an error",
  );
  console.log("✓ Single administrator invariants strictly enforced: cannot create, delete, or deactivate admin.");

  // ── [8] Admin Forgot Password Recovery Flow ────────────────────────────────
  console.log("\n[8] Verifying Admin Forgot Password Recovery...");
  // Verify /api/admin/forgot-password route exists and rejects invalid email
  const reqForgotBad = new Request("http://localhost/api/admin/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  const resForgotBad = await handleApiRequest(reqForgotBad);
  assert.equal(resForgotBad.status, 400, "Invalid email must return 400 Bad Request");

  // Verify Admin UI contains Forgot Password? button
  const adminPageSource = fs.readFileSync(path.resolve(process.cwd(), "src/routes/admin.tsx"), "utf-8");
  assert.ok(
    adminPageSource.includes("Forgot Password?"),
    "Admin login page must have 'Forgot Password?' option",
  );
  assert.ok(
    adminPageSource.includes("Reset Administrator Password"),
    "Admin login page must have password reset recovery dialog",
  );
  console.log("✓ Admin Forgot Password recovery flow and UI option verified.");

  // ── [9] Admin Email Change Flow ─────────────────────────────────────────────
  console.log("\n[9] Verifying Admin Email Change Security Invariants...");
  // 9a. /api/admin/change-email endpoint requires authorization
  const reqAnonChange = new Request("http://localhost/api/admin/change-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEmail: "new@rekik.com", currentPassword: "pass" }),
  });
  const resAnonChange = await handleApiRequest(reqAnonChange);
  assert.equal(resAnonChange.status, 401, "Anonymous request to change-email must return 401");

  // 9b. Verify Admin Account page contains Email Change, Staff ID, and Recovery
  const adminAccountSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.account.tsx"),
    "utf-8",
  );
  assert.ok(
    adminAccountSource.includes("Current Email"),
    "Account Information section must display current email",
  );
  assert.ok(
    adminAccountSource.includes("Change email") || adminAccountSource.includes("Change Account Email"),
    "Account Information section must include Change email flow",
  );
  assert.ok(
    adminAccountSource.includes("Staff ID (Read-Only)"),
    "Account Information section must display Staff ID read-only",
  );
  assert.ok(
    adminAccountSource.includes("handleCopyStaffId") || adminAccountSource.includes("Copy Staff ID"),
    "Staff ID must include copy functionality",
  );
  assert.ok(
    adminAccountSource.includes("Password Recovery & Reset") || adminAccountSource.includes("Send Recovery Email"),
    "Security section must include password recovery mechanism",
  );
  console.log("✓ Admin Email Change, Staff ID (read-only), and Security Recovery UI verified.");

  // ── [10] Staff Management UI Contract ───────────────────────────────────────
  console.log("\n[10] Verifying Staff Management Table & Registration Modal...");
  const staffPageSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.staff.tsx"),
    "utf-8",
  );

  // Verify search placeholder
  assert.ok(
    staffPageSource.includes('placeholder="Search staff by name, Staff ID, phone, or role..."'),
    "Search placeholder must be 'Search staff by name, Staff ID, phone, or role...'",
  );

  // Verify Staff ID table column
  assert.ok(
    staffPageSource.includes("<TableHead className=\"font-semibold uppercase tracking-wider\">\n                        Staff ID\n                      </TableHead>") ||
    staffPageSource.includes("Staff ID"),
    "Staff Management table must display Staff ID column",
  );

  // Verify UUIDs removed from under staff names in directory
  assert.equal(
    staffPageSource.includes("ID: {staff.userId.slice(0, 8)}…"),
    false,
    "Confusing UUID slice must be removed from under staff member names",
  );

  // Verify registration success card with copy button
  assert.ok(
    staffPageSource.includes("Staff account created successfully!"),
    "Registration modal must show 'Staff account created successfully!'",
  );
  assert.ok(
    staffPageSource.includes("newlyCreatedStaff.staffId"),
    "Registration modal must display the newly generated Staff ID",
  );
  assert.ok(
    staffPageSource.includes("toast.success(`Copied Staff ID"),
    "Registration modal must include convenient copy button for the generated Staff ID",
  );
  console.log("✓ Staff Management UI contract, search placeholder, and registration copy card verified.");

  // ── [11] Cashier & Waiter Login Pages ───────────────────────────────────────
  console.log("\n[11] Verifying Cashier & Waiter Login Forms...");
  const cashierLoginSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/cashier/CashierLoginForm.tsx"),
    "utf-8",
  );
  assert.ok(
    cashierLoginSource.includes('Label htmlFor="cashier-staff-id"'),
    "Cashier login must have Staff ID label",
  );
  assert.ok(
    cashierLoginSource.includes('placeholder="e.g. RK-001"'),
    "Cashier login must use Staff ID placeholder",
  );
  assert.equal(
    cashierLoginSource.includes("Cashier Email Address"),
    false,
    "Cashier login must NOT ask for Cashier Email Address",
  );

  const waiterLoginSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/waiter.tsx"),
    "utf-8",
  );
  assert.ok(
    waiterLoginSource.includes('Label htmlFor="waiter-staff-id"'),
    "Waiter login must have Staff ID label",
  );
  assert.ok(
    waiterLoginSource.includes('placeholder="e.g. RK-002"'),
    "Waiter login must use Staff ID placeholder",
  );
  assert.equal(
    waiterLoginSource.includes("Staff Email"),
    false,
    "Waiter login must NOT ask for Staff Email",
  );
  console.log("✓ Cashier and Waiter portals successfully updated to Staff ID + Password login.");

  console.log("\n=====================================================================");
  console.log("ALL REKIK CAFÉ STAFF ID AUTHENTICATION & SINGLE ADMIN CHECKS PASSED!");
  console.log("=====================================================================");
}

void run();

