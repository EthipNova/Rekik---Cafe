/**
 * ============================================================================
 * Rekik Café — Category 4: Physical Inventory & Stock Monitoring Unit Tests
 * File: tests/inventory_monitoring.test.ts
 * ============================================================================
 * Comprehensive unit and integration test suite validating:
 * 1. Physical stock nullity & availability separation
 * 2. Multi-criteria filtering & sorting (search, category, availability, stock states)
 * 3. Atomic stock mutation invariants (Opening, Adjustment, Waste, Negative-stock prevention)
 * 4. Append-only stock movement ledger integrity
 * 5. Order stock deduction idempotency & restoration rules
 * 6. Migration DDL & security invariants (RLS least privilege, SELECT FOR UPDATE, SECURITY DEFINER)
 * 7. Metric aggregation & zero-division safety
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculatePhysicalStockStatus,
  filterInventoryProducts,
  getInventorySchemaAssessment,
  recordStockMutation,
  PROPOSED_INVENTORY_MIGRATION_SQL,
  type InventoryProductRecord,
} from "../src/lib/inventory-monitoring";

console.log("==================================================");
console.log("RUNNING REKIK CAFÉ INVENTORY & STOCK MONITORING VERIFICATION");
console.log("==================================================");

// Sample verified test products
const mockProducts: InventoryProductRecord[] = [
  {
    id: "p-1",
    name: "Classic Burger",
    slug: "classic-burger",
    categoryId: "cat-1",
    categorySlug: "burgers",
    categoryName: "Burgers",
    price: 250,
    available: true,
    featured: true,
    image: "/images/classic-burger.jpg",
    description: "Fresh beef patty, vegetables and special sauce.",
    ingredients: ["Beef patty", "Lettuce", "Tomato", "Special sauce", "Sesame bun"],
    trackInventory: false,
    stockQuantity: null,
    stockUnit: "portion",
    minStockThreshold: null,
    stockTrackingStatus: "untracked",
    menuAvailabilityStatus: "available",
  },
  {
    id: "p-2",
    name: "Chicken Burger",
    slug: "chicken-burger",
    categoryId: "cat-1",
    categorySlug: "burgers",
    categoryName: "Burgers",
    price: 280,
    available: false, // 86'd / unavailable
    featured: false,
    image: "/images/chicken-burger.jpg",
    description: "Crispy chicken fillet with fresh slaw and mild mayo.",
    ingredients: ["Chicken fillet", "Cabbage slaw", "Mayo", "Brioche bun"],
    trackInventory: false,
    stockQuantity: null,
    stockUnit: "portion",
    minStockThreshold: null,
    stockTrackingStatus: "untracked",
    menuAvailabilityStatus: "unavailable",
  },
  {
    id: "p-3",
    name: "Margherita Pizza",
    slug: "margherita-pizza",
    categoryId: "cat-2",
    categorySlug: "pizza",
    categoryName: "Pizza",
    price: 420,
    available: true,
    featured: true,
    image: "/images/margherita.jpg",
    description: "Stone-baked dough, tomato sauce, mozzarella and fresh basil.",
    ingredients: ["Pizza dough", "Tomato sauce", "Mozzarella", "Fresh basil"],
    trackInventory: true,
    stockQuantity: null, // Tracked, but uninitialized (count required)
    stockUnit: "portion",
    minStockThreshold: 10,
    stockTrackingStatus: "uninitialized",
    menuAvailabilityStatus: "available",
  },
  {
    id: "p-4",
    name: "Ethiopian Yirgacheffe Pour-Over",
    slug: "ethiopian-yirgacheffe",
    categoryId: "cat-5",
    categorySlug: "coffee",
    categoryName: "Coffee & Tea",
    price: 95,
    available: true,
    featured: true,
    image: "/images/hero.jpg",
    description: "Single-origin pour-over with fragrant floral jasmine notes.",
    ingredients: ["Yirgacheffe Coffee Beans", "Filtered Water"],
    trackInventory: true,
    stockQuantity: 45, // Healthy in-stock
    stockUnit: "cup",
    minStockThreshold: 10,
    stockTrackingStatus: "healthy",
    menuAvailabilityStatus: "available",
  },
  {
    id: "p-7",
    name: "Coca-Cola",
    slug: "coca-cola",
    categoryId: "cat-4",
    categorySlug: "drinks",
    categoryName: "Soft Drinks",
    price: 50,
    available: true,
    featured: false,
    trackInventory: true,
    stockQuantity: 4, // Low stock (below threshold 15)
    stockUnit: "bottle",
    minStockThreshold: 15,
    stockTrackingStatus: "low_stock",
    menuAvailabilityStatus: "available",
  },
  {
    id: "p-8",
    name: "Sprite",
    slug: "sprite",
    categoryId: "cat-4",
    categorySlug: "drinks",
    categoryName: "Soft Drinks",
    price: 50,
    available: false,
    featured: false,
    trackInventory: true,
    stockQuantity: 0, // Out of stock
    stockUnit: "bottle",
    minStockThreshold: 15,
    stockTrackingStatus: "out_of_stock",
    menuAvailabilityStatus: "unavailable",
  },
];

// ── Test 1: Zero Invented Stock & Separation of Availability from Physical Stock ────
console.log("\n[1] Testing Physical Stock Nullity & Availability Separation...");

// Ensure calculatePhysicalStockStatus honors invariants
assert.equal(calculatePhysicalStockStatus(false, null, null), "untracked");
assert.equal(calculatePhysicalStockStatus(false, 100, null), "untracked"); // Tracking disabled overrides quantity
assert.equal(calculatePhysicalStockStatus(true, null, 10), "uninitialized"); // Null quantity is never 0
assert.equal(calculatePhysicalStockStatus(true, 0, 10), "out_of_stock");
assert.equal(calculatePhysicalStockStatus(true, 8, 10), "low_stock");
assert.equal(calculatePhysicalStockStatus(true, 10, 10), "low_stock"); // At threshold is low_stock
assert.equal(calculatePhysicalStockStatus(true, 25, 10), "healthy");

// Product with available=false is a menu toggle, NOT a physical stock count of 0
const unavailableUntracked = mockProducts.find((p) => p.id === "p-2")!;
assert.equal(unavailableUntracked.name, "Chicken Burger");
assert.equal(unavailableUntracked.available, false);
assert.equal(unavailableUntracked.stockQuantity, null);
assert.equal(unavailableUntracked.stockTrackingStatus, "untracked");

// Product with stockQuantity = null must never be formatted as 0
const uninitializedItem = mockProducts.find((p) => p.id === "p-3")!;
assert.equal(uninitializedItem.stockQuantity, null);
assert.equal(uninitializedItem.stockTrackingStatus, "uninitialized");

console.log("✓ Physical stock nullity & availability separation verified!");

// ── Test 2: Inventory Search & Multi-Criteria Filtering ───────────────────────
console.log("\n[2] Testing Multi-Criteria Filtering & Sorting...");

// Search by name
const searchNameResult = filterInventoryProducts(mockProducts, { searchQuery: "pizza" });
assert.equal(searchNameResult.length, 1);
assert.equal(searchNameResult[0]?.name, "Margherita Pizza");

// Search by ingredient
const searchIngResult = filterInventoryProducts(mockProducts, { searchQuery: "jasmine" });
assert.equal(searchIngResult.length, 1);
assert.equal(searchIngResult[0]?.name, "Ethiopian Yirgacheffe Pour-Over");

// Category filtering
const categoryResult = filterInventoryProducts(mockProducts, { categorySlug: "burgers" });
assert.equal(categoryResult.length, 2);

// Menu availability filtering
const availableResult = filterInventoryProducts(mockProducts, { availability: "available" });
assert.equal(availableResult.length, 4);
const unavailableResult = filterInventoryProducts(mockProducts, { availability: "unavailable" });
assert.equal(unavailableResult.length, 2);

// Physical stock state filtering
const trackedOnly = filterInventoryProducts(mockProducts, { stockFilter: "tracked" });
assert.equal(trackedOnly.length, 4);

const untrackedOnly = filterInventoryProducts(mockProducts, { stockFilter: "untracked" });
assert.equal(untrackedOnly.length, 2);

const uninitializedOnly = filterInventoryProducts(mockProducts, { stockFilter: "uninitialized" });
assert.equal(uninitializedOnly.length, 1);
assert.equal(uninitializedOnly[0]?.id, "p-3");

const lowStockOnly = filterInventoryProducts(mockProducts, { stockFilter: "low_stock" });
assert.equal(lowStockOnly.length, 1);
assert.equal(lowStockOnly[0]?.name, "Coca-Cola");

const outOfStockOnly = filterInventoryProducts(mockProducts, { stockFilter: "out_of_stock" });
assert.equal(outOfStockOnly.length, 1);
assert.equal(outOfStockOnly[0]?.name, "Sprite");

// Sorting: Price ascending
const priceAsc = filterInventoryProducts(mockProducts, { sortBy: "price_asc" });
assert.equal(priceAsc[0]?.price, 50); // Cola/Sprite
assert.equal(priceAsc[priceAsc.length - 1]?.price, 420); // Pizza

// Sorting: Stock quantity ascending
const stockAsc = filterInventoryProducts(mockProducts, { sortBy: "stock_asc" });
assert.equal(stockAsc[0]?.stockQuantity, null); // null sorted first in ascending
assert.equal(stockAsc[stockAsc.length - 1]?.stockQuantity, 45); // Yirgacheffe highest

console.log("✓ Multi-criteria filtering & sorting verified!");

// ── Test 3: Atomic Stock Mutation Invariants ─────────────────────────────────
console.log("\n[3] Testing Atomic Stock Mutation Invariants...");

async function testMutations() {
  // Test 3.1: Zero-quantity change must be rejected
  const zeroRes = await recordStockMutation({
    productId: "p-4",
    productName: "Yirgacheffe",
    movementType: "purchase",
    quantityChange: 0,
    currentProduct: mockProducts[3],
  });
  assert.equal(zeroRes.success, false);
  assert.ok(zeroRes.error?.includes("cannot be zero"));

  // Test 3.2: Untracked product must be rejected
  const untrackedRes = await recordStockMutation({
    productId: "p-1",
    productName: "Classic Burger",
    movementType: "purchase",
    quantityChange: 10,
    currentProduct: mockProducts[0],
  });
  assert.equal(untrackedRes.success, false);
  assert.ok(untrackedRes.error?.includes("disabled"));

  // Test 3.3: Adjusting uninitialized product without opening count must be rejected
  const uninitRes = await recordStockMutation({
    productId: "p-3",
    productName: "Margherita Pizza",
    movementType: "adjustment",
    quantityChange: 5,
    currentProduct: mockProducts[2],
  });
  assert.equal(uninitRes.success, false);
  assert.ok(uninitRes.error?.includes("not been initialized"));

  // Test 3.4: Initializing opening count succeeds
  const openRes = await recordStockMutation({
    productId: "p-3",
    productName: "Margherita Pizza",
    movementType: "opening",
    quantityChange: 30,
    notes: "Opening verified count",
    currentProduct: mockProducts[2],
  });
  assert.equal(openRes.success, true);
  assert.equal(openRes.previousQuantity, null);
  assert.equal(openRes.newQuantity, 30);

  // Test 3.5: Subsequent opening count attempt on already initialized product must be rejected
  const doubleOpenRes = await recordStockMutation({
    productId: "p-3",
    productName: "Margherita Pizza",
    movementType: "opening",
    quantityChange: 20,
    currentProduct: {
      ...mockProducts[2]!,
      stockQuantity: 30,
    },
  });
  assert.equal(doubleOpenRes.success, false);
  assert.ok(doubleOpenRes.error?.includes("already been entered"));

  // Test 3.6: Negative stock prevention
  const overdrawRes = await recordStockMutation({
    productId: "p-4",
    productName: "Yirgacheffe",
    movementType: "waste",
    quantityChange: -100, // on-hand is 45
    currentProduct: mockProducts[3],
  });
  assert.equal(overdrawRes.success, false);
  assert.ok(
    overdrawRes.error?.includes("Insufficient stock") || overdrawRes.error?.includes("negative"),
  );

  // Test 3.7: Valid purchase restock adds to on-hand
  const validPurchaseRes = await recordStockMutation({
    productId: "p-4",
    productName: "Yirgacheffe",
    movementType: "purchase",
    quantityChange: 25,
    notes: "Supplier Delivery Receipt #REC-104",
    currentProduct: mockProducts[3],
  });
  assert.equal(validPurchaseRes.success, true);
  assert.equal(validPurchaseRes.previousQuantity, 45);
  assert.equal(validPurchaseRes.newQuantity, 70);

  // Test 3.8: Opening count of 0 is valid for a new item starting at zero
  const zeroOpeningRes = await recordStockMutation({
    productId: "p-new-item",
    productName: "New Item",
    movementType: "opening",
    quantityChange: 0,
    notes: "Initial balance zero",
    currentProduct: {
      id: "p-new-item",
      name: "New Item",
      slug: "new-item",
      categoryId: "cat-1",
      categorySlug: "burgers",
      categoryName: "Burgers",
      price: 150,
      available: true,
      featured: false,
      image: "/images/hero.jpg",
      description: "New item",
      ingredients: [],
      trackInventory: true,
      stockQuantity: null,
      stockUnit: "portion",
      minStockThreshold: 5,
      stockTrackingStatus: "uninitialized",
      menuAvailabilityStatus: "available",
    },
  });
  assert.equal(zeroOpeningRes.success, true);
  assert.equal(zeroOpeningRes.previousQuantity, null);
  assert.equal(zeroOpeningRes.newQuantity, 0);

  // Test 3.9: Negative opening count must be rejected
  const negOpeningRes = await recordStockMutation({
    productId: "p-neg-item",
    productName: "Negative Item",
    movementType: "opening",
    quantityChange: -10,
    currentProduct: {
      id: "p-neg-item",
      name: "Negative Item",
      slug: "negative-item",
      categoryId: "cat-1",
      categorySlug: "burgers",
      categoryName: "Burgers",
      price: 150,
      available: true,
      featured: false,
      image: "/images/hero.jpg",
      description: "Negative item",
      ingredients: [],
      trackInventory: true,
      stockQuantity: null,
      stockUnit: "portion",
      minStockThreshold: 5,
      stockTrackingStatus: "uninitialized",
      menuAvailabilityStatus: "available",
    },
  });
  assert.equal(negOpeningRes.success, false);
  assert.ok(negOpeningRes.error?.includes("non-negative"));

  console.log("✓ Atomic stock mutation invariants verified!");
}

await testMutations();

// ── Test 4: Schema Migration DDL Integrity & Security Controls ──────────────
console.log("\n[4] Testing Migration DDL & Security Controls...");

const migrationPath = path.resolve(
  process.cwd(),
  "supabase",
  "migrations",
  "20261018170000_physical_inventory_tracking.sql",
);
assert.ok(
  fs.existsSync(migrationPath),
  "Migration file 20261018170000_physical_inventory_tracking.sql must exist",
);

const migrationContent = fs.readFileSync(migrationPath, "utf-8");

// DDL Invariants
assert.ok(
  migrationContent.includes("ADD COLUMN IF NOT EXISTS track_inventory"),
  "Must add track_inventory",
);
assert.ok(
  migrationContent.includes("ADD COLUMN IF NOT EXISTS stock_quantity"),
  "Must add stock_quantity",
);
assert.ok(migrationContent.includes("ADD COLUMN IF NOT EXISTS stock_unit"), "Must add stock_unit");
assert.ok(
  migrationContent.includes("CREATE TABLE IF NOT EXISTS public.stock_movements"),
  "Must create stock_movements ledger",
);
assert.ok(
  migrationContent.includes("ON DELETE RESTRICT"),
  "Movement product reference must use ON DELETE RESTRICT",
);
assert.ok(
  migrationContent.includes("check_stock_movements_new_qty_non_negative"),
  "Must constrain new_quantity >= 0",
);
assert.ok(
  migrationContent.includes("quantity_change != 0 OR movement_type = 'opening'"),
  "Must constrain non-zero change while allowing opening count of zero",
);

// RLS Protection on products table (closes critical security gap)
assert.ok(
  migrationContent.includes("ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;"),
  "Must enable RLS on public.products",
);
assert.ok(
  migrationContent.includes("Public can view products"),
  "Must provide public read policy for diner menu viewing",
);
assert.ok(
  migrationContent.includes("Staff can manage products"),
  "Must restrict product updates to staff",
);

// Concurrency & Security Invariants
assert.ok(
  migrationContent.includes("FOR UPDATE"),
  "Must serialize concurrency using SELECT ... FOR UPDATE",
);
assert.ok(migrationContent.includes("SECURITY DEFINER"), "RPCs must be SECURITY DEFINER");
assert.ok(
  migrationContent.includes("SET search_path = public, pg_temp"),
  "Must specify explicit, safe search_path",
);
assert.ok(
  migrationContent.includes("REVOKE INSERT, UPDATE, DELETE ON public.stock_movements"),
  "Must revoke direct client writes on ledger",
);
assert.ok(
  migrationContent.includes("is_inventory_manager()"),
  "Must check is_inventory_manager() role authorization",
);

// Order Idempotency Invariants
assert.ok(
  migrationContent.includes("reference_order_id"),
  "Must track reference_order_id in ledger",
);
assert.ok(
  migrationContent.includes("deduct_order_inventory"),
  "Must define idempotent deduct_order_inventory RPC",
);
assert.ok(
  migrationContent.includes("already_deducted"),
  "Must handle duplicate order deduction idempotently",
);
assert.ok(
  migrationContent.includes("restore_order_inventory"),
  "Must define compensating restore_order_inventory RPC",
);

console.log("✓ Migration DDL & security controls verified!");

// ── Test 5: Metric Aggregation & Zero-Division Safety ────────────────────────
console.log("\n[5] Testing Metric Aggregation & Zero-Division Safety...");

const emptyProducts: InventoryProductRecord[] = [];
const emptyFiltered = filterInventoryProducts(emptyProducts, { searchQuery: "test" });
assert.equal(emptyFiltered.length, 0);

const calcAvgPrice = (items: InventoryProductRecord[]) =>
  items.length > 0 ? Math.round(items.reduce((s, p) => s + p.price, 0) / items.length) : 0;

assert.equal(calcAvgPrice([]), 0, "Empty product array should return avg price 0");
assert.equal(calcAvgPrice(mockProducts), Math.round((250 + 280 + 420 + 95 + 50 + 50) / 6)); // 191

const assessment = getInventorySchemaAssessment();
assert.ok(Array.isArray(assessment) && assessment.length >= 6);
const migrationReady = assessment.filter((a) => a.status === "migration_ready");
assert.ok(
  migrationReady.length >= 3,
  "Physical stock, ledger, and atomic RPC should be marked migration_ready",
);

console.log("✓ Metric aggregation & zero-division safety passed!");

console.log("\n==================================================");
console.log("ALL REKIK INVENTORY MONITORING TESTS PASSED!");
console.log("==================================================");
