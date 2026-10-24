import assert from "node:assert/strict";
import { serverSupabase } from "../src/server/supabase";
import { supabase } from "../src/lib/supabase";

const LIVE_BASE_URL = "http://localhost:8080";
const ADMIN_EMAIL = "kbstar77sisay@gmail.com";
const CUSTOMER_EMAIL = "alemu00@gmail.com";

async function main() {
  console.log("=================================================================");
  console.log("REKIK CAFÉ — LIVE BROWSER-TO-SERVER AUTHENTICATION & SAVE TEST");
  console.log("Targeting live server at:", LIVE_BASE_URL);
  console.log("=================================================================\n");

  // Step 1: Sign in as Admin via Supabase Auth
  console.log("[1] Authenticating administrator via Supabase Auth...");
  const { data: linkData, error: linkErr } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_EMAIL,
  });
  assert.equal(linkErr, null, `generateLink failed: ${linkErr?.message}`);

  const { data: sessionData, error: authErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  assert.equal(authErr, null, `verifyOtp failed: ${authErr?.message}`);
  assert.ok(sessionData.session, "Admin session must be present");

  const adminToken = sessionData.session.access_token;
  console.log(`✓ Admin session established for ${ADMIN_EMAIL} (Token length: ${adminToken.length})`);

  // Step 2: Test unauthenticated saves (Expect 401 Authentication Required)
  console.log("\n[2] Testing unauthenticated save requests (must return 401)...");
  const unauthAccountRes = await fetch(`${LIVE_BASE_URL}/api/admin/account`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Hacker" }),
  });
  assert.equal(unauthAccountRes.status, 401, "Unauthenticated account save must return 401");
  const unauthAccountBody = await unauthAccountRes.json();
  console.log(`✓ Unauthenticated Account save rejected: HTTP ${unauthAccountRes.status}`, unauthAccountBody);

  const unauthSettingsRes = await fetch(`${LIVE_BASE_URL}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cafeName: "Hacked Cafe" }),
  });
  assert.equal(unauthSettingsRes.status, 401, "Unauthenticated settings save must return 401");
  const unauthSettingsBody = await unauthSettingsRes.json();
  console.log(`✓ Unauthenticated Settings save rejected: HTTP ${unauthSettingsRes.status}`, unauthSettingsBody);

  // Step 3: Test customer save requests (Expect 403 Forbidden)
  console.log("\n[3] Testing customer authorization limits (must return 403)...");
  const { data: custLink } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: CUSTOMER_EMAIL,
  });
  const { data: custSession } = await supabase.auth.verifyOtp({
    token_hash: custLink!.properties.hashed_token,
    type: "magiclink",
  });
  const customerToken = custSession.session!.access_token;

  const custSettingsRes = await fetch(`${LIVE_BASE_URL}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({ cafeName: "Customer Cafe" }),
  });
  assert.equal(custSettingsRes.status, 403, "Customer settings save must return 403");
  console.log(`✓ Customer Settings save rejected: HTTP ${custSettingsRes.status}`);

  // Re-establish Admin session
  await supabase.auth.setSession({
    access_token: adminToken,
    refresh_token: sessionData.session.refresh_token,
  });

  // Step 4: Admin Account Save Operation
  console.log("\n[4] Testing live Admin Account save operation (PATCH /api/admin/account)...");
  const originalAccountRes = await fetch(`${LIVE_BASE_URL}/api/admin/account`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(originalAccountRes.status, 200);
  const originalAccount = (await originalAccountRes.json()).data;
  console.log(`Current profile: Name="${originalAccount.fullName}", Phone="${originalAccount.phone}"`);

  const testName = "Admin Sisay - Live Verified";
  const testPhone = "+251911998877";

  const saveAccountRes = await fetch(`${LIVE_BASE_URL}/api/admin/account`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fullName: testName,
      phone: testPhone,
    }),
  });
  assert.equal(saveAccountRes.status, 200, "Account save must return 200 OK");
  const saveAccountResult = await saveAccountRes.json();
  console.log("✓ Live Account save response:", saveAccountResult);

  // Step 5: Reload / Refresh Account from database
  console.log("\n[5] Simulating page refresh: re-fetching account profile...");
  const reloadAccountRes = await fetch(`${LIVE_BASE_URL}/api/admin/account`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(reloadAccountRes.status, 200);
  const reloadedAccount = (await reloadAccountRes.json()).data;
  assert.equal(reloadedAccount.fullName, testName, "Reloaded name must persist");
  assert.equal(reloadedAccount.phone, testPhone, "Reloaded phone must persist");
  console.log(`✓ Confirmed persistence after refresh: Name="${reloadedAccount.fullName}", Phone="${reloadedAccount.phone}"`);

  // Step 6: Admin Settings Save Operation
  console.log("\n[6] Testing live Admin Settings save operation (PUT /api/settings)...");
  const originalSettingsRes = await fetch(`${LIVE_BASE_URL}/api/settings`);
  assert.equal(originalSettingsRes.status, 200);
  const originalSettings = await originalSettingsRes.json();
  console.log(`Current settings: Name="${originalSettings.cafeName}", Price/km=${originalSettings.pricePerKm}`);

  const testCafeName = "Rekik Café Hawassa";
  const testPricePerKm = 22;
  const testMinDeliveryFee = 55;

  const saveSettingsRes = await fetch(`${LIVE_BASE_URL}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      ...originalSettings,
      cafeName: testCafeName,
      pricePerKm: testPricePerKm,
      minDeliveryFee: testMinDeliveryFee,
    }),
  });
  assert.equal(saveSettingsRes.status, 200, "Settings save must return 200 OK");
  const saveSettingsResult = await saveSettingsRes.json();
  console.log(`✓ Live Settings save succeeded: CafeName="${saveSettingsResult.cafeName}", Price/km=${saveSettingsResult.pricePerKm}`);

  // Step 7: Reload / Refresh Settings from database
  console.log("\n[7] Simulating page refresh: re-fetching settings from live server...");
  const reloadSettingsRes = await fetch(`${LIVE_BASE_URL}/api/settings`);
  assert.equal(reloadSettingsRes.status, 200);
  const reloadedSettings = await reloadSettingsRes.json();
  assert.equal(reloadedSettings.cafeName, testCafeName, "Reloaded cafeName must persist");
  assert.equal(reloadedSettings.pricePerKm, testPricePerKm, "Reloaded pricePerKm must persist");
  assert.equal(reloadedSettings.minDeliveryFee, testMinDeliveryFee, "Reloaded minDeliveryFee must persist");
  console.log(`✓ Confirmed persistence after refresh: CafeName="${reloadedSettings.cafeName}", Price/km=${reloadedSettings.pricePerKm}, MinFee=${reloadedSettings.minDeliveryFee}`);

  // Step 8: Avatar Upload & Removal Live Flow
  console.log("\n[8] Testing live Avatar Upload and Removal (/api/admin/account/avatar)...");
  const sample1x1Png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const uploadAvatarRes = await fetch(`${LIVE_BASE_URL}/api/admin/account/avatar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      dataUrl: sample1x1Png,
    }),
  });
  assert.equal(uploadAvatarRes.status, 200, "Avatar upload must return 200 OK");
  const uploadAvatarResult = await uploadAvatarRes.json();
  assert.ok(uploadAvatarResult.avatarUrl, "Must return uploaded avatarUrl");
  console.log("✓ Avatar uploaded live successfully:", uploadAvatarResult.avatarUrl);

  // Confirm avatar in account profile
  const profileWithAvatarRes = await fetch(`${LIVE_BASE_URL}/api/admin/account`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const profileWithAvatar = (await profileWithAvatarRes.json()).data;
  assert.equal(profileWithAvatar.avatarUrl, uploadAvatarResult.avatarUrl, "Avatar URL must persist in account");
  console.log("✓ Confirmed avatar persisted in account profile");

  // Remove avatar
  const deleteAvatarRes = await fetch(`${LIVE_BASE_URL}/api/admin/account/avatar`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      currentAvatarUrl: uploadAvatarResult.avatarUrl,
    }),
  });
  assert.equal(deleteAvatarRes.status, 200, "Avatar removal must return 200 OK");
  console.log("✓ Avatar removed live successfully");

  // Confirm avatar is null after removal
  const profileAfterDeleteRes = await fetch(`${LIVE_BASE_URL}/api/admin/account`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const profileAfterDelete = (await profileAfterDeleteRes.json()).data;
  assert.equal(profileAfterDelete.avatarUrl, null, "Avatar must be null after removal");
  console.log("✓ Confirmed avatar removed in database");

  // Step 9: Revert test profile and settings safely
  console.log("\n[9] Restoring original account and store settings safely...");
  await fetch(`${LIVE_BASE_URL}/api/admin/account`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fullName: originalAccount.fullName || "Admin Sisay",
      phone: originalAccount.phone || "+251911123456",
    }),
  });

  await fetch(`${LIVE_BASE_URL}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(originalSettings),
  });
  console.log("✓ Original values safely restored.");

  console.log("\n=================================================================");
  console.log("ALL LIVE BROWSER-TO-SERVER SAVE & AUTH TESTS PASSED 100%!");
  console.log("=================================================================");
}

main().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
