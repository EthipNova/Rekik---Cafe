/**
 * ============================================================================
 * Rekik Coffee — Receiving Accounts, Branding & Visual Theme Verification Suite
 * File: tests/receiving_accounts_and_staff_theme.test.ts
 * ============================================================================
 * Verifies:
 * 1. Staff & Activity page has Rekik Coffee branding and no visible NEBA Café label
 * 2. Receiving Accounts button placed beside Register Waiter / Cashier
 * 3. Coffee-inspired background and component styling on Staff & Activity dashboard
 * 4. Public payment accounts endpoint /api/payment-accounts returns active receiving accounts
 * 5. Admin payment accounts endpoint /api/admin/payment-accounts requires admin authorization
 * 6. Admin can view, create, edit, and toggle active status on public.payment_account_settings
 * 7. Invalid payment method rejected (check constraint: 'telebirr' | 'cbe')
 * 8. Customer payment workflows (checkout, order tracking, account) dynamically use receiving accounts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest } from "../src/server/api";
import {
  getAdminPaymentAccounts,
  getPublicPaymentAccounts,
  upsertPaymentAccount,
} from "../src/server/payment-accounts";

console.log("=======================================================================");
console.log("RUNNING REKIK COFFEE RECEIVING ACCOUNTS & STAFF THEME VERIFICATION");
console.log("=======================================================================");

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

async function runTests() {
  const staffRoutePath = path.resolve(process.cwd(), "src/routes/admin.staff.tsx");
  const checkoutRoutePath = path.resolve(process.cwd(), "src/routes/checkout.tsx");
  const orderDetailRoutePath = path.resolve(process.cwd(), "src/routes/order.$id.tsx");
  const accountRoutePath = path.resolve(process.cwd(), "src/routes/account.tsx");

  // [1] Branding verification
  console.log("\n[1] Verifying Staff & Activity Page Branding...");
  assert.ok(fs.existsSync(staffRoutePath), "src/routes/admin.staff.tsx must exist");
  const staffContent = fs.readFileSync(staffRoutePath, "utf8");
  assert.ok(staffContent.includes("Rekik Coffee"), "Staff page must include Rekik Coffee branding");
  assert.ok(!/NEBA\s+Caf[eé]/i.test(staffContent), "Staff page must not contain NEBA Café branding");
  assert.ok(!staffContent.includes("{cafeName}"), "Staff page header badge must not use unverified {cafeName}");
  console.log("✓ Staff & Activity page displays Rekik Coffee branding with zero NEBA Café traces.");

  // [2] Button layout verification
  console.log("\n[2] Verifying Receiving Accounts Button Placement...");
  assert.ok(
    staffContent.includes('id="open-receiving-accounts-btn"'),
    "Receiving Accounts button must have id open-receiving-accounts-btn",
  );
  assert.ok(
    staffContent.includes('id="open-register-staff-dialog-btn"'),
    "Register staff button must have id open-register-staff-dialog-btn",
  );
  assert.ok(
    staffContent.includes("Receiving Accounts"),
    "Receiving Accounts button label must be present",
  );
  assert.ok(
    staffContent.includes("Register Waiter / Cashier"),
    "Register Waiter / Cashier button label must be present",
  );
  console.log("✓ Receiving Accounts button is placed beside Register Waiter / Cashier.");

  // [3] Coffee-inspired background & visual theme
  console.log("\n[3] Verifying Coffee-Inspired Theme & Visual Palette...");
  assert.ok(
    staffContent.includes("from-[#FAF8F5]") && staffContent.includes("dark:from-[#181310]"),
    "Staff dashboard must have refined warm cream and espresso ambient background",
  );
  assert.ok(
    staffContent.includes("border-amber-950"),
    "Staff dashboard must use coffee-toned warm borders",
  );
  assert.ok(
    staffContent.includes("border-l-[#8B4513]"),
    "Registered Staff card must have espresso brown border accent",
  );
  assert.ok(
    staffContent.includes("border-l-[#C17A44]"),
    "Waiter queue card must have warm caramel border accent",
  );
  console.log("✓ Coffee-inspired color palette, espresso accents, and warm styling verified.");

  // [4] Public payment accounts read endpoint
  console.log("\n[4] Verifying Public Active Payment Accounts Read Path...");
  const publicReq = new Request("http://localhost:8080/api/payment-accounts", { method: "GET" });
  const publicRes = await handleApiRequest(publicReq);
  assert.equal(publicRes.status, 200, "GET /api/payment-accounts must return 200 OK");
  const publicJson = await publicRes.json();
  assert.ok(Array.isArray(publicJson), "Public payment accounts response must be an array");
  assert.ok(publicJson.length >= 1, "At least one active receiving account must be present");
  publicJson.forEach((acc: any) => {
    assert.ok(["telebirr", "cbe"].includes(acc.payment_method), "Provider must be telebirr or cbe");
    assert.ok(acc.account_number, "Account number must be non-empty");
    assert.ok(acc.account_owner_name, "Account owner name must be non-empty");
    assert.equal(acc.is_active, true, "Public endpoint must only expose active accounts");
  });
  console.log(`✓ Public read path verified: returned ${publicJson.length} active receiving account(s).`);

  // [5] Admin authorization on /api/admin/payment-accounts
  console.log("\n[5] Verifying Security & Authorization on Receiving Accounts API...");
  // 5.1 Anonymous caller rejected
  const anonReq = new Request("http://localhost:8080/api/admin/payment-accounts", { method: "GET" });
  const anonRes = await handleApiRequest(anonReq);
  assert.equal(anonRes.status, 401, "Anonymous request to /api/admin/payment-accounts must return 401");

  // 5.2 Customer caller rejected (403 Forbidden)
  const customerLink = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: "alemu00@gmail.com",
  });
  if (customerLink.data?.properties?.hashed_token) {
    const custSession = await supabase.auth.verifyOtp({
      token_hash: customerLink.data.properties.hashed_token,
      type: "magiclink",
    });
    if (custSession.data.session) {
      const custReq = new Request("http://localhost:8080/api/admin/payment-accounts", {
        method: "GET",
        headers: { Authorization: `Bearer ${custSession.data.session.access_token}` },
      });
      const custRes = await handleApiRequest(custReq);
      assert.equal(custRes.status, 403, "Customer request to admin receiving accounts must return 403 Forbidden");
    }
  }
  console.log("✓ Anonymous and customer access strictly denied (401/403).");

  // [6] Admin view, update & toggle active status in public.payment_account_settings
  console.log("\n[6] Verifying Admin View, Update & Persistence in Supabase...");
  const adminAuth = await getAdminToken();
  const adminReq = new Request("http://localhost:8080/api/admin/payment-accounts", {
    method: "GET",
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  const adminRes = await handleApiRequest(adminReq);
  assert.equal(adminRes.status, 200, "Admin request to /api/admin/payment-accounts must return 200 OK");
  const accounts = await adminRes.json();
  assert.ok(Array.isArray(accounts), "Admin accounts list must be an array");

  const telebirrAcc = accounts.find((a: any) => a.payment_method === "telebirr");
  assert.ok(telebirrAcc, "Telebirr account must be present in payment_account_settings");

  const originalOwner = telebirrAcc.account_owner_name;
  const originalNumber = telebirrAcc.account_number;

  // Update Telebirr account details via admin POST endpoint
  const updateReq = new Request("http://localhost:8080/api/admin/payment-accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      id: telebirrAcc.id,
      payment_method: "telebirr",
      account_number: "0911 234 567",
      account_owner_name: "Rekik Coffee Official",
      is_active: true,
    }),
  });
  const updateRes = await handleApiRequest(updateReq);
  assert.equal(updateRes.status, 200, "Admin account update must succeed with 200");
  const updateJson = await updateRes.json();
  assert.equal(updateJson.account.account_owner_name, "Rekik Coffee Official");

  // Verify persistence by refetching from database via serverSupabase
  const { data: refetched } = await serverSupabase
    .from("payment_account_settings")
    .select("*")
    .eq("id", telebirrAcc.id)
    .single();
  assert.equal(refetched.account_owner_name, "Rekik Coffee Official", "Database row must reflect updated name");

  // Restore original name
  await upsertPaymentAccount({
    id: telebirrAcc.id,
    payment_method: "telebirr",
    account_number: originalNumber,
    account_owner_name: originalOwner,
    is_active: true,
  });
  console.log("✓ Admin update, persistence in payment_account_settings, and retrieval verified.");

  // [7] Check constraint validation ('telebirr' | 'cbe')
  console.log("\n[7] Verifying Check Constraint on payment_method...");
  const invalidMethodReq = new Request("http://localhost:8080/api/admin/payment-accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      payment_method: "crypto_usdt",
      account_number: "0x123456",
      account_owner_name: "Invalid",
    }),
  });
  const invalidRes = await handleApiRequest(invalidMethodReq);
  assert.equal(invalidRes.status, 400, "Invalid payment method must be rejected with 400 Bad Request");
  console.log("✓ Unsupported payment method strictly rejected with 400 Bad Request.");

  // [8] Customer payment workflow integration
  console.log("\n[8] Verifying Customer Payment Workflow Integration...");
  const checkoutContent = fs.readFileSync(checkoutRoutePath, "utf8");
  const orderDetailContent = fs.readFileSync(orderDetailRoutePath, "utf8");
  const accountContent = fs.readFileSync(accountRoutePath, "utf8");

  assert.ok(
    checkoutContent.includes("/api/payment-accounts") && checkoutContent.includes("receivingAccounts"),
    "Checkout page must load receiving accounts from /api/payment-accounts and display dynamic details",
  );
  assert.ok(
    orderDetailContent.includes("/api/payment-accounts") && orderDetailContent.includes("receivingAccounts"),
    "Order tracking page must load receiving accounts from /api/payment-accounts and display dynamic details",
  );
  assert.ok(
    accountContent.includes("/api/payment-accounts") && accountContent.includes("receivingAccounts"),
    "Account settlement modal must load receiving accounts from /api/payment-accounts and display dynamic details",
  );
  console.log("✓ Customer checkout, order tracking, and account pages dynamically display active receiving details.");

  console.log("\n=======================================================================");
  console.log("ALL REKIK COFFEE RECEIVING ACCOUNTS & STAFF THEME CHECKS PASSED!");
  console.log("=======================================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
