/**
 * ============================================================================
 * Rekik Café — Admin Account & Settings Dashboards Verification Suite
 * File: tests/account_and_settings_dashboard.test.ts
 * ============================================================================
 * Strictly verifies end-to-end data loading, persistence, and security:
 * 1. Admin Account: Load real profile from Supabase (GET /api/admin/account)
 * 2. Admin Account: Update profile details & persist (PATCH /api/admin/account)
 * 3. Admin Account: Prevent privilege escalation (cannot tamper with role or email)
 * 4. Admin Account: Avatar upload and removal (POST & DELETE /api/admin/account/avatar)
 * 5. Admin Account: Reject unauthenticated (401) and customer (403) callers
 * 6. Store Settings: Load singleton settings handling UUID (GET /api/settings, no 22P02 error)
 * 7. Store Settings: Update and persist store delivery and contact settings (PUT /api/settings)
 * 8. Store Settings: Validation of negative fees, invalid coordinates, and invalid rounding rules
 * 9. Store Settings: Reject unauthorized updates (401 / 403) while allowing public read
 * 10. Receiving Accounts Protection: payment_account_settings remains functional and protected
 * ============================================================================
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import { getSettings, updateSettings } from "../src/server/db";

console.log("=======================================================================");
console.log("RUNNING REKIK CAFÉ ADMIN ACCOUNT & SETTINGS VERIFICATION SUITE");
console.log("=======================================================================");

const ADMIN_EMAIL = "kbstar77sisay@gmail.com";
const CUSTOMER_EMAIL = "alemu00@gmail.com";

async function getAuthToken(email: string): Promise<{ token: string; userId: string }> {
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

async function runVerification() {
  console.log("\n[1] Authenticating test administrative session...");
  const adminAuth = await getAuthToken(ADMIN_EMAIL);
  console.log(`✓ Admin authenticated successfully: ${ADMIN_EMAIL} (ID: ${adminAuth.userId})`);

  // --------------------------------------------------------------------------
  // TEST 1: Load Admin Account Details
  // --------------------------------------------------------------------------
  console.log("\n[2] Testing GET /api/admin/account (Account Data Loading)...");
  const accountReq = new Request("http://localhost:8080/api/admin/account", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  const accountRes = await handleApiRequest(accountReq);
  assert.equal(accountRes.status, 200, "GET /api/admin/account must return 200 OK");
  const accountData = await accountRes.json();

  assert.ok(accountData.data, "Response must include account profile object");
  assert.equal(accountData.data.id, adminAuth.userId, "Profile ID must match authenticated user");
  assert.equal(accountData.data.email, ADMIN_EMAIL, "Profile email must match admin");
  assert.equal(accountData.data.role, "ADMIN", "Profile role must be ADMIN");
  assert.ok(accountData.data.accountCreatedAt, "accountCreatedAt timestamp must be present");
  console.log(
    `✓ Admin account successfully loaded: ${accountData.data.fullName} (${accountData.data.role})`,
  );

  // --------------------------------------------------------------------------
  // TEST 2: Update Admin Account Profile & Persist
  // --------------------------------------------------------------------------
  console.log("\n[3] Testing PATCH /api/admin/account (Profile Updates & Persistence)...");
  const updatedName = "Admin Sisay Verified";
  const updatedPhone = "+251911223344";

  const patchReq = new Request("http://localhost:8080/api/admin/account", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      fullName: updatedName,
      phone: updatedPhone,
    }),
  });
  const patchRes = await handleApiRequest(patchReq);
  assert.equal(patchRes.status, 200, "PATCH /api/admin/account must return 200 OK");
  const patchData = await patchRes.json();
  assert.equal(patchData.success, true, "PATCH response must be successful");

  // Verify persistence on subsequent read
  const verifyAccountReq = new Request("http://localhost:8080/api/admin/account", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  const verifyAccountRes = await handleApiRequest(verifyAccountReq);
  const verifyAccountData = await verifyAccountRes.json();
  assert.equal(
    verifyAccountData.data.fullName,
    updatedName,
    "Persisted full name must match after reload",
  );
  assert.equal(
    verifyAccountData.data.phone,
    updatedPhone,
    "Persisted phone must match after reload",
  );
  console.log("✓ Profile update saved and verified on subsequent GET request.");

  // --------------------------------------------------------------------------
  // TEST 3: Privilege Escalation Prevention on Account Endpoint
  // --------------------------------------------------------------------------
  console.log("\n[4] Testing Privilege Escalation Prevention (Role & Email Tampering)...");
  const tamperReq = new Request("http://localhost:8080/api/admin/account", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      role: "SUPER_ADMIN",
      email: "hacked@rekikcafe.com",
      id: "00000000-0000-0000-0000-000000000000",
    }),
  });
  const tamperRes = await handleApiRequest(tamperReq);
  assert.equal(tamperRes.status, 200, "Request completes but ignores privileged fields");

  // Verify role and email remain untampered
  const verifyTamperReq = new Request("http://localhost:8080/api/admin/account", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  const verifyTamperRes = await handleApiRequest(verifyTamperReq);
  const verifyTamperData = await verifyTamperRes.json();
  assert.equal(
    verifyTamperData.data.role,
    "ADMIN",
    "Role must NOT be modified via account endpoint",
  );
  assert.equal(
    verifyTamperData.data.email,
    ADMIN_EMAIL,
    "Email must NOT be modified via account endpoint",
  );
  assert.equal(
    verifyTamperData.data.id,
    adminAuth.userId,
    "ID must NOT be modified via account endpoint",
  );
  console.log("✓ Privilege escalation strictly prevented: role, email, and ID cannot be changed.");

  // --------------------------------------------------------------------------
  // TEST 4: Account Security & Authorization Rejection
  // --------------------------------------------------------------------------
  console.log("\n[5] Testing Account Security & Role-Based Rejection...");
  // Anonymous caller rejected
  const anonAccountReq = new Request("http://localhost:8080/api/admin/account", { method: "GET" });
  const anonAccountRes = await handleApiRequest(anonAccountReq);
  assert.equal(
    anonAccountRes.status,
    401,
    "Anonymous request to /api/admin/account must return 401",
  );

  // Customer caller rejected (403)
  const customerAuth = await getAuthToken(CUSTOMER_EMAIL);
  const custAccountReq = new Request("http://localhost:8080/api/admin/account", {
    method: "GET",
    headers: { Authorization: `Bearer ${customerAuth.token}` },
  });
  const custAccountRes = await handleApiRequest(custAccountReq);
  assert.equal(custAccountRes.status, 403, "Customer caller must return 403 Forbidden");

  const custPatchReq = new Request("http://localhost:8080/api/admin/account", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerAuth.token}`,
    },
    body: JSON.stringify({ fullName: "Malicious Customer" }),
  });
  const custPatchRes = await handleApiRequest(custPatchReq);
  assert.equal(
    custPatchRes.status,
    403,
    "Customer PATCH to admin account must return 403 Forbidden",
  );
  console.log("✓ Anonymous (401) and customer (403) callers strictly rejected.");

  // --------------------------------------------------------------------------
  // TEST 5: Avatar Upload and Removal
  // --------------------------------------------------------------------------
  console.log("\n[6] Testing Avatar Upload and Removal (/api/admin/account/avatar)...");
  // 1x1 transparent PNG base64
  const testBase64 =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const uploadReq = new Request("http://localhost:8080/api/admin/account/avatar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      dataUrl: testBase64,
      fileName: "admin_avatar.png",
    }),
  });
  const uploadRes = await handleApiRequest(uploadReq);
  assert.equal(uploadRes.status, 200, "Avatar upload must return 200 OK");
  const uploadData = await uploadRes.json();
  assert.ok(uploadData.avatarUrl, "Response must include public avatarUrl");
  assert.ok(
    uploadData.avatarUrl.includes("avatars/"),
    "Avatar URL must point to avatars storage bucket",
  );
  console.log(`✓ Avatar uploaded successfully: ${uploadData.avatarUrl}`);

  // Delete Avatar
  const deleteReq = new Request("http://localhost:8080/api/admin/account/avatar", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      currentAvatarUrl: uploadData.avatarUrl,
    }),
  });
  const deleteRes = await handleApiRequest(deleteReq);
  assert.equal(deleteRes.status, 200, "Avatar deletion must return 200 OK");
  const deleteData = await deleteRes.json();
  assert.equal(deleteData.avatarUrl, null, "Avatar URL must be reset to null");
  console.log("✓ Avatar removed and reset to null.");

  // --------------------------------------------------------------------------
  // TEST 6: Store Settings Data Loading (Handling UUID singleton, no 22P02 error)
  // --------------------------------------------------------------------------
  console.log("\n[7] Testing Store Settings Data Loading (GET /api/settings)...");
  const settingsReq = new Request("http://localhost:8080/api/settings", { method: "GET" });
  const settingsRes = await handleApiRequest(settingsReq);
  assert.equal(settingsRes.status, 200, "GET /api/settings must return 200 OK");
  const settingsData = await settingsRes.json();
  assert.ok(settingsData.cafeName, "Store settings must return cafeName");
  assert.ok(typeof settingsData.pricePerKm === "number", "pricePerKm must be a number");
  assert.ok(typeof settingsData.minDeliveryFee === "number", "minDeliveryFee must be a number");
  assert.ok(
    typeof settingsData.maxDeliveryDistanceKm === "number",
    "maxDeliveryDistanceKm must be a number",
  );
  assert.ok(typeof settingsData.roundingRule === "string", "roundingRule must be a string");
  console.log(
    `✓ Store settings loaded successfully: ${settingsData.cafeName} (Price/km: ${settingsData.pricePerKm})`,
  );

  // Also test direct server db function getSettings()
  const dbSettings = await getSettings();
  assert.ok(dbSettings, "getSettings() must return valid settings");
  assert.ok(dbSettings.cafeName, "dbSettings must have cafeName");
  console.log(
    "✓ server db getSettings() dynamically fetched singleton record without 22P02 error.",
  );

  // --------------------------------------------------------------------------
  // TEST 7: Store Settings Update and Persistence (PUT /api/settings)
  // --------------------------------------------------------------------------
  console.log("\n[8] Testing Store Settings Update & Persistence (PUT /api/settings)...");
  const updatedCafeName = "Rekik Café & Roastery";
  const updatedStorePhone = "+251 91 123 4567";
  const updatedPricePerKm = 25.0;
  const updatedMinFee = 60.0;
  const updatedMaxDistance = 20.0;
  const updatedRounding = "nearest_5";
  const updatedLat = 9.012345;
  const updatedLng = 38.754321;

  const putReq = new Request("http://localhost:8080/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      cafeName: updatedCafeName,
      phone: updatedStorePhone,
      pricePerKm: updatedPricePerKm,
      minDeliveryFee: updatedMinFee,
      maxDeliveryDistanceKm: updatedMaxDistance,
      roundingRule: updatedRounding,
      cafeLatitude: updatedLat,
      cafeLongitude: updatedLng,
      deliveryEnabled: true,
    }),
  });
  const putRes = await handleApiRequest(putReq);
  assert.equal(putRes.status, 200, "PUT /api/settings must return 200 OK");
  const putData = await putRes.json();
  assert.equal(putData.cafeName, updatedCafeName, "Updated cafe name must match");
  assert.equal(putData.pricePerKm, updatedPricePerKm, "Updated pricePerKm must match");
  assert.equal(putData.minDeliveryFee, updatedMinFee, "Updated minDeliveryFee must match");

  // Verify persistence on subsequent GET
  const verifySettingsReq = new Request("http://localhost:8080/api/settings", { method: "GET" });
  const verifySettingsRes = await handleApiRequest(verifySettingsReq);
  const verifySettingsData = await verifySettingsRes.json();
  assert.equal(verifySettingsData.cafeName, updatedCafeName, "Persisted cafe name must match");
  assert.equal(verifySettingsData.pricePerKm, updatedPricePerKm, "Persisted pricePerKm must match");
  assert.equal(
    verifySettingsData.minDeliveryFee,
    updatedMinFee,
    "Persisted minDeliveryFee must match",
  );
  console.log("✓ Store settings updated and verified on subsequent GET request.");

  // --------------------------------------------------------------------------
  // TEST 8: Store Settings Validation
  // --------------------------------------------------------------------------
  console.log("\n[9] Testing Store Settings Input Validation...");
  // Negative pricePerKm
  const negPriceReq = new Request("http://localhost:8080/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({ pricePerKm: -10 }),
  });
  const negPriceRes = await handleApiRequest(negPriceReq);
  assert.equal(negPriceRes.status, 400, "Negative pricePerKm must return 400 Bad Request");

  // Negative minDeliveryFee
  const negFeeReq = new Request("http://localhost:8080/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({ minDeliveryFee: -5 }),
  });
  const negFeeRes = await handleApiRequest(negFeeReq);
  assert.equal(negFeeRes.status, 400, "Negative minDeliveryFee must return 400 Bad Request");

  // Invalid roundingRule
  const invalidRuleReq = new Request("http://localhost:8080/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({ roundingRule: "invalid_rule" }),
  });
  const invalidRuleRes = await handleApiRequest(invalidRuleReq);
  assert.equal(invalidRuleRes.status, 400, "Invalid roundingRule must return 400 Bad Request");

  // Invalid latitude (> 90)
  const invalidLatReq = new Request("http://localhost:8080/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({ cafeLatitude: 105.0 }),
  });
  const invalidLatRes = await handleApiRequest(invalidLatReq);
  assert.equal(invalidLatRes.status, 400, "Invalid latitude (> 90) must return 400 Bad Request");
  console.log(
    "✓ Input validation strictly enforced (rejected negative values, invalid rules, and out-of-range coordinates).",
  );

  // --------------------------------------------------------------------------
  // TEST 9: Settings Security & Role-Based Rejection
  // --------------------------------------------------------------------------
  console.log("\n[10] Testing Settings Authorization (PUT /api/settings)...");
  // Anonymous update rejected
  const anonPutReq = new Request("http://localhost:8080/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cafeName: "Hacked Café" }),
  });
  const anonPutRes = await handleApiRequest(anonPutReq);
  assert.equal(anonPutRes.status, 401, "Anonymous update must return 401 Unauthorized");

  // Customer update rejected
  const custPutReq = new Request("http://localhost:8080/api/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerAuth.token}`,
    },
    body: JSON.stringify({ cafeName: "Customer Café" }),
  });
  const custPutRes = await handleApiRequest(custPutReq);
  assert.equal(custPutRes.status, 403, "Customer update must return 403 Forbidden");
  console.log("✓ Settings mutation strictly restricted to authorized administrators.");

  // --------------------------------------------------------------------------
  // TEST 10: Protection of Payment Accounts (payment_account_settings)
  // --------------------------------------------------------------------------
  console.log("\n[11] Verifying Receiving Accounts & Payment Settings Protection...");
  const pubPayReq = new Request("http://localhost:8080/api/payment-accounts", { method: "GET" });
  const pubPayRes = await handleApiRequest(pubPayReq);
  assert.equal(pubPayRes.status, 200, "GET /api/payment-accounts must return 200 OK");
  const pubPayData = await pubPayRes.json();
  assert.ok(
    Array.isArray(pubPayData) && pubPayData.length >= 1,
    "Active receiving accounts must be present",
  );
  console.log(
    `✓ Receiving accounts protected and intact: ${pubPayData.length} active account(s) available.`,
  );

  console.log("\n=======================================================================");
  console.log("ALL ADMIN ACCOUNT & SETTINGS DASHBOARD TESTS PASSED SUCCESSFULLY! ✓");
  console.log("=======================================================================");
}

runVerification().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
