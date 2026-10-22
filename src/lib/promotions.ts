/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Product } from "@/lib/menu-data";
import { supabase } from "@/lib/supabase";

export type DiscountType = "percentage" | "fixed";
export type PromotionStatus = "active" | "scheduled" | "expired" | "draft";
export type PromotionTargetType = "all" | "category" | "products";

export type PromotionProductItem = {
  id: string;
  name: string;
  slug: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  categoryId?: string | null | undefined;
};

export type Promotion = {
  id: string;
  name: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  appliesToAll?: boolean | undefined;
  applicableProductIds: string[]; // ["*"] denotes all products in legacy records
  applicableCategorySlug?: string | undefined;
  categoryId?: string | null | undefined;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status?: PromotionStatus | undefined;
  minOrderAmount?: number | undefined;
  createdAt: string; // ISO date string
  products?: PromotionProductItem[] | undefined;
};

export type CreatePromotionInput = {
  name: string;
  description?: string | undefined;
  discountType: DiscountType;
  discountValue: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: PromotionStatus;
  minOrderAmount?: number | null | undefined;
  categoryId?: string | null | undefined;
};

export type UpdatePromotionInput = CreatePromotionInput;

/**
 * Resolves the targeting type of a promotion.
 * Priority order for existing and new records:
 * 1. If categoryId / category_id exists -> "category"
 * 2. Else if applicableCategorySlug / category_slug exists -> "category" (legacy fallback)
 * 3. Else if appliesToAll / applies_to_all === true -> "all"
 * 4. Else if applicableProductIds contains "*" -> "all" for legacy compatibility
 * 5. Otherwise -> "products"
 */
export function resolvePromotionTargetType(promo: {
  categoryId?: string | null | undefined;
  category_id?: string | null | undefined;
  applicableCategorySlug?: string | undefined;
  category_slug?: string | undefined;
  appliesToAll?: boolean | undefined;
  applies_to_all?: boolean | undefined;
  applicableProductIds?: string[] | undefined;
}): PromotionTargetType {
  const catId = promo.categoryId ?? promo.category_id;
  if (catId) {
    return "category";
  }
  if (promo.applicableCategorySlug || promo.category_slug) {
    return "category";
  }
  if (promo.appliesToAll === true || promo.applies_to_all === true) {
    return "all";
  }
  if (
    promo.applicableProductIds &&
    promo.applicableProductIds.includes("*") &&
    promo.appliesToAll !== false &&
    promo.applies_to_all !== false
  ) {
    return "all";
  }
  return "products";
}

/**
 * Normalizes promotion targeting parameters for persistence.
 * Ensures mutually exclusive targeting between all, category, and specific products.
 */
export function normalizePromotionTargeting(
  targetType: PromotionTargetType,
  categoryId?: string | null,
  productIds?: string[],
): {
  appliesToAll: boolean;
  categoryId: string | null;
  targetProductIds: string[];
} {
  if (targetType === "all") {
    return {
      appliesToAll: true,
      categoryId: null,
      targetProductIds: [],
    };
  }
  if (targetType === "category") {
    return {
      appliesToAll: false,
      categoryId: categoryId?.trim() || null,
      targetProductIds: [],
    };
  }
  return {
    appliesToAll: false,
    categoryId: null,
    targetProductIds: (productIds || []).filter((id) => id && id !== "*"),
  };
}

/**
 * Derives the operational status of a promotion based on its publication
 * mode and date schedule against the current calendar day.
 */
export function derivePromotionStatus(promo: Promotion): PromotionStatus {
  if (promo.status === "draft") return "draft";

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]!;

  if (promo.startDate && promo.startDate > todayStr) {
    return "scheduled";
  }
  if (promo.endDate && promo.endDate < todayStr) {
    return "expired";
  }
  return "active";
}

/**
 * Formats a user-facing string for discount value (e.g. "15% OFF" or "100 ETB OFF").
 */
export function formatDiscount(promo: {
  discountType: DiscountType;
  discountValue: number;
}): string {
  if (promo.discountType === "percentage") {
    return `${promo.discountValue}% OFF`;
  }
  return `${promo.discountValue.toLocaleString("en-US")} ETB OFF`;
}

/**
 * Formats currency values consistently in ETB without external dependencies.
 */
export function formatETB(amount: number): string {
  return `${amount.toLocaleString("en-US")} ETB`;
}

/**
 * Calculates the promotional discounted price.
 * For percentage: price - (price * discountValue / 100)
 * For fixed: price - discountValue
 * Clamped so the price never drops below zero.
 */
export function calculateDiscountedPrice(
  price: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  const numericPrice = Number(price) || 0;
  const numericVal = Number(discountValue) || 0;
  if (numericPrice <= 0 || numericVal <= 0) return numericPrice;

  let discounted = numericPrice;
  if (discountType === "percentage") {
    discounted = numericPrice - (numericPrice * numericVal) / 100;
  } else if (discountType === "fixed") {
    discounted = numericPrice - numericVal;
  }

  return Math.max(0, Math.round(discounted * 100) / 100);
}

/**
 * Formats a promotion's end date into a user-facing label (e.g. "Offer ends Sep 25").
 */
export function formatPromotionExpiry(endDate: string): string {
  if (!endDate) return "Limited time offer";
  try {
    const parts = endDate.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!year || !month || !day) return `Offer ends ${endDate}`;
    const date = new Date(year, month - 1, day);
    const formatted = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `Offer ends ${formatted}`;
  } catch {
    return `Offer ends ${endDate}`;
  }
}

export type TodaySpecialData = {
  promotion: Promotion;
  product: Product;
  originalPrice: number;
  discountedPrice: number;
  hasDiscount: boolean;
  discountBadge: string;
  expiryLabel: string;
  headline: string;
  description: string;
};

/**
 * Resolves the active promotion and product that belongs in the homepage "Today's Special" slot.
 *
 * Rules:
 * 1. An eligible promotion must satisfy derivePromotionStatus(promotion) === "active" (excludes draft, scheduled, expired).
 * 2. Promotions are evaluated in their provided array order (newest first).
 * 3. For a targeted promotion (specific product IDs):
 *    - Finds the first available product (available !== false) in the promotion's product ordering.
 * 4. For a universal promotion (applicableProductIds includes "*"):
 *    - Prefers an available featured product.
 *    - Falls back to the first available product.
 * 5. Returns null if no active promotion with an available product exists (cleanly hiding the section).
 */
export function resolveTodaySpecial(
  promotions: Promotion[] | null | undefined,
  products: Product[] | null | undefined,
): TodaySpecialData | null {
  if (!promotions || promotions.length === 0 || !products || products.length === 0) {
    return null;
  }

  const productById = new Map<string, Product>();
  for (const p of products) {
    if (p && p.id) {
      productById.set(p.id, p);
    }
  }

  const availableProducts = products.filter((p) => p.available !== false);
  if (availableProducts.length === 0) return null;

  // Filter ACTIVE promotions and sort deterministically: newest createdAt first, then by id
  const activePromos = promotions
    .filter((promo) => derivePromotionStatus(promo) === "active")
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return (b.id || "").localeCompare(a.id || "");
    });

  if (activePromos.length === 0) return null;

  for (const promo of activePromos) {
    const targetType = resolvePromotionTargetType(promo);
    let chosenProduct: Product | null = null;

    if (targetType === "all") {
      // All products: Prefer an available featured product, else first available product
      const featured = availableProducts.find((p) => p.featured === true);
      chosenProduct = featured || availableProducts[0] || null;
    } else if (targetType === "category") {
      // Category promotion: ONLY eligible available products from the selected category
      const categoryCandidates = availableProducts.filter((p) => {
        if (promo.categoryId && p.categoryId) {
          return p.categoryId === promo.categoryId;
        }
        if (promo.applicableCategorySlug && p.categorySlug) {
          return p.categorySlug.toLowerCase() === promo.applicableCategorySlug.toLowerCase();
        }
        return false;
      });

      // If the selected category has no available products, skip this promotion and continue to the next active promotion
      if (categoryCandidates.length === 0) {
        continue;
      }

      const featured = categoryCandidates.find((p) => p.featured === true);
      chosenProduct = featured || categoryCandidates[0] || null;
    } else {
      // Specific products: Candidates are only selected eligible available products
      for (const pid of promo.applicableProductIds) {
        if (pid === "*") continue;
        const prod = productById.get(pid);
        if (prod && prod.available !== false) {
          chosenProduct = prod;
          break;
        }
      }

      // If not in products list but joined in promo.products, check promo.products
      if (!chosenProduct && Array.isArray(promo.products) && promo.products.length > 0) {
        for (const item of promo.products) {
          if (item && item.isAvailable !== false) {
            chosenProduct = {
              id: item.id,
              name: item.name,
              slug: item.slug || item.id,
              categorySlug: "other",
              description: "",
              ingredients: [],
              price: item.price,
              image: item.imageUrl || "/images/classic-burger.jpg",
              available: item.isAvailable,
              featured: false,
            };
            break;
          }
        }
      }

      // If no targeted products are available, skip this promotion and continue
      if (!chosenProduct) {
        continue;
      }
    }

    // If an eligible available product was resolved for this active promotion
    if (chosenProduct) {
      const originalPrice = Number(chosenProduct.price) || 0;
      const discountedPrice = calculateDiscountedPrice(
        originalPrice,
        promo.discountType,
        promo.discountValue,
      );

      return {
        promotion: promo,
        product: chosenProduct,
        originalPrice,
        discountedPrice,
        hasDiscount: discountedPrice < originalPrice,
        discountBadge: formatDiscount(promo),
        expiryLabel: formatPromotionExpiry(promo.endDate),
        headline: chosenProduct.name,
        description: promo.description?.trim() || chosenProduct.description || "",
      };
    }
  }

  // Rule 8: No active promotion yields an available product
  return null;
}

/**
 * Normalizes a raw Supabase promotion record into the frontend Promotion type.
 */
function normalizePromotionRecord(raw: any): Promotion {
  const categoryRaw = Array.isArray(raw.categories) ? raw.categories[0] : raw.categories;
  const promoProductsRaw = Array.isArray(raw.promotion_products) ? raw.promotion_products : [];

  const normalizedProducts: PromotionProductItem[] = [];
  const applicableProductIds: string[] = [];

  if (promoProductsRaw.length > 0) {
    for (const item of promoProductsRaw) {
      if (item && item.product_id) {
        applicableProductIds.push(item.product_id);
        const prod = Array.isArray(item.products) ? item.products[0] : item.products;
        if (prod) {
          normalizedProducts.push({
            id: prod.id,
            name: prod.name || "Menu item",
            slug: prod.slug || "",
            price: Number(prod.price) || 0,
            imageUrl: prod.image_url ?? null,
            isAvailable: prod.is_available ?? true,
            categoryId: prod.category_id ?? null,
          });
        }
      }
    }
  }

  const categoryId = raw.category_id ?? categoryRaw?.id ?? null;
  const isCategory = Boolean(categoryId);
  const isLegacyAll =
    !isCategory &&
    Array.isArray(raw.applicableProductIds) &&
    raw.applicableProductIds.includes("*");
  const appliesToAll = isCategory ? false : Boolean(raw.applies_to_all) || isLegacyAll;

  let resolvedProductIds: string[] = [];
  if (isCategory) {
    resolvedProductIds = [];
  } else if (appliesToAll) {
    resolvedProductIds = [];
  } else {
    resolvedProductIds = applicableProductIds.filter((id) => id && id !== "*");
  }

  return {
    id: raw.id,
    name: raw.name || "Untitled Promotion",
    description: raw.description || "",
    discountType: (raw.discount_type as DiscountType) || "percentage",
    discountValue: Number(raw.discount_value) || 0,
    appliesToAll,
    applicableProductIds: resolvedProductIds,
    applicableCategorySlug: categoryRaw?.slug ?? undefined,
    categoryId,
    startDate: raw.start_date || "",
    endDate: raw.end_date || "",
    status: (raw.status as PromotionStatus) || "draft",
    minOrderAmount: raw.min_order_amount ? Number(raw.min_order_amount) : undefined,
    createdAt: raw.created_at || new Date().toISOString(),
    products: normalizedProducts,
  };
}

/**
 * Fetches all promotions joined with their categories and targeted products.
 */
export async function fetchAdminPromotions(): Promise<{
  data: Promotion[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await (supabase.from("promotions" as any) as any)
      .select(
        `
        id,
        name,
        description,
        discount_type,
        discount_value,
        applies_to_all,
        start_date,
        end_date,
        status,
        min_order_amount,
        category_id,
        created_at,
        categories (
          id,
          name,
          slug
        ),
        promotion_products (
          product_id,
          products (
            id,
            name,
            slug,
            price,
            image_url,
            is_available,
            category_id
          )
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const records = (data || []).map(normalizePromotionRecord);
    return { data: records, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to fetch promotions"),
    };
  }
}

/**
 * Fetches available menu products from the real Supabase products table
 * for the promotion product selection checklist.
 */
export async function fetchPromotionProductsList(): Promise<{
  data: PromotionProductItem[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await (supabase.from("products" as any) as any)
      .select("id, name, slug, price, image_url, category_id, is_available")
      .order("name", { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const items: PromotionProductItem[] = (data || []).map((p: any) => ({
      id: p.id,
      name: p.name || "Item",
      slug: p.slug || "",
      price: Number(p.price) || 0,
      imageUrl: p.image_url ?? null,
      isAvailable: p.is_available ?? true,
      categoryId: p.category_id ?? null,
    }));

    return { data: items, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to load products list"),
    };
  }
}

/**
 * Generates an RFC 4122 v4 UUID string.
 * Uses crypto.randomUUID() when available (secure contexts/modern environments),
 * and falls back to crypto.getRandomValues() in non-secure HTTP contexts or older engines.
 */
function generatePromotionId(): string {
  const cryptoObj =
    typeof globalThis !== "undefined" && globalThis.crypto
      ? globalThis.crypto
      : typeof crypto !== "undefined"
        ? crypto
        : undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);

    // RFC 4122 v4 compliance
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // 4-bit version 4 (0100)
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // 2-bit variant 1 (10)

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }

  throw new Error("No secure UUID generation API is available in this runtime.");
}

/**
 * Creates a promotion in Supabase and associates target products in promotion_products.
 * Generates a client-side UUID via generatePromotionId() because public.promotions.id
 * has no database default (column_default = NULL).
 * If targetProductIds is ["*"], zero rows are added to promotion_products (Universal Promotion).
 */
export async function createAdminPromotion(
  input: CreatePromotionInput,
  targetProductIds: string[],
  targetTypeParam?: PromotionTargetType,
): Promise<{ data: Promotion | null; error: Error | null }> {
  try {
    const promotionId = generatePromotionId();

    const inferredTargetType: PromotionTargetType =
      targetTypeParam ||
      (input.categoryId ? "category" : targetProductIds.includes("*") ? "all" : "products");

    const targeting = normalizePromotionTargeting(
      inferredTargetType,
      input.categoryId,
      targetProductIds,
    );

    // 1. Construct insert payload with generated UUID
    const insertPayload: {
      id: string;
      name: string;
      description: string | null;
      discount_type: DiscountType;
      discount_value: number;
      applies_to_all: boolean;
      category_id: string | null;
      start_date: string;
      end_date: string;
      status: PromotionStatus;
      min_order_amount: number | null;
    } = {
      id: promotionId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      applies_to_all: targeting.appliesToAll,
      category_id: targeting.categoryId,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status,
      min_order_amount: input.minOrderAmount ?? null,
    };

    const { data: promo, error: promoError } = await (supabase.from("promotions" as any) as any)
      .insert(insertPayload)
      .select()
      .single();

    if (promoError || !promo) {
      return {
        data: null,
        error: new Error(promoError?.message || "Failed to insert promotion"),
      };
    }

    // 2. If targeting specific products, insert junction rows
    if (inferredTargetType === "products" && targeting.targetProductIds.length > 0) {
      const junctionRows = targeting.targetProductIds.map((pid) => ({
        promotion_id: promotionId,
        product_id: pid,
      }));

      const { error: junctionError } = await (
        supabase.from("promotion_products" as any) as any
      ).insert(junctionRows);

      if (junctionError) {
        return {
          data: null,
          error: new Error(
            `Promotion created, but failed to associate targeted products: ${junctionError.message}`,
          ),
        };
      }
    }

    return {
      data: {
        id: promo.id,
        name: promo.name,
        description: promo.description || "",
        discountType: promo.discount_type as DiscountType,
        discountValue: Number(promo.discount_value),
        appliesToAll: targeting.appliesToAll,
        applicableProductIds: targeting.targetProductIds,
        categoryId: targeting.categoryId,
        startDate: promo.start_date,
        endDate: promo.end_date,
        status: promo.status as PromotionStatus,
        minOrderAmount: promo.min_order_amount ? Number(promo.min_order_amount) : undefined,
        createdAt: promo.created_at,
      },
      error: null,
    };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("An unexpected error occurred during creation"),
    };
  }
}

/**
 * Updates an existing promotion in Supabase and synchronizes its promotion_products junction rows.
 */
export async function updateAdminPromotion(
  id: string,
  input: UpdatePromotionInput,
  targetProductIds: string[],
  targetTypeParam?: PromotionTargetType,
): Promise<{ error: Error | null }> {
  try {
    const inferredTargetType: PromotionTargetType =
      targetTypeParam ||
      (input.categoryId ? "category" : targetProductIds.includes("*") ? "all" : "products");

    const targeting = normalizePromotionTargeting(
      inferredTargetType,
      input.categoryId,
      targetProductIds,
    );

    // 1. Update promotion terms
    const updatePayload: {
      name: string;
      description: string | null;
      discount_type: DiscountType;
      discount_value: number;
      applies_to_all: boolean;
      category_id: string | null;
      start_date: string;
      end_date: string;
      status: PromotionStatus;
      min_order_amount: number | null;
    } = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      applies_to_all: targeting.appliesToAll,
      category_id: targeting.categoryId,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status,
      min_order_amount: input.minOrderAmount ?? null,
    };

    const { error: promoError } = await (supabase.from("promotions" as any) as any)
      .update(updatePayload)
      .eq("id", id);

    if (promoError) {
      return { error: new Error(promoError.message) };
    }

    // 2. Synchronize junction rows: remove existing associations
    const { error: deleteError } = await (supabase.from("promotion_products" as any) as any)
      .delete()
      .eq("promotion_id", id);

    if (deleteError) {
      return {
        error: new Error(
          `Promotion details updated, but failed to clear previous product associations: ${deleteError.message}`,
        ),
      };
    }

    // 3. Insert new junction rows ONLY if target type is "products"
    if (inferredTargetType === "products" && targeting.targetProductIds.length > 0) {
      const junctionRows = targeting.targetProductIds.map((pid) => ({
        promotion_id: id,
        product_id: pid,
      }));

      const { error: insertError } = await (
        supabase.from("promotion_products" as any) as any
      ).insert(junctionRows);

      if (insertError) {
        return {
          error: new Error(
            `Promotion details updated, but failed to save new product associations: ${insertError.message}`,
          ),
        };
      }
    }

    return { error: null };
  } catch (err: any) {
    return {
      error: err instanceof Error ? err : new Error("An unexpected error occurred during update"),
    };
  }
}

/**
 * Deletes a promotion from Supabase. Explicitly clears dependent junction rows first
 * to ensure deletion succeeds regardless of database cascade configuration.
 */
export async function deleteAdminPromotion(id: string): Promise<{ error: Error | null }> {
  try {
    // 1. Clear any dependent junction records
    await (supabase.from("promotion_products" as any) as any).delete().eq("promotion_id", id);

    // 2. Delete promotion
    const { error } = await (supabase.from("promotions" as any) as any).delete().eq("id", id);

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err: any) {
    return {
      error: err instanceof Error ? err : new Error("An unexpected error occurred during deletion"),
    };
  }
}
