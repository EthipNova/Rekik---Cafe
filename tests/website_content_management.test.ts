/**
 * ============================================================================
 * Rekik Café — Website Content Management (CMS) Test Suite
 * File: tests/website_content_management.test.ts
 * ============================================================================
 */

import assert from "node:assert/strict";

// Polyfill window & localStorage for Node test runner
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
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  },
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: (i: number) => Object.keys(mockStorage)[i] ?? null,
};

(globalThis as any).window = {
  location: { pathname: "/admin/content" },
  localStorage: mockLocalStorage,
};
(globalThis as any).localStorage = mockLocalStorage;

import { serverSupabase } from "../src/server/supabase";
import { handleApiRequest, DESIGNATED_ADMIN_ID } from "../src/server/api";
import { getAboutContent, updateAboutContent, getSettings, updateSettings } from "../src/server/db";
import { DEFAULT_ABOUT_CONTENT, normalizeAboutContent } from "../src/lib/content";
import { validateSiteImageFile, MAX_SITE_IMAGE_SIZE_BYTES } from "../src/lib/site-images";

console.log("================================================================================");
console.log("REKIK CAFÉ: WEBSITE CONTENT MANAGEMENT (CMS) VERIFICATION SUITE");
console.log("================================================================================");

async function run() {
  // ── [1] Test Content Retrieval & Fallback Architecture ─────────────────────
  console.log("\n[1] Testing getAboutContent() & Content Normalization...");
  const initialContent = await getAboutContent();
  assert.ok(initialContent, "getAboutContent() must return a content object");
  assert.ok(typeof initialContent.homepage_hero_title === "string", "Must have homepage_hero_title");
  assert.ok(typeof initialContent.homepage_hero_subtitle === "string", "Must have homepage_hero_subtitle");
  assert.ok(typeof initialContent.about_title === "string", "Must have about_title");
  assert.ok(typeof initialContent.about_description === "string", "Must have about_description");
  assert.ok(typeof initialContent.story_title === "string", "Must have story_title");
  assert.ok(typeof initialContent.story_content === "string", "Must have story_content");
  console.log(`✓ Initial homepage hero title: "${initialContent.homepage_hero_title}"`);
  console.log(`✓ Initial about page title: "${initialContent.about_title}"`);

  // Verify normalization fallback on empty/null input
  const normalizedFallback = normalizeAboutContent(null);
  assert.equal(
    normalizedFallback.homepage_hero_title,
    DEFAULT_ABOUT_CONTENT.homepage_hero_title,
    "Null content should fallback to default homepage hero title",
  );
  console.log("✓ Empty content gracefully resolves to default fallback without crashing.");

  // ── [2] Test Security: Non-Admin Rejection ──────────────────────────────────
  console.log("\n[2] Testing Security: Non-Admin PUT /api/content Rejection...");

  // Anonymous request
  const anonReq = new Request("http://localhost:3000/api/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ about_title: "Unauthorized Hack" }),
  });
  const anonRes = await handleApiRequest(anonReq);
  assert.ok(
    anonRes.status === 401 || anonRes.status === 403,
    `Anonymous PUT /api/content must be blocked (status: ${anonRes.status})`,
  );
  console.log(`✓ Anonymous user blocked with HTTP ${anonRes.status}`);

  // Fake customer token
  const customerReq = new Request("http://localhost:3000/api/content", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer fake-customer-token",
    },
    body: JSON.stringify({ about_title: "Unauthorized Customer Edit" }),
  });
  const customerRes = await handleApiRequest(customerReq);
  assert.ok(
    customerRes.status === 401 || customerRes.status === 403,
    `Customer PUT /api/content must be blocked (status: ${customerRes.status})`,
  );
  console.log(`✓ Customer role blocked with HTTP ${customerRes.status}`);

  // ── [3] Test Homepage Hero Content Update ──────────────────────────────────
  console.log("\n[3] Testing Homepage Hero Update (Title, Subtitle, Image)...");
  const testHeroTitle = "Welcome to Rekik Café — Hawassa Heritage";
  const testHeroSubtitle = "Handcrafted coffee, stone-baked pizza, and effortless digital ordering.";
  const testHeroImage = "https://imqtqshcgvgxokojfgxv.supabase.co/storage/v1/object/public/product-images/content/homepage/test-hero.jpg";

  const updatedHero = await updateAboutContent({
    homepage_hero_title: testHeroTitle,
    homepage_hero_subtitle: testHeroSubtitle,
    homepage_hero_image: testHeroImage,
  });

  assert.equal(updatedHero.homepage_hero_title, testHeroTitle, "Hero title must match updated value");
  assert.equal(updatedHero.homepage_hero_subtitle, testHeroSubtitle, "Hero subtitle must match updated value");
  assert.equal(updatedHero.homepage_hero_image, testHeroImage, "Hero image must match updated value");

  // Re-fetch to ensure persistence
  const reloadedHero = await getAboutContent();
  assert.equal(reloadedHero.homepage_hero_title, testHeroTitle, "Persisted hero title must be retrievable");
  assert.equal(reloadedHero.homepage_hero_subtitle, testHeroSubtitle, "Persisted hero subtitle must be retrievable");
  assert.equal(reloadedHero.homepage_hero_image, testHeroImage, "Persisted hero image must be retrievable");
  console.log(`✓ Homepage hero successfully updated and persisted: "${reloadedHero.homepage_hero_title}"`);

  // ── [4] Test About Us Content Update ───────────────────────────────────────
  console.log("\n[4] Testing About Us Content Update (Title, Description, Values)...");
  const testAboutTitle = "Our Community Café, Modernised";
  const testAboutDesc = "Rekik Café combines traditional Ethiopian hospitality with modern online ordering.";
  const testStoryTitle = "Roots in Hawassa";

  const updatedAbout = await updateAboutContent({
    about_title: testAboutTitle,
    about_description: testAboutDesc,
    story_title: testStoryTitle,
  });

  assert.equal(updatedAbout.about_title, testAboutTitle);
  assert.equal(updatedAbout.about_description, testAboutDesc);
  assert.equal(updatedAbout.story_title, testStoryTitle);

  const reloadedAbout = await getAboutContent();
  assert.equal(reloadedAbout.about_title, testAboutTitle);
  assert.equal(reloadedAbout.story_title, testStoryTitle);
  console.log(`✓ About page content updated and verified: "${reloadedAbout.about_title}"`);

  // ── [5] Test Contact Information Update (store_settings) ───────────────────
  console.log("\n[5] Testing Contact Information Update in store_settings...");
  const initialSettings = await getSettings();
  const testPhone = "+251 91 199 9888";
  const testEmail = "support@rekikcafe.com";
  const testAddress = "Piassa, Next to Kibru Hospital, Hawassa, Ethiopia.";
  const testHours = "Mon – Sun: 7:00 AM – 11:00 PM";

  const updatedSettings = await updateSettings({
    phone: testPhone,
    email: testEmail,
    address: testAddress,
    openingHours: testHours,
  });

  assert.equal(updatedSettings.phone, testPhone, "Phone must be updated");
  assert.equal(updatedSettings.email, testEmail, "Email must be updated");
  assert.equal(updatedSettings.address, testAddress, "Address must be updated");
  assert.equal(updatedSettings.openingHours, testHours, "Opening hours must be updated");

  const reloadedSettings = await getSettings();
  assert.equal(reloadedSettings.phone, testPhone);
  assert.equal(reloadedSettings.email, testEmail);
  assert.equal(reloadedSettings.address, testAddress);
  assert.equal(reloadedSettings.openingHours, testHours);
  console.log(`✓ Contact information successfully updated in store_settings:`);
  console.log(`   Phone: ${reloadedSettings.phone}`);
  console.log(`   Email: ${reloadedSettings.email}`);
  console.log(`   Address: ${reloadedSettings.address}`);
  console.log(`   Hours: ${reloadedSettings.openingHours}`);

  // ── [6] Test Site Image Validation Constraints ─────────────────────────────
  console.log("\n[6] Testing Image Validation Rules...");
  // Test invalid file types
  const fakePdf = { name: "menu.pdf", size: 1024 * 1024, type: "application/pdf" } as File;
  const pdfVal = validateSiteImageFile(fakePdf);
  assert.equal(pdfVal.valid, false, "PDF files must be rejected");

  // Test oversize file (> 5 MB)
  const oversizeJpg = { name: "banner.jpg", size: MAX_SITE_IMAGE_SIZE_BYTES + 1024, type: "image/jpeg" } as File;
  const sizeVal = validateSiteImageFile(oversizeJpg);
  assert.equal(sizeVal.valid, false, "Files > 5MB must be rejected");

  // Test valid JPG
  const validJpg = { name: "hero.jpg", size: 2 * 1024 * 1024, type: "image/jpeg" } as File;
  const validVal = validateSiteImageFile(validJpg);
  assert.equal(validVal.valid, true, "Valid JPG <= 5MB must be accepted");

  // Test valid WebP
  const validWebp = { name: "coffee.webp", size: 500 * 1024, type: "image/webp" } as File;
  const webpVal = validateSiteImageFile(validWebp);
  assert.equal(webpVal.valid, true, "Valid WebP <= 5MB must be accepted");
  console.log("✓ Image validation strictly enforces file types (JPG, PNG, WebP) and 5MB size limit.");

  // ── [7] Restoration / Teardown ─────────────────────────────────────────────
  console.log("\n[7] Restoring baseline content...");
  await updateAboutContent({
    homepage_hero_title: initialContent.homepage_hero_title,
    homepage_hero_subtitle: initialContent.homepage_hero_subtitle,
    homepage_hero_image: initialContent.homepage_hero_image,
    about_title: initialContent.about_title,
    about_description: initialContent.about_description,
    story_title: initialContent.story_title,
  });

  await updateSettings({
    phone: initialSettings.phone,
    email: initialSettings.email,
    address: initialSettings.address,
    openingHours: initialSettings.openingHours,
  });
  console.log("✓ Baseline website content and contact settings restored.");

  console.log("\n================================================================================");
  console.log("ALL WEBSITE CONTENT MANAGEMENT (CMS) TESTS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});

