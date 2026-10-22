import { supabase } from "./supabase";
import { toggleAdminProductAvailability } from "./products";

export type AvailabilityProduct = {
  id: string;
  name: string;
  available: boolean;
  categoryId?: string;
  categoryName?: string;
};

/**
 * Normalizes a raw Supabase product record into an AvailabilityProduct item.
 */
function normalizeAvailabilityProduct(raw: any): AvailabilityProduct {
  const categoryRaw = Array.isArray(raw?.categories) ? raw.categories[0] : raw?.categories;
  return {
    id: raw?.id ?? "",
    name: raw?.name ?? "",
    available: raw?.is_available ?? false,
    categoryId: raw?.category_id ?? categoryRaw?.id ?? "",
    categoryName: categoryRaw?.name ?? "",
  };
}

/**
 * Fetches all products from Supabase ordered alphabetically by name for availability management.
 */
export async function fetchAvailabilityProducts(): Promise<{
  data: AvailabilityProduct[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await (supabase.from("products" as any) as any)
      .select(
        `
        id,
        name,
        is_available,
        category_id,
        categories (
          id,
          name,
          slug
        )
      `,
      )
      .order("name", { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const products = (data || []).map((row: any) => normalizeAvailabilityProduct(row));
    return { data: products, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to load availability products"),
    };
  }
}

// Re-export single source of truth for toggling product availability
export { toggleAdminProductAvailability };
