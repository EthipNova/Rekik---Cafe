/**
 * ============================================================================
 * Rekik Café — Product Image Upload & Storage Verification Test
 * File: tests/product_image_upload.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";
import {
  PRODUCT_IMAGES_BUCKET,
  MAX_IMAGE_SIZE_BYTES,
  validateProductImageFile,
} from "../src/lib/product-images";
import {
  fetchAdminProducts,
  fetchAdminCategories,
  createAdminProduct,
  updateAdminProduct,
  generateProductId,
} from "../src/lib/products";
import { supabase } from "../src/lib/supabase";
import { serverSupabase } from "../src/server/supabase";

console.log("==================================================");
console.log("RUNNING REKIK CAFÉ PRODUCT IMAGE UPLOAD & RLS TEST");
console.log("==================================================");

async function run() {
  // ── [1] Test File Validation Logic ───────────────────────────────────────────
  console.log("\n[1] Testing validateProductImageFile()...");

  // Valid JPEG
  const validJpeg = new File([new Uint8Array(1024)], "coffee.jpg", { type: "image/jpeg" });
  assert.deepEqual(validateProductImageFile(validJpeg), { valid: true });

  // Valid PNG
  const validPng = new File([new Uint8Array(2048)], "burger.png", { type: "image/png" });
  assert.deepEqual(validateProductImageFile(validPng), { valid: true });

  // Valid WEBP
  const validWebp = new File([new Uint8Array(512)], "pastry.webp", { type: "image/webp" });
  assert.deepEqual(validateProductImageFile(validWebp), { valid: true });

  // Invalid MIME type (GIF)
  const invalidGif = new File([new Uint8Array(1024)], "anim.gif", { type: "image/gif" });
  const gifValidation = validateProductImageFile(invalidGif);
  assert.equal(gifValidation.valid, false);
  assert.ok(gifValidation.error?.includes("JPG, PNG, and WEBP"));

  // Invalid MIME type (PDF)
  const invalidPdf = new File([new Uint8Array(1024)], "menu.pdf", { type: "application/pdf" });
  const pdfValidation = validateProductImageFile(invalidPdf);
  assert.equal(pdfValidation.valid, false);

  // Oversized File (> 5MB)
  const oversizedBuffer = new Uint8Array(MAX_IMAGE_SIZE_BYTES + 1024);
  const oversizedFile = new File([oversizedBuffer], "huge.png", { type: "image/png" });
  const sizeValidation = validateProductImageFile(oversizedFile);
  assert.equal(sizeValidation.valid, false);
  assert.ok(sizeValidation.error?.includes("exceeds"));

  console.log("✓ File validation rules strictly enforce allowed MIME types and 5MB limit!");

  // ── [2] Verify Bucket Configuration ──────────────────────────────────────────
  console.log("\n[2] Verifying Supabase Storage Bucket Configuration...");
  assert.equal(PRODUCT_IMAGES_BUCKET, "product-images", "Bucket name must be 'product-images'");

  const { data: bucket, error: bucketErr } =
    await supabase.storage.getBucket(PRODUCT_IMAGES_BUCKET);
  assert.equal(bucketErr, null, `getBucket error: ${bucketErr?.message}`);
  assert.ok(bucket, "Bucket must exist in Supabase Storage");
  assert.equal(bucket.id, "product-images", "Bucket ID must match");
  assert.equal(bucket.public, true, "Bucket must be configured as public for menu item images");
  assert.equal(bucket.file_size_limit, 5242880, "File size limit must be 5MB (5242880 bytes)");
  console.log(
    `✓ Bucket "${bucket.id}" is present, public=${bucket.public}, size_limit=${bucket.file_size_limit}`,
  );

  // ── [3] Test Storage Security: Anonymous Upload Must Be Rejected ────────────
  console.log("\n[3] Testing Storage Security: Anonymous upload rejection...");
  const png1x1 = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  const { error: anonUploadErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload("unauthorized-test.png", png1x1, {
      contentType: "image/png",
    });

  assert.ok(anonUploadErr, "Anonymous upload must fail due to RLS");
  assert.ok(
    anonUploadErr.message.includes("row-level security") ||
      (anonUploadErr as any).statusCode === "403",
    `Expected RLS denial, got: ${anonUploadErr.message}`,
  );
  console.log("✓ Anonymous upload correctly blocked by Supabase Storage RLS!");

  // ── [4] Test Database Security: Customer Insert Must Be Rejected ───────────
  console.log("\n[4] Testing Database Security: Customer product insert rejection...");
  // Sign in as customer alemu00@gmail.com
  const { data: custLink } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: "alemu00@gmail.com",
  });
  if (custLink) {
    const { data: custSession } = await supabase.auth.verifyOtp({
      token_hash: custLink.properties.hashed_token,
      type: "magiclink",
    });
    assert.ok(custSession.session, "Customer session established for testing RLS");

    const { error: custInsertErr } = await (supabase.from("products" as any) as any).insert({
      id: generateProductId(),
      name: "Unauthorized Customer Product",
      slug: `unauthorized-${Date.now()}`,
      price: 50,
      is_available: true,
    });

    assert.ok(custInsertErr, "Customer insert must be rejected by products RLS");
    assert.ok(
      custInsertErr.message.includes("row-level security") || custInsertErr.code === "42501",
      `Expected 42501 RLS violation, got: ${custInsertErr.message}`,
    );
    console.log("✓ Customer product insert correctly blocked by products RLS (42501)!");

    await supabase.auth.signOut();
  }

  // ── [5] Test Authorized Staff Upload & Product Creation (Admin Sisay) ────────
  console.log("\n[5] Authenticating Admin user (Admin Sisay)...");
  const { data: adminLink, error: adminLinkErr } = await serverSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: "kbstar77sisay@gmail.com",
  });
  assert.equal(adminLinkErr, null, `generateLink error: ${adminLinkErr?.message}`);

  const { data: adminSession, error: adminAuthErr } = await supabase.auth.verifyOtp({
    token_hash: adminLink.properties.hashed_token,
    type: "magiclink",
  });
  assert.equal(adminAuthErr, null, `verifyOtp error: ${adminAuthErr?.message}`);
  assert.ok(adminSession.session, "Session must be established for admin user");
  console.log(`✓ Authenticated session established for: ${adminSession.user?.email}`);

  const testProductId = generateProductId();
  const testFileName = `products/${testProductId}/verification-${Date.now()}.png`;

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(testFileName, png1x1, {
      contentType: "image/png",
      upsert: true,
    });

  assert.equal(uploadErr, null, `Staff upload failed: ${uploadErr?.message}`);
  assert.ok(uploadData?.path, "Upload must return storage path");
  console.log(`✓ Image uploaded successfully to storage path: ${uploadData.path}`);

  const { data: publicUrlData } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(uploadData.path);
  const imageUrl = publicUrlData.publicUrl;
  assert.ok(imageUrl.includes(PRODUCT_IMAGES_BUCKET), "Public URL must reference the bucket");
  console.log(`✓ Generated public image URL: ${imageUrl}`);

  // Verify public HTTP download of the uploaded image
  const fetchResp = await fetch(imageUrl);
  assert.equal(
    fetchResp.status,
    200,
    `Image URL should return HTTP 200 OK, got ${fetchResp.status}`,
  );
  console.log("✓ Public HTTP GET on uploaded image succeeded (HTTP 200 OK)");

  const { data: categories } = await fetchAdminCategories();
  assert.ok(categories && categories.length > 0, "Categories must be available");
  const targetCategory = categories[0];

  const testProductName = `Admin Product ${Date.now()}`;
  const { data: createdProduct, error: createErr } = await createAdminProduct(
    {
      id: testProductId,
      name: testProductName,
      price: 180,
      categoryId: targetCategory.id,
      imageUrl: imageUrl,
      description: "Automated test item for image upload verification.",
    },
    categories,
  );

  assert.equal(createErr, null, `Product creation failed: ${createErr?.message}`);
  assert.ok(createdProduct, "Created product should be returned");
  assert.equal(createdProduct.id, testProductId);
  assert.equal(createdProduct.name, testProductName);
  assert.equal(createdProduct.image, imageUrl, "Product must store the exact uploaded image URL");
  console.log(
    `✓ Product created successfully in DB (ID: ${createdProduct.id}) with image: ${createdProduct.image}`,
  );

  // Test product update (editing)
  const { data: updatedProduct, error: updateErr } = await updateAdminProduct(
    {
      id: testProductId,
      name: `${testProductName} (Updated)`,
      price: 195,
      categoryId: targetCategory.id,
      imageUrl: imageUrl,
      description: "Updated description for verification.",
    },
    categories,
  );
  assert.equal(updateErr, null, `Product update failed: ${updateErr?.message}`);
  assert.ok(updatedProduct, "Updated product should be returned");
  assert.equal(updatedProduct.price, 195);
  console.log("✓ Product update (edit) succeeded via RLS policy!");

  // Verify Product Listing
  const { data: allProducts, error: listErr } = await fetchAdminProducts();
  assert.equal(listErr, null, `Fetch products failed: ${listErr?.message}`);
  const found = allProducts?.find((p) => p.id === testProductId);
  assert.ok(found, "Newly created product must appear in admin products listing");
  assert.equal(found.image, imageUrl, "Listing record must have the image URL");
  console.log("✓ Product verified in admin listing with correct thumbnail image URL!");

  // Clean up admin product and storage
  await (supabase.from("products" as any) as any).delete().eq("id", testProductId);
  await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([testFileName]);
  await supabase.auth.signOut();
  console.log("✓ Cleaned up admin test product and storage object.");

  // ── [6] Test Authorized Cashier Account (Rekik staff_profiles) ─────────────
  console.log("\n[6] Authenticating Cashier user (cashier@rekikcafe.com)...");
  const { data: cashierLink, error: cashierLinkErr } = await serverSupabase.auth.admin.generateLink(
    {
      type: "magiclink",
      email: "cashier@rekikcafe.com",
    },
  );
  assert.equal(cashierLinkErr, null, `generateLink error: ${cashierLinkErr?.message}`);

  const { data: cashierSession, error: cashierAuthErr } = await supabase.auth.verifyOtp({
    token_hash: cashierLink.properties.hashed_token,
    type: "magiclink",
  });
  assert.equal(cashierAuthErr, null, `verifyOtp error: ${cashierAuthErr?.message}`);
  assert.ok(cashierSession.session, "Session must be established for cashier");
  console.log(`✓ Authenticated session established for cashier: ${cashierSession.user?.email}`);

  const cashierProductId = generateProductId();
  const cashierFileName = `products/${cashierProductId}/cashier-test-${Date.now()}.png`;

  const { data: cashierUpload, error: cashierUploadErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(cashierFileName, png1x1, { contentType: "image/png" });

  assert.equal(
    cashierUploadErr,
    null,
    `Cashier storage upload failed: ${cashierUploadErr?.message}`,
  );
  console.log(`✓ Cashier image uploaded successfully to storage: ${cashierUpload?.path}`);

  const { data: cashierUrlData } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(cashierUpload.path);

  const { data: cashierProduct, error: cashierProdErr } = await createAdminProduct(
    {
      id: cashierProductId,
      name: `Cashier Item ${Date.now()}`,
      price: 95,
      categoryId: targetCategory.id,
      imageUrl: cashierUrlData.publicUrl,
      description: "Item created by cashier staff profile.",
    },
    categories,
  );

  assert.equal(cashierProdErr, null, `Cashier product creation failed: ${cashierProdErr?.message}`);
  assert.ok(cashierProduct, "Cashier created product should be returned");
  console.log(`✓ Cashier product created successfully in DB (ID: ${cashierProduct.id})`);

  // Clean up cashier product and storage
  await (supabase.from("products" as any) as any).delete().eq("id", cashierProductId);
  await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([cashierFileName]);
  await supabase.auth.signOut();
  console.log("✓ Cleaned up cashier test product and storage object.");

  console.log("\n==================================================");
  console.log("ALL PRODUCT IMAGE UPLOAD & RLS TESTS PASSED!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
