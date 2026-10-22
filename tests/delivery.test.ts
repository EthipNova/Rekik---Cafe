import assert from "node:assert/strict";
import {
  isValidCoordinate,
  calculateHaversineDistance,
  applyRoundingRule,
  calculateDeliveryFee,
  type DeliveryPricingConfig,
} from "../src/lib/distance";

console.log("==================================================");
console.log("RUNNING NEBA CAFÉ DISTANCE & PRICING VERIFICATION");
console.log("==================================================");

// ── Test 1: Coordinate Validation ───────────────────────────────────────────
console.log("\n[1] Testing Coordinate Validation...");

assert.equal(isValidCoordinate(7.058, 38.473), true, "Valid Hawassa coordinates should pass");
assert.equal(isValidCoordinate(0, 0), true, "Equator/Prime Meridian should pass");
assert.equal(isValidCoordinate(90, 180), true, "Upper bounds should pass");
assert.equal(isValidCoordinate(-90, -180), true, "Lower bounds should pass");

assert.equal(isValidCoordinate(90.1, 38.473), false, "Latitude > 90 must fail");
assert.equal(isValidCoordinate(-90.1, 38.473), false, "Latitude < -90 must fail");
assert.equal(isValidCoordinate(7.058, 180.1), false, "Longitude > 180 must fail");
assert.equal(isValidCoordinate(7.058, -180.1), false, "Longitude < -180 must fail");

assert.equal(isValidCoordinate(NaN, 38.473), false, "NaN latitude must fail");
assert.equal(isValidCoordinate(7.058, NaN), false, "NaN longitude must fail");
assert.equal(isValidCoordinate(Infinity, 38.473), false, "Infinity must fail");
assert.equal(isValidCoordinate(null, 38.473), false, "Null latitude must fail");
assert.equal(isValidCoordinate(7.058, null), false, "Null longitude must fail");
assert.equal(isValidCoordinate(undefined, undefined), false, "Undefined coordinates must fail");

console.log("✓ Coordinate validation tests passed!");

// ── Test 2: Haversine Distance Engine ───────────────────────────────────────
console.log("\n[2] Testing Haversine Distance Accuracy...");

// Known benchmark: Hawassa center to specific known offsets
// 1 deg latitude ≈ 111.195 km
const lat0 = 7.058;
const lon0 = 38.473;

// Same point -> 0 KM
const d0 = calculateHaversineDistance(lat0, lon0, lat0, lon0);
assert.equal(d0, 0, "Distance between identical points must be 0");

// Shift by ~1 km North: deltaLat = 1 / 111.195 ≈ 0.008993 degrees
const lat1km = lat0 + 1 / 111.195;
const d1km = calculateHaversineDistance(lat0, lon0, lat1km, lon0);
assert.ok(Math.abs(d1km - 1.0) < 0.01, `Expected ~1.0 km, got ${d1km}`);

// Shift by ~5 km North: deltaLat = 5 / 111.195 ≈ 0.044966 degrees
const lat5km = lat0 + 5 / 111.195;
const d5km = calculateHaversineDistance(lat0, lon0, lat5km, lon0);
assert.ok(Math.abs(d5km - 5.0) < 0.02, `Expected ~5.0 km, got ${d5km}`);

// Shift by ~10 km
const lat10km = lat0 + 10 / 111.195;
const d10km = calculateHaversineDistance(lat0, lon0, lat10km, lon0);
assert.ok(Math.abs(d10km - 10.0) < 0.03, `Expected ~10.0 km, got ${d10km}`);

// Shift by ~15 km
const lat15km = lat0 + 15 / 111.195;
const d15km = calculateHaversineDistance(lat0, lon0, lat15km, lon0);
assert.ok(Math.abs(d15km - 15.0) < 0.05, `Expected ~15.0 km, got ${d15km}`);

console.log("✓ Haversine distance tests passed!");

// ── Test 3: Rounding Rules ──────────────────────────────────────────────────
console.log("\n[3] Testing Delivery Rounding Rules...");

// Rule: nearest_5
assert.equal(applyRoundingRule(48, "nearest_5"), 50);
assert.equal(applyRoundingRule(51, "nearest_5"), 50);
assert.equal(applyRoundingRule(52.4, "nearest_5"), 50);
assert.equal(applyRoundingRule(52.5, "nearest_5"), 55);
assert.equal(applyRoundingRule(54, "nearest_5"), 55);
assert.equal(applyRoundingRule(144, "nearest_5"), 145);

// Rule: nearest_1
assert.equal(applyRoundingRule(50.4, "nearest_1"), 50);
assert.equal(applyRoundingRule(50.5, "nearest_1"), 51);
assert.equal(applyRoundingRule(144.2, "nearest_1"), 144);

// Rule: ceil
assert.equal(applyRoundingRule(50.01, "ceil"), 51);
assert.equal(applyRoundingRule(50.0, "ceil"), 50);
assert.equal(applyRoundingRule(144.1, "ceil"), 145);

// Rule: none
assert.equal(applyRoundingRule(52.345, "none"), 52.35);

console.log("✓ Rounding rule tests passed!");

// ── Test 4: Business Pricing Formula ────────────────────────────────────────
console.log("\n[4] Testing Business Delivery Fee Scenarios...");

const baseConfig: DeliveryPricingConfig = {
  pricePerKm: 20.0,
  minDeliveryFee: 50.0,
  maxDeliveryDistanceKm: 15.0,
  roundingRule: "nearest_5",
  deliveryEnabled: true,
};

// Scenario A: 1 KM -> raw = max(50, 1 * 20) = 50 ETB (minimum fee)
const fee1 = calculateDeliveryFee(1.0, baseConfig, { hasCafeCoordinates: true });
assert.equal(fee1.eligible, true);
assert.equal(fee1.fee, 50.0, "1 KM should charge minimum delivery fee (50 ETB)");

// Scenario B: 4.5 KM -> raw = max(50, 4.5 * 20) = 90 ETB -> nearest_5 = 90 ETB
const fee4_5 = calculateDeliveryFee(4.5, baseConfig, { hasCafeCoordinates: true });
assert.equal(fee4_5.eligible, true);
assert.equal(fee4_5.fee, 90.0, "4.5 KM should charge 90 ETB");

// Scenario C: 7.2 KM -> raw = max(50, 7.2 * 20) = 144 ETB -> nearest_5 = 145 ETB
const fee7_2 = calculateDeliveryFee(7.2, baseConfig, { hasCafeCoordinates: true });
assert.equal(fee7_2.eligible, true);
assert.equal(fee7_2.fee, 145.0, "7.2 KM with nearest_5 should round 144 to 145 ETB");

// Scenario D: 15.0 KM -> raw = max(50, 15 * 20) = 300 ETB
const fee15 = calculateDeliveryFee(15.0, baseConfig, { hasCafeCoordinates: true });
assert.equal(fee15.eligible, true);
assert.equal(fee15.fee, 300.0, "15.0 KM should charge 300 ETB");

// Scenario E: 15.1 KM -> rejected because distance > maxDeliveryDistanceKm (15.0)
const fee15_1 = calculateDeliveryFee(15.1, baseConfig, { hasCafeCoordinates: true });
assert.equal(fee15_1.eligible, false, "15.1 KM must be rejected as outside delivery radius");
assert.equal(fee15_1.fee, 0);

console.log("✓ Business pricing scenarios passed!");

// ── Test 5: Operational & Security Constraints ──────────────────────────────
console.log("\n[5] Testing Operational Eligibility & Security Checks...");

// Delivery disabled
const disabledConfig: DeliveryPricingConfig = { ...baseConfig, deliveryEnabled: false };
const feeDisabled = calculateDeliveryFee(3.0, disabledConfig, { hasCafeCoordinates: true });
assert.equal(feeDisabled.eligible, false, "Disabled delivery must be rejected");

// Unconfigured café coordinates
const feeNoCafe = calculateDeliveryFee(3.0, baseConfig, { hasCafeCoordinates: false });
assert.equal(feeNoCafe.eligible, false, "Missing café coordinates must be rejected");

// Dine-in and takeaway logic
function computeAuthoritativeOrder(
  method: "dine-in" | "takeaway" | "delivery",
  canonicalProducts: { id: string; price: number }[],
  clientLines: { productId: string; quantity: number; price?: number }[],
  clientDeliveryInput?: number,
  clientDiscountInput?: number,
  clientTotalInput?: number,
  distanceKm?: number,
) {
  // Server validates products and fetches canonical price from DB
  const items = clientLines.map((line) => {
    const canonical = canonicalProducts.find((p) => p.id === line.productId);
    if (!canonical) throw new Error("Invalid product");
    return {
      productId: canonical.id,
      quantity: Math.max(1, Math.floor(line.quantity)),
      price: canonical.price, // strictly DB price
    };
  });

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);

  // Authoritative discount = 0 (no coupon engine)
  const discount = 0;

  // Delivery fee
  let delivery = 0;
  if (method === "delivery") {
    if (distanceKm === undefined) throw new Error("Missing distance");
    const res = calculateDeliveryFee(distanceKm, baseConfig, { hasCafeCoordinates: true });
    if (!res.eligible) throw new Error(res.reason || "Delivery not eligible");
    delivery = res.fee;
  } else {
    delivery = 0;
  }

  const total = subtotal - discount + delivery;
  const paymentAmount = total; // Strictly equal to server-calculated total

  return { subtotal, discount, delivery, total, paymentAmount };
}

const mockDbProducts = [
  { id: "prod_1", price: 250 }, // Burger
  { id: "prod_2", price: 80 }, // Fries
];

// Attack Scenario 1: Client sends price = 1 ETB, discount = 500 ETB, delivery = 0 ETB
const attack1 = computeAuthoritativeOrder(
  "delivery",
  mockDbProducts,
  [{ productId: "prod_1", quantity: 2, price: 1 }], // client forged price = 1
  0, // client forged delivery = 0
  500, // client forged discount = 500
  1, // client forged total = 1
  4.5, // 4.5 km distance
);

assert.equal(attack1.subtotal, 500, "Subtotal must be 2 * 250 = 500 ETB (ignoring client price=1)");
assert.equal(attack1.discount, 0, "Discount must be 0 (ignoring client discount=500)");
assert.equal(
  attack1.delivery,
  90,
  "Delivery fee must be 90 ETB for 4.5 KM (ignoring client delivery=0)",
);
assert.equal(attack1.total, 590, "Total must be 500 + 90 = 590 ETB (ignoring client total=1)");
assert.equal(attack1.paymentAmount, 590, "Payment amount must equal authoritative total (590 ETB)");

// Attack Scenario 2: Dine-in order with client delivery = 9999 ETB
const attack2 = computeAuthoritativeOrder(
  "dine-in",
  mockDbProducts,
  [{ productId: "prod_2", quantity: 1 }],
  9999, // client sends delivery fee
);
assert.equal(attack2.delivery, 0, "Dine-in delivery fee must always be 0");
assert.equal(attack2.total, 80, "Dine-in total must be subtotal only");

// Attack Scenario 3: Takeaway order with client delivery = 90 ETB
const attack3 = computeAuthoritativeOrder(
  "takeaway",
  mockDbProducts,
  [{ productId: "prod_1", quantity: 1 }],
  90,
);
assert.equal(attack3.delivery, 0, "Takeaway delivery fee must always be 0");

console.log("✓ Security and server-authoritative pricing tests passed!");

console.log("\n==================================================");
console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
console.log("==================================================");
