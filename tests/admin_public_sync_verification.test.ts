/**
 * ============================================================================
 * Rekik Café — Admin & Public Website Data Synchronization Test
 * File: tests/admin_public_sync_verification.test.ts
 *
 * Verifies that changes made via Admin Content Management persist to Supabase
 * and are immediately reflected across the public website endpoints and pages.
 * ============================================================================
 */

import assert from "node:assert/strict";

// Mock localStorage and window for Node environment
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
import { DEFAULT_ABOUT_CONTENT } from "../src/lib/content";

console.log("================================================================================");
console.log("REKIK CAFÉ: ADMIN & PUBLIC WEBSITE REAL-TIME SYNCHRONIZATION TEST");
console.log("================================================================================");

async function run() {
  // Snapshot initial baseline state
  const initialContent = await getAboutContent();
  const initialSettings = await getSettings();

  console.log("\n[Snapshot] Baseline Data from Supabase:");
  console.log(`  - Homepage Hero Title: "${initialContent.homepage_hero_title}"`);
  console.log(`  - About Us Title: "${initialContent.about_title}"`);
  console.log(`  - Contact Phone: "${initialSettings.phone}"`);
  console.log(`  - Contact Address: "${initialSettings.address}"`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Text Content Synchronization (Homepage & About Us)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 1: Text Content Synchronization (Homepage & About Us) ---");
  const newHeroTitle = "Rekik Specialty Café & Roastery";
  const newHeroSubtitle = "Single origin Ethiopian coffee crafted with pride in Addis Ababa.";
  const newAboutTitle = "Craft, Culture, and Community";
  const newAboutDesc = "Founded with the passion to celebrate Ethiopia's finest coffee heritage.";
  const newStoryTitle = "From Bean to Cup";
  const newStoryContent = "Every cup is roasted to perfection and served with authentic buna ritual tradition.";

  console.log("1. Admin saves updated text content via updateAboutContent()...");
  const savedContent = await updateAboutContent({
    homepage_hero_title: newHeroTitle,
    homepage_hero_subtitle: newHeroSubtitle,
    about_title: newAboutTitle,
    about_description: newAboutDesc,
    story_title: newStoryTitle,
    story_content: newStoryContent,
  });

  assert.equal(savedContent.about_title, newAboutTitle, "Saved content must reflect new about title");
  assert.equal(savedContent.story_title, newStoryTitle, "Saved content must reflect new story title");
  console.log("✓ Admin update operation succeeded.");

  console.log("2. Public website queries getAboutContent() & GET /api/content...");
  const publicContentServer = await getAboutContent();
  
  // Also simulate HTTP GET /api/content that public client calls
  const getReq = new Request("http://localhost:3000/api/content", { method: "GET" });
  const getRes = await handleApiRequest(getReq);
  const publicContentApi = await getRes.json();

  assert.equal(publicContentServer.about_title, newAboutTitle, "Public server loader must show new about title");
  assert.equal(publicContentServer.about_description, newAboutDesc, "Public server loader must show new about description");
  assert.equal(publicContentServer.story_title, newStoryTitle, "Public server loader must show new story title");
  assert.equal(publicContentServer.story_content, newStoryContent, "Public server loader must show new story content");
  assert.equal(publicContentServer.homepage_hero_title, newHeroTitle, "Public hero headline must show new hero title");

  assert.equal(publicContentApi.about_title, newAboutTitle, "GET /api/content must return new about title");
  assert.equal(publicContentApi.homepage_hero_title, newHeroTitle, "GET /api/content must return new hero title");
  console.log("✓ Public website data reflects all updated text copy in real-time.");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Image Synchronization (Hero, About, and Story Images)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 2: Image URL Synchronization (Hero, About, and Story Images) ---");
  const testHeroImage = "https://imqtqshcgvgxokojfgxv.supabase.co/storage/v1/object/public/product-images/content/homepage/hero-modern-2026.jpg";
  const testAboutHeroImage = "https://imqtqshcgvgxokojfgxv.supabase.co/storage/v1/object/public/product-images/content/about/about-flagship.jpg";
  const testStoryImage = "https://imqtqshcgvgxokojfgxv.supabase.co/storage/v1/object/public/product-images/content/story/buna-roast.jpg";

  console.log("1. Admin uploads and saves new photo URLs...");
  const savedImages = await updateAboutContent({
    homepage_hero_image: testHeroImage,
    about_hero_image: testAboutHeroImage,
    story_image: testStoryImage,
  });

  assert.equal(savedImages.homepage_hero_image, testHeroImage, "Hero image URL must match");
  assert.equal(savedImages.about_hero_image, testAboutHeroImage, "About hero image URL must match");
  assert.equal(savedImages.story_image, testStoryImage, "Story image URL must match");

  console.log("2. Public website queries getAboutContent() for image URLs...");
  const publicImages = await getAboutContent();
  assert.equal(publicImages.homepage_hero_image, testHeroImage, "Public homepage hero must receive new image URL");
  assert.equal(publicImages.about_hero_image, testAboutHeroImage, "Public about hero must receive new image URL");
  assert.equal(publicImages.story_image, testStoryImage, "Public story section must receive new image URL");
  console.log("✓ Public website renders the new uploaded photos across Hero, About, and Story sections.");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Core Values Synchronization
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 3: Core Values Synchronization ---");
  const newValues = {
    value_1_title: "Highland Single-Origin",
    value_1_description: "Exclusively sourced from Yirgacheffe, Sidama, and Guji farmers.",
    value_2_title: "Authentic Buna Ritual",
    value_2_description: "Honouring Ethiopian ceremony traditions alongside modern espresso craft.",
    value_3_title: "Digital Elegance",
    value_3_description: "Instant Telebirr & CBE ordering with live barista preparation tracking.",
  };

  await updateAboutContent(newValues);
  const publicValues = await getAboutContent();

  assert.equal(publicValues.value_1_title, newValues.value_1_title);
  assert.equal(publicValues.value_1_description, newValues.value_1_description);
  assert.equal(publicValues.value_2_title, newValues.value_2_title);
  assert.equal(publicValues.value_2_description, newValues.value_2_description);
  assert.equal(publicValues.value_3_title, newValues.value_3_title);
  assert.equal(publicValues.value_3_description, newValues.value_3_description);
  console.log("✓ Core values updated and visible to public About page.");

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Contact Information Synchronization (Phone, Email, Address, Hours)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 4: Contact Information Synchronization ---");
  const testContact = {
    phone: "+251 91 144 5566",
    email: "contact@rekikcoffee.com",
    address: "Bole Atlas, Behind Edna Mall, Addis Ababa, Ethiopia",
    openingHours: "Monday – Sunday: 6:30 AM – 11:30 PM",
  };

  console.log("1. Admin updates contact details in store_settings...");
  await updateSettings(testContact);

  console.log("2. Public website queries getSettings() & GET /api/settings...");
  const publicSettingsServer = await getSettings();

  const getSettingsReq = new Request("http://localhost:3000/api/settings", { method: "GET" });
  const getSettingsRes = await handleApiRequest(getSettingsReq);
  const publicSettingsApi = await getSettingsRes.json();

  assert.equal(publicSettingsServer.phone, testContact.phone, "Server settings phone must match");
  assert.equal(publicSettingsServer.email, testContact.email, "Server settings email must match");
  assert.equal(publicSettingsServer.address, testContact.address, "Server settings address must match");
  assert.equal(publicSettingsServer.openingHours, testContact.openingHours, "Server settings opening hours must match");

  assert.equal(publicSettingsApi.phone, testContact.phone, "API settings phone must match");
  assert.equal(publicSettingsApi.address, testContact.address, "API settings address must match");
  console.log("✓ Contact page and Site Footer display the updated address, phone, email, and opening hours.");

  // ──────────────────────────────────────────────────────────────────────────
  // CLEANUP / RESTORATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEARDOWN: Restoring Initial Baseline State ---");
  await updateAboutContent({
    homepage_hero_title: initialContent.homepage_hero_title,
    homepage_hero_subtitle: initialContent.homepage_hero_subtitle,
    homepage_hero_image: initialContent.homepage_hero_image,
    about_hero_image: initialContent.about_hero_image,
    about_title: initialContent.about_title,
    about_description: initialContent.about_description,
    story_title: initialContent.story_title,
    story_content: initialContent.story_content,
    story_image: initialContent.story_image,
    value_1_title: initialContent.value_1_title,
    value_1_description: initialContent.value_1_description,
    value_2_title: initialContent.value_2_title,
    value_2_description: initialContent.value_2_description,
    value_3_title: initialContent.value_3_title,
    value_3_description: initialContent.value_3_description,
  });

  await updateSettings({
    cafeName: initialSettings.cafeName,
    phone: initialSettings.phone,
    email: initialSettings.email,
    address: initialSettings.address,
    openingHours: initialSettings.openingHours,
  });
  console.log("✓ Initial baseline restored cleanly in Supabase.");

  console.log("\n================================================================================");
  console.log("ALL 4 SYNCHRONIZATION TESTS COMPLETED AND VERIFIED 100% SUCCESSFULLY!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
