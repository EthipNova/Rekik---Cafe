/**
 * NEBA Café — Distance & Delivery Pricing Engine
 * Pure, deterministic functions for coordinate validation, Haversine distance,
 * and admin-configurable delivery fee calculation.
 */

export type DeliveryRoundingRule = "none" | "nearest_1" | "nearest_5" | "ceil";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface DeliveryPricingConfig {
  pricePerKm: number;
  minDeliveryFee: number;
  maxDeliveryDistanceKm: number;
  roundingRule: DeliveryRoundingRule;
  deliveryEnabled?: boolean;
}

export interface DeliveryFeeCalculationResult {
  eligible: boolean;
  distanceKm: number;
  fee: number;
  reason?: string;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Validates whether a given latitude and longitude represent valid, finite geographical coordinates.
 * Latitude must be within [-90, 90].
 * Longitude must be within [-180, 180].
 */
export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return false;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }
  if (latitude < -90 || latitude > 90) {
    return false;
  }
  if (longitude < -180 || longitude > 180) {
    return false;
  }
  return true;
}

/**
 * Calculates straight-line distance in kilometers between two geographical points
 * using the spherical Haversine formula.
 *
 * @throws Error if any coordinate is invalid, NaN, or non-finite.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    throw new Error("Invalid coordinates provided to calculateHaversineDistance");
  }

  // Exact identical location shortcut
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceKm = EARTH_RADIUS_KM * c;

  // Round to 2 decimal places for consistent precision
  return Math.round(distanceKm * 100) / 100;
}

/**
 * Applies the configured business rounding rule to a delivery fee.
 *
 * - 'none': Exact amount rounded to 2 decimal places
 * - 'nearest_1': Standard rounding to nearest integer Birr (e.g. 54.4 -> 54, 54.5 -> 55)
 * - 'nearest_5': Rounding to nearest 5 Birr step (e.g. 52 -> 50, 53 -> 55, 72 -> 70, 73 -> 75)
 * - 'ceil': Always ceiling up to the next integer Birr (e.g. 50.1 -> 51)
 */
export function applyRoundingRule(
  amount: number,
  rule: DeliveryRoundingRule = "nearest_5",
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  switch (rule) {
    case "none":
      return Math.round(amount * 100) / 100;
    case "nearest_1":
      return Math.round(amount);
    case "nearest_5":
      return Math.round(amount / 5) * 5;
    case "ceil":
      return Math.ceil(amount);
    default:
      return Math.round(amount / 5) * 5;
  }
}

/**
 * Computes the authoritative delivery fee given the distance in KM and admin pricing settings.
 *
 * Formula:
 *   raw_fee = max(minDeliveryFee, distanceKm * pricePerKm)
 *   final_fee = applyRoundingRule(raw_fee, roundingRule)
 */
export function calculateDeliveryFee(
  distanceKm: number,
  config: DeliveryPricingConfig,
  options?: {
    hasCafeCoordinates?: boolean;
  },
): DeliveryFeeCalculationResult {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return {
      eligible: false,
      distanceKm: 0,
      fee: 0,
      reason: "Invalid delivery distance.",
    };
  }

  if (config.deliveryEnabled === false) {
    return {
      eligible: false,
      distanceKm,
      fee: 0,
      reason: "Delivery service is temporarily disabled.",
    };
  }

  if (options?.hasCafeCoordinates === false) {
    return {
      eligible: false,
      distanceKm,
      fee: 0,
      reason: "Café delivery coordinates have not been configured by administration.",
    };
  }

  const maxDistance = Number(config.maxDeliveryDistanceKm) || 15;
  if (distanceKm > maxDistance) {
    return {
      eligible: false,
      distanceKm,
      fee: 0,
      reason: `Selected location (${distanceKm.toFixed(1)} km) exceeds our maximum delivery radius of ${maxDistance} km.`,
    };
  }

  const pricePerKm = Math.max(0, Number(config.pricePerKm) || 0);
  const minFee = Math.max(0, Number(config.minDeliveryFee) || 0);

  const rawFee = Math.max(minFee, distanceKm * pricePerKm);
  const finalFee = applyRoundingRule(rawFee, config.roundingRule);

  return {
    eligible: true,
    distanceKm,
    fee: finalFee,
  };
}
