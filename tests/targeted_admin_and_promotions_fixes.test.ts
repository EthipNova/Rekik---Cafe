import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  derivePromotionStatus,
  normalizePromotionRecord,
  findApplicablePromotion,
  calculateDiscountedPrice,
  type Promotion,
} from "../src/lib/promotions";
import { updateStaffPassword } from "../src/server/staff";

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING REKIK CAFÉ TARGETED FIXES VERIFICATION");
  console.log("==================================================\n");

  // -------------------------------------------------------------------------
  // Test 1: Date comparison bug fix in derivePromotionStatus
  // -------------------------------------------------------------------------
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const todayStr = now.toISOString().split("T")[0]!;
  const todayISOWithTime = `${todayStr}T00:00:00.000Z`;
  const futureISOWithTime = `${yyyy + 1}-12-31T23:59:59.000Z`;
  const pastISOWithTime = `${yyyy - 1}-01-01T00:00:00.000Z`;

  // An active promotion created with ISO datetime on today's date
  const promoActiveToday: Promotion = {
    id: "promo-1",
    name: "Opening Special",
    code: "OPEN50",
    description: "50% off",
    discountType: "percentage",
    discountValue: 50,
    startDate: todayISOWithTime,
    endDate: futureISOWithTime,
    status: "active",
    applicableCategories: ["cat-1"],
    applicableProducts: [],
    minOrderAmount: 0,
    usageLimit: null,
    usageCount: 0,
    createdAt: todayISOWithTime,
    updatedAt: todayISOWithTime,
  };

  const derivedActive = derivePromotionStatus(promoActiveToday);
  assert.equal(
    derivedActive,
    "active",
    `derivePromotionStatus must return 'active' for today's ISO date, but got '${derivedActive}'`,
  );

  // A promotion starting in the future
  const promoFuture: Promotion = {
    ...promoActiveToday,
    id: "promo-2",
    startDate: `${yyyy + 1}-01-01T00:00:00+00:00`,
    endDate: `${yyyy + 1}-12-31T23:59:59+00:00`,
  };
  const derivedFuture = derivePromotionStatus(promoFuture);
  assert.equal(derivedFuture, "scheduled", "Future promotion must be scheduled");

  // An expired promotion
  const promoExpired: Promotion = {
    ...promoActiveToday,
    id: "promo-3",
    startDate: pastISOWithTime,
    endDate: `${yyyy - 1}-12-31T23:59:59+00:00`,
  };
  const derivedExpired = derivePromotionStatus(promoExpired);
  assert.equal(derivedExpired, "expired", "Past promotion must be expired");
  console.log("✓ derivePromotionStatus ISO date comparison verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 2: findApplicablePromotion & calculateDiscountedPrice
  // -------------------------------------------------------------------------
  console.log("[2] Testing findApplicablePromotion and calculateDiscountedPrice...");
  const samplePromotions: Promotion[] = [
    {
      ...promoActiveToday,
      id: "p-cat",
      name: "Coffee Category 20% Off",
      discountType: "percentage",
      discountValue: 20,
      categoryId: "coffee",
      applicableCategorySlug: "coffee",
      applicableProductIds: [],
    },
    {
      ...promoActiveToday,
      id: "p-all",
      name: "All Items 10% Off",
      discountType: "percentage",
      discountValue: 10,
      appliesToAll: true,
      applicableProductIds: ["*"],
    },
    {
      ...promoActiveToday,
      id: "p-fixed",
      name: "Pastry 50 ETB Off",
      discountType: "fixed",
      discountValue: 50,
      categoryId: "pastry",
      applicableCategorySlug: "pastry",
      applicableProductIds: [],
    },
  ];

  // Product in 'coffee' category should get 20% off
  const coffeeMatch = findApplicablePromotion("prod-1", "coffee", samplePromotions);
  assert.ok(coffeeMatch, "Coffee product should match category promotion");
  assert.equal(coffeeMatch.id, "p-cat");
  const coffeePrice = calculateDiscountedPrice(200, coffeeMatch.discountType, coffeeMatch.discountValue);
  assert.equal(coffeePrice, 160, `200 ETB - 20% should be 160 ETB, got ${coffeePrice}`);

  // Product in 'tea' category should fallback to storewide 'p-all' (10% off)
  const teaMatch = findApplicablePromotion("prod-2", "tea", samplePromotions);
  assert.ok(teaMatch, "Tea product should match storewide promotion");
  assert.equal(teaMatch.id, "p-all");
  const teaPrice = calculateDiscountedPrice(100, teaMatch.discountType, teaMatch.discountValue);
  assert.equal(teaPrice, 90, `100 ETB - 10% should be 90 ETB, got ${teaPrice}`);

  // Product in 'pastry' category should get fixed 50 ETB discount
  const pastryMatch = findApplicablePromotion("prod-3", "pastry", samplePromotions);
  assert.ok(pastryMatch);
  const pastryPrice = calculateDiscountedPrice(120, pastryMatch.discountType, pastryMatch.discountValue);
  assert.equal(pastryPrice, 70, `120 ETB - 50 ETB should be 70 ETB, got ${pastryPrice}`);

  // Fixed discount larger than price should not go below zero
  const cheapPastryPrice = calculateDiscountedPrice(30, pastryMatch.discountType, pastryMatch.discountValue);
  assert.equal(cheapPastryPrice, 0, "Discounted price cannot be negative");
  console.log("✓ Promotion applicability and discount calculations verified!\n");

  // -------------------------------------------------------------------------
  // Test 3: normalizePromotionRecord backward compatibility
  // -------------------------------------------------------------------------
  console.log("[3] Testing normalizePromotionRecord with both camelCase & snake_case...");
  const snakePromo = {
    id: "p-snake",
    name: "Snake Case Promo",
    code: "SNAKE",
    discount_type: "percentage",
    discount_value: 15,
    start_date: todayISOWithTime,
    end_date: futureISOWithTime,
    applicable_categories: ["c1"],
    status: "active",
  };
  const normalizedSnake = normalizePromotionRecord(snakePromo);
  assert.equal(normalizedSnake.discountType, "percentage");
  assert.equal(normalizedSnake.discountValue, 15);
  assert.deepEqual(normalizedSnake.applicableCategories, ["c1"]);

  const camelPromo = {
    id: "p-camel",
    name: "Camel Case Promo",
    code: "CAMEL",
    discountType: "fixed",
    discountValue: 25,
    startDate: todayISOWithTime,
    endDate: futureISOWithTime,
    applicableCategories: ["c2"],
    status: "active",
  };
  const normalizedCamel = normalizePromotionRecord(camelPromo);
  assert.equal(normalizedCamel.discountType, "fixed");
  assert.equal(normalizedCamel.discountValue, 25);
  console.log("✓ normalizePromotionRecord dual-schema compatibility verified!\n");

  // -------------------------------------------------------------------------
  // Test 4: Staff Password Update security & input validation
  // -------------------------------------------------------------------------
  console.log("[4] Testing staff password update security enforcement...");
  // Passwords under 6 characters must be rejected
  await assert.rejects(
    () => updateStaffPassword("fake-id", "12345", "admin-id"),
    /at least 6 characters/i,
    "Passwords under 6 characters must be rejected",
  );

  // Missing targetUserId or adminUserId must be rejected
  await assert.rejects(
    () => updateStaffPassword("", "validpassword123", "admin-id"),
    /Target user ID is required/i,
  );
  await assert.rejects(
    () => updateStaffPassword("fake-id", "validpassword123", ""),
    /Admin authorization required/i,
  );
  console.log("✓ Staff password update validation rules enforced!\n");

  // -------------------------------------------------------------------------
  // Test 5: Verify Active Queue is removed from Admin Dashboard Index
  // -------------------------------------------------------------------------
  console.log("[5] Verifying Active Queue is removed from Admin Dashboard Index...");
  const adminIndexPath = path.resolve(process.cwd(), "src/routes/admin.index.tsx");
  const adminIndexContent = fs.readFileSync(adminIndexPath, "utf-8");

  assert.ok(
    !adminIndexContent.includes("Active Workflow Queue"),
    "Admin index must not contain Active Workflow Queue card",
  );
  assert.ok(
    !adminIndexContent.includes("Active in Queue"),
    "Admin index must not contain Active in Queue label",
  );
  assert.ok(
    adminIndexContent.includes("lg:grid-cols-4"),
    "Admin index summary grid must use 4 columns (lg:grid-cols-4)",
  );
  console.log("✓ Active Queue card removed from admin dashboard index as required!\n");

  // -------------------------------------------------------------------------
  // Test 6: Verify Admin Payments Order Inspection Sheet contains Cashier Breakdown
  // -------------------------------------------------------------------------
  console.log("[6] Verifying Admin Payments Order Inspection Cashier Breakdown...");
  const adminPaymentsPath = path.resolve(process.cwd(), "src/routes/admin.payments.tsx");
  const adminPaymentsContent = fs.readFileSync(adminPaymentsPath, "utf-8");

  assert.ok(
    adminPaymentsContent.includes("Ordered Items Table (Matching Cashier Financial Breakdown)"),
    "Admin payments drawer must include Ordered Items matching Cashier Breakdown",
  );
  assert.ok(
    adminPaymentsContent.includes("Outstanding Balance"),
    "Admin payments drawer must include Outstanding Balance",
  );
  assert.ok(
    adminPaymentsContent.includes("Payment Receipt Screenshot"),
    "Admin payments drawer must include Payment Receipt Screenshot section",
  );
  assert.ok(
    adminPaymentsContent.includes("fetchProofSignedUrl"),
    "Admin payments must invoke fetchProofSignedUrl for secure receipt preview",
  );
  assert.ok(
    adminPaymentsContent.includes("formatReviewDate"),
    "Admin payments must format timestamps with formatReviewDate",
  );
  console.log("✓ Order inspection drawer matches cashier financial breakdown!\n");

  // -------------------------------------------------------------------------
  // Test 7: Verify Staff History & Password Action in Admin Staff
  // -------------------------------------------------------------------------
  console.log("[7] Verifying Staff History and Password Action in admin.staff.tsx...");
  const adminStaffPath = path.resolve(process.cwd(), "src/routes/admin.staff.tsx");
  const adminStaffContent = fs.readFileSync(adminStaffPath, "utf-8");

  assert.ok(
    adminStaffContent.includes("Reset Staff Password"),
    "Admin staff must include Reset Staff Password dialog",
  );
  assert.ok(
    adminStaffContent.includes("handleUpdatePassword"),
    "Admin staff must handle password updates via handleUpdatePassword",
  );
  assert.ok(
    adminStaffContent.includes("selectedWaiterHistory"),
    "Admin staff must compute selectedWaiterHistory",
  );
  assert.ok(
    adminStaffContent.includes("selectedCashierHistory"),
    "Admin staff must compute selectedCashierHistory",
  );
  // -------------------------------------------------------------------------
  // Test 8: Task 1 - Promotion optional image upload and customer homepage
  // -------------------------------------------------------------------------
  console.log("[8] Verifying Task 1: Promotion optional image and customer homepage display...");
  const { normalizePromotion } = await import("../src/server/db");
  const promoWithEncodedImage = {
    id: "promo-img-1",
    name: "Latte Art Festival",
    description: "Enjoy 25% off all espresso drinks.<!--promo_img:https://example.com/promo.webp-->",
    discount_type: "percentage",
    discount_value: 25,
    start_date: todayISOWithTime,
    end_date: futureISOWithTime,
    status: "active",
  };
  const normalizedWithImage = normalizePromotion(promoWithEncodedImage);
  assert.equal(normalizedWithImage.imageUrl, "https://example.com/promo.webp", "Image URL must be parsed from encoded description");
  assert.equal(normalizedWithImage.description, "Enjoy 25% off all espresso drinks.", "Description must be clean without image tag");

  const promoWithoutImage = {
    id: "promo-no-img",
    name: "Classic Morning Promo",
    description: "Fresh brew at 10% off",
    discount_type: "percentage",
    discount_value: 10,
    start_date: todayISOWithTime,
    end_date: futureISOWithTime,
    status: "active",
  };
  const normalizedNoImage = normalizePromotion(promoWithoutImage);
  assert.ok(!normalizedNoImage.imageUrl, "Promotion without image must have falsy/null imageUrl");

  // Verify customer homepage replaces Popular right now with Promotions
  const indexPath = path.resolve(process.cwd(), "src/routes/index.tsx");
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  assert.ok(
    !indexContent.includes('title="Popular right now"'),
    "Customer homepage must not contain 'Popular right now' section",
  );
  assert.ok(
    indexContent.includes('title="Promotions"'),
    "Customer homepage must contain dedicated 'Promotions' section",
  );
  assert.ok(
    indexContent.includes("promo.imageUrl"),
    "Customer homepage Promotions section must check and display promo.imageUrl when available",
  );

  // Verify Admin Promotions has optional image upload
  const adminPromoPath = path.resolve(process.cwd(), "src/routes/admin.promotions.tsx");
  const adminPromoContent = fs.readFileSync(adminPromoPath, "utf-8");
  assert.ok(
    adminPromoContent.includes("Promotion Image (Optional)"),
    "Admin Promotions must have optional image upload field",
  );
  assert.ok(
    adminPromoContent.includes("uploadPromotionImage"),
    "Admin Promotions must call uploadPromotionImage",
  );
  assert.ok(
    adminPromoContent.includes("validateProductImageFile"),
    "Admin Promotions must validate image file",
  );
  console.log("✓ Task 1 verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 9: Task 2 - Remove four horizontal cards from main Admin Dashboard
  // -------------------------------------------------------------------------
  console.log("[9] Verifying Task 2: Horizontal cards removed from main Admin Dashboard...");
  const adminIndexUpdated = fs.readFileSync(adminIndexPath, "utf-8");
  assert.ok(
    !adminIndexUpdated.includes("Management Shortcuts"),
    "Admin index must not contain Management Shortcuts section",
  );
  assert.ok(
    !adminIndexUpdated.includes("Performance & Growth"),
    "Admin index must not contain Performance & Growth horizontal card",
  );
  assert.ok(
    !adminIndexUpdated.includes("Direct operational consoles"),
    "Admin index must not contain horizontal shortcut consoles",
  );
  console.log("✓ Task 2 verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 10: Task 3 - Operational Alert must show only rejected orders
  // -------------------------------------------------------------------------
  console.log("[10] Verifying Task 3: Operational Alert shows only actual rejected orders...");
  const adminIndexContentT3 = fs.readFileSync(adminIndexPath, "utf-8");
  assert.ok(
    adminIndexContentT3.includes("data.rejectedOrdersCount"),
    "Admin index Operational Alert card must use rejectedOrdersCount",
  );
  assert.ok(
    adminIndexContentT3.includes("data.rejectedOrders.map"),
    "Admin index Operational Alert card must map over rejectedOrders",
  );
  assert.ok(
    adminIndexContentT3.includes("Unable to load rejected orders"),
    "Admin index Operational Alert card must handle query failures explicitly",
  );

  // Test filter logic
  const mockOrders = [
    { id: "o-1", number: "101", status: "rejected", waiterDecision: "rejected" },
    { id: "o-2", number: "102", status: "confirmed", waiterDecision: "approved" },
    { id: "o-3", number: "103", status: "preparing", waiterDecision: "approved" },
    { id: "o-4", number: "104", status: "delivered", waiterDecision: "approved" },
    { id: "o-5", number: "105", status: "completed", waiterDecision: "approved" },
    { id: "o-6", number: "106", status: "pending_waiter", waiterDecision: "pending" },
    { id: "o-7", number: "107", status: "payment_rejected", waiterDecision: "approved" },
    { id: "o-8", number: "108", status: "rejected_by_waiter", waiterDecision: "rejected" },
    { id: "o-1", number: "101", status: "rejected", waiterDecision: "rejected" }, // duplicate join simulation
  ];

  // Deduplicate
  const seenIds = new Set<string>();
  const deduped = mockOrders.filter((o) => {
    if (seenIds.has(o.id)) return false;
    seenIds.add(o.id);
    return true;
  });
  assert.equal(deduped.length, 8, "Duplicates from joins must be filtered out");

  const filteredRejected = deduped.filter(
    (o) =>
      o.status === "rejected" ||
      o.status === "rejected_by_waiter" ||
      o.status === "payment_rejected" ||
      o.waiterDecision === "rejected",
  );
  assert.equal(filteredRejected.length, 3, "Only actual rejected orders must be included");
  assert.deepEqual(
    filteredRejected.map((o) => o.number),
    ["101", "107", "108"],
    "Must match only rejected orders #101, #107, #108",
  );
  console.log("✓ Task 3 verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 11: Task 4 - Remove specific dashboard buttons
  // -------------------------------------------------------------------------
  console.log("[11] Verifying Task 4: Specific dashboard buttons removed...");
  const adminIndexContentT4 = fs.readFileSync(adminIndexPath, "utf-8");
  // 1. In Rekik Operational Workflow Stages, Manage buttons removed
  assert.ok(
    !adminIndexContentT4.includes("<span>Manage</span>"),
    "Workflow cards must not contain Manage buttons",
  );
  // 2. Under Verified Sales Trend, Growth and Analytics button removed
  assert.ok(
    !adminIndexContentT4.includes("Growth Analytics"),
    "Verified Sales Trend must not contain Growth Analytics button",
  );
  assert.ok(
    adminIndexContentT4.includes("Verified Sales Trend"),
    "Verified Sales Trend section must remain intact",
  );
  assert.ok(
    adminIndexContentT4.includes("Rekik Operational Workflow Stages"),
    "Rekik Operational Workflow Stages section must remain intact",
  );
  console.log("✓ Task 4 verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 12: Task 5 - Remove Issues Needing Attention
  // -------------------------------------------------------------------------
  console.log("[12] Verifying Task 5: Issues Needing Attention removed from Admin Dashboard...");
  const adminIndexContentT5 = fs.readFileSync(adminIndexPath, "utf-8");
  assert.ok(
    !adminIndexContentT5.includes("Issues Needing Attention"),
    "Admin index must not contain 'Issues Needing Attention' card",
  );
  assert.ok(
    adminIndexContentT5.includes("lg:grid-cols-4"),
    "KPI metric cards grid must use 4 columns (lg:grid-cols-4)",
  );
  // -------------------------------------------------------------------------
  // Test 13: Task 6 - Remove Board View from Orders sidebar page
  // -------------------------------------------------------------------------
  console.log("[13] Verifying Task 6: Board View removed from Admin Orders page...");
  const adminOrdersPath = path.resolve(process.cwd(), "src/routes/admin.orders.tsx");
  const adminOrdersContent = fs.readFileSync(adminOrdersPath, "utf-8");

  assert.ok(
    !adminOrdersContent.includes("Board View"),
    "Admin orders must not contain Board View button/toggle",
  );
  assert.ok(
    !adminOrdersContent.includes("Kanban"),
    "Admin orders must not import or render Kanban",
  );
  assert.ok(
    !adminOrdersContent.includes("viewMode === \"board\""),
    "Admin orders must not have board view branch",
  );
  assert.ok(
    adminOrdersContent.includes("Table") && adminOrdersContent.includes("filteredOrders"),
    "Admin orders must maintain table/list view for orders",
  );
  assert.ok(
    adminOrdersContent.includes("searchQuery") && adminOrdersContent.includes("statusFilter"),
    "Admin orders must keep search and filters functional",
  );
  assert.ok(
    adminOrdersContent.includes("setSelectedOrderId"),
    "Admin orders must keep order details drawer inspection functional",
  );
  // -------------------------------------------------------------------------
  // Test 14: Task 7 - Restrict Sales & Payments payment-method filtering
  // -------------------------------------------------------------------------
  const { classifyPaymentMethod, orderMatchesPaymentMethod } = await import(
    "../src/lib/financial-monitoring"
  );

  // Canonical classification tests
  assert.equal(classifyPaymentMethod("Telebirr Mobile"), "telebirr");
  assert.equal(classifyPaymentMethod("telebirr"), "telebirr");
  assert.equal(classifyPaymentMethod("CBE Birr"), "cbe");
  assert.equal(classifyPaymentMethod("Bank Transfer"), "cbe");
  assert.equal(classifyPaymentMethod("cbe"), "cbe");
  assert.equal(classifyPaymentMethod("Cash at Table"), "cash");
  assert.equal(classifyPaymentMethod("Cash on Delivery"), "cash");
  assert.equal(classifyPaymentMethod("Pay at Table / Cash"), "cash");
  assert.equal(classifyPaymentMethod("Pay at Pickup Counter"), "cash");
  assert.equal(classifyPaymentMethod("cash"), "cash");
  assert.equal(classifyPaymentMethod("Unknown Crypto"), "other");

  // Order matching tests
  assert.ok(
    orderMatchesPaymentMethod({ paymentMethod: "CBE Birr" }, "cbe"),
    "Must match CBE order",
  );
  assert.ok(
    !orderMatchesPaymentMethod({ paymentMethod: "Telebirr Mobile" }, "cbe"),
    "Must not match Telebirr for CBE filter",
  );
  assert.ok(
    orderMatchesPaymentMethod({ paymentMethod: "Cash on Delivery" }, "cash"),
    "Must match Cash order",
  );
  assert.ok(
    orderMatchesPaymentMethod({ paymentMethod: "Cash on Delivery" }, "all"),
    "Must match all filter",
  );

  // UI verification: filter dropdown options strictly restricted
  const adminPaymentsContentT7 = fs.readFileSync(adminPaymentsPath, "utf-8");
  assert.ok(
    adminPaymentsContentT7.includes('<SelectItem value="cbe">CBE</SelectItem>'),
    "Payment method filter must offer CBE",
  );
  assert.ok(
    adminPaymentsContentT7.includes('<SelectItem value="telebirr">Telebirr</SelectItem>'),
    "Payment method filter must offer Telebirr",
  );
  assert.ok(
    adminPaymentsContentT7.includes('<SelectItem value="cash">Cash</SelectItem>'),
    "Payment method filter must offer Cash",
  );
  assert.ok(
    !adminPaymentsContentT7.includes("availableMethods.map"),
    "Payment method filter must not expose unvetted raw strings from availableMethods",
  );
  // -------------------------------------------------------------------------
  // Test 15: Task 8 - Staff & Activity cards and Kitchen Staff role removed
  // -------------------------------------------------------------------------
  console.log("[15] Verifying Task 8: Waiter Queue, Cashier Queue, and Kitchen Staff role removed...");
  const adminStaffContentT8 = fs.readFileSync(adminStaffPath, "utf-8");

  assert.ok(
    !adminStaffContentT8.includes("Waiter Queue"),
    "Staff & Activity must not contain Waiter Queue card",
  );
  assert.ok(
    !adminStaffContentT8.includes("Cashier Review Queue"),
    "Staff & Activity must not contain Cashier Review Queue card",
  );
  assert.ok(
    !adminStaffContentT8.includes('<SelectItem value="kitchen">'),
    "Staff & Activity must not include Kitchen Staff in role filter options",
  );
  assert.ok(
    adminStaffContentT8.includes("Registered Staff"),
    "Staff & Activity must keep Registered Staff summary card",
  );
  assert.ok(
    adminStaffContentT8.includes("Accountability Activity"),
    "Staff & Activity must keep Accountability Activity summary card",
  );
  assert.ok(
    adminStaffContentT8.includes('<SelectItem value="waiter">Waiters</SelectItem>'),
    "Staff & Activity must keep Waiters role filter option",
  );
  assert.ok(
    adminStaffContentT8.includes('<SelectItem value="cashier">Cashiers</SelectItem>'),
    "Staff & Activity must keep Cashiers role filter option",
  );
  assert.ok(
    adminStaffContentT8.includes('<SelectItem value="admin">Administrators</SelectItem>'),
    "Staff & Activity must keep Administrators role filter option",
  );
  // -------------------------------------------------------------------------
  // Test 16: Task 9 - Remove status filtering from Promotions page
  // -------------------------------------------------------------------------
  console.log("[16] Verifying Task 9: Status filtering removed from Admin Promotions page...");
  const adminPromosPath = path.resolve(process.cwd(), "src/routes/admin.promotions.tsx");
  const adminPromosContentT9 = fs.readFileSync(adminPromosPath, "utf-8");

  assert.ok(
    !adminPromosContentT9.includes("statusFilter"),
    "Admin promotions must not have statusFilter state or variable",
  );
  assert.ok(
    !adminPromosContentT9.includes('aria-label="Filter by promotion status"'),
    "Admin promotions must not contain status filter select control",
  );
  assert.ok(
    adminPromosContentT9.includes("derivePromotionStatus"),
    "Admin promotions must retain derivePromotionStatus for status labels & badges",
  );
  assert.ok(
    adminPromosContentT9.includes("StatusBadge"),
    "Admin promotions must retain StatusBadge for status display in cards and drawers",
  );
  assert.ok(
    adminPromosContentT9.includes("discountTypeFilter") && adminPromosContentT9.includes("searchQuery"),
    "Admin promotions must retain search and discount type filtering",
  );
  // -------------------------------------------------------------------------
  // Test 17: Task 10 - Phone number in waiter/cashier registration & directory
  // -------------------------------------------------------------------------
  console.log("[17] Verifying Task 10: Phone number field in waiter/cashier registration & directory...");
  const { validateStaffRegistrationInput } = await import("../src/server/staff");

  // Valid phone numbers
  const validPhoneRes1 = validateStaffRegistrationInput({
    name: "Abebe Kebede",
    email: "abebe@rekikcafe.com",
    password: "password123",
    role: "waiter",
    phone: "+251 91 123 4567",
  });
  assert.ok(validPhoneRes1.valid, "Valid +251 Ethiopian phone should pass validation");

  const validPhoneRes2 = validateStaffRegistrationInput({
    name: "Chaltu Desta",
    email: "chaltu@rekikcafe.com",
    password: "password123",
    role: "cashier",
    phone: "0911234567",
  });
  assert.ok(validPhoneRes2.valid, "Valid 0911 phone should pass validation");

  // Optional phone (omitted/empty)
  const optionalPhoneRes = validateStaffRegistrationInput({
    name: "Dawit Haile",
    email: "dawit@rekikcafe.com",
    password: "password123",
    role: "waiter",
  });
  assert.ok(optionalPhoneRes.valid, "Omitted phone should pass validation (optional)");

  // Invalid phone format
  const invalidPhoneRes = validateStaffRegistrationInput({
    name: "Dawit Haile",
    email: "dawit@rekikcafe.com",
    password: "password123",
    role: "waiter",
    phone: "abc12",
  });
  assert.strictEqual(invalidPhoneRes.valid, false, "Invalid phone should fail validation");
  assert.strictEqual(invalidPhoneRes.field, "phone");

  // Verify UI has Phone Number input field
  const adminStaffContentT10 = fs.readFileSync(adminStaffPath, "utf-8");
  assert.ok(
    adminStaffContentT10.includes('id="staff-phone-input"'),
    "Staff registration dialog must contain Phone Number input field",
  );
  assert.ok(
    adminStaffContentT10.includes("registerPhone"),
    "Staff registration dialog must bind registerPhone state",
  );
  assert.ok(
    adminStaffContentT10.includes("staff.phone"),
    "Staff Directory must display saved staff phone number",
  );

  // Verify server API accepts phone
  const serverApiContentT10 = fs.readFileSync(
    path.resolve(process.cwd(), "src/server/api.ts"),
    "utf-8",
  );
  assert.ok(
    serverApiContentT10.includes("phone: body.phone"),
    "Server API /api/admin/staff must forward phone to registerStaffMember",
  );
  console.log("✓ Task 10 verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 18: Task 11 - Customers page shows customers only & deduplicates orders
  // -------------------------------------------------------------------------
  console.log("[18] Verifying Task 11: Customers page shows customers only, deduplicates orders, and displays errors explicitly...");
  const dbContentT11 = fs.readFileSync(path.resolve(process.cwd(), "src/server/db.ts"), "utf-8");
  const customersLibContentT11 = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/customers.ts"),
    "utf-8",
  );
  const adminCustomersContentT11 = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.customers.tsx"),
    "utf-8",
  );

  // 1. getCustomers excludes staff members
  assert.ok(
    dbContentT11.includes('staff_profiles') && dbContentT11.includes('excludedUserIds'),
    "getCustomers in db.ts must query staff_profiles to identify and exclude staff members",
  );
  assert.ok(
    dbContentT11.includes('excludedEmails') && dbContentT11.includes('excludedPhones'),
    "getCustomers in db.ts must check excludedEmails and excludedPhones",
  );

  // 2. Deduplicates orders inside each customer record
  assert.ok(
    dbContentT11.includes("seenOrderIds") && dbContentT11.includes("deduplicatedOrders"),
    "getCustomers in db.ts must deduplicate orders by order.id",
  );
  assert.ok(
    customersLibContentT11.includes("seenOrderIds"),
    "normalizeCustomerRecord in customers.ts must deduplicate raw orders by order.id",
  );

  // 3. Error propagation (not swallowed as empty list)
  assert.ok(
    dbContentT11.includes("throw new Error(`Failed to load customer profiles: ${error.message}`);"),
    "getCustomers in db.ts must throw on error rather than returning []",
  );
  assert.ok(
    adminCustomersContentT11.includes("Failed to load customer profiles"),
    "admin.customers.tsx must have an explicit error state",
  );
  assert.ok(
    adminCustomersContentT11.includes("Retry connection"),
    "admin.customers.tsx must have a retry button on query error",
  );
  console.log("✓ Task 11 verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 19: Task 12 - Website Content image replacement and UUID fix
  // -------------------------------------------------------------------------
  console.log("[19] Verifying Task 12: Website Content image replacement and UUID handling...");
  const siteImagesContentT12 = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/site-images.ts"),
    "utf-8",
  );
  const { SITE_IMAGES_BUCKET, extractSiteImageStoragePath } = await import("../src/lib/site-images");
  const { isValidUUID } = await import("../src/lib/content");
  const { getAboutContent, updateAboutContent } = await import("../src/server/db");

  assert.strictEqual(
    SITE_IMAGES_BUCKET,
    "product-images",
    "SITE_IMAGES_BUCKET must point to the verified existing public bucket 'product-images'",
  );
  assert.ok(
    siteImagesContentT12.includes("content/${category}/"),
    "Site images upload path must save under content/ path in product-images bucket",
  );

  // Test extractSiteImageStoragePath with product-images URL
  const testUrl = "https://mock-supabase.co/storage/v1/object/public/product-images/content/homepage/test-hero.webp";
  const extractedPath = extractSiteImageStoragePath(testUrl);
  assert.strictEqual(
    extractedPath,
    "content/homepage/test-hero.webp",
    "extractSiteImageStoragePath must accurately extract path from product-images bucket URL",
  );

  // UUID Validation
  assert.strictEqual(isValidUUID("028a78ee-094c-4334-8512-8697b747a674"), true, "Valid UUID must return true");
  assert.strictEqual(isValidUUID("**"), false, "Invalid ID '**' must return false");
  assert.strictEqual(isValidUUID("1"), false, "Invalid integer ID '1' must return false");
  assert.strictEqual(isValidUUID(""), false, "Empty string must return false");
  assert.strictEqual(isValidUUID(undefined), false, "Undefined must return false");

  // Verify getAboutContent returns string UUID
  const currentAbout = await getAboutContent();
  assert.ok(
    isValidUUID(currentAbout.id),
    `getAboutContent must return a record with a valid UUID, received: ${currentAbout.id}`,
  );

  // Verify updateAboutContent rejects malformed ID with clear validation error
  let rejectedError = "";
  try {
    await updateAboutContent({ id: "**" as any });
  } catch (err: any) {
    rejectedError = err.message;
  }
  assert.ok(
    rejectedError.includes('invalid content record ID "**"'),
    `updateAboutContent must reject invalid ID '**' with clear validation message, got: ${rejectedError}`,
  );

  // Verify UI preserves and validates form.id
  const adminContentContentT12 = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.content.tsx"),
    "utf-8",
  );
  assert.ok(
    adminContentContentT12.includes("id: form.id"),
    "admin.content.tsx must include form.id in the update payload",
  );
  assert.ok(
    adminContentContentT12.includes("isValidUUID(form.id)"),
    "admin.content.tsx must validate form.id with isValidUUID",
  );

  // Verify server/api.ts validates body.id
  const serverApiContentT12 = fs.readFileSync(
    path.resolve(process.cwd(), "src/server/api.ts"),
    "utf-8",
  );
  assert.ok(
    serverApiContentT12.includes("isValidUUID(idStr)"),
    "server/api.ts must validate body.id with isValidUUID",
  );

  console.log("✓ Task 12 verified successfully!\n");

  // -------------------------------------------------------------------------
  // Test 20: Task 13 - Messages page customer-message fetching
  // -------------------------------------------------------------------------
  console.log("[20] Verifying Task 13: Customer message fetching for /admin/contact-messages...");
  const serverApiContentT13 = fs.readFileSync(
    path.resolve(process.cwd(), "src/server/api.ts"),
    "utf-8",
  );
  const adminContactMessagesContentT13 = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/admin.contact-messages.tsx"),
    "utf-8",
  );
  const { getContactMessages } = await import("../src/server/db");
  const { serverSupabase } = await import("../src/server/supabase");

  // 1. Server API supports contact messages endpoints with error handling and fallback
  assert.ok(
    serverApiContentT13.includes('pathname === "/api/contact-messages" || pathname === "/api/admin/contact-messages"'),
    "server api must match both /api/contact-messages and /api/admin/contact-messages",
  );
  assert.ok(
    serverApiContentT13.includes("getContactMessages(serverSupabase)"),
    "server api must use serverSupabase after verified authorization",
  );
  assert.ok(
    serverApiContentT13.includes("createContactMessage(") && serverApiContentT13.includes("serverSupabase"),
    "server api must pass serverSupabase to createContactMessage for public contact form",
  );

  // 2. Fetch real messages from database
  const contactMessages = await getContactMessages(serverSupabase);
  assert.ok(
    Array.isArray(contactMessages),
    "getContactMessages must return an array of messages",
  );
  assert.ok(
    contactMessages.length > 0,
    `getContactMessages must retrieve existing customer messages from database, found: ${contactMessages.length}`,
  );
  assert.ok(
    contactMessages[0].name && contactMessages[0].email && contactMessages[0].message,
    "Messages must contain customer name, email, and message body",
  );

  // 3. UI handles loading, empty, and query error states distinctly
  assert.ok(
    adminContactMessagesContentT13.includes("Loading contact messages from Supabase"),
    "admin.contact-messages.tsx must display distinct loading state",
  );
  assert.ok(
    adminContactMessagesContentT13.includes("Failed to load contact messages"),
    "admin.contact-messages.tsx must display explicit error state with retry",
  );
  assert.ok(
    adminContactMessagesContentT13.includes("No contact messages yet"),
    "admin.contact-messages.tsx must display distinct empty list state",
  );
  console.log("✓ Task 13 verified successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
