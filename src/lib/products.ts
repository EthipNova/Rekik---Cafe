/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabase";
import { deleteProductImageFromStorage } from "./product-images";

export type Product = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  categorySlug: string;
  categoryName?: string;
  description: string;
  ingredients: string[];
  price: number;
  image: string;
  available: boolean;
  featured: boolean;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  isActive: boolean;
};

export type CreateProductInput = {
  id?: string;
  name: string;
  price: number;
  categoryId: string;
  imageUrl?: string;
  description?: string;
};

export type UpdateProductInput = {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  imageUrl?: string;
  description?: string;
};

/**
 * Generates an RFC 4122 v4 UUID string with runtime compatibility fallbacks.
 * Uses crypto.randomUUID() when available, falling back to crypto.getRandomValues().
 */
function generateUUID(): string {
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

  // Non-crypto fallback in rare legacy environments
  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generates a unique product ID adhering to the database UUID format.
 */
export function generateProductId(): string {
  return generateUUID();
}

/**
 * Generates a clean URL slug from a product name.
 * e.g., "Classic Burger" -> "classic-burger"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Formats currency values consistently in ETB.
 */
export function formatETB(amount: number): string {
  return `${amount.toLocaleString("en-US")} ETB`;
}

/**
 * Normalizes a raw Supabase product record into the UI Product model.
 */
function normalizeProductRecord(raw: any, categoriesList?: Category[]): Product {
  const categoryRaw = Array.isArray(raw?.categories) ? raw.categories[0] : raw?.categories;
  const categoryId = raw?.category_id ?? categoryRaw?.id ?? "";

  let categorySlug = categoryRaw?.slug ?? "";
  let categoryName = categoryRaw?.name ?? "";

  if ((!categorySlug || !categoryName) && categoriesList && categoryId) {
    const matched = categoriesList.find((c) => c.id === categoryId);
    if (matched) {
      categorySlug = matched.slug;
      categoryName = matched.name;
    }
  }

  return {
    id: raw?.id ?? "",
    name: raw?.name ?? "",
    slug: raw?.slug ?? "",
    categoryId,
    categorySlug,
    categoryName,
    description: raw?.description ?? "",
    ingredients: Array.isArray(raw?.ingredients) ? raw.ingredients : [],
    price: Number(raw?.price) || 0,
    image: raw?.image_url ?? "",
    available: raw?.is_available ?? false,
    featured: raw?.is_featured ?? false,
  };
}

/**
 * Normalizes a raw Supabase category record into Category.
 */
function normalizeCategoryRecord(raw: any): Category {
  return {
    id: raw?.id ?? "",
    slug: raw?.slug ?? "",
    name: raw?.name ?? "",
    tagline: raw?.description ?? raw?.tagline ?? "",
    isActive: raw?.is_active ?? true,
  };
}

/**
 * Fetches all products with relational categories from Supabase.
 */
export async function fetchAdminProducts(): Promise<{
  data: Product[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await (supabase.from("products" as any) as any)
      .select(
        `
        id,
        category_id,
        name,
        slug,
        description,
        price,
        image_url,
        is_available,
        is_featured,
        ingredients,
        created_at,
        updated_at,
        categories (
          id,
          slug,
          name,
          description,
          is_active
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const products = (data || []).map((row: any) => normalizeProductRecord(row));
    return { data: products, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to load products"),
    };
  }
}

/**
 * Fetches all categories from Supabase.
 */
export async function fetchAdminCategories(): Promise<{
  data: Category[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await (supabase.from("categories" as any) as any)
      .select("id, slug, name, description, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const categories = (data || []).map((row: any) => normalizeCategoryRecord(row));
    return { data: categories, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to load categories"),
    };
  }
}

/**
 * Maps PostgreSQL and Supabase database error codes into user-friendly, specific error messages.
 * Differentiates constraint violations (unique, check, not-null, foreign key, RLS)
 * according to the exact constraint or column involved.
 */
export function mapProductDatabaseError(
  error: any,
  operation: "create" | "update" | "delete" | "read" = "create",
): Error {
  if (!error) return new Error(`Failed to ${operation} product.`);

  const code = String(error.code || "").trim();
  const msg = String(error.message || "").toLowerCase();
  const details = String(error.details || "").toLowerCase();
  const hint = String(error.hint || "").toLowerCase();
  const combined = `${code} ${msg} ${details} ${hint}`;

  // 1. PostgreSQL 23505: Unique Constraint Violation
  if (code === "23505" || combined.includes("unique") || combined.includes("duplicate key")) {
    if (combined.includes("products_slug_key") || combined.includes("slug")) {
      return new Error("A product with this name already exists (duplicate URL slug).");
    }
    if (combined.includes("products_pkey") || combined.includes("id")) {
      return new Error("A product with this unique ID already exists in the system.");
    }
    return new Error("A unique constraint violation occurred for this product.");
  }

  // 2. PostgreSQL 23514: Check Constraint Violation
  if (code === "23514" || combined.includes("check constraint")) {
    if (combined.includes("products_price_check") || combined.includes("price")) {
      return new Error("Product price must be greater than or equal to 0 ETB.");
    }
    if (combined.includes("products_name_not_empty") || combined.includes("name")) {
      return new Error("Product name cannot be empty or whitespace only.");
    }
    if (combined.includes("products_slug_not_empty") || combined.includes("slug")) {
      return new Error("Product slug cannot be empty.");
    }
    if (combined.includes("check_products_stock_quantity_non_negative")) {
      return new Error("Stock quantity cannot be negative.");
    }
    return new Error("A constraint check failed for this product data.");
  }

  // 3. PostgreSQL 23502: NOT NULL Violation
  if (
    code === "23502" ||
    combined.includes("violates not-null constraint") ||
    combined.includes("null value in column")
  ) {
    if (combined.includes("category_id") || combined.includes("category")) {
      return new Error("Please select a valid product category.");
    }
    if (combined.includes("name")) {
      return new Error("Product name is required.");
    }
    if (combined.includes("price")) {
      return new Error("Product price is required.");
    }
    return new Error("A required product field is missing.");
  }

  // 4. PostgreSQL 23503: Foreign Key Violation
  if (
    code === "23503" ||
    combined.includes("foreign key") ||
    combined.includes("violates foreign key constraint")
  ) {
    if (
      operation === "delete" ||
      combined.includes("stock_movements") ||
      combined.includes("order_items")
    ) {
      return new Error(
        "This product cannot be deleted because it is referenced in inventory tracking or customer order history. Disable product availability instead.",
      );
    }
    if (combined.includes("category_id") || combined.includes("categories")) {
      return new Error("The selected category does not exist or has been removed.");
    }
    return new Error("A relational constraint prevents this operation.");
  }

  // 5. PostgreSQL 42501: Insufficient Privilege / RLS Policy Denied
  if (
    code === "42501" ||
    combined.includes("row-level security") ||
    combined.includes("permission denied")
  ) {
    return new Error(
      "Access denied: You do not have permission to manage products. Please verify you are logged in as an active staff member or administrator.",
    );
  }

  return error instanceof Error
    ? error
    : new Error(error.message || `Failed to ${operation} product`);
}

/**
 * Creates a new product in public.products.
 * Generates an application ID (since products.id has no DB default)
 * and generates a unique slug.
 */
export async function createAdminProduct(
  input: CreateProductInput,
  categoriesList?: Category[],
): Promise<{
  data: Product | null;
  error: Error | null;
}> {
  try {
    const trimmedName = input.name?.trim() || "";
    if (!trimmedName) {
      return {
        data: null,
        error: new Error("Product name cannot be empty or whitespace only."),
      };
    }

    if (!input.categoryId?.trim()) {
      return {
        data: null,
        error: new Error("Please select a valid product category."),
      };
    }

    if (typeof input.price !== "number" || isNaN(input.price) || input.price < 0) {
      return {
        data: null,
        error: new Error("Product price must be greater than or equal to 0 ETB."),
      };
    }

    const id = input.id || generateProductId();
    const slug = generateSlug(trimmedName);

    if (!slug) {
      return {
        data: null,
        error: new Error("A valid product name is required to generate a slug."),
      };
    }

    const newRecord = {
      id,
      category_id: input.categoryId.trim(),
      name: trimmedName,
      slug,
      description: input.description?.trim() || "",
      price: input.price,
      image_url: input.imageUrl?.trim() || "",
      is_available: true,
      is_featured: false,
      ingredients: [],
    };

    const { data, error } = await (supabase.from("products" as any) as any)
      .insert(newRecord)
      .select(
        `
        id,
        category_id,
        name,
        slug,
        description,
        price,
        image_url,
        is_available,
        is_featured,
        ingredients,
        created_at,
        updated_at,
        categories (
          id,
          slug,
          name,
          description,
          is_active
        )
      `,
      )
      .single();

    if (error) {
      return { data: null, error: mapProductDatabaseError(error, "create") };
    }

    return { data: normalizeProductRecord(data, categoriesList), error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to create product"),
    };
  }
}

/**
 * Updates an existing product in public.products.
 * Preserves the existing slug, id, image_url, ingredients, is_available, is_featured.
 */
export async function updateAdminProduct(
  input: UpdateProductInput,
  categoriesList?: Category[],
): Promise<{
  data: Product | null;
  error: Error | null;
}> {
  try {
    const trimmedName = input.name?.trim() || "";
    if (!trimmedName) {
      return {
        data: null,
        error: new Error("Product name cannot be empty or whitespace only."),
      };
    }

    if (!input.categoryId?.trim()) {
      return {
        data: null,
        error: new Error("Please select a valid product category."),
      };
    }

    if (typeof input.price !== "number" || isNaN(input.price) || input.price < 0) {
      return {
        data: null,
        error: new Error("Product price must be greater than or equal to 0 ETB."),
      };
    }

    const updateFields: {
      name: string;
      category_id: string;
      price: number;
      description: string;
      updated_at: string;
      image_url?: string;
    } = {
      name: trimmedName,
      category_id: input.categoryId.trim(),
      price: input.price,
      description: input.description?.trim() || "",
      updated_at: new Date().toISOString(),
    };

    if (input.imageUrl !== undefined) {
      updateFields.image_url = input.imageUrl.trim();
    }

    const { data, error } = await (supabase.from("products" as any) as any)
      .update(updateFields)
      .eq("id", input.id)
      .select(
        `
        id,
        category_id,
        name,
        slug,
        description,
        price,
        image_url,
        is_available,
        is_featured,
        ingredients,
        created_at,
        updated_at,
        categories (
          id,
          slug,
          name,
          description,
          is_active
        )
      `,
      )
      .single();

    if (error) {
      return { data: null, error: mapProductDatabaseError(error, "update") };
    }

    return { data: normalizeProductRecord(data, categoriesList), error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to update product"),
    };
  }
}

/**
 * Deletes an existing product in public.products and safely cleans up its associated storage image.
 *
 * Safety & Transaction Semantics:
 * 1. Executes PostgreSQL DELETE on public.products FIRST.
 * 2. If PostgreSQL deletion fails (e.g. Foreign Key restriction 23503 from inventory or orders),
 *    the operation aborts immediately and the storage image is PRESERVED.
 * 3. Only if PostgreSQL deletion succeeds does it attempt cleanup of product-specific images in Storage.
 * 4. Storage cleanup failures are captured and returned in the 'warning' field, without falsely
 *    claiming failure of the database deletion or claiming a distributed atomic transaction.
 */
export async function deleteAdminProduct(
  id: string,
  imageUrl?: string,
): Promise<{
  success: boolean;
  error: Error | null;
  warning: string | null;
}> {
  try {
    if (!id || typeof id !== "string" || !id.trim()) {
      return {
        success: false,
        error: new Error("A valid product ID is required for deletion."),
        warning: null,
      };
    }

    const cleanId = id.trim();

    // 1. Delete from PostgreSQL database first
    const { data, error: dbError } = await (supabase.from("products" as any) as any)
      .delete()
      .eq("id", cleanId)
      .select("id, name, image_url");

    if (dbError) {
      return {
        success: false,
        error: mapProductDatabaseError(dbError, "delete"),
        warning: null,
      };
    }

    // If RLS blocked the delete or ID was not found, PostgREST returns 0 rows without error
    if (!data || data.length === 0) {
      return {
        success: false,
        error: new Error("Product was not found or you lack permission to delete it."),
        warning: null,
      };
    }

    // 2. Identify the target image URL for cleanup
    const targetImageUrl = imageUrl || data[0]?.image_url;
    let warning: string | null = null;

    if (targetImageUrl && typeof targetImageUrl === "string" && targetImageUrl.trim()) {
      const storageResult = await deleteProductImageFromStorage(targetImageUrl.trim(), cleanId);
      if (!storageResult.success && !storageResult.skipped && storageResult.error) {
        warning = `Product was deleted from database, but image storage cleanup failed: ${storageResult.error.message}`;
        console.warn(warning);
      }
    }

    return {
      success: true,
      error: null,
      warning,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Unexpected error deleting product."),
      warning: null,
    };
  }
}

/**
 * Toggles product availability (active/inactive switch) in public.products.
 * Only modifies is_available and updated_at.
 */
export async function toggleAdminProductAvailability(
  id: string,
  isAvailable: boolean,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await (supabase.from("products" as any) as any)
      .update({
        is_available: isAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return { success: false, error: mapProductDatabaseError(error, "update") };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to update product availability"),
    };
  }
}
