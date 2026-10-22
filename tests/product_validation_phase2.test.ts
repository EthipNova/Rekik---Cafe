/**
 * ============================================================================
 * Rekik Café — Phase 2: Isolated Product Validation & Security Unit Tests
 * File: tests/product_validation_phase2.test.ts
 * ============================================================================
 * Scope:
 * 1. Product input validation (blank names, null categories, negative prices, slug generation).
 * 2. Precision PostgreSQL database error mapping (23505, 23514, 23502, 23503, 42501).
 * 3. Storage path isolation, URL parsing, and static asset protection.
 * 4. Product deletion safety & decoupled storage cleanup semantics.
 *
 * Safety:
 * Pure in-memory unit tests. Does NOT connect to or mutate the production database,
 * does NOT alter live staff accounts, and does NOT delete live storage objects.
 * ============================================================================
 */

import assert from "node:assert/strict";
import {
  generateSlug,
  generateProductId,
  mapProductDatabaseError,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
} from "../src/lib/products";
import {
  extractStoragePathFromUrl,
  isProductSpecificStoragePath,
  isStaticAssetPath,
  deleteProductImageFromStorage,
  PRODUCT_IMAGES_BUCKET,
} from "../src/lib/product-images";

console.log("==========================================================");
console.log("RUNNING PHASE 2 ISOLATED UNIT & SECURITY TEST SUITE");
console.log("==========================================================");

async function testProductValidation() {
  console.log("\n[1] Testing Product Input Validation & Slug Generation...");

  // 1. Slug generation
  assert.equal(generateSlug("Classic Burger"), "classic-burger");
  assert.equal(generateSlug("  Tibs & Rice (Special)!  "), "tibs-rice-special");
  assert.equal(generateSlug("Macchiato 100%"), "macchiato-100");
  assert.equal(generateSlug(""), "");
  console.log("✓ generateSlug produces clean URL slugs.");

  // 2. Product ID generation
  const id1 = generateProductId();
  const id2 = generateProductId();
  assert.notEqual(id1, id2);
  assert.match(
    id1,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Generated ID must be a valid RFC 4122 v4 UUID",
  );
  console.log("✓ generateProductId creates unique UUIDs.");

  // 3. createAdminProduct rejects empty/whitespace names before network call
  const emptyNameRes = await createAdminProduct({
    name: "    ",
    price: 100,
    categoryId: "cat-1",
  });
  assert.equal(emptyNameRes.data, null);
  assert.match(emptyNameRes.error?.message || "", /cannot be empty/i);
  console.log("✓ Empty/whitespace name rejected by client validation.");

  // 4. createAdminProduct rejects empty categoryId before network call
  const emptyCatRes = await createAdminProduct({
    name: "Valid Name",
    price: 100,
    categoryId: "   ",
  });
  assert.equal(emptyCatRes.data, null);
  assert.match(emptyCatRes.error?.message || "", /category/i);
  console.log("✓ Empty category rejected by client validation.");

  // 5. createAdminProduct rejects negative prices before network call
  const negPriceRes = await createAdminProduct({
    name: "Negative Price Item",
    price: -15,
    categoryId: "cat-1",
  });
  assert.equal(negPriceRes.data, null);
  assert.match(negPriceRes.error?.message || "", /greater than or equal to 0/i);
  console.log("✓ Negative price rejected by client validation.");

  // 6. updateAdminProduct rejects invalid inputs before network call
  const updateNegRes = await updateAdminProduct({
    id: id1,
    name: "Valid",
    price: -1,
    categoryId: "cat-1",
  });
  assert.equal(updateNegRes.data, null);
  assert.match(updateNegRes.error?.message || "", /greater than or equal to 0/i);
  console.log("✓ Update negative price rejected by client validation.");
}

function testDatabaseErrorMapping() {
  console.log("\n[2] Testing Precision Database Error Mapping...");

  // Unique constraint: slug collision
  const errSlug = mapProductDatabaseError({
    code: "23505",
    message: 'duplicate key value violates unique constraint "products_slug_key"',
    details: "Key (slug)=(classic-burger) already exists.",
  });
  assert.match(errSlug.message, /already exists \(duplicate url slug\)/i);
  console.log(`✓ 23505 slug collision translated: "${errSlug.message}"`);

  // Unique constraint: primary key ID collision
  const errPkey = mapProductDatabaseError({
    code: "23505",
    message: 'duplicate key value violates unique constraint "products_pkey"',
    details: "Key (id)=(...) already exists.",
  });
  assert.match(errPkey.message, /unique id already exists/i);
  console.log(`✓ 23505 primary key collision translated: "${errPkey.message}"`);

  // Check constraint: price negative
  const errPrice = mapProductDatabaseError({
    code: "23514",
    message: 'new row for relation "products" violates check constraint "products_price_check"',
  });
  assert.match(errPrice.message, /greater than or equal to 0/i);
  console.log(`✓ 23514 price check translated: "${errPrice.message}"`);

  // Check constraint: empty name
  const errEmptyName = mapProductDatabaseError({
    code: "23514",
    message: 'new row for relation "products" violates check constraint "products_name_not_empty"',
  });
  assert.match(errEmptyName.message, /name cannot be empty/i);
  console.log(`✓ 23514 empty name check translated: "${errEmptyName.message}"`);

  // NOT NULL constraint: category_id
  const errNullCat = mapProductDatabaseError({
    code: "23502",
    message:
      'null value in column "category_id" of relation "products" violates not-null constraint',
  });
  assert.match(errNullCat.message, /valid product category/i);
  console.log(`✓ 23502 not-null category translated: "${errNullCat.message}"`);

  // Foreign Key constraint: category missing on insert
  const errFkCat = mapProductDatabaseError(
    {
      code: "23503",
      message:
        'insert or update on table "products" violates foreign key constraint "products_category_id_fkey"',
      details: 'Key (category_id)=(9999) is not present in table "categories".',
    },
    "create",
  );
  assert.match(errFkCat.message, /category does not exist/i);
  console.log(`✓ 23503 category foreign key translated: "${errFkCat.message}"`);

  // Foreign Key constraint: product deletion blocked by inventory or order items
  const errFkDelete = mapProductDatabaseError(
    {
      code: "23503",
      message:
        'update or delete on table "products" violates foreign key constraint "stock_movements_product_id_fkey"',
      details: 'Key (id)=(...) is still referenced from table "stock_movements".',
    },
    "delete",
  );
  assert.match(errFkDelete.message, /referenced in inventory tracking or customer order history/i);
  console.log(`✓ 23503 delete restriction translated: "${errFkDelete.message}"`);

  // RLS 42501 Insufficient Privileges
  const errRls = mapProductDatabaseError({
    code: "42501",
    message: 'new row violates row-level security policy for table "products"',
  });
  assert.match(errRls.message, /access denied/i);
  console.log(`✓ 42501 RLS denial translated: "${errRls.message}"`);
}

function testStorageUrlAndPathValidation() {
  console.log("\n[3] Testing Storage URL Parsing & Product Path Safety...");

  // 1. Static bundled asset detection
  assert.equal(isStaticAssetPath("/images/food/burger.jpg"), true);
  assert.equal(isStaticAssetPath("images/placeholder.png"), true);
  assert.equal(isStaticAssetPath("/assets/logo.svg"), true);
  assert.equal(
    isStaticAssetPath(
      "https://imqtqshcgvgxokojfgxv.supabase.co/storage/v1/object/public/product-images/products/p1/img.webp",
    ),
    false,
  );
  console.log("✓ Static bundled assets correctly distinguished from storage objects.");

  // 2. URL path extraction
  const publicUrl = `https://imqtqshcgvgxokojfgxv.supabase.co/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/products/prod-123/img-abc.webp?t=123456`;
  const extracted = extractStoragePathFromUrl(publicUrl);
  assert.equal(extracted, "products/prod-123/img-abc.webp");
  console.log(`✓ extractStoragePathFromUrl parsed clean path: "${extracted}"`);

  // 3. Static and external URLs return null in extractStoragePathFromUrl
  assert.equal(extractStoragePathFromUrl("/images/coffee.jpg"), null);
  assert.equal(extractStoragePathFromUrl("https://images.unsplash.com/photo-123"), null);
  console.log("✓ Non-bucket and static URLs safely return null.");

  // 4. Product-specific path boundary validation
  const validPath = "products/prod-123/image-001.webp";
  assert.equal(isProductSpecificStoragePath(validPath, "prod-123"), true);
  assert.equal(isProductSpecificStoragePath(validPath), true);

  // Rejects path for different product
  assert.equal(isProductSpecificStoragePath(validPath, "different-prod"), false);

  // Rejects path traversal attempts
  assert.equal(isProductSpecificStoragePath("products/../avatars/user.jpg"), false);
  assert.equal(isProductSpecificStoragePath("products/prod-123/../../secrets.env"), false);
  assert.equal(isProductSpecificStoragePath("products\\prod-123\\image.png"), false);

  // Rejects files in bucket root or non-product directories
  assert.equal(isProductSpecificStoragePath("root-file.png"), false);
  assert.equal(isProductSpecificStoragePath("categories/cat-1.png"), false);
  assert.equal(isProductSpecificStoragePath("products/prod-123"), false);

  console.log("✓ isProductSpecificStoragePath strictly enforces product directory boundaries.");
}

async function testDeletionSafetyContracts() {
  console.log("\n[4] Testing Product Deletion Safety Contracts...");

  // 1. deleteAdminProduct rejects empty product ID
  const emptyDelete = await deleteAdminProduct("   ");
  assert.equal(emptyDelete.success, false);
  assert.match(emptyDelete.error?.message || "", /valid product id is required/i);
  console.log("✓ deleteAdminProduct rejects empty product ID without touching DB.");

  // 2. deleteProductImageFromStorage safely skips static bundled assets
  const staticDelete = await deleteProductImageFromStorage("/images/coffee.jpg", "prod-1");
  assert.equal(staticDelete.success, true);
  assert.equal(staticDelete.skipped, true);
  assert.equal(staticDelete.error, null);
  console.log("✓ deleteProductImageFromStorage safely skips bundled static assets.");

  // 3. deleteProductImageFromStorage safely skips external URLs
  const externalDelete = await deleteProductImageFromStorage(
    "https://external.com/photo.png",
    "prod-1",
  );
  assert.equal(externalDelete.success, true);
  assert.equal(externalDelete.skipped, true);
  assert.equal(externalDelete.error, null);
  console.log("✓ deleteProductImageFromStorage safely skips external URLs.");

  // 4. deleteProductImageFromStorage blocks path tampering
  const traversalDelete = await deleteProductImageFromStorage(
    "products/prod-1/../../malicious.png",
    "prod-1",
  );
  assert.equal(traversalDelete.success, false);
  assert.match(traversalDelete.error?.message || "", /refusing to delete/i);
  console.log("✓ deleteProductImageFromStorage blocks directory traversal attempts.");
}

async function main() {
  await testProductValidation();
  testDatabaseErrorMapping();
  testStorageUrlAndPathValidation();
  await testDeletionSafetyContracts();

  console.log("\n==========================================================");
  console.log("ALL PHASE 2 ISOLATED UNIT & SECURITY TESTS PASSED!");
  console.log("==========================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
