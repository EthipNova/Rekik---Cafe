/**
 * ============================================================================
 * Rekik Café — Category Cover Images Integration Test
 * File: tests/category_cover_images.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";

// Polyfill window & localStorage for Node test runner before importing supabase
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => {
    mockStorage[key] = String(val);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  },
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: (i: number) => Object.keys(mockStorage)[i] ?? null,
};

(globalThis as any).window = {
  location: { pathname: "/admin/categories" },
  localStorage: mockLocalStorage,
};
(globalThis as any).localStorage = mockLocalStorage;

import {
  PRODUCT_IMAGES_BUCKET,
  MAX_IMAGE_SIZE_BYTES,
  validateProductImageFile,
  extractStoragePathFromUrl,
  isCategorySpecificStoragePath,
  uploadCategoryImage,
  deleteCategoryImageFromStorage,
} from "../src/lib/product-images";
import {
  fetchAdminCategories as fetchLibCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
} from "../src/lib/categories";
import { fetchAdminCategories as fetchProductLibCategories } from "../src/lib/products";
import { getCategories } from "../src/server/db";
import { supabase, adminSupabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";

console.log("==================================================");
console.log("RUNNING REKIK CAFÉ CATEGORY COVER IMAGES TEST");
console.log("==================================================");

async function run() {
  // ── [1] Test File Validation & Storage Path Helpers ───────────────────────────
  console.log("\n[1] Testing validateProductImageFile() & Category Storage Path Helpers...");

  // Valid JPEG file
  const validJpeg = new File([new Uint8Array(1024)], "coffee-cover.jpg", { type: "image/jpeg" });
  assert.deepEqual(validateProductImageFile(validJpeg), { valid: true });

  // Valid PNG file
  const validPng = new File([new Uint8Array(2048)], "juice-cover.png", { type: "image/png" });
  assert.deepEqual(validateProductImageFile(validPng), { valid: true });

  // Valid WEBP file
  const validWebp = new File([new Uint8Array(512)], "dessert-cover.webp", { type: "image/webp" });
  assert.deepEqual(validateProductImageFile(validWebp), { valid: true });

  // Invalid MIME type (SVG)
  const invalidSvg = new File([new Uint8Array(1024)], "vector.svg", { type: "image/svg+xml" });
  const svgValidation = validateProductImageFile(invalidSvg);
  assert.equal(svgValidation.valid, false);
  assert.ok(svgValidation.error?.includes("JPG, PNG, and WEBP"));

  // Oversized File (> 5MB)
  const oversizedBuffer = new Uint8Array(MAX_IMAGE_SIZE_BYTES + 1024);
  const oversizedFile = new File([oversizedBuffer], "massive.jpg", { type: "image/jpeg" });
  const sizeValidation = validateProductImageFile(oversizedFile);
  assert.equal(sizeValidation.valid, false);
  assert.ok(sizeValidation.error?.includes("5 MB") || sizeValidation.error?.includes("exceeds"));

  console.log("✓ File validation rules passed!");

  // Test storage path extraction and category boundary guards
  const mockCategoryId = "test-cat-123";
  const validCategoryUrl = `https://mockproject.supabase.co/storage/v1/object/public/product-images/categories/${mockCategoryId}/cover-uuid.png`;
  const extractedPath = extractStoragePathFromUrl(validCategoryUrl);
  assert.equal(extractedPath, `categories/${mockCategoryId}/cover-uuid.png`);

  assert.equal(
    isCategorySpecificStoragePath(`categories/${mockCategoryId}/cover-uuid.png`, mockCategoryId),
    true,
    "Valid category path under expected category ID should return true",
  );

  // Boundary check: different category id
  assert.equal(
    isCategorySpecificStoragePath(`categories/different-cat/cover-uuid.png`, mockCategoryId),
    false,
    "Storage path with different category ID must be rejected",
  );

  // Boundary check: root or non-category path
  assert.equal(
    isCategorySpecificStoragePath("categories/", mockCategoryId),
    false,
    "Bare prefix without filename must be rejected",
  );
  assert.equal(
    isCategorySpecificStoragePath(`products/${mockCategoryId}/image.png`, mockCategoryId),
    false,
    "Product path must not be recognized as category path",
  );

  // Boundary check: static assets must never be extracted or deleted
  assert.equal(
    extractStoragePathFromUrl("/assets/coffee.jpg"),
    null,
    "Static assets must return null from extractStoragePathFromUrl",
  );
  assert.equal(
    extractStoragePathFromUrl("https://example.com/external.png"),
    null,
    "External non-Supabase URLs must return null",
  );

  console.log("✓ Storage path helpers and security boundaries verified!");

  // ── [2] Verify fetchAdminCategories from src/lib/categories.ts ────────────────
  console.log("\n[2] Testing fetchAdminCategories() in src/lib/categories.ts...");
  const { data: adminCats, error: adminErr } = await fetchLibCategories();
  assert.equal(adminErr, null, `Fetch admin categories should have no error: ${adminErr?.message}`);
  assert.ok(Array.isArray(adminCats), "Admin categories should be an array");
  assert.ok(adminCats.length > 0, "Should return categories");

  // Verify that all categories have the `imageUrl` property (string or null)
  for (const cat of adminCats) {
    assert.ok(
      "imageUrl" in cat,
      `Category ${cat.name} must have imageUrl property present in AdminCategory`,
    );
    assert.ok(
      cat.imageUrl === null || typeof cat.imageUrl === "string",
      `Category ${cat.name} imageUrl must be string or null, got: ${typeof cat.imageUrl}`,
    );
  }
  console.log(`✓ Verified ${adminCats.length} categories include imageUrl property!`);

  // ── [3] Verify fetchAdminCategories from src/lib/products.ts ──────────────────
  console.log("\n[3] Testing fetchAdminCategories() in src/lib/products.ts...");
  const { data: prodCats, error: prodErr } = await fetchProductLibCategories();
  assert.equal(prodErr, null, `Fetch product categories should have no error: ${prodErr?.message}`);
  assert.ok(Array.isArray(prodCats), "Product categories should be an array");
  for (const cat of prodCats) {
    assert.ok(
      "imageUrl" in cat,
      `Category ${cat.name} must have imageUrl in products.ts Category type`,
    );
  }
  console.log(`✓ Verified ${prodCats.length} categories in products.ts include imageUrl!`);

  // ── [4] Verify getCategories from src/server/db.ts ────────────────────────────
  console.log("\n[4] Testing getCategories() in src/server/db.ts...");
  const dbCats = await getCategories();
  assert.ok(Array.isArray(dbCats), "DB categories should be an array");
  assert.ok(dbCats.length > 0, "DB categories must return items");
  for (const cat of dbCats) {
    assert.ok(
      "imageUrl" in cat,
      `Category ${cat.name} must have imageUrl in db.ts Category return`,
    );
  }
  console.log(`✓ Verified ${dbCats.length} categories in server/db include imageUrl!`);

  // ── [5] Test Database Security & Admin Authenticated CRUD with Cover Image ────
  console.log("\n[5] Testing Database Security & Admin CRUD with Cover Image...");

  // 5a: Anonymous category creation must be rejected by RLS
  const anonTest = await createAdminCategory({
    name: "Unauthorized Category",
    tagline: "Should fail RLS",
  });
  assert.ok(anonTest.error, "Anonymous category insert must be rejected by RLS");
  console.log("✓ Anonymous category creation correctly blocked by RLS!");

  // 5b: Authenticate as Admin Sisay
  console.log("\n[6] Authenticating as Admin Sisay (kbstar77sisay@gmail.com)...");
  const { data: adminLink, error: adminLinkErr } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: "kbstar77sisay@gmail.com",
  });
  assert.equal(adminLinkErr, null, `generateLink error: ${adminLinkErr?.message}`);
  assert.ok(adminLink, "Admin magic link must be generated");

  const { data: adminSession, error: adminAuthErr } = await supabase.auth.verifyOtp({
    token_hash: adminLink.properties.hashed_token,
    type: "magiclink",
  });
  assert.equal(adminAuthErr, null, `verifyOtp error: ${adminAuthErr?.message}`);
  assert.ok(adminSession.session, "Admin session must be established");
  console.log(`✓ Admin session established for: ${adminSession.user?.email}`);

  // 5c: Upload a real category cover image into Supabase storage
  console.log("\n[7] Testing uploadCategoryImage() to Supabase storage...");
  const dummyCatId = `cat-test-${Date.now()}`;
  const png1x1 = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  const sampleFile = new File([png1x1], "category-cover.png", { type: "image/png" });

  const { url: uploadedImageUrl, error: uploadErr } = await uploadCategoryImage(
    dummyCatId,
    sampleFile,
  );
  assert.equal(uploadErr, null, `uploadCategoryImage error: ${uploadErr?.message}`);
  assert.ok(uploadedImageUrl, "uploadCategoryImage should return a public URL");
  assert.ok(
    uploadedImageUrl.includes(PRODUCT_IMAGES_BUCKET),
    "Public URL must contain product-images bucket",
  );
  assert.ok(
    uploadedImageUrl.includes(`categories/${dummyCatId}`),
    "Public URL must contain category storage path",
  );
  console.log(`✓ Cover image uploaded to: ${uploadedImageUrl}`);

  // 5d: Create category with uploaded cover image
  console.log("\n[8] Creating category with cover image...");
  const timestamp = Date.now();
  const testName = `Category ${timestamp}`;
  const { data: created, error: createErr } = await createAdminCategory({
    name: testName,
    tagline: "Special test category for cover image verification",
    imageUrl: uploadedImageUrl,
  });

  assert.equal(createErr, null, `Create category should have no error: ${createErr?.message}`);
  assert.ok(created, "Created category data should not be null");
  assert.equal(created.name, testName);
  assert.equal(created.imageUrl, uploadedImageUrl, "Created category must persist imageUrl");
  const testCatId = created.id;
  console.log(`✓ Category created with ID: ${testCatId} and cover image.`);

  // 5e: Update category (replace image URL and update name)
  console.log("\n[9] Updating category cover image and name...");
  const sampleFile2 = new File([png1x1], "category-cover-2.png", { type: "image/png" });
  const { url: uploadedImageUrl2 } = await uploadCategoryImage(testCatId, sampleFile2);

  const { data: updated, error: updateErr } = await updateAdminCategory({
    id: testCatId,
    name: `${testName} Updated`,
    imageUrl: uploadedImageUrl2,
  });

  assert.equal(updateErr, null, `Update category should have no error: ${updateErr?.message}`);
  assert.ok(updated, "Updated category data should not be null");
  assert.equal(updated.id, testCatId);
  assert.equal(updated.name, `${testName} Updated`);
  assert.equal(updated.imageUrl, uploadedImageUrl2, "Updated category must reflect new imageUrl");
  console.log("✓ Category cover image successfully replaced.");

  // 5f: Update category (remove image URL -> set to null)
  console.log("\n[10] Removing cover image from category...");
  const { data: cleared, error: clearErr } = await updateAdminCategory({
    id: testCatId,
    name: `${testName} Updated`,
    imageUrl: null,
  });

  assert.equal(clearErr, null, `Clear category cover should have no error: ${clearErr?.message}`);
  assert.ok(cleared, "Cleared category data should not be null");
  assert.equal(cleared.id, testCatId);
  assert.equal(cleared.imageUrl, null, "Category imageUrl must be null after removal");
  console.log("✓ Category cover image successfully removed.");

  // 5g: Delete category and test cleanup
  console.log("\n[11] Deleting test category and storage cleanup...");
  const { success: delSuccess, error: delErr } = await deleteAdminCategory(
    testCatId,
    uploadedImageUrl2,
  );
  assert.equal(delErr, null, `Delete category should have no error: ${delErr?.message}`);
  assert.equal(delSuccess, true);

  // Clean up initial test upload
  await deleteCategoryImageFromStorage(uploadedImageUrl, dummyCatId);

  // Confirm category is removed from database
  const { data: checkDeleted } = await serverSupabase
    .from("categories")
    .select("id")
    .eq("id", testCatId)
    .maybeSingle();

  assert.equal(checkDeleted, null, "Category should no longer exist in database");
  console.log("✓ Test category cleanly deleted.");

  await supabase.auth.signOut();
  console.log("\n==================================================");
  console.log("ALL CATEGORY COVER IMAGE TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
