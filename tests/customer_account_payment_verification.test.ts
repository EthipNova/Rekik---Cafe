import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { handleApiRequest } from "../src/server/api";
import { serverSupabase } from "../src/server/supabase";
import { upsertPaymentAccount } from "../src/server/payment-accounts";

import { supabase } from "../src/lib/supabase";

async function getAdminToken(
  email = "kbstar77sisay@gmail.com",
): Promise<string> {
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
  assert.ok(sessionData.session?.access_token, "Must receive valid access token");
  return sessionData.session.access_token;
}

async function runCustomerAccountPaymentVerification() {
  console.log("=======================================================================");
  console.log("VERIFYING CUSTOMER ACCOUNT PAYMENT SECTION & REALTIME UPDATE WORKFLOW");
  console.log("=======================================================================\n");

  // [1] Verify source code integrity of src/routes/account.tsx
  console.log("[1] Checking src/routes/account.tsx for dynamic data flow and zero hardcoded details...");
  const accountFilePath = path.resolve(process.cwd(), "src/routes/account.tsx");
  const accountContent = fs.readFileSync(accountFilePath, "utf8");

  // Check no hardcoded numbers remain
  assert.ok(
    !accountContent.includes("Till: 0911 234 567"),
    "Hardcoded Telebirr till string '0911 234 567' must be removed from account.tsx",
  );
  assert.ok(
    !accountContent.includes("Account: 1000 2345 67890"),
    "Hardcoded CBE account string '1000 2345 67890' must be removed from account.tsx",
  );
  console.log("✓ Zero hardcoded CBE or Telebirr account details in account.tsx.");

  // Check dynamic fetch and state
  assert.ok(
    accountContent.includes("/api/payment-accounts") && accountContent.includes("receivingAccounts"),
    "account.tsx must fetch from /api/payment-accounts and store in receivingAccounts",
  );
  assert.ok(
    accountContent.includes("payment_account_settings"),
    "account.tsx must reference payment_account_settings",
  );
  assert.ok(
    accountContent.includes("postgres_changes"),
    "account.tsx must subscribe to Supabase Realtime postgres_changes on payment_account_settings",
  );
  assert.ok(
    accountContent.includes("visibilitychange") || accountContent.includes("setInterval"),
    "account.tsx must have a safe periodic refetch / visibility refetch mechanism",
  );
  console.log("✓ account.tsx contains dynamic fetch, Supabase Realtime channel, and safe refetch mechanism.");

  // [2] Fetch initial active payment accounts as a customer
  console.log("\n[2] Fetching active payment accounts configured in Supabase payment_account_settings...");
  const initialReq = new Request("http://localhost:8080/api/payment-accounts", { method: "GET" });
  const initialRes = await handleApiRequest(initialReq);
  assert.equal(initialRes.status, 200, "Customer GET /api/payment-accounts must return 200");
  const initialAccounts: any[] = await initialRes.json();
  assert.ok(Array.isArray(initialAccounts), "Response must be an array of accounts");
  console.log(`✓ Customer view fetched ${initialAccounts.length} active account(s):`, initialAccounts.map(a => `${a.payment_method}: ${a.account_number} (${a.account_owner_name})`));

  const telebirrAcc = initialAccounts.find((a: any) => a.payment_method === "telebirr");
  assert.ok(telebirrAcc, "Telebirr account must be configured in payment_account_settings");

  const originalOwner = telebirrAcc.account_owner_name;
  const originalNumber = telebirrAcc.account_number;
  const originalActive = telebirrAcc.is_active;

  try {
    // [3] Admin updates account details in payment_account_settings
    console.log("\n[3] Admin modifying payment account details in payment_account_settings...");
    const adminToken = await getAdminToken();
    const updatedTestOwner = `Rekik Lounge — Realtime Verified ${Date.now()}`;
    const updatedTestNumber = "0911 999 888";

    const updateReq = new Request("http://localhost:8080/api/admin/payment-accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: telebirrAcc.id,
        payment_method: "telebirr",
        account_number: updatedTestNumber,
        account_owner_name: updatedTestOwner,
        is_active: true,
      }),
    });
    const updateRes = await handleApiRequest(updateReq);
    assert.equal(updateRes.status, 200, "Admin account update must succeed with 200");
    const updateJson = await updateRes.json();
    assert.equal(updateJson.account.account_owner_name, updatedTestOwner);
    assert.equal(updateJson.account.account_number, updatedTestNumber);
    console.log(`✓ Admin successfully saved updated account: ${updatedTestNumber} (${updatedTestOwner})`);

    // [4] Verify that customer view/read path now displays the latest admin configuration
    console.log("\n[4] Verifying customer view refetch reflects the admin's changes...");
    const refetchReq = new Request("http://localhost:8080/api/payment-accounts", { method: "GET" });
    const refetchRes = await handleApiRequest(refetchReq);
    assert.equal(refetchRes.status, 200);
    const refetchedAccounts: any[] = await refetchRes.json();
    const refetchedTelebirr = refetchedAccounts.find((a: any) => a.id === telebirrAcc.id);
    assert.ok(refetchedTelebirr, "Refetched accounts must include updated Telebirr");
    assert.equal(refetchedTelebirr.account_owner_name, updatedTestOwner, "Customer view must show updated owner name");
    assert.equal(refetchedTelebirr.account_number, updatedTestNumber, "Customer view must show updated account number");
    console.log("✓ Customer view successfully reflected updated account number and owner name from payment_account_settings!");

    // [5] Admin deactivates account -> Customer view automatically excludes it
    console.log("\n[5] Verifying deactivation behavior (admin sets is_active: false)...");
    const deactivateReq = new Request("http://localhost:8080/api/admin/payment-accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: telebirrAcc.id,
        payment_method: "telebirr",
        account_number: updatedTestNumber,
        account_owner_name: updatedTestOwner,
        is_active: false,
      }),
    });
    const deactivateRes = await handleApiRequest(deactivateReq);
    assert.equal(deactivateRes.status, 200);

    const customerCheckReq = new Request("http://localhost:8080/api/payment-accounts", { method: "GET" });
    const customerCheckRes = await handleApiRequest(customerCheckReq);
    const activeToCustomer: any[] = await customerCheckRes.json();
    const inactiveTelebirr = activeToCustomer.find((a: any) => a.id === telebirrAcc.id);
    assert.equal(inactiveTelebirr, undefined, "Inactive account must NOT be displayed to customers");
    console.log("✓ Deactivated account is cleanly excluded from the customer view.");

  } finally {
    // [6] Cleanup and restore original account state
    console.log("\n[6] Restoring original account settings in Supabase...");
    await upsertPaymentAccount({
      id: telebirrAcc.id,
      payment_method: "telebirr",
      account_number: originalNumber,
      account_owner_name: originalOwner,
      is_active: originalActive,
    });
    console.log("✓ Original payment account settings restored successfully.");
  }

  console.log("\n=======================================================================");
  console.log("ALL CUSTOMER ACCOUNT PAYMENT TESTS PASSED SUCCESSFULLY! ✓");
  console.log("=======================================================================\n");
}

runCustomerAccountPaymentVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
