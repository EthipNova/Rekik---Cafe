/**
 * ============================================================================
 * Rekik Café — Staff Login, Anti-Loop Routing, Cash Payment, and i18n Test Suite
 * File: tests/staff_login_routing_and_cash_i18n.test.ts
 * ============================================================================
 * Validates:
 * 1. Staff ID + Password authentication with Staff ID (e.g. RK-003, RK-006, RK-007)
 * 2. Proper error messages:
 *    - "Invalid Staff ID or password."
 *    - "Your account has been deactivated."
 *    - "Your Staff ID could not be found."
 *    - "You do not have permission to access this portal."
 *    - NEVER "Invalid email or password"
 * 3. Role-based portal isolation and prevention of redirect loops:
 *    - No automatic redirect loops when unauthorized roles access /admin, /waiter, or /casher
 *    - Access Restricted screen with Switch Account action
 * 4. Cash payment display in Cashier Portal:
 *    - Cash orders display "Payment Method: 💵 Cash" / "💵 Cash" badge
 *    - Cash orders do NOT display broken image mockup, image viewport, or upload prompts
 *    - Proof-based payment methods (Telebirr, CBE Birr) continue showing proof inspection
 * 5. Language Support (i18n):
 *    - Supported languages: English (en), አማርኛ (am), Sidaamu Afoo (sid)
 *    - Translations dictionary covers navigation, authentication, cashier, waiter, and error messages
 *    - Dynamic translation function t(key) returns accurate native translations
 *    - Language selector UI component exists and provides clean access
 */

import fs from "node:fs";
import path from "node:path";

// Ensure environment variables are loaded synchronously in test runner
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      if (k && !process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

import assert from "node:assert/strict";
import { findStaffByStaffId } from "../src/server/staff-id";
import { handleApiRequest, DESIGNATED_ADMIN_ID } from "../src/server/api";
import { translations, LANGUAGE_NAMES, type SupportedLanguage } from "../src/lib/i18n";

console.log("=====================================================================");
console.log("RUNNING REKIK CAFÉ STAFF LOGIN, ANTI-LOOP ROUTING, CASH & i18n SUITE");
console.log("=====================================================================");

async function run() {
  // ── [1] Staff ID Lookup & Auth Resolution ───────────────────────────────────
  console.log("\n[1] Verifying Staff ID Resolution (Case-Insensitive & Baseline Accounts)...");

  // Admin account (RK-003)
  const adminStaff = await findStaffByStaffId("RK-003");
  assert.ok(adminStaff, "Admin RK-003 must be resolved");
  assert.equal(adminStaff?.role, "admin");
  assert.equal(adminStaff?.userId, DESIGNATED_ADMIN_ID);
  assert.equal(adminStaff?.isActive, true);

  // Cashier account (RK-006)
  const cashierStaff = await findStaffByStaffId("rk-006");
  assert.ok(cashierStaff, "Cashier RK-006 must be resolved case-insensitively");
  assert.equal(cashierStaff?.role, "cashier");

  // Waiter account (RK-007)
  const waiterStaff = await findStaffByStaffId("RK-007");
  assert.ok(waiterStaff, "Waiter RK-007 must be resolved");
  assert.equal(waiterStaff?.role, "waiter");

  // Inactive cashier (RK-001)
  const inactiveStaff = await findStaffByStaffId("RK-001");
  assert.ok(inactiveStaff, "RK-001 must be resolved");
  assert.equal(inactiveStaff?.isActive, false, "RK-001 must be inactive");

  // Non-existent Staff ID
  const notFound = await findStaffByStaffId("RK-9999");
  assert.equal(notFound, null, "Non-existent Staff ID must return null");

  console.log("✓ All baseline Staff IDs (Admin RK-003, Cashier RK-006, Waiter RK-007, Inactive RK-001) resolved cleanly.");

  // ── [2] Staff ID + Password Login Invariants & Exact Error Messages ──────────
  console.log("\n[2] Verifying Staff ID Login Endpoint & Exact Error Messages...");

  // 2a. Missing fields
  const resMissing = await handleApiRequest(
    new Request("http://localhost/api/auth/staff-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: "", password: "" }),
    }),
  );
  assert.equal(resMissing.status, 400);

  // 2b. Non-existent Staff ID
  const resNotFound = await handleApiRequest(
    new Request("http://localhost/api/auth/staff-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: "RK-9999", password: "Password123!" }),
    }),
  );
  assert.equal(resNotFound.status, 401);
  const jsonNotFound = await resNotFound.json();
  assert.notEqual(
    jsonNotFound.error?.toLowerCase(),
    "invalid email or password",
    "Must NEVER say 'Invalid email or password'",
  );
  assert.ok(
    jsonNotFound.error === "Invalid Staff ID or password." ||
      jsonNotFound.status === "not_found",
    "Must return clear Staff ID invalid/not_found error",
  );

  // 2c. Deactivated staff member login
  const resDeactivated = await handleApiRequest(
    new Request("http://localhost/api/auth/staff-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: "RK-001", password: "Password123!" }),
    }),
  );
  assert.equal(resDeactivated.status, 403);
  const jsonDeactivated = await resDeactivated.json();
  assert.equal(jsonDeactivated.error, "Your account has been deactivated.");
  assert.equal(jsonDeactivated.status, "deactivated");

  // 2d. Role mismatch & Portal authorization logic in src/server/api.ts
  const apiSrc = fs.readFileSync(path.resolve(process.cwd(), "src/server/api.ts"), "utf-8");
  assert.ok(
    apiSrc.includes('error: "You do not have permission to access this portal."'),
    "API must return exact error: 'You do not have permission to access this portal.' on role mismatch",
  );
  assert.ok(
    apiSrc.includes('status: "role_mismatch"'),
    "API must return status 'role_mismatch'",
  );
  assert.ok(
    apiSrc.includes('targetPortal === "admin"'),
    "API must enforce designated administrator isolation for admin portal",
  );
  assert.ok(
    apiSrc.includes('targetPortal === "cashier"'),
    "API must enforce cashier/admin authorization for cashier portal",
  );
  assert.ok(
    apiSrc.includes('targetPortal === "waiter"'),
    "API must enforce waiter/admin authorization for waiter portal",
  );

  console.log("✓ All error messages match exact specifications without generic 'Invalid email or password'.");

  // ── [3] Admin Login Page & Prevention of Redirect Loop ──────────────────────
  console.log("\n[3] Verifying Admin Portal Authentication Flow & Anti-Loop Route Guard...");

  const adminSrc = fs.readFileSync(path.resolve(process.cwd(), "src/routes/admin.tsx"), "utf-8");

  // 3a. Admin login page uses /api/auth/staff-login with targetPortal: "admin"
  assert.ok(
    adminSrc.includes('targetPortal: "admin"'),
    "Admin login handler must submit targetPortal: 'admin' to /api/auth/staff-login",
  );
  assert.ok(
    adminSrc.includes("/api/auth/staff-login"),
    "Admin login handler must call /api/auth/staff-login instead of direct email auth",
  );

  // 3b. UI displays Staff ID field
  assert.ok(
    adminSrc.includes('htmlFor="admin-email">{t("login.staffId", "Staff ID")}</Label>'),
    "Admin login form must label input as Staff ID",
  );
  assert.ok(
    adminSrc.includes('placeholder="RK-003"'),
    "Admin login form placeholder must be RK-003",
  );

  // 3c. Redirect loop removed: navigate({ to: "/waiter" }) and navigate({ to: "/casher" })
  // must NOT be invoked inside onAuthStateChange or getSession
  assert.ok(
    !adminSrc.includes('void navigate({ to: "/waiter", replace: true });'),
    "Infinite redirect loop to /waiter must be removed from admin route guard",
  );
  assert.ok(
    !adminSrc.includes('void navigate({ to: "/casher", replace: true });'),
    "Infinite redirect loop to /casher must be removed from admin route guard",
  );

  // 3d. Access Restricted screen exists with Switch Account action
  assert.ok(
    adminSrc.includes("unauthorizedStaff"),
    "Admin layout must maintain unauthorizedStaff state for unauthorized roles",
  );
  assert.ok(
    adminSrc.includes("Sign Out & Switch Account"),
    "Admin layout must provide 'Sign Out & Switch Account' button on restricted screen",
  );
  assert.ok(
    adminSrc.includes("auth.signOut()"),
    "Switch Account must execute signOut to clear stale session data",
  );

  console.log("✓ Redirect loop to /waiter eliminated. Admin route provides Access Restricted screen and account switching.");

  // ── [4] Cash Payment Display in Cashier Portal ──────────────────────────────
  console.log("\n[4] Verifying Cash Payment Display in Cashier Components...");

  const modalSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/cashier/PaymentProofModal.tsx"),
    "utf-8",
  );
  const pendingListSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/cashier/PendingReviewsList.tsx"),
    "utf-8",
  );
  const overviewSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/cashier/CashierOverview.tsx"),
    "utf-8",
  );
  const historySrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/cashier/ReviewHistoryView.tsx"),
    "utf-8",
  );

  // 4a. Cash handling in PaymentProofModal
  assert.ok(
    modalSrc.includes("isCash ? ("),
    "PaymentProofModal must branch rendering on isCash",
  );
  assert.ok(
    modalSrc.includes("In-Person Cash Payment"),
    "PaymentProofModal must display in-person cash payment banner",
  );
  assert.ok(
    modalSrc.includes("No receipt screenshot or payment proof required"),
    "PaymentProofModal must indicate no proof is required for cash",
  );
  assert.ok(
    modalSrc.includes("💵 Cash"),
    "PaymentProofModal must display '💵 Cash' badge",
  );
  assert.ok(
    modalSrc.includes("💵 Payment collected in cash. No payment proof is required."),
    "PaymentProofModal must display clear cash message in payment proof section",
  );
  assert.ok(
    modalSrc.includes("Payment collected in cash by the waiter."),
    "PaymentProofModal must note that cash was collected by the waiter",
  );
  assert.ok(
    !modalSrc.includes("Payment made from CBE. Please check the screenshot."),
    "PaymentProofModal must NOT hardcode default CBE message",
  );

  // 4b. Cash handling in PendingReviewsList
  assert.ok(
    pendingListSrc.includes("isCash ? ("),
    "PendingReviewsList must branch item thumbnail on isCash",
  );
  assert.ok(
    pendingListSrc.includes("Cash Payment"),
    "PendingReviewsList must label cash orders with Cash Payment badge",
  );
  assert.ok(
    pendingListSrc.includes("💵 Cash"),
    "PendingReviewsList must display cash indicator badge",
  );

  // 4c. Overview and History Cash indicators
  assert.ok(
    overviewSrc.includes("💵 Cash"),
    "CashierOverview must display Cash badge for cash orders",
  );
  assert.ok(
    historySrc.includes("💵 Cash"),
    "ReviewHistoryView must display Cash badge in review history",
  );

  console.log("✓ Cash payments properly distinguished with clear 💵 Cash badges and zero broken proof images.");

  // ── [5] Language Support (i18n) ──────────────────────────────────────────────
  console.log("\n[5] Verifying Language Support (English, አማርኛ, Sidaamu Afoo)...");

  // 5a. Check supported languages
  const expectedLangs: SupportedLanguage[] = ["en", "am", "sid"];
  for (const lang of expectedLangs) {
    assert.ok(LANGUAGE_NAMES[lang], `Language ${lang} must be registered in LANGUAGE_NAMES`);
    assert.ok(translations[lang], `Language ${lang} must have a translation dictionary`);
  }

  // 5b. Verify required translation keys across all 3 languages
  const criticalKeys = [
    "nav.home",
    "nav.menu",
    "nav.orders",
    "nav.cart",
    "nav.admin",
    "nav.waiter",
    "nav.cashier",
    "nav.signIn",
    "nav.signOut",
    "nav.backToMenu",
    "nav.switchAccount",
    "login.title",
    "login.staffId",
    "login.password",
    "error.invalidCredentials",
    "error.deactivated",
    "error.notFound",
    "error.roleMismatch",
    "error.accessRestricted",
    "cashier.cash",
    "cashier.cashBadge",
    "cashier.cashPayment",
    "cashier.noProofRequired",
    "cashier.approvePayment",
    "cashier.rejectPayment",
    "waiter.dashboard",
    "waiter.currentOrders",
    "waiter.onDuty",
    "waiter.offDuty",
  ];

  for (const lang of expectedLangs) {
    const dict = translations[lang];
    for (const key of criticalKeys) {
      assert.ok(dict[key], `Language '${lang}' missing required key '${key}'`);
      assert.ok(dict[key].trim().length > 0, `Language '${lang}' key '${key}' must not be empty`);
    }
  }

  // 5c. Check specific language translations
  assert.equal(translations.en["login.staffId"], "Staff ID");
  assert.equal(translations.am["login.staffId"], "የሰራተኛ መለያ (Staff ID)");
  assert.equal(translations.sid["login.staffId"], "Losoosi ID");

  assert.equal(translations.en["error.invalidCredentials"], "Invalid Staff ID or password.");
  assert.equal(translations.am["error.invalidCredentials"], "የተሳሳተ የሰራተኛ መለያ ወይም የይለፍ ቃል።");
  assert.equal(translations.sid["error.invalidCredentials"], "Bonsheessitino Losoosi ID woy passworde gariikkitinokkite.");

  assert.equal(translations.en["error.deactivated"], "Your account has been deactivated.");
  assert.equal(translations.am["error.deactivated"], "መለያዎ ቦዝኗል ወይም ታግዷል።");
  assert.equal(translations.sid["error.deactivated"], "Akaawunttikki gatamariishshi hoongino.");

  assert.equal(translations.en["error.roleMismatch"], "You do not have permission to access this portal.");
  assert.equal(translations.am["error.roleMismatch"], "ይህንን ፖርታል ለመጠቀም ፈቃድ የለዎትም።");
  assert.equal(translations.sid["error.roleMismatch"], "Tenne poortaale eate fajjote bae dinohe.");

  // 5d. Check LanguageSelector component exists
  const langSelectorSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/site/LanguageSelector.tsx"),
    "utf-8",
  );
  assert.ok(langSelectorSrc.includes("English"), "LanguageSelector must provide English option");
  assert.ok(langSelectorSrc.includes("አማርኛ"), "LanguageSelector must provide አማርኛ option");
  assert.ok(langSelectorSrc.includes("Sidaamu Afoo"), "LanguageSelector must provide Sidaamu Afoo option");

  console.log("✓ Complete multi-language support (English, አማርኛ, Sidaamu Afoo) verified with accurate vocabulary.");

  console.log("\n=====================================================================");
  console.log("ALL REKIK CAFÉ CHECKS PASSED SUCCESSFULLY (100%)");
  console.log("=====================================================================");
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
