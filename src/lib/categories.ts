import { supabase } from "./supabase";

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  active: boolean;
  productCount: number;
  createdAt?: string | undefined;
};

export type CreateCategoryInput = {
  name: string;
  tagline?: string | undefined;
};

type RawCategoryRecord = {
  id?: string;
  slug?: string;
  name?: string;
  tagline?: string;
  is_active?: boolean;
  created_at?: string;
  products?: { count: number | string }[];
};

type SupabaseCategoryClient = {
  from(table: string): {
    select(query?: string): {
      order(
        column: string,
        options?: { ascending?: boolean },
      ): Promise<{
        data: RawCategoryRecord[] | null;
        error: { message: string } | null;
      }>;
    };
    insert(record: Record<string, unknown>): {
      select(query?: string): {
        single(): Promise<{
          data: RawCategoryRecord | null;
          error: { message: string; code?: string; details?: string } | null;
        }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: unknown,
      ): Promise<{
        error: { message: string } | null;
      }>;
    };
    delete(): {
      eq(
        column: string,
        value: unknown,
      ): Promise<{
        error: { message: string; code?: string; details?: string } | null;
      }>;
    };
  };
};

const categoryDb = supabase as unknown as SupabaseCategoryClient;

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

  return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generates a clean URL slug from a category name.
 * e.g., "Chips & Sides" -> "chips-sides"
 */
export function generateCategorySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalizes a raw Supabase category record into AdminCategory.
 */
function normalizeCategoryRecord(raw: RawCategoryRecord): AdminCategory {
  let productCount = 0;
  if (Array.isArray(raw?.products) && raw.products.length > 0) {
    productCount = Number(raw.products[0]?.count) || 0;
  }

  return {
    id: raw?.id ?? "",
    slug: raw?.slug ?? "",
    name: raw?.name ?? "",
    tagline: raw?.tagline ?? "",
    active: Boolean(raw?.is_active),
    productCount,
    ...(raw?.created_at ? { createdAt: raw.created_at } : {}),
  };
}

/**
 * Creates a new category in public.categories with is_active = true and 0 products.
 * Does NOT create or assign any products.
 */
export async function createAdminCategory(input: CreateCategoryInput): Promise<{
  data: AdminCategory | null;
  error: Error | null;
}> {
  try {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      return { data: null, error: new Error("Category name is required.") };
    }

    const slug = generateCategorySlug(trimmedName);
    if (!slug) {
      return {
        data: null,
        error: new Error("A valid category name is required to generate a slug."),
      };
    }

    const id = generateUUID();
    const newRecord = {
      id,
      name: trimmedName,
      slug,
      tagline: input.tagline?.trim() || "New category",
      is_active: true,
    };

    const { data, error } = await categoryDb
      .from("categories")
      .insert(newRecord)
      .select(
        `
        id,
        slug,
        name,
        tagline,
        is_active,
        created_at
      `,
      )
      .single();

    if (error) {
      if (
        error.code === "23505" ||
        error.message?.includes("23505") ||
        error.message?.toLowerCase().includes("duplicate") ||
        error.message?.includes("categories_slug_key")
      ) {
        return {
          data: null,
          error: new Error("A category with this name already exists."),
        };
      }
      return { data: null, error: new Error(error.message) };
    }

    if (!data) {
      return { data: null, error: new Error("Failed to create category record.") };
    }

    return {
      data: {
        ...normalizeCategoryRecord(data),
        productCount: 0,
      },
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to create category"),
    };
  }
}

/**
 * Fetches all categories relational to product counts from Supabase.
 */
export async function fetchAdminCategories(): Promise<{
  data: AdminCategory[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await categoryDb
      .from("categories")
      .select(
        `
        id,
        slug,
        name,
        tagline,
        is_active,
        created_at,
        products (count)
      `,
      )
      .order("name", { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const categories = (data || []).map((row) => normalizeCategoryRecord(row));
    return { data: categories, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to load categories"),
    };
  }
}

/**
 * Toggles a category's is_active boolean flag in public.categories.
 * Only updates is_active. Does not send updated_at because that column does not exist.
 */
export async function toggleAdminCategoryActive(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await categoryDb
      .from("categories")
      .update({
        is_active: isActive,
      })
      .eq("id", id);

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to update category status"),
    };
  }
}

/**
 * Deletes a category record from public.categories.
 * Does not delete or cascade to products.
 * If foreign-key constraint 23503 is violated, returns a friendly error.
 */
export async function deleteAdminCategory(
  id: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await categoryDb.from("categories").delete().eq("id", id);

    if (error) {
      const isFkViolation =
        error.code === "23503" ||
        error.message?.toLowerCase().includes("foreign key") ||
        error.message?.includes("23503") ||
        error.details?.includes("23503");

      if (isFkViolation) {
        return {
          success: false,
          error: new Error(
            "Cannot delete a category that contains products. Reassign or remove its products first, or disable the category instead.",
          ),
        };
      }

      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to delete category"),
    };
  }
}
