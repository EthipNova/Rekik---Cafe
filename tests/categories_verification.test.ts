/**
 * ============================================================================
 * Rekik Café — Categories Table & Dropdown Verification Test
 * File: tests/categories_verification.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";
import { fetchAdminCategories as fetchProductCategories } from "../src/lib/products";
import { fetchAdminCategories as fetchCategoryPageCategories } from "../src/lib/categories";

console.log("==================================================");
console.log("RUNNING REKIK CAFÉ CATEGORIES INTEGRATION TEST");
console.log("==================================================");

async function run() {
  // 1. Verify fetchAdminCategories from src/lib/products.ts (used by Admin -> Products -> New Product)
  console.log("\n[1] Testing fetchAdminCategories() from src/lib/products.ts...");
  const { data: prodCats, error: prodErr } = await fetchProductCategories();
  assert.equal(prodErr, null, `Product categories fetch should have no error: ${prodErr?.message}`);
  assert.ok(Array.isArray(prodCats), "Product categories should be an array");
  console.log(`Retrieved ${prodCats.length} categories for Admin -> Products dropdown.`);
  assert.equal(prodCats.length, 12, "Should return 12 categories for Admin -> Products dropdown");

  const expectedNames = [
    "Coffee",
    "Espresso",
    "Tea",
    "Juice",
    "Soft Drinks",
    "Breakfast",
    "Burgers",
    "Pizza",
    "Pasta",
    "Sandwiches",
    "Desserts",
    "Combos",
  ];

  for (const name of expectedNames) {
    const found = prodCats.find((c) => c.name === name);
    assert.ok(found, `Expected category "${name}" in products category dropdown list`);
    assert.equal(found.isActive, true, `Category "${name}" should be active`);
    assert.ok(found.tagline.length > 0, `Category "${name}" should have description/tagline`);
  }
  console.log("✓ Admin -> Products dropdown category list verified for all 12 items!");

  // 2. Verify fetchAdminCategories from src/lib/categories.ts (used by Admin -> Categories page)
  console.log("\n[2] Testing fetchAdminCategories() from src/lib/categories.ts...");
  const { data: adminCats, error: adminErr } = await fetchCategoryPageCategories();
  assert.equal(
    adminErr,
    null,
    `Admin categories page fetch should have no error: ${adminErr?.message}`,
  );
  assert.ok(Array.isArray(adminCats), "Admin categories should be an array");
  console.log(`Retrieved ${adminCats.length} categories for Admin -> Categories page.`);
  assert.equal(adminCats.length, 12, "Should return 12 categories for Admin -> Categories page");

  for (const name of expectedNames) {
    const found = adminCats.find((c) => c.name === name);
    assert.ok(found, `Expected category "${name}" in Admin Categories page`);
    assert.equal(found.active, true);
    assert.ok(found.tagline.length > 0);
  }
  console.log(
    "✓ Admin -> Categories page query succeeded with products count join for all 12 items!",
  );

  console.log("\n==================================================");
  console.log("ALL CATEGORY TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
