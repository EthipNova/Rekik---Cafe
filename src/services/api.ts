/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * NEBA Café — Frontend Data-Fetching Service Layer (src/services/api.ts)
 * ============================================================================
 * Provides typed helper functions to interact with NEBA Café API endpoints
 * and live Supabase database tables with automatic cart product registry sync.
 */

import { registerProduct, registerProducts, type Category, type Product } from "@/lib/menu-data";
import {
  findOrder,
  readOrders,
  saveOrder,
  writeOrders,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@/lib/orders";
import type {
  Promotion,
  DiscountType,
  PromotionStatus,
  PromotionProductItem,
} from "@/lib/promotions";
import { DEFAULT_SETTINGS, normalizeStoreSettings, type NebaSettings } from "@/lib/settings";
import { type AboutContent, DEFAULT_ABOUT_CONTENT, normalizeAboutContent } from "@/lib/content";
import { supabase } from "@/lib/supabase";
import type { ContactMessage, CreateContactMessageInput } from "@/lib/contact";

/**
 * Custom error class for API request failures with HTTP status and server error payload.
 */
export class ApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Resolves the base URL for isomorphic fetch (works both in browser and server-side).
 */
function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const proc = typeof process !== "undefined" ? process.env : undefined;
  const configuredAppUrl =
    (import.meta.env["VITE_APP_URL"] as string | undefined) ||
    (proc ? proc["VITE_APP_URL"] : undefined);

  if (configuredAppUrl && configuredAppUrl.trim()) {
    return configuredAppUrl.trim().replace(/\/+$/, "");
  }

  // On Vercel, VERCEL_URL is automatically populated with the deployment domain (e.g. neba-cafe.vercel.app)
  if (proc?.["VERCEL_URL"]) {
    const host = proc["VERCEL_URL"].trim().replace(/\/+$/, "");
    return host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`;
  }

  // Development-only fallback to local dev server
  return "http://localhost:8080";
}

/**
 * Internal generic HTTP request helper with unified error handling and timeout support.
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  // Automatically attach active session Bearer token in browser when not explicitly specified
  if (!headers.has("Authorization") && typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      /* ignore */
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      const errorMessage =
        (typeof errorData === "object" &&
        errorData !== null &&
        "message" in errorData &&
        (errorData as any).message
          ? String((errorData as { message: unknown }).message)
          : typeof errorData === "object" && errorData !== null && "error" in errorData
            ? String((errorData as { error: unknown }).error)
            : null) || `Request failed with status ${response.status} (${response.statusText})`;

      throw new ApiError(errorMessage, response.status, errorData);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Network request timed out", 408);
    }
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new ApiError(message, 0);
  } finally {
    clearTimeout(timeoutId);
  }
}

function getFallbackImage(name: string, categorySlug?: string): string {
  const n = name.toLowerCase();
  const cat = (categorySlug || "").toLowerCase();

  if (n.includes("pizza") || cat.includes("pizza")) return "/images/margherita.jpg";
  if (n.includes("chicken") && n.includes("burger")) return "/images/chicken-burger.jpg";
  if (n.includes("cheese") && n.includes("burger")) return "/images/cheese-burger.jpg";
  if (n.includes("burger") || cat.includes("burger")) return "/images/classic-burger.jpg";
  if (n.includes("fries") || n.includes("chip") || cat.includes("side"))
    return "/images/fries.jpg";
  if (n.includes("sprite")) return "/images/sprite.jpg";
  if (n.includes("water")) return "/images/water.jpg";
  if (n.includes("drink") || n.includes("cola") || cat.includes("drink"))
    return "/images/cola.jpg";
  return "/images/hero.jpg";
}

/* ==========================================================================
   1. Categories
   ========================================================================== */

/**
 * Fetches all menu categories from API or directly from Supabase.
 */
export async function fetchCategories(): Promise<Category[]> {
  try {
    const data = await request<Category[]>("/api/categories");
    if (Array.isArray(data)) return data;
  } catch {
    // Fallback directly to Supabase client
  }

  try {
    const { data, error } = await supabase
      .from("categories" as any)
      .select("id, slug, name, tagline, is_active")
      .order("name", { ascending: true });

    if (!error && Array.isArray(data)) {
      return data.map((c: any) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        tagline: c.tagline || "",
        active: c.is_active ?? true,
      }));
    }
  } catch (err) {
    console.warn("fetchCategories Supabase fallback failed:", err);
  }

  return [];
}

/* ==========================================================================
   2. Products
   ========================================================================== */

export interface FetchProductsOptions {
  category?: string | undefined;
  available?: boolean | undefined;
}

/**
 * Fetches all products with optional category and availability filtering.
 * Automatically registers fetched products into the cart registry.
 */
export async function fetchProducts(options?: FetchProductsOptions): Promise<Product[]> {
  const params = new URLSearchParams();
  if (options?.category) {
    params.set("category", options.category);
  }
  if (typeof options?.available === "boolean") {
    params.set("available", String(options.available));
  }

  const query = params.toString();

  try {
    const products = await request<Product[]>(`/api/products${query ? `?${query}` : ""}`);
    if (Array.isArray(products)) {
      registerProducts(products);
      return products;
    }
  } catch {
    // Fallback directly to Supabase client
  }

  try {
    let queryBuilder = (supabase.from("products" as any) as any)
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

    if (typeof options?.available === "boolean") {
      queryBuilder = queryBuilder.eq("is_available", options.available);
    }

    const { data, error } = await queryBuilder;

    if (!error && Array.isArray(data)) {
      let products: Product[] = data.map((raw: any) => {
        const cat = Array.isArray(raw.categories) ? raw.categories[0] : raw.categories;
        const catSlug = cat?.slug || raw.category_slug || "other";
        const img = raw.image_url?.trim() || getFallbackImage(raw.name, catSlug);
        return {
          id: raw.id,
          categoryId: raw.category_id || cat?.id || undefined,
          name: raw.name,
          slug: raw.slug || raw.id,
          categorySlug: catSlug,
          description: raw.description || "",
          ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : [],
          price: Number(raw.price) || 0,
          image: img,
          available: raw.is_available ?? true,
          featured: raw.is_featured ?? false,
        };
      });

      if (options?.category) {
        products = products.filter((p) => p.categorySlug === options.category);
      }

      registerProducts(products);
      return products;
    }
  } catch (err) {
    console.warn("fetchProducts Supabase fallback failed:", err);
  }

  return [];
}

/**
 * Fetches single product details by ID or URL slug.
 */
export async function fetchProductById(id: string): Promise<Product> {
  try {
    const product = await request<Product>(`/api/products/${encodeURIComponent(id)}`);
    if (product) {
      registerProduct(product);
      return product;
    }
  } catch {
    // Fallback directly to Supabase client
  }

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
        categories (
          id,
          slug,
          name,
          tagline,
          is_active
        )
      `,
      )
      .or(`id.eq.${id},slug.eq.${id}`)
      .maybeSingle();

    if (!error && data) {
      const cat = Array.isArray(data.categories) ? data.categories[0] : data.categories;
      const catSlug = cat?.slug || data.category_slug || "other";
      const product: Product = {
        id: data.id,
        name: data.name,
        slug: data.slug || data.id,
        categorySlug: catSlug,
        description: data.description || "",
        ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
        price: Number(data.price) || 0,
        image: data.image_url?.trim() || getFallbackImage(data.name, catSlug),
        available: data.is_available ?? true,
        featured: data.is_featured ?? false,
      };
      registerProduct(product);
      return product;
    }
  } catch (err) {
    console.warn(`fetchProductById Supabase fallback failed for ${id}:`, err);
  }

  throw new ApiError(`Product '${id}' not found`, 404);
}

/**
 * Creates a new product menu item in the persistent database.
 */
export async function createProduct(
  data: Partial<Product> & { name: string; price: number; categoryId?: string },
): Promise<Product> {
  const created = await request<Product>("/api/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (created) registerProduct(created);
  return created;
}

/**
 * Updates an existing product's fields (pricing, description, availability, etc.).
 */
export async function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  const updated = await request<Product>(`/api/products/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (updated) registerProduct(updated);
  return updated;
}

/**
 * Toggles or sets product availability.
 */
export async function toggleAvailability(id: string, targetState?: boolean): Promise<Product> {
  let nextState = targetState;
  if (typeof nextState !== "boolean") {
    const current = await fetchProductById(id);
    nextState = !current.available;
  }
  return updateProduct(id, { available: nextState });
}

/**
 * Deletes a product by ID or slug.
 */
export async function deleteProduct(id: string): Promise<{ success: boolean; deletedId: string }> {
  return request<{ success: boolean; deletedId: string }>(
    `/api/products/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

/* ==========================================================================
   3. Promotions
   ========================================================================== */

/**
 * Fetches all current promotional offers.
 */
export async function fetchPromotions(): Promise<Promotion[]> {
  try {
    const data = await request<Promotion[]>("/api/promotions");
    if (data && data.length > 0) return data;
  } catch {
    // Fallback directly to Supabase client
  }

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

    if (!error && data && data.length > 0) {
      return data.map((raw: any) => {
        const cat = Array.isArray(raw.categories) ? raw.categories[0] : raw.categories;
        const promoProductsRaw = Array.isArray(raw.promotion_products)
          ? raw.promotion_products
          : [];
        const applicableProductIds: string[] = [];
        const normalizedProducts: PromotionProductItem[] = [];

        for (const item of promoProductsRaw) {
          if (item?.product_id) {
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

        const categoryId = raw.category_id ?? cat?.id ?? null;
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
          name: raw.name || "Promotion",
          description: raw.description || "",
          discountType: (raw.discount_type as DiscountType) || "percentage",
          discountValue: Number(raw.discount_value) || 0,
          appliesToAll,
          applicableProductIds: resolvedProductIds,
          applicableCategorySlug: cat?.slug || undefined,
          categoryId,
          startDate: raw.start_date || "",
          endDate: raw.end_date || "",
          status: (raw.status as PromotionStatus) || "active",
          minOrderAmount: raw.min_order_amount ? Number(raw.min_order_amount) : undefined,
          createdAt: raw.created_at || new Date().toISOString(),
          products: normalizedProducts,
        };
      });
    }
  } catch (err) {
    console.warn("fetchPromotions Supabase fallback failed:", err);
  }

  return [];
}

/**
 * Updates the promotions list or modifies an existing promotion.
 */
export async function updatePromotions(
  data: Promotion[] | (Partial<Promotion> & { id: string }),
): Promise<Promotion[]> {
  return request<Promotion[]>("/api/promotions", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Creates a new promotion campaign.
 */
export async function createPromotion(
  data: Partial<Promotion> & { name: string; discountValue: number },
): Promise<Promotion> {
  return request<Promotion>("/api/promotions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Deletes a promotion campaign by ID.
 */
export async function deletePromotion(
  id: string,
): Promise<{ success: boolean; deletedId: string }> {
  return request<{ success: boolean; deletedId: string }>(
    `/api/promotions/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

/* ==========================================================================
   4. Settings
   ========================================================================== */

/**
 * Fetches café profile information and operational settings.
 */
export async function fetchSettings(): Promise<NebaSettings> {
  try {
    const data = await request<NebaSettings>("/api/settings");
    if (data) return data;
  } catch {
    // Fallback directly to Supabase client
  }

  try {
    const { data, error } = await (supabase.from("store_settings" as any) as any)
      .select(
        "id, cafe_name, phone, email, address, opening_hours, delivery_fee, cafe_latitude, cafe_longitude, price_per_km, min_delivery_fee, max_delivery_distance_km, delivery_enabled, rounding_rule, updated_at",
      )
      .eq("id", 1)
      .maybeSingle();

    if (!error && data) {
      return normalizeStoreSettings(data);
    }
  } catch (err) {
    console.warn("fetchSettings Supabase fallback failed:", err);
  }

  return normalizeStoreSettings();
}

/**
 * Updates café profile information and settings in the database.
 */
export async function updateSettings(data: Partial<NebaSettings>): Promise<NebaSettings> {
  return request<NebaSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

function normalizeServiceOrder(raw: any): Order {
  const rawItems = Array.isArray(raw?.order_items) ? raw.order_items : [];
  const items: OrderItem[] = rawItems.map((item: any) => ({
    productId: item.product_id,
    name: item.name || item.products?.name || "Menu Item",
    quantity: Number(item.quantity) || 1,
    price: Number(item.unit_price) || 0,
  }));

  const paymentRaw = Array.isArray(raw?.payments) ? raw.payments[0] : raw?.payments;
  const paymentStatus = paymentRaw?.status || "paid";
  const paymentMethod = paymentRaw?.method || "Mobile Payment";

  return {
    id: raw.id,
    number: raw.order_number,
    createdAt: raw.created_at,
    method: raw.method || "dine-in",
    status: raw.status || "received",
    paymentStatus:
      paymentStatus === "paid" || paymentStatus === "pending" || paymentStatus === "failed"
        ? paymentStatus
        : "paid",
    paymentMethod,
    customer: {
      name: raw.customer_name || "Guest",
      phone: raw.customer_phone || "",
      table: raw.table_number || undefined,
      address: raw.delivery_address || undefined,
      latitude:
        raw.delivery_latitude !== null && raw.delivery_latitude !== undefined
          ? Number(raw.delivery_latitude)
          : null,
      longitude:
        raw.delivery_longitude !== null && raw.delivery_longitude !== undefined
          ? Number(raw.delivery_longitude)
          : null,
    },
    items,
    subtotal: Number(raw.subtotal) || 0,
    discount: Number(raw.discount_amount) || 0,
    delivery: Number(raw.delivery_fee) || 0,
    distanceKm:
      raw.delivery_distance_km !== null && raw.delivery_distance_km !== undefined
        ? Number(raw.delivery_distance_km)
        : null,
    total: Number(raw.total_amount) || 0,
    waiterId: raw.waiter_id || null,
    waiterName: raw.staff_profiles?.full_name || null,
    waiterDecision: raw.waiter_decision || "pending",
    waiterRejectionReason: raw.waiter_rejection_reason || null,
    paymentProof: Array.isArray(raw.payment_proofs) && raw.payment_proofs[0]
      ? {
          id: raw.payment_proofs[0].id,
          paymentId: raw.payment_proofs[0].payment_id,
          screenshotPath: raw.payment_proofs[0].screenshot_path,
          submittedAmount: Number(raw.payment_proofs[0].submitted_amount) || 0,
          transactionReference: raw.payment_proofs[0].transaction_reference || null,
          status: raw.payment_proofs[0].status || "pending",
          rejectionReason: raw.payment_proofs[0].rejection_reason || null,
          submittedAt: raw.payment_proofs[0].submitted_at || new Date().toISOString(),
        }
      : null,
  };
}

/* ==========================================================================
   5. Orders
   ========================================================================== */

export interface CreateOrderPayload {
  lines: {
    productId: string;
    name?: string | undefined;
    quantity: number;
    price?: number | undefined;
  }[];
  method: Order["method"];
  customer: Order["customer"];
  paymentMethod?: string | undefined;
  paymentStatus?: "paid" | "pending" | "failed" | undefined;
  delivery?: number | undefined;
  discount?: number | undefined;
  waiterId?: string | undefined;
  customerNotes?: string | undefined;
}

/**
 * Fetches all recorded customer orders (optionally filtered by customer phone).
/**
 * Fetches order history with authenticated user isolation.
 * If authenticated, passes Bearer token to retrieve only customer's owned orders (or operational orders for Admin/Staff).
 * If unauthenticated, returns empty list immediately without exposing other customer data.
 */
export async function fetchOrders(
  options?: { phone?: string | undefined; token?: string | undefined } | string,
): Promise<Order[]> {
  const customPhone = typeof options === "string" ? options : options?.phone;
  let token = typeof options === "object" ? options?.token : undefined;

  const headers: Record<string, string> = {};
  if (!token && typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    } catch {
      /* ignore */
    }
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    // Unauthenticated: return empty list immediately to prevent unauthenticated 401s or leaks
    return [];
  }

  const query = customPhone ? `?phone=${encodeURIComponent(customPhone)}` : "";
  try {
    const data = await request<Order[]>(`/api/orders${query}`, { headers });
    if (Array.isArray(data)) return data;
  } catch (err) {
    console.warn("fetchOrders API error:", err);
  }

  return [];
}

/**
 * Fetches a single order by ID or order number.
 */
export async function fetchOrderById(id: string): Promise<Order> {
  try {
    const order = await request<Order>(`/api/orders/${encodeURIComponent(id)}`);
    if (order) return order;
  } catch {
    // Fallback directly to Supabase client
  }

  try {
    const { data, error } = await (supabase.from("orders" as any) as any)
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        method,
        status,
        table_number,
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        delivery_distance_km,
        subtotal,
        discount_amount,
        delivery_fee,
        total_amount,
        created_at,
        updated_at,
        order_items (
          id,
          order_id,
          product_id,
          name,
          quantity,
          unit_price,
          line_total,
          products (
            id,
            name,
            image_url,
            price
          )
        ),
        payments (
          id,
          order_id,
          method,
          status,
          amount
        )
      `,
      )
      .or(`id.eq.${id},order_number.eq.${id}`)
      .maybeSingle();

    if (!error && data) {
      return normalizeServiceOrder(data);
    }
  } catch (err) {
    console.warn(`fetchOrderById Supabase fallback failed for ${id}:`, err);
  }

  const found = findOrder(id);
  if (found) return found;

  throw new ApiError(`Order '${id}' not found`, 404);
}

export interface CustomerProfileData {
  user: {
    id: string;
    email: string;
    role: string;
    full_name?: string | null;
    phone?: string | null;
  };
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  } | null;
}

/**
 * Fetches the authenticated customer profile from the server.
 */
export async function fetchCustomerProfile(options?: {
  token?: string | undefined;
}): Promise<CustomerProfileData | null> {
  const headers: Record<string, string> = {};
  let token = options?.token;
  if (!token && typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    } catch {
      return null;
    }
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    return null;
  }

  try {
    return await request<CustomerProfileData>("/api/customer/profile", { headers });
  } catch (err) {
    console.warn("fetchCustomerProfile failed:", err);
    return null;
  }
}

/**
 * Updates the authenticated customer's profile fields.
 */
export async function updateCustomerProfile(payload: {
  full_name?: string;
  phone?: string;
}): Promise<CustomerProfileData | null> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        throw new ApiError("Authentication required", 401);
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError("Authentication required", 401);
    }
  }

  return request<CustomerProfileData>("/api/customer/profile", {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
}

/**
 * Submits a new customer order.
 * If user is authenticated, passes Bearer token to automatically link order to customer profile.
 */
export async function createOrder(orderData: CreateOrderPayload): Promise<Order> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      /* ignore */
    }
  }

  const created = await request<Order>("/api/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(orderData),
  });
  if (created) {
    saveOrder(created);
    return created;
  }

  throw new ApiError("Failed to create order on server", 500);
}

/**
 * Updates order status (e.g., 'received', 'preparing', 'ready', 'delivered').
 */
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  options?: { token?: string | undefined },
): Promise<Order> {
  const headers: Record<string, string> = {};
  let token = options?.token;
  if (!token && typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    } catch {
      /* ignore */
    }
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const updated = await request<Order>(`/api/orders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status }),
  });
  if (updated) {
    saveOrder(updated);
    return updated;
  }

  throw new ApiError(`Order '${id}' not found`, 404);
}

/**
 * Updates order payment status and transaction details.
 */
export async function updateOrderPayment(
  id: string,
  data: {
    paymentStatus: "paid" | "pending" | "failed";
    paymentMethod?: string | undefined;
    transactionReference?: string | undefined;
  },
): Promise<Order> {
  const updated = await request<Order>(`/api/orders/${encodeURIComponent(id)}/payment`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (updated) {
    saveOrder(updated);
    return updated;
  }

  throw new ApiError(`Order '${id}' payment update failed`, 404);
}

/* ==========================================================================
   6. Website Content
   ========================================================================== */

/**
 * Fetches the singleton website content (homepage hero, about narrative, values).
 */
export async function fetchAboutContent(): Promise<AboutContent> {
  try {
    const data = await request<AboutContent>("/api/content");
    if (data) return normalizeAboutContent(data);
  } catch (err) {
    console.warn("fetchAboutContent API request failed:", err);
  }

  return { ...DEFAULT_ABOUT_CONTENT };
}

/**
 * Updates website content in the database (requires authenticated ADMIN session).
 */
export async function updateAboutContent(data: Partial<AboutContent>): Promise<AboutContent> {
  const headers: Record<string, string> = {};

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {
    // ignore if session unavailable in non-browser environment
  }

  return request<AboutContent>("/api/content", {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
}

/* ==========================================================================
   Contact Messages (Public Submission & Admin/Staff Management)
   ========================================================================== */

/**
 * Submits a contact message from the public Contact page.
 */
export async function submitContactMessage(
  data: CreateContactMessageInput,
): Promise<{ success: boolean; message: string; id?: string }> {
  return request<{ success: boolean; message: string; id?: string }>("/api/contact", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Fetches all contact messages for authenticated ADMIN / STAFF.
 */
export async function fetchContactMessages(options?: {
  token?: string | undefined;
}): Promise<ContactMessage[]> {
  const headers: Record<string, string> = {};
  let token = options?.token;

  if (!token) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    } catch {
      // non-browser or unauthenticated
    }
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return request<ContactMessage[]>("/api/contact-messages", {
    headers,
  });
}

/**
 * Updates the read status of a contact message (ADMIN / STAFF only).
 */
export async function updateContactMessageReadStatus(
  id: string,
  isRead: boolean,
  options?: { token?: string | undefined },
): Promise<ContactMessage> {
  const headers: Record<string, string> = {};
  let token = options?.token;

  if (!token) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    } catch {
      // non-browser or unauthenticated
    }
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return request<ContactMessage>(`/api/contact-messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ isRead }),
  });
}

/**
 * Deletes a contact message (ADMIN / STAFF only).
 */
export async function deleteContactMessage(
  id: string,
  options?: { token?: string | undefined },
): Promise<{ success: boolean; deletedId: string }> {
  const headers: Record<string, string> = {};
  let token = options?.token;

  if (!token) {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    } catch {
      // non-browser or unauthenticated
    }
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return request<{ success: boolean; deletedId: string }>(
    `/api/contact-messages/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers,
    },
  );
}

/**
 * Submits a payment proof screenshot and transaction reference for cashier review.
 */
export async function submitPaymentProof(
  orderId: string,
  payload: {
    screenshotPath?: string | undefined;
    imageBase64?: string | undefined;
    mimeType?: string | undefined;
    submittedAmount?: number | undefined;
    transactionReference?: string | undefined;
    paymentMethod?: string | undefined;
  },
): Promise<Order> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      /* ignore */
    }
  }

  const updated = await request<Order>(`/api/orders/${encodeURIComponent(orderId)}/payment-proof`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (updated) {
    saveOrder(updated);
    return updated;
  }

  throw new ApiError("Failed to submit payment proof", 500);
}

/* ==========================================================================
   Waiters & Floor Staff
   ========================================================================== */

export interface AvailableWaiter {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  isAvailable?: boolean;
  isActive?: boolean;
}

/**
 * Fetches the list of active and available floor waiters from the server.
 */
export async function fetchAvailableWaiters(): Promise<AvailableWaiter[]> {
  return request<AvailableWaiter[]>("/api/waiters/available");
}

/**
 * Records a waiter's approval or rejection decision on an assigned order.
 */
export async function recordWaiterDecision(
  orderIdOrParams: string | { orderId: string; decision: "approved" | "rejected"; reason?: string | undefined; comments?: string | undefined },
  decisionArg?: "approved" | "rejected",
  commentsArg?: string,
): Promise<Order> {
  const orderId = typeof orderIdOrParams === "string" ? orderIdOrParams : orderIdOrParams.orderId;
  const decision = typeof orderIdOrParams === "string" ? decisionArg! : orderIdOrParams.decision;
  const comments = typeof orderIdOrParams === "string" ? commentsArg : (orderIdOrParams.reason || orderIdOrParams.comments);

  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      /* ignore */
    }
  }

  const updated = await request<Order>(
    `/api/orders/${encodeURIComponent(orderId)}/waiter-decision`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ decision, comments }),
    },
  );
  if (updated) {
    saveOrder(updated);
  }
  return updated;
}

/**
 * Records payment details collected on the floor by an assigned waiter.
 */
export async function recordWaiterPaymentCollection(
  orderIdOrParams: string | { orderId: string; transactionReference: string; notes?: string | undefined },
  transactionReferenceArg?: string,
  notesArg?: string,
): Promise<Order> {
  const orderId = typeof orderIdOrParams === "string" ? orderIdOrParams : orderIdOrParams.orderId;
  const transactionReference =
    typeof orderIdOrParams === "string"
      ? transactionReferenceArg!
      : orderIdOrParams.transactionReference;
  const notes = typeof orderIdOrParams === "string" ? notesArg : orderIdOrParams.notes;

  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      /* ignore */
    }
  }

  const updated = await request<Order>(
    `/api/orders/${encodeURIComponent(orderId)}/waiter-payment-collection`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ transactionReference, notes }),
    },
  );
  if (updated) {
    saveOrder(updated);
  }
  return updated;
}

/**
 * Updates the customer's selected payment method on an existing order.
 */
export async function updateOrderPaymentMethod(
  orderIdOrParams: string | { orderId: string; paymentMethod: string },
  paymentMethodArg?: string,
): Promise<Order> {
  const orderId = typeof orderIdOrParams === "string" ? orderIdOrParams : orderIdOrParams.orderId;
  const paymentMethod =
    typeof orderIdOrParams === "string" ? paymentMethodArg! : orderIdOrParams.paymentMethod;

  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      /* ignore */
    }
  }

  const updated = await request<Order>(
    `/api/orders/${encodeURIComponent(orderId)}/payment-method`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ paymentMethod }),
    },
  );
  if (updated) {
    saveOrder(updated);
  }
  return updated;
}

