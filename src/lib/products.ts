import { supabase } from "./supabase";

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
 * Generates a unique product ID adhering to the PROD-XXXXXXXX-XXXX format.
 * products.id is VARCHAR with no DB default, so application must provide it.
 */
export function generateProductId(): string {
  const uuid = generateUUID();
  return `PROD-${uuid.slice(0, 8).toUpperCase()}-${uuid.slice(9, 13).toUpperCase()}`;
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
    tagline: raw?.tagline ?? "",
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
          tagline,
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
      .select("id, slug, name, tagline, is_active, created_at")
      .order("name", { ascending: true });

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
    const id = input.id || generateProductId();
    const slug = generateSlug(input.name);

    if (!slug) {
      return {
        data: null,
        error: new Error("A valid product name is required to generate a slug."),
      };
    }

    const newRecord = {
      id,
      category_id: input.categoryId,
      name: input.name.trim(),
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
          tagline,
          is_active
        )
      `,
      )
      .single();

    if (error) {
      // Handle duplicate slug PostgreSQL error 23505
      if (
        error.code === "23505" ||
        error.message?.includes("23505") ||
        error.message?.includes("duplicate key") ||
        error.message?.includes("products_slug_key")
      ) {
        return {
          data: null,
          error: new Error("A product with this name already exists."),
        };
      }
      return { data: null, error: new Error(error.message) };
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
    const updateFields: {
      name: string;
      category_id: string;
      price: number;
      description: string;
      updated_at: string;
      image_url?: string;
    } = {
      name: input.name.trim(),
      category_id: input.categoryId,
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
          tagline,
          is_active
        )
      `,
      )
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
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
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to update product availability"),
    };
  }
}
