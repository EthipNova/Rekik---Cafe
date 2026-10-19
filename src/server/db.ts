/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Category, Product } from "@/lib/menu-data";
import type { Order, OrderItem, OrderMethod, OrderStatus, PaymentProof } from "@/lib/orders";
import type { Promotion, DiscountType, PromotionStatus } from "@/lib/promotions";
import { DEFAULT_SETTINGS, normalizeStoreSettings, type NebaSettings } from "@/lib/settings";
import {
  calculateDeliveryFee,
  calculateHaversineDistance,
  isValidCoordinate,
} from "@/lib/distance";
import { serverSupabase as supabase, isSupabaseConfigured } from "./supabase";
import { type AboutContent, DEFAULT_ABOUT_CONTENT, normalizeAboutContent } from "@/lib/content";
import { createScopedClient } from "@/lib/supabase";
import type { ContactMessage, CreateContactMessageInput } from "@/lib/contact";

export interface DatabaseSchema {
  categories: Category[];
  products: Product[];
  promotions: Promotion[];
  settings: NebaSettings;
  orders: Order[];
  about_content?: AboutContent;
}

function resolveDbPath(): string {
  const cwd = process.cwd();
  const directPath = path.resolve(cwd, "data", "db.json");
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  const nestedPath = path.resolve(cwd, "NEBA-cafe-main", "data", "db.json");
  if (fs.existsSync(nestedPath)) {
    return nestedPath;
  }
  return directPath;
}

let writeLock = Promise.resolve();

/**
 * Safely reads the local database file as an offline/network fallback.
 */
export async function readDb(): Promise<DatabaseSchema> {
  const filePath = resolveDbPath();
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      promotions: Array.isArray(parsed.promotions) ? parsed.promotions : [],
      settings:
        parsed.settings && typeof parsed.settings === "object"
          ? (parsed.settings as NebaSettings)
          : { ...DEFAULT_SETTINGS },
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      about_content:
        parsed.about_content && typeof parsed.about_content === "object"
          ? normalizeAboutContent(parsed.about_content)
          : { ...DEFAULT_ABOUT_CONTENT },
    };
  } catch {
    return {
      categories: [],
      products: [],
      promotions: [],
      settings: { ...DEFAULT_SETTINGS },
      orders: [],
      about_content: { ...DEFAULT_ABOUT_CONTENT },
    };
  }
}

/**
 * Writes data to data/db.json for offline backup.
 */
export async function writeDb(data: DatabaseSchema): Promise<void> {
  // In serverless environments (e.g. Vercel) the filesystem is read-only.
  // Skip filesystem writes so operations rely purely on authoritative Supabase persistence.
  if (process.env["VERCEL"] || process.env["AWS_LAMBDA_FUNCTION_NAME"]) {
    return;
  }

  const filePath = resolveDbPath();
  const dir = path.dirname(filePath);

  writeLock = writeLock.then(async () => {
    try {
      await fsp.mkdir(dir, { recursive: true });
      const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      const jsonString = JSON.stringify(data, null, 2);
      await fsp.writeFile(tempPath, jsonString, "utf-8");
      await fsp.rename(tempPath, filePath);
    } catch (err) {
      console.warn("[db] Failed to write local db backup:", err);
    }
  });

  return writeLock;
}

/* ==========================================================================
   Image Helper
   ========================================================================== */

function getProductFallbackImage(name: string, categorySlug?: string): string {
  const n = name.toLowerCase();
  const cat = (categorySlug || "").toLowerCase();

  if (n.includes("pizza") || cat.includes("pizza")) {
    return "/images/margherita.jpg";
  }
  if (n.includes("chicken") && n.includes("burger")) {
    return "/images/chicken-burger.jpg";
  }
  if (n.includes("cheese") && n.includes("burger")) {
    return "/images/cheese-burger.jpg";
  }
  if (n.includes("burger") || cat.includes("burger")) {
    return "/images/classic-burger.jpg";
  }
  if (n.includes("fries") || n.includes("chip") || cat.includes("side")) {
    return "/images/fries.jpg";
  }
  if (n.includes("sprite")) {
    return "/images/sprite.jpg";
  }
  if (n.includes("water")) {
    return "/images/water.jpg";
  }
  if (n.includes("drink") || n.includes("cola") || cat.includes("drink")) {
    return "/images/cola.jpg";
  }
  return "/images/hero.jpg";
}

/* ==========================================================================
   Normalizers
   ========================================================================== */

function normalizeCategory(raw: any): Category {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    tagline: raw.tagline || "",
    active: raw.is_active ?? true,
  };
}

function normalizeProduct(raw: any): Product {
  const categoryRaw = Array.isArray(raw?.categories) ? raw.categories[0] : raw?.categories;
  const categorySlug = categoryRaw?.slug || raw.category_slug || "other";
  const rawImage = typeof raw.image_url === "string" ? raw.image_url.trim() : "";
  const image = rawImage || getProductFallbackImage(raw.name, categorySlug);

  return {
    id: raw.id,
    categoryId: raw.category_id || categoryRaw?.id || undefined,
    name: raw.name,
    slug: raw.slug || raw.id,
    categorySlug,
    description: raw.description || "",
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : [],
    price: Number(raw.price) || 0,
    image,
    available: raw.is_available ?? true,
    featured: raw.is_featured ?? false,
  };
}

function normalizePromotion(raw: any): Promotion {
  const categoryRaw = Array.isArray(raw?.categories) ? raw.categories[0] : raw?.categories;
  const promoProductsRaw = Array.isArray(raw?.promotion_products) ? raw.promotion_products : [];

  const applicableProductIds: string[] = [];
  const normalizedProducts: any[] = [];

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
    name: raw.name || "Special Promotion",
    description: raw.description || "",
    discountType: (raw.discount_type as DiscountType) || "percentage",
    discountValue: Number(raw.discount_value) || 0,
    appliesToAll,
    applicableProductIds: resolvedProductIds,
    applicableCategorySlug: categoryRaw?.slug ?? undefined,
    categoryId,
    startDate: raw.start_date || "",
    endDate: raw.end_date || "",
    status: (raw.status as PromotionStatus) || "active",
    minOrderAmount: raw.min_order_amount ? Number(raw.min_order_amount) : undefined,
    createdAt: raw.created_at || new Date().toISOString(),
    products: normalizedProducts,
  };
}

function normalizeOrder(raw: any): Order {
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

  const rawProofs = Array.isArray(raw?.payment_proofs)
    ? raw.payment_proofs
    : raw?.payment_proofs
      ? [raw.payment_proofs]
      : Array.isArray(paymentRaw?.payment_proofs)
        ? paymentRaw.payment_proofs
        : paymentRaw?.payment_proofs
          ? [paymentRaw.payment_proofs]
          : [];

  const proof = rawProofs.length > 0 ? rawProofs[0] : null;
  const transactionReference =
    paymentRaw?.transaction_reference || proof?.transaction_reference || raw?.transaction_reference || null;

  const paymentProof: PaymentProof | null = proof
    ? {
        id: proof.id,
        paymentId: proof.payment_id,
        orderId: proof.order_id,
        screenshotPath: proof.screenshot_path,
        screenshotUrl: proof.signed_url || proof.screenshot_path || null,
        submittedAmount: Number(proof.submitted_amount) || 0,
        transactionReference: proof.transaction_reference || null,
        status: proof.status || "pending",
        rejectionReason: proof.rejection_reason || null,
        reviewedBy: proof.reviewed_by || null,
        submittedAt: proof.submitted_at,
        createdAt: proof.submitted_at,
        reviewedAt: proof.reviewed_at || null,
        signedUrl: proof.signed_url || null,
      }
    : null;

  const rawStaff = raw?.staff_profiles;
  const waiterName =
    rawStaff?.full_name || raw?.waiter_name || (typeof raw?.waiter === "string" ? raw.waiter : null);
  const rawMethod = raw.method;
  const method: OrderMethod =
    rawMethod === "dine_in"
      ? "dine-in"
      : rawMethod === "pickup"
        ? "takeaway"
        : rawMethod === "takeaway" || rawMethod === "delivery"
          ? rawMethod
          : "dine-in";

  const rawStatus = raw.status;
  const status: OrderStatus =
    rawStatus === "pending"
      ? "received"
      : rawStatus || "received";

  return {
    id: raw.id,
    number: raw.order_number,
    createdAt: raw.created_at,
    method,
    status,
    paymentStatus:
      paymentStatus === "paid" || paymentStatus === "pending" || paymentStatus === "failed"
        ? paymentStatus
        : "paid",
    paymentMethod,
    transactionReference,
    paymentProof,
    waiterId: raw.waiter_id || null,
    waiterName: waiterName || null,
    waiterDecision: raw.waiter_decision || null,
    waiterAssignedAt: raw.waiter_assigned_at || null,
    waiterDecidedAt: raw.waiter_decided_at || null,
    waiterRejectionReason: raw.waiter_rejection_reason || null,
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
  };
}

/* ==========================================================================
   Categories (Live Supabase with Local Fallback)
   ========================================================================== */

export async function getCategories(): Promise<Category[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("categories" as any)
        .select("id, slug, name, tagline, is_active, created_at")
        .order("name", { ascending: true });

      if (!error && Array.isArray(data)) {
        return data.map(normalizeCategory);
      }
    } catch (err) {
      console.warn("[db] Failed to fetch categories from Supabase, using fallback:", err);
    }
  }

  const local = await readDb();
  return local.categories;
}

/* ==========================================================================
   Products (Live Supabase with Local Fallback)
   ========================================================================== */

export async function getProducts(options?: {
  category?: string | undefined;
  available?: boolean | undefined;
}): Promise<Product[]> {
  if (isSupabaseConfigured) {
    try {
      let query = (supabase.from("products" as any) as any)
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
        query = query.eq("is_available", options.available);
      }

      const { data, error } = await query;

      if (!error && Array.isArray(data)) {
        let products = data.map(normalizeProduct);
        if (options?.category) {
          products = products.filter((p: Product) => p.categorySlug === options.category);
        }
        return products;
      }
    } catch (err) {
      console.warn("[db] Failed to fetch products from Supabase, using fallback:", err);
    }
  }

  const local = await readDb();
  let results = local.products;
  if (options?.category) {
    results = results.filter((p) => p.categorySlug === options.category);
  }
  if (typeof options?.available === "boolean") {
    results = results.filter((p) => p.available === options.available);
  }
  return results;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  if (isSupabaseConfigured) {
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
        return normalizeProduct(data);
      }
    } catch (err) {
      console.warn(`[db] Failed to fetch product ${id} from Supabase:`, err);
    }
  }

  const local = await readDb();
  return local.products.find((p) => p.id === id || p.slug === id);
}

export async function createProduct(
  input: Partial<Product> & { name: string; price: number; categoryId?: string },
): Promise<Product> {
  const id = input.id || `PROD-${Date.now().toString(36).toUpperCase()}`;
  const slug =
    input.slug ||
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  try {
    const record = {
      id,
      name: input.name.trim(),
      slug,
      price: input.price,
      description: input.description || "",
      image_url: input.image || "",
      is_available: input.available ?? true,
      is_featured: input.featured ?? false,
      ingredients: input.ingredients || [],
      ...(input.categoryId ? { category_id: input.categoryId } : {}),
    };

    const { data, error } = await (supabase.from("products" as any) as any)
      .insert(record)
      .select("*, categories(*)")
      .single();

    if (!error && data) {
      return normalizeProduct(data);
    }
  } catch (err) {
    console.warn("[db] Supabase createProduct failed, saving to local fallback:", err);
  }

  // Local fallback
  const db = await readDb();
  const newProduct: Product = {
    id,
    name: input.name,
    slug,
    categorySlug: input.categorySlug || "other",
    description: input.description || "",
    ingredients: Array.isArray(input.ingredients) ? input.ingredients : [],
    price: Number(input.price) || 0,
    image: input.image || getProductFallbackImage(input.name, input.categorySlug),
    available: input.available ?? true,
    featured: input.featured ?? false,
  };
  db.products = [newProduct, ...db.products];
  await writeDb(db);
  return newProduct;
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>,
): Promise<Product | null> {
  try {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.name !== undefined) updatePayload["name"] = updates.name.trim();
    if (updates.price !== undefined) updatePayload["price"] = updates.price;
    if (updates.description !== undefined)
      updatePayload["description"] = updates.description.trim();
    if (updates.available !== undefined) updatePayload["is_available"] = updates.available;
    if (updates.featured !== undefined) updatePayload["is_featured"] = updates.featured;
    if (updates.image !== undefined) updatePayload["image_url"] = updates.image.trim();
    if (updates.ingredients !== undefined) updatePayload["ingredients"] = updates.ingredients;

    const { data, error } = await (supabase.from("products" as any) as any)
      .update(updatePayload)
      .or(`id.eq.${id},slug.eq.${id}`)
      .select("*, categories(*)")
      .maybeSingle();

    if (!error && data) {
      return normalizeProduct(data);
    }
  } catch (err) {
    console.warn(`[db] Supabase updateProduct failed for ${id}:`, err);
  }

  // Local fallback
  const db = await readDb();
  const index = db.products.findIndex((p) => p.id === id || p.slug === id);
  if (index === -1) return null;

  const current = db.products[index]!;
  const updated: Product = {
    ...current,
    ...updates,
    id: current.id,
  };
  db.products[index] = updated;
  await writeDb(db);
  return updated;
}

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    const { error } = await (supabase.from("products" as any) as any)
      .delete()
      .or(`id.eq.${id},slug.eq.${id}`);

    if (!error) {
      return true;
    }
  } catch (err) {
    console.warn(`[db] Supabase deleteProduct failed for ${id}:`, err);
  }

  const db = await readDb();
  const initialCount = db.products.length;
  db.products = db.products.filter((p) => p.id !== id && p.slug !== id);
  if (db.products.length === initialCount) return false;
  await writeDb(db);
  return true;
}

/* ==========================================================================
   Waiters & Floor Staff
   ========================================================================== */

export interface AvailableWaiter {
  id: string;
  name: string;
  role: string;
  phone?: string | null;
  isAvailable: boolean;
  isActive: boolean;
}

/**
 * Fetches active and available floor waiters from staff_profiles.
 */
export async function getAvailableWaiters(): Promise<AvailableWaiter[]> {
  try {
    const { data, error } = await (supabase.from("staff_profiles" as any) as any)
      .select("user_id, full_name, phone, role, is_available, is_active")
      .eq("role", "waiter")
      .eq("is_active", true)
      .eq("is_available", true)
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[db] Failed to fetch available waiters:", error.message);
      throw new Error(`Failed to load waiters: ${error.message}`);
    }

    if (Array.isArray(data)) {
      return data.map((w: any) => ({
        id: w.user_id,
        name: w.full_name || "Floor Waiter",
        role: w.role || "waiter",
        phone: w.phone || null,
        isAvailable: Boolean(w.is_available),
        isActive: Boolean(w.is_active),
      }));
    }
  } catch (err: any) {
    console.error("[db] Exception in getAvailableWaiters:", err);
    throw err;
  }
  return [];
}

/* ==========================================================================
   Orders (Live Supabase with Local Fallback)
   ========================================================================== */

export async function getOrders(
  options?: { phone?: string | undefined },
  client: any = supabase,
): Promise<Order[]> {
  const dbClient = client || supabase;
  if (isSupabaseConfigured || client !== supabase) {
    try {
      const { data, error } = await (dbClient.from("orders" as any) as any)
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
        waiter_id,
        waiter_decision,
        waiter_assigned_at,
        waiter_decided_at,
        waiter_rejection_reason,
        staff_profiles:waiter_id (
          user_id,
          full_name,
          role
        ),
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
          amount,
          transaction_reference,
          paid_at,
          payment_proofs (
            id,
            payment_id,
            order_id,
            submitted_by,
            screenshot_path,
            submitted_amount,
            transaction_reference,
            status,
            rejection_reason,
            reviewed_by,
            submitted_at,
            reviewed_at
          )
        )
      `,
        )
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        let orders: Order[] = data.map(normalizeOrder);
        if (options?.phone) {
          const p = options.phone.replace(/[\s\-().+]/g, "").slice(-9);
          orders = orders.filter((o: Order) =>
            o.customer.phone.replace(/[\s\-().+]/g, "").includes(p),
          );
        }
        return orders;
      }
      if (error) {
        console.warn("[db] Failed to fetch orders from Supabase:", error.message);
      }
    } catch (err) {
      console.warn("[db] Exception fetching orders from Supabase:", err);
    }
  }

  // Only return empty list on failure — do not silently populate mock orders in production flows
  return [];
}

/**
 * Fetches only orders belonging exclusively to the customer associated with an auth.users.id.
 * Performs database-level filtering via customers.user_id = userId -> orders.customer_id.
 */
export async function getOrdersForCustomerUser(userId: string, client?: any): Promise<Order[]> {
  const dbClient = client || supabase;
  try {
    // 1. Resolve customer ID linked to auth.users.id
    let customerId: string | null = null;
    try {
      const { data: cust, error: custErr } = await (dbClient.from("customers" as any) as any)
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!custErr && cust?.id) {
        customerId = cust.id;
      }
    } catch {
      /* ignore lookup failure */
    }

    if (!customerId) {
      return [];
    }

    // 2. Query orders belonging exclusively to this customer
    const { data, error } = await (dbClient.from("orders" as any) as any)
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
        waiter_id,
        waiter_decision,
        waiter_assigned_at,
        waiter_decided_at,
        waiter_rejection_reason,
        staff_profiles:waiter_id (
          user_id,
          full_name,
          role
        ),
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
          amount,
          transaction_reference,
          paid_at,
          payment_proofs (
            id,
            payment_id,
            order_id,
            submitted_by,
            screenshot_path,
            submitted_amount,
            transaction_reference,
            status,
            rejection_reason,
            reviewed_by,
            submitted_at,
            reviewed_at
          )
        )
      `,
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      return data.map(normalizeOrder);
    }
    if (error) {
      console.warn("[db] Failed to fetch customer orders:", error.message);
    }
  } catch (err) {
    console.error("[db] Exception in getOrdersForCustomerUser:", err);
  }
  return [];
}

/**
 * Retrieves the customer profile (public.users + public.customers) by auth.users.id.
 */
export async function getCustomerProfileByUserId(
  userId: string,
  client: any = supabase,
): Promise<{
  user: {
    id: string;
    email: string;
    role: string;
    full_name?: string | null;
    phone?: string | null;
  } | null;
  customer: { id: string; name: string; phone?: string | null; email?: string | null } | null;
}> {
  const dbClient = client || supabase;
  let dbUser = null;
  let customer = null;

  try {
    const { data: u } = await (dbClient.from("users" as any) as any)
      .select("id, email, role, full_name, phone")
      .eq("id", userId)
      .maybeSingle();
    dbUser = u;
  } catch {
    /* ignore */
  }

  try {
    const { data: c } = await (dbClient.from("customers" as any) as any)
      .select("id, name, phone, email")
      .eq("user_id", userId)
      .maybeSingle();
    customer = c;
  } catch {
    /* ignore */
  }

  return { user: dbUser, customer };
}

/**
 * Synchronizes customer profile updates in public.users and public.customers.
 */
export async function syncCustomerProfile(
  userId: string,
  email: string,
  payload: { full_name?: string; phone?: string },
): Promise<void> {
  const nowIso = new Date().toISOString();

  // Upsert into public.users
  try {
    await (supabase.from("users" as any) as any).upsert({
      id: userId,
      email,
      role: "CUSTOMER",
      full_name: payload.full_name || null,
      phone: payload.phone || null,
      updated_at: nowIso,
    });
  } catch (err) {
    console.warn("[db] syncCustomerProfile users upsert warning:", err);
  }

  // Upsert into public.customers
  try {
    const { data: existingCust } = await (supabase.from("customers" as any) as any)
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingCust?.id) {
      await (supabase.from("customers" as any) as any)
        .update({
          name: payload.full_name || email.split("@")[0],
          phone: payload.phone || null,
          email,
          updated_at: nowIso,
        })
        .eq("id", existingCust.id);
    } else {
      await (supabase.from("customers" as any) as any).insert({
        id: crypto.randomUUID(),
        user_id: userId,
        name: payload.full_name || email.split("@")[0],
        phone: payload.phone || null,
        email,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  } catch (err) {
    console.warn("[db] syncCustomerProfile customers upsert warning:", err);
  }
}

export async function getSignedProofUrl(screenshotPath: string): Promise<string | null> {
  if (!screenshotPath || screenshotPath === "reference-only") return null;
  if (
    screenshotPath.startsWith("http://") ||
    screenshotPath.startsWith("https://") ||
    screenshotPath.startsWith("data:")
  ) {
    return screenshotPath;
  }
  try {
    const cleanPath = screenshotPath.replace(/^payment-proofs\//, "");
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(cleanPath, 7200);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (err) {
    console.warn("[db] Failed to generate signed URL for payment proof:", err);
  }
  return null;
}

export async function uploadProofImageToStorage(orderId: string, dataUrlOrBase64: string): Promise<string> {
  let buffer: Buffer;
  let ext = "png";
  let mimeType = "image/png";

  if (dataUrlOrBase64.startsWith("data:")) {
    const match = dataUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1] || "image/png";
      const rawExt = mimeType.split("/")[1] || "png";
      ext = rawExt === "jpeg" ? "jpg" : rawExt;
      buffer = Buffer.from(match[2]!, "base64");
    } else {
      buffer = Buffer.from(dataUrlOrBase64);
    }
  } else {
    buffer = Buffer.from(dataUrlOrBase64, "base64");
  }

  const fileName = `proofs/${orderId}_${Date.now()}.${ext}`;

  try {
    const { error } = await supabase.storage.from("payment-proofs").upload(fileName, buffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) {
      console.warn("[db] Payment proof bucket upload issue:", error.message);
      // Attempt bucket creation if not existing
      try {
        await supabase.storage.createBucket("payment-proofs", { public: false });
        const retry = await supabase.storage.from("payment-proofs").upload(fileName, buffer, {
          contentType: mimeType,
          upsert: true,
        });
        if (!retry.error) {
          return fileName;
        }
      } catch (bucketErr) {
        console.warn("[db] Could not create storage bucket payment-proofs:", bucketErr);
      }
      // Return the base64/dataUrl fallback so the proof is preserved without throwing a technical error
      return dataUrlOrBase64;
    }

    return fileName;
  } catch (err) {
    console.warn("[db] Exception while uploading payment proof to storage bucket:", err);
    return dataUrlOrBase64;
  }
}

export async function getOrderById(id: string, client?: any): Promise<Order | undefined> {
  const dbClient = client || supabase;
  if (isSupabaseConfigured || client !== supabase) {
    try {
      const { data, error } = await (dbClient.from("orders" as any) as any)
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
        waiter_id,
        waiter_decision,
        waiter_assigned_at,
        waiter_decided_at,
        waiter_rejection_reason,
        staff_profiles:waiter_id (
          user_id,
          full_name,
          role
        ),
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
          amount,
          transaction_reference,
          paid_at,
          payment_proofs (
            id,
            payment_id,
            order_id,
            submitted_by,
            screenshot_path,
            submitted_amount,
            transaction_reference,
            status,
            rejection_reason,
            reviewed_by,
            submitted_at,
            reviewed_at
          )
        )
      `,
        )
        .or(`id.eq.${id},order_number.eq.${id}`)
        .maybeSingle();

      if (!error && data) {
        const order = normalizeOrder(data);
        if (order.paymentProof?.screenshotPath) {
          order.paymentProof.signedUrl = await getSignedProofUrl(order.paymentProof.screenshotPath);
        }
        return order;
      }
    } catch (err) {
      console.warn(`[db] Failed to fetch order ${id} from Supabase:`, err);
    }
  }

  const local = await readDb();
  return local.orders.find((o) => o.id === id || o.number === id);
}

export async function createOrder(
  input: {
    lines: { productId: string; name?: string; quantity: number; price?: number }[];
    method: Order["method"];
    customer: Order["customer"];
    paymentMethod?: string;
    paymentStatus?: "paid" | "pending" | "failed";
    delivery?: number | undefined;
    discount?: number | undefined;
    authUserId?: string | undefined;
    authUserEmail?: string | undefined;
    transactionReference?: string | undefined;
    proofImageBase64?: string | undefined;
    waiterId?: string | undefined;
  },
  client?: any,
): Promise<Order> {
  const dbClient = client || supabase;

  // ── Step A: Canonical product resolution & server-side pricing ─────────────
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Order must contain at least one item.");
  }

  const allProducts = await getProducts();
  const productMap = new Map(allProducts.map((p) => [p.id, p]));
  for (const p of allProducts) {
    if (p.slug) productMap.set(p.slug, p);
  }

  const items: OrderItem[] = [];
  for (const line of input.lines) {
    const product = productMap.get(line.productId);
    if (!product) {
      throw new Error(`Invalid product: Item with ID "${line.productId}" was not found.`);
    }
    if (product.available === false) {
      throw new Error(`Product unavailable: "${product.name}" is currently not available.`);
    }

    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error(
        `Invalid quantity for product "${product.name}". Must be a positive whole number.`,
      );
    }

    // Strictly server-authoritative price from database. Ignore any client-supplied line.price.
    const price = Number(product.price);

    items.push({
      productId: product.id,
      name: product.name,
      quantity: qty,
      price,
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Authoritative discount: Rekik Coffee promotions are item-level menu discounts.
  // There is no server-authoritative coupon/discount code mechanism for orders.
  // The authoritative discount is strictly 0. Ignore any client-supplied input.discount.
  const discount = 0;

  // ── Step B: Authoritative delivery calculation ─────────────────────────────
  let delivery = 0;
  let deliveryLatitude: number | null = null;
  let deliveryLongitude: number | null = null;
  let deliveryDistanceKm: number | null = null;

  if (input.method === "delivery") {
    const settings = await getSettings();

    if (settings.deliveryEnabled === false) {
      throw new Error("Delivery orders are currently disabled. Please choose Takeaway or Dine-in.");
    }

    if (!isValidCoordinate(settings.cafeLatitude, settings.cafeLongitude)) {
      throw new Error(
        "Delivery is currently unavailable because the café location has not been configured. Please choose Takeaway or Dine-in.",
      );
    }

    const custLat = input.customer?.latitude;
    const custLng = input.customer?.longitude;

    if (!isValidCoordinate(custLat, custLng)) {
      throw new Error(
        "Valid delivery coordinates are required for delivery orders. Please select your location on the map or choose Takeaway or Dine-in.",
      );
    }

    const latNum = Number(custLat);
    const lngNum = Number(custLng);

    const distance = calculateHaversineDistance(
      settings.cafeLatitude!,
      settings.cafeLongitude!,
      latNum,
      lngNum,
    );

    const feeResult = calculateDeliveryFee(distance, settings);
    if (!feeResult.eligible) {
      throw new Error(
        feeResult.reason ||
          `Your selected location is outside our delivery area (${distance.toFixed(1)} km away). Maximum delivery distance is ${settings.maxDeliveryDistanceKm} km. Please choose Takeaway or Dine-in.`,
      );
    }

    delivery = feeResult.fee;
    deliveryLatitude = latNum;
    deliveryLongitude = lngNum;
    deliveryDistanceKm = distance;
  } else {
    // For dine-in and takeaway, delivery fee must always be 0
    delivery = 0;
    deliveryLatitude = null;
    deliveryLongitude = null;
    deliveryDistanceKm = null;
  }

  const total = Math.max(0, subtotal - discount + delivery);
  const paymentStatus = input.paymentStatus || "paid";
  const paymentMethod = input.paymentMethod || "Mobile Payment";

  // Atomically obtain canonical order number from PostgreSQL sequence via RPC.
  // The sequence is the single source of truth; no timestamp/random fallback.
  const { data: orderNumber, error: rpcErr } = await (dbClient.rpc as any)("next_order_number");
  if (rpcErr || !orderNumber) {
    console.error("[db] Failed to generate order number from sequence:", rpcErr);
    throw new Error(
      `Failed to generate order number: ${rpcErr?.message || "Sequence unavailable"}`,
    );
  }

  // ── Step Waiter Validation: Server-authoritative database check ───────────
  let assignedWaiterId: string | null = null;
  let assignedWaiterName: string | null = null;

  if (input.waiterId) {
    const { data: waiterRecord, error: waiterErr } = await (supabase.from("staff_profiles" as any) as any)
      .select("user_id, full_name, role, is_available, is_active")
      .eq("user_id", input.waiterId)
      .maybeSingle();

    if (waiterErr || !waiterRecord) {
      throw new Error("Invalid waiter selected. The specified staff member was not found.");
    }
    if (waiterRecord.role !== "waiter") {
      throw new Error("The selected staff account is not assigned to a waiter role.");
    }
    if (!waiterRecord.is_active || !waiterRecord.is_available) {
      throw new Error(
        "The selected waiter is currently off duty or unavailable. Please select another available waiter.",
      );
    }

    assignedWaiterId = waiterRecord.user_id;
    assignedWaiterName = waiterRecord.full_name;
  } else if (input.method === "dine-in") {
    // If dine-in, check if any floor waiters exist. If available, require waiter selection.
    const availableWaiters = await getAvailableWaiters().catch(() => []);
    if (availableWaiters.length > 0) {
      throw new Error("Please select an available waiter for your dine-in table order.");
    }
  }

  const orderId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const customerPhone = input.customer?.phone?.trim() || "";
  const customerName =
    input.customer?.name?.trim() || (input.method === "dine-in" ? "Dine-in Guest" : "Guest");

  // ── Step C: Customer Identification & Resolution ───────────────────────────
  let customerId: string | null = null;

  // Normalise phone for consistent deduplication across +251/09/251 formats
  const normPhone = customerPhone
    ? customerPhone
        .replace(/[\s\-().]/g, "")
        .replace(/^\+251/, "0")
        .replace(/^251/, "0")
    : "";

  if (input.authUserId) {
    // ── C0: Authenticated Customer: Resolve or create record linked to auth.users.id
    // Must use token-scoped client to satisfy customer RLS (auth.uid() = user_id)
    try {
      const { data: byUser } = await (dbClient.from("customers" as any) as any)
        .select("id, name, phone")
        .eq("user_id", input.authUserId)
        .maybeSingle();

      if (byUser?.id) {
        customerId = byUser.id;
        const updatePayload: Record<string, unknown> = { updated_at: nowIso };
        if (customerName && customerName !== byUser["name"]) updatePayload["name"] = customerName;
        if (customerPhone && customerPhone !== byUser["phone"])
          updatePayload["phone"] = customerPhone;
        if (input.authUserEmail) updatePayload["email"] = input.authUserEmail;
        if (Object.keys(updatePayload).length > 1) {
          await (dbClient.from("customers" as any) as any)
            .update(updatePayload)
            .eq("id", customerId);
        }
      } else {
        const newCustId = crypto.randomUUID();
        const insertPayload: Record<string, unknown> = {
          id: newCustId,
          user_id: input.authUserId,
          name: customerName,
          phone: customerPhone || normPhone || null,
          email: input.authUserEmail || null,
          created_at: nowIso,
          updated_at: nowIso,
        };

        const { error: custErr } = await (dbClient.from("customers" as any) as any).insert(
          insertPayload,
        );

        if (!custErr) {
          customerId = newCustId;
        } else {
          console.error(
            `[db] Authenticated customer create failed (code ${custErr.code}): ${custErr.message}`,
          );
          throw new Error(`Failed to create customer record: ${custErr.message}`);
        }
      }
    } catch (authCustErr) {
      console.error("[db] Authenticated customer resolution error:", authCustErr);
      if (
        authCustErr instanceof Error &&
        authCustErr.message.startsWith("Failed to create customer record")
      ) {
        throw authCustErr;
      }
      throw new Error(
        `Failed to create customer record: ${authCustErr instanceof Error ? authCustErr.message : "Unknown error"}`,
      );
    }
  } else {
    // ── C1 & C2: Guest Checkout (no auth user): Create guest customer with known UUID
    // Pure INSERT without .select() to avoid anonymous SELECT RLS restriction (42501)
    try {
      const newCustId = crypto.randomUUID();
      const guestPhone = normPhone || `09${Date.now().toString().slice(-8)}`;
      const { error: custErr } = await (dbClient.from("customers" as any) as any).insert({
        id: newCustId,
        name: customerName,
        phone: guestPhone,
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (!custErr) {
        customerId = newCustId;
      } else if (custErr.code === "23505") {
        console.warn(
          "[db] Guest phone already registered; proceeding with order-level contact info.",
        );
        customerId = null;
      } else {
        console.error(
          `[db] Guest customer create failed (code ${custErr.code}): ${custErr.message}`,
        );
        throw new Error(`Failed to create customer record: ${custErr.message}`);
      }
    } catch (custEx) {
      console.error("[db] Guest customer creation error:", custEx);
      if (
        custEx instanceof Error &&
        custEx.message.startsWith("Failed to create customer record")
      ) {
        throw custEx;
      }
      throw new Error(
        `Failed to create customer record: ${custEx instanceof Error ? custEx.message : "Unknown error"}`,
      );
    }
  }

  // ── Step D: Insert the order row (FATAL if this fails) ─────────────────────
  const dbMethod =
    input.method === "dine-in"
      ? "dine_in"
      : input.method === "takeaway"
        ? "pickup"
        : "delivery";

  const orderRecord = {
    id: orderId,
    order_number: orderNumber,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: customerPhone,
    method: dbMethod,
    status: "pending",
    waiter_id: assignedWaiterId,
    waiter_decision: assignedWaiterId ? "pending" : null,
    waiter_assigned_at: assignedWaiterId ? nowIso : null,
    table_number: input.customer?.table || null,
    delivery_address: input.customer?.address || null,
    delivery_latitude: deliveryLatitude,
    delivery_longitude: deliveryLongitude,
    delivery_distance_km: deliveryDistanceKm,
    subtotal,
    discount_amount: discount,
    delivery_fee: delivery,
    total_amount: total,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { error: ordErr } = await (dbClient.from("orders" as any) as any).insert(orderRecord);

  if (ordErr) {
    console.error(`[db] Supabase order insert error (code ${ordErr.code}):`, ordErr.message);
    throw new Error(`Failed to create order: ${ordErr.message || String(ordErr)}`);
  }

  // ── Step D2: Send notification to assigned waiter ──────────────────────────
  if (assignedWaiterId) {
    try {
      await (supabase.from("notifications" as any) as any).insert({
        recipient_user_id: assignedWaiterId,
        order_id: orderId,
        title: "New Order Assignment",
        message: `You have been assigned order #${orderNumber} for café dine-in service.`,
        notification_type: "order_submitted",
        is_read: false,
        created_at: nowIso,
      });
    } catch (notifErr) {
      console.warn("[db] Failed to send waiter notification:", notifErr);
    }
  }

  // ── Step E: Insert order items (FATAL if this fails) ───────────────────────
  if (items.length > 0) {
    const supabaseProductIds = new Set(allProducts.map((p) => p.id));

    const itemRecords = items.map((it) => ({
      order_id: orderId,
      product_id: supabaseProductIds.has(it.productId) ? it.productId : null,
      name: it.name,
      quantity: it.quantity,
      unit_price: it.price,
      line_total: it.price * it.quantity,
    }));
    const { error: itemsErr } = await (dbClient.from("order_items" as any) as any).insert(
      itemRecords,
    );
    if (itemsErr) {
      console.error(`[db] order_items insert failed (code ${itemsErr.code}): ${itemsErr.message}`);
      throw new Error(`Failed to create order items: ${itemsErr.message}`);
    }
  }

  // ── Step F: Insert payment record (FATAL if this fails) ────────────────────
  const { data: payRow, error: payErr } = await (dbClient.from("payments" as any) as any)
    .insert({
      order_id: orderId,
      method: paymentMethod,
      status: paymentStatus,
      amount: total,
      transaction_reference: input.transactionReference || null,
      paid_at: paymentStatus === "paid" ? nowIso : null,
      created_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (payErr) {
    console.error(`[db] payments insert failed (code ${payErr.code}): ${payErr.message}`);
    throw new Error(`Failed to create payment: ${payErr.message}`);
  }

  let createdProof: PaymentProof | null = null;
  const paymentId = payRow?.id;
  if (paymentId && (input.proofImageBase64 || input.transactionReference)) {
    try {
      let screenshotPath = "reference-only";
      if (input.proofImageBase64) {
        screenshotPath = await uploadProofImageToStorage(orderId, input.proofImageBase64);
      }
      const { data: proofData, error: proofErr } = await (supabase.from("payment_proofs" as any) as any)
        .insert({
          payment_id: paymentId,
          order_id: orderId,
          submitted_by: input.authUserId || null,
          screenshot_path: screenshotPath,
          submitted_amount: total,
          transaction_reference: input.transactionReference || null,
          status: "pending",
          submitted_at: nowIso,
        })
        .select("id")
        .maybeSingle();

      if (!proofErr && proofData) {
        createdProof = {
          id: proofData.id,
          paymentId,
          orderId,
          screenshotPath,
          submittedAmount: total,
          transactionReference: input.transactionReference || null,
          status: "pending",
          submittedAt: nowIso,
        };
        if (screenshotPath !== "reference-only") {
          createdProof.signedUrl = await getSignedProofUrl(screenshotPath);
        }

        await (supabase.from("order_status_logs" as any) as any).insert({
          order_id: orderId,
          from_status: "received",
          to_status: "received",
          changed_by: input.authUserId || null,
          notes: `Customer submitted payment proof (Ref: ${input.transactionReference || "Screenshot uploaded"}). Pending cashier review.`,
          created_at: nowIso,
        });
      }
    } catch (proofErr) {
      console.warn("[db] Payment proof creation warning:", proofErr);
    }
  }

  // ── Step G: Construct canonical order response ─────────────────────────────
  if (input.authUserId && client) {
    try {
      const created = await getOrderById(orderId, client);
      if (created) return created;
    } catch {
      /* fallback to synthesized response */
    }
  }

  return {
    id: orderId,
    number: orderNumber,
    createdAt: nowIso,
    method: input.method,
    status: "received",
    paymentStatus,
    paymentMethod,
    transactionReference: input.transactionReference || null,
    paymentProof: createdProof,
    waiterId: assignedWaiterId,
    waiterName: assignedWaiterName,
    waiterDecision: assignedWaiterId ? "pending" : null,
    waiterAssignedAt: assignedWaiterId ? nowIso : null,
    customer: {
      name: customerName,
      phone: customerPhone,
      ...(input.customer?.table ? { table: input.customer.table } : {}),
      ...(input.customer?.address ? { address: input.customer.address } : {}),
      latitude: deliveryLatitude,
      longitude: deliveryLongitude,
    },
    items,
    subtotal,
    discount,
    delivery,
    distanceKm: deliveryDistanceKm,
    total,
  };
}

/**
 * Records a waiter's approval or rejection decision on an assigned order.
 * Inserts a row in order_approvals and updates orders waiter_decision and status.
 */
export async function recordWaiterDecision(input: {
  orderId: string;
  waiterId: string;
  decision: "approved" | "rejected";
  comments?: string;
}): Promise<Order> {
  const nowIso = new Date().toISOString();
  const order = await getOrderById(input.orderId);
  if (!order) {
    throw new Error(`Order '${input.orderId}' not found.`);
  }

  const { data: waiterRecord, error: waiterErr } = await (supabase.from("staff_profiles" as any) as any)
    .select("user_id, full_name, role")
    .eq("user_id", input.waiterId)
    .maybeSingle();

  if (waiterErr || !waiterRecord || waiterRecord.role !== "waiter") {
    throw new Error("Only authorized waiters can record an order decision.");
  }

  // Insert into order_approvals
  try {
    await (supabase.from("order_approvals" as any) as any).insert({
      order_id: input.orderId,
      waiter_id: input.waiterId,
      decision: input.decision,
      comments:
        input.comments ||
        (input.decision === "approved" ? "Approved by floor waiter" : "Rejected by floor waiter"),
      decided_at: nowIso,
    });
  } catch (appErr) {
    console.warn("[db] Failed to insert order_approval record:", appErr);
  }

  const newStatus = input.decision === "approved" ? "confirmed" : "rejected";
  await (supabase.from("orders" as any) as any)
    .update({
      waiter_decision: input.decision,
      waiter_decided_at: nowIso,
      waiter_rejection_reason:
        input.decision === "rejected" ? input.comments || "Rejected by waiter" : null,
      status: newStatus,
      updated_at: nowIso,
    })
    .eq("id", input.orderId);

  // Status log
  try {
    await (supabase.from("order_status_logs" as any) as any).insert({
      order_id: input.orderId,
      from_status: order.status === "received" ? "pending" : order.status,
      to_status: newStatus,
      changed_by: input.waiterId,
      notes: `Order ${input.decision} by server ${waiterRecord.full_name}.${input.comments ? ` Reason: ${input.comments}` : ""}`,
      created_at: nowIso,
    });
  } catch (logErr) {
    console.warn("[db] Failed to log order status change:", logErr);
  }

  // Notification
  try {
    await (supabase.from("notifications" as any) as any).insert({
      recipient_user_id: input.waiterId,
      order_id: input.orderId,
      title: `Order ${order.number} ${input.decision === "approved" ? "Approved" : "Rejected"}`,
      message: `Order #${order.number} has been ${input.decision}.`,
      notification_type: input.decision === "approved" ? "order_approved" : "order_rejected",
      is_read: false,
      created_at: nowIso,
    });
  } catch (notifErr) {
    console.warn("[db] Failed to send decision notification:", notifErr);
  }

  const updated = await getOrderById(input.orderId);
  return updated || order;
}

/* ==========================================================================
   Customers (server-side, service-role client — never exposes data to browser)
   ========================================================================== */

/**
 * Raw customer row shape returned by Supabase for the customers table.
 * Defines only the columns that actually exist in the schema.
 */
export interface RawCustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  orders?: RawCustomerOrderRow[];
  customer_addresses?: RawCustomerAddressRow[];
}

interface RawCustomerOrderRow {
  id: string;
  order_number: string | null;
  method: string | null;
  status: string | null;
  table_number: string | null;
  delivery_address: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  delivery_fee: number | null;
  total_amount: number | null;
  created_at: string;
  updated_at: string | null;
  order_items?: RawOrderItemRow[];
  payments?: RawPaymentRow[];
}

interface RawOrderItemRow {
  id: string;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
}

interface RawPaymentRow {
  id: string;
  status: string | null;
  method: string | null;
  amount: number | null;
  created_at: string;
}

interface RawCustomerAddressRow {
  id: string;
  address_line: string | null;
  is_default: boolean | null;
  created_at: string;
}

/**
 * Fetches all customer profiles with their full order history from Supabase
 * using the server-side service-role client (bypasses RLS).
 * This function runs on the server only — never called from the browser.
 */
export async function getCustomers(client: any = supabase): Promise<RawCustomerRow[]> {
  try {
    const { data, error } = await (client.from("customers" as any) as any)
      .select(
        `
        id,
        name,
        phone,
        email,
        created_at,
        updated_at,
        orders (
          id,
          order_number,
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
            name,
            quantity,
            unit_price,
            line_total
          ),
          payments (
            id,
            status,
            method,
            amount,
            created_at
          )
        ),
        customer_addresses (
          id,
          address_line,
          is_default,
          created_at
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[db] getCustomers Supabase error:", error.message);
      return [];
    }

    return Array.isArray(data) ? (data as RawCustomerRow[]) : [];
  } catch (err) {
    console.error("[db] getCustomers exception:", err);
    return [];
  }
}

export async function updateOrderStatus(
  idOrNumber: string,
  status: OrderStatus,
  client: any = supabase,
  changedBy?: string,
): Promise<Order | null> {
  const dbClient = client || supabase;
  const nowIso = new Date().toISOString();

  // 1. Fetch current order to check existence, canonical id, and current status
  const currentOrder = await getOrderById(idOrNumber, dbClient);
  if (!currentOrder) {
    return null;
  }

  const oldStatus = currentOrder.status;

  // 2. If status is already the requested status, return without duplicate log
  if (oldStatus === status) {
    return currentOrder;
  }

  // 3. Update order in Supabase with authenticated client
  let updatedOrder: Order | null = null;
  try {
    const { data, error } = await (dbClient.from("orders" as any) as any)
      .update({ status, updated_at: nowIso })
      .eq("id", currentOrder.id).select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        method,
        status,
        table_number,
        delivery_address,
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
      `);

    if (!error && data && data.length > 0) {
      updatedOrder = normalizeOrder(data[0]);
    } else if (error) {
      console.warn(
        `[db] Failed to update order status in Supabase for ${currentOrder.id}:`,
        error.message,
      );
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[db] Exception updating order status for ${currentOrder.id}:`, err);
    throw err;
  }

  if (!updatedOrder) {
    return null;
  }

  // 4. Record transition in public.order_status_logs
  try {
    const { error: logErr } = await (dbClient.from("order_status_logs" as any) as any).insert({
      id: crypto.randomUUID(),
      order_id: currentOrder.id,
      from_status: oldStatus,
      to_status: status,
      changed_by: changedBy || null,
      created_at: nowIso,
    });
    if (logErr) {
      console.warn("[db] Warning: Failed to insert order_status_logs:", logErr.message);
    }
  } catch (err) {
    console.warn("[db] Exception logging order status change:", err);
  }

  // 5. Update local fallback DB
  const db = await readDb();
  const orderIndex = db.orders.findIndex(
    (o) => o.id === currentOrder.id || o.number === currentOrder.number,
  );
  if (orderIndex !== -1) {
    db.orders[orderIndex]!.status = status;
    await writeDb(db);
  }

  return updatedOrder;
}

export async function updateOrderPayment(
  idOrNumber: string,
  input: {
    paymentStatus: "paid" | "pending" | "failed";
    paymentMethod?: string;
    transactionReference?: string | null;
  },
): Promise<Order | null> {
  const db = await readDb();
  const orderIndex = db.orders.findIndex((o) => o.id === idOrNumber || o.number === idOrNumber);
  let localUpdated: Order | null = null;
  if (orderIndex !== -1) {
    db.orders[orderIndex]!.paymentStatus = input.paymentStatus;
    if (input.paymentMethod) {
      db.orders[orderIndex]!.paymentMethod = input.paymentMethod;
    }
    localUpdated = db.orders[orderIndex]!;
    await writeDb(db);
  }

  try {
    const order = await getOrderById(idOrNumber);
    if (order) {
      const nowIso = new Date().toISOString();
      const paymentUpdate: any = {
        status: input.paymentStatus,
        updated_at: nowIso,
      };
      if (input.paymentMethod) paymentUpdate.method = input.paymentMethod;
      if (input.transactionReference !== undefined) {
        paymentUpdate.transaction_reference = input.transactionReference;
      }
      if (input.paymentStatus === "paid") {
        paymentUpdate.paid_at = nowIso;
      }

      await (supabase.from("payments" as any) as any)
        .update(paymentUpdate)
        .eq("order_id", order.id);

      await (supabase.from("orders" as any) as any)
        .update({ updated_at: nowIso })
        .eq("id", order.id);

      const refreshed = await getOrderById(order.id);
      if (refreshed) return refreshed;
    }
  } catch (err) {
    console.warn(`[db] Failed to update order payment in Supabase for ${idOrNumber}:`, err);
  }

  return localUpdated;
}

/**
 * Customer / Guest submits payment proof (receipt screenshot or bank transaction reference).
 */
export async function submitPaymentProof(input: {
  orderId: string;
  paymentId?: string;
  transactionReference?: string;
  proofImageBase64?: string;
  submittedAmount?: number;
  authUserId?: string;
}): Promise<{ success: boolean; proof: any; order: Order | null }> {
  const order = await getOrderById(input.orderId);
  if (!order) {
    throw new Error(`Order '${input.orderId}' not found.`);
  }

  const nowIso = new Date().toISOString();

  // 1. Locate or create payment record
  let paymentId = input.paymentId;
  if (!paymentId) {
    const { data: pay } = await (supabase.from("payments" as any) as any)
      .select("id, amount, status")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pay) {
      paymentId = pay.id;
    } else {
      const { data: newPay, error: newPayErr } = await (supabase.from("payments" as any) as any)
        .insert({
          order_id: order.id,
          method: order.paymentMethod || "Mobile Payment",
          status: "pending",
          amount: order.total,
          transaction_reference: input.transactionReference || null,
          created_at: nowIso,
        })
        .select("id")
        .single();

      if (newPayErr) throw new Error(`Failed to create payment: ${newPayErr.message}`);
      paymentId = newPay.id;
    }
  }

  // 2. Upload proof image if provided
  let screenshotPath = "reference-only";
  if (input.proofImageBase64) {
    screenshotPath = await uploadProofImageToStorage(order.id, input.proofImageBase64);
  }

  const submittedAmount =
    input.submittedAmount !== undefined ? Number(input.submittedAmount) : order.total;

  // 3. Insert or update payment_proofs record
  const { data: proofData, error: proofErr } = await (supabase.from("payment_proofs" as any) as any)
    .insert({
      payment_id: paymentId,
      order_id: order.id,
      submitted_by: input.authUserId || null,
      screenshot_path: screenshotPath,
      submitted_amount: submittedAmount,
      transaction_reference: input.transactionReference || null,
      status: "pending",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      submitted_at: nowIso,
    })
    .select("*")
    .single();

  if (proofErr) {
    throw new Error(`Failed to record payment proof: ${proofErr.message}`);
  }

  // 4. Update payments table to pending and sync transaction reference
  await (supabase.from("payments" as any) as any)
    .update({
      status: "pending",
      transaction_reference: input.transactionReference || undefined,
      updated_at: nowIso,
    })
    .eq("id", paymentId);

  // 5. Update orders updated_at
  await (supabase.from("orders" as any) as any)
    .update({ updated_at: nowIso })
    .eq("id", order.id);

  // 6. Log to order_status_logs
  await (supabase.from("order_status_logs" as any) as any).insert({
    order_id: order.id,
    from_status: order.status,
    to_status: order.status,
    changed_by: input.authUserId || null,
    notes: `Customer submitted payment verification proof (Ref: ${input.transactionReference || "Screenshot uploaded"}). Awaiting cashier review.`,
    created_at: nowIso,
  });

  // 7. Notify active cashiers about submitted payment proof
  try {
    const { data: cashiers } = await (supabase.from("staff_profiles" as any) as any)
      .select("user_id")
      .eq("role", "cashier")
      .eq("is_active", true);

    if (Array.isArray(cashiers) && cashiers.length > 0) {
      const notifs = cashiers.map((c: any) => ({
        recipient_user_id: c.user_id,
        order_id: order.id,
        title: `Payment Submitted: #${order.number}`,
        message: `Payment proof submitted for order #${order.number} (${order.total} ETB) awaiting cashier review.`,
        notification_type: "payment_submitted",
        is_read: false,
        created_at: nowIso,
      }));
      await (supabase.from("notifications" as any) as any).insert(notifs);
    }
  } catch (notifErr) {
    console.warn("[db] Failed to send cashier payment notification:", notifErr);
  }

  const refreshed = await getOrderById(order.id);
  return {
    success: true,
    proof: proofData,
    order: refreshed || null,
  };
}

/**
 * Cashier / Reception staff approves a customer payment proof.
 * Sets proof status to 'approved', payment status to 'paid', logs review & audit log.
 */
export async function approvePaymentProof(input: {
  paymentProofId?: string;
  paymentId?: string;
  orderId?: string;
  cashierId?: string;
  cashierName?: string;
  note?: string;
}): Promise<{ success: boolean; order: Order | null }> {
  const nowIso = new Date().toISOString();
  const defaultCashierId = "5d2b434b-0b18-461b-a12d-9a93ac8fc92a";
  const cashierId = input.cashierId || defaultCashierId;
  const cashierName = input.cashierName || "Cashier Staff";

  // Locate the proof and associated payment/order
  let proof: any = null;
  if (input.paymentProofId) {
    const { data } = await (supabase.from("payment_proofs" as any) as any)
      .select("*")
      .eq("id", input.paymentProofId)
      .maybeSingle();
    proof = data;
  } else if (input.paymentId) {
    const { data } = await (supabase.from("payment_proofs" as any) as any)
      .select("*")
      .eq("payment_id", input.paymentId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    proof = data;
  } else if (input.orderId) {
    const { data } = await (supabase.from("payment_proofs" as any) as any)
      .select("*")
      .eq("order_id", input.orderId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    proof = data;
  }

  const paymentId = proof?.payment_id || input.paymentId;
  const orderId = proof?.order_id || input.orderId;

  if (!paymentId && !orderId) {
    throw new Error("Cannot approve payment: neither payment nor order ID could be resolved.");
  }

  // 1. If proof exists, update payment_proofs and record payment_reviews
  if (proof) {
    await (supabase.from("payment_proofs" as any) as any)
      .update({
        status: "approved",
        reviewed_by: cashierId,
        reviewed_at: nowIso,
      })
      .eq("id", proof.id);

    await (supabase.from("payment_reviews" as any) as any).insert({
      payment_proof_id: proof.id,
      cashier_id: cashierId,
      decision: "approved",
      reason: input.note || "Verified and approved by cashier",
      reviewed_at: nowIso,
    });
  }

  // 2. Update payment record to paid
  if (paymentId) {
    await (supabase.from("payments" as any) as any)
      .update({
        status: "paid",
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", paymentId);
  } else if (orderId) {
    await (supabase.from("payments" as any) as any)
      .update({
        status: "paid",
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq("order_id", orderId);
  }

  // 3. Update order: if order is in 'received' state, advance to 'confirmed'
  let targetOrderId = orderId;
  if (!targetOrderId && paymentId) {
    const { data: p } = await (supabase.from("payments" as any) as any)
      .select("order_id")
      .eq("id", paymentId)
      .maybeSingle();
    targetOrderId = p?.order_id;
  }

  let refreshedOrder: Order | null = null;
  if (targetOrderId) {
    const existingOrder = await getOrderById(targetOrderId);
    const updatedStatus: OrderStatus =
      existingOrder && existingOrder.status === "received"
        ? "confirmed"
        : existingOrder?.status || "confirmed";

    await (supabase.from("orders" as any) as any)
      .update({
        status: updatedStatus,
        updated_at: nowIso,
      })
      .eq("id", targetOrderId);

    // 4. Record order_status_logs & audit_logs
    await (supabase.from("order_status_logs" as any) as any).insert({
      order_id: targetOrderId,
      from_status: existingOrder?.status || "received",
      to_status: updatedStatus,
      changed_by: cashierId,
      notes: `Payment approved by ${cashierName}.${input.note ? ` Note: ${input.note}` : ""}`,
      created_at: nowIso,
    });

    await (supabase.from("audit_logs" as any) as any).insert({
      actor_user_id: cashierId,
      order_id: targetOrderId,
      payment_proof_id: proof?.id || null,
      action: "PAYMENT_APPROVED",
      entity_type: "payment",
      entity_id: paymentId || targetOrderId,
      old_values: { payment_status: "pending", proof_status: proof?.status || "pending" },
      new_values: { payment_status: "paid", proof_status: "approved" },
      details: {
        order_number: existingOrder?.number,
        customer_name: existingOrder?.customer.name,
        amount: existingOrder?.total,
        notes: input.note || null,
      },
      created_at: nowIso,
    });

    // Notify customer and assigned waiter
    try {
      const { data: dbOrder } = await (supabase.from("orders" as any) as any)
        .select("customer_id, waiter_id")
        .eq("id", targetOrderId)
        .maybeSingle();

      const notificationsToInsert: any[] = [];
      const waiterIdToNotify = existingOrder?.waiterId || dbOrder?.waiter_id;
      if (waiterIdToNotify) {
        notificationsToInsert.push({
          recipient_user_id: waiterIdToNotify,
          order_id: targetOrderId,
          title: `Payment Approved: #${existingOrder?.number || ""}`,
          message: `Payment for order #${existingOrder?.number || ""} (${existingOrder?.total || 0} ETB) has been verified by cashier. Order is ready for café service.`,
          notification_type: "payment_approved",
          is_read: false,
          created_at: nowIso,
        });
      }

      if (dbOrder?.customer_id) {
        const { data: custRecord } = await (supabase.from("customers" as any) as any)
          .select("user_id")
          .eq("id", dbOrder.customer_id)
          .maybeSingle();

        if (custRecord?.user_id) {
          notificationsToInsert.push({
            recipient_user_id: custRecord.user_id,
            order_id: targetOrderId,
            title: `Payment Approved: #${existingOrder?.number || ""}`,
            message: `Your payment of ${existingOrder?.total || 0} ETB for order #${existingOrder?.number || ""} has been verified and approved!`,
            notification_type: "payment_approved",
            is_read: false,
            created_at: nowIso,
          });
        }
      }

      if (notificationsToInsert.length > 0) {
        await (supabase.from("notifications" as any) as any).insert(notificationsToInsert);
      }
    } catch (notifErr) {
      console.warn("[db] Failed to send payment approved notifications:", notifErr);
    }

    refreshedOrder = (await getOrderById(targetOrderId)) || null;
  }

  return { success: true, order: refreshedOrder };
}

/**
 * Cashier / Reception staff rejects / cancels a payment proof.
 * Requires a reason (mandatory). Sets proof status to 'rejected', payment to 'failed', logs review & audit log.
 */
export async function rejectPaymentProof(input: {
  paymentProofId?: string;
  paymentId?: string;
  orderId?: string;
  cashierId?: string;
  cashierName?: string;
  reason: string;
}): Promise<{ success: boolean; order: Order | null }> {
  if (!input.reason || !input.reason.trim()) {
    throw new Error("A rejection reason is required to reject payment verification.");
  }

  const reason = input.reason.trim();
  const nowIso = new Date().toISOString();
  const defaultCashierId = "5d2b434b-0b18-461b-a12d-9a93ac8fc92a";
  const cashierId = input.cashierId || defaultCashierId;
  const cashierName = input.cashierName || "Cashier Staff";

  let proof: any = null;
  if (input.paymentProofId) {
    const { data } = await (supabase.from("payment_proofs" as any) as any)
      .select("*")
      .eq("id", input.paymentProofId)
      .maybeSingle();
    proof = data;
  } else if (input.paymentId) {
    const { data } = await (supabase.from("payment_proofs" as any) as any)
      .select("*")
      .eq("payment_id", input.paymentId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    proof = data;
  } else if (input.orderId) {
    const { data } = await (supabase.from("payment_proofs" as any) as any)
      .select("*")
      .eq("order_id", input.orderId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    proof = data;
  }

  const paymentId = proof?.payment_id || input.paymentId;
  const orderId = proof?.order_id || input.orderId;

  // 1. Update payment_proofs and record review
  if (proof) {
    await (supabase.from("payment_proofs" as any) as any)
      .update({
        status: "rejected",
        rejection_reason: reason,
        reviewed_by: cashierId,
        reviewed_at: nowIso,
      })
      .eq("id", proof.id);

    await (supabase.from("payment_reviews" as any) as any).insert({
      payment_proof_id: proof.id,
      cashier_id: cashierId,
      decision: "rejected",
      reason,
      reviewed_at: nowIso,
    });
  }

  // 2. Update payment status to failed
  if (paymentId) {
    await (supabase.from("payments" as any) as any)
      .update({
        status: "failed",
        updated_at: nowIso,
      })
      .eq("id", paymentId);
  } else if (orderId) {
    await (supabase.from("payments" as any) as any)
      .update({
        status: "failed",
        updated_at: nowIso,
      })
      .eq("order_id", orderId);
  }

  let targetOrderId = orderId;
  if (!targetOrderId && paymentId) {
    const { data: p } = await (supabase.from("payments" as any) as any)
      .select("order_id")
      .eq("id", paymentId)
      .maybeSingle();
    targetOrderId = p?.order_id;
  }

  let refreshedOrder: Order | null = null;
  if (targetOrderId) {
    const existingOrder = await getOrderById(targetOrderId);

    await (supabase.from("orders" as any) as any)
      .update({ updated_at: nowIso })
      .eq("id", targetOrderId);

    // Record logs
    await (supabase.from("order_status_logs" as any) as any).insert({
      order_id: targetOrderId,
      from_status: existingOrder?.status || "received",
      to_status: existingOrder?.status || "received",
      changed_by: cashierId,
      notes: `Payment verification rejected by ${cashierName}. Reason: ${reason}`,
      created_at: nowIso,
    });

    await (supabase.from("audit_logs" as any) as any).insert({
      actor_user_id: cashierId,
      order_id: targetOrderId,
      payment_proof_id: proof?.id || null,
      action: "PAYMENT_REJECTED",
      entity_type: "payment",
      entity_id: paymentId || targetOrderId,
      old_values: { payment_status: "pending", proof_status: proof?.status || "pending" },
      new_values: { payment_status: "failed", proof_status: "rejected" },
      details: {
        order_number: existingOrder?.number,
        customer_name: existingOrder?.customer.name,
        rejection_reason: reason,
      },
      created_at: nowIso,
    });

    // Notify customer about payment rejection
    try {
      const { data: dbOrder } = await (supabase.from("orders" as any) as any)
        .select("customer_id")
        .eq("id", targetOrderId)
        .maybeSingle();

      if (dbOrder?.customer_id) {
        const { data: custRecord } = await (supabase.from("customers" as any) as any)
          .select("user_id")
          .eq("id", dbOrder.customer_id)
          .maybeSingle();

        if (custRecord?.user_id) {
          await (supabase.from("notifications" as any) as any).insert({
            recipient_user_id: custRecord.user_id,
            order_id: targetOrderId,
            title: `Payment Proof Rejected: #${existingOrder?.number || ""}`,
            message: `Your payment proof was rejected by cashier: ${reason}. You can upload a corrected screenshot on your order page.`,
            notification_type: "order_rejected",
            is_read: false,
            created_at: nowIso,
          });
        }
      }
    } catch (notifErr) {
      console.warn("[db] Failed to send payment rejected notification:", notifErr);
    }

    refreshedOrder = (await getOrderById(targetOrderId)) || null;
  }

  return { success: true, order: refreshedOrder };
}

/**
 * Cashier / Reception staff marks cash or in-person payment as settled.
 */
export async function markCashPaymentSettled(input: {
  paymentId?: string;
  orderId?: string;
  cashierId?: string;
  cashierName?: string;
  note?: string;
}): Promise<{ success: boolean; order: Order | null }> {
  const nowIso = new Date().toISOString();
  const defaultCashierId = "5d2b434b-0b18-461b-a12d-9a93ac8fc92a";
  const cashierId = input.cashierId || defaultCashierId;
  const cashierName = input.cashierName || "Cashier Staff";

  let orderId = input.orderId;
  let paymentId = input.paymentId;

  if (!orderId && paymentId) {
    const { data: p } = await (supabase.from("payments" as any) as any)
      .select("order_id")
      .eq("id", paymentId)
      .maybeSingle();
    orderId = p?.order_id;
  }

  if (paymentId) {
    await (supabase.from("payments" as any) as any)
      .update({
        status: "paid",
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", paymentId);
  } else if (orderId) {
    await (supabase.from("payments" as any) as any)
      .update({
        status: "paid",
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq("order_id", orderId);
  }

  let refreshedOrder: Order | null = null;
  if (orderId) {
    const existingOrder = await getOrderById(orderId);
    const updatedStatus: OrderStatus =
      existingOrder && existingOrder.status === "received"
        ? "confirmed"
        : existingOrder?.status || "confirmed";

    await (supabase.from("orders" as any) as any)
      .update({
        status: updatedStatus,
        updated_at: nowIso,
      })
      .eq("id", orderId);

    await (supabase.from("order_status_logs" as any) as any).insert({
      order_id: orderId,
      from_status: existingOrder?.status || "received",
      to_status: updatedStatus,
      changed_by: cashierId,
      notes: `Cashier ${cashierName} confirmed cash/in-person settlement.${input.note ? ` Note: ${input.note}` : ""}`,
      created_at: nowIso,
    });

    await (supabase.from("audit_logs" as any) as any).insert({
      actor_user_id: cashierId,
      order_id: orderId,
      action: "PAYMENT_APPROVED",
      entity_type: "payment",
      entity_id: paymentId || orderId,
      old_values: { payment_status: "pending" },
      new_values: { payment_status: "paid" },
      details: {
        payment_method: "Cash / In-Person",
        order_number: existingOrder?.number,
        amount: existingOrder?.total,
        notes: input.note || "Cash received in-person",
      },
      created_at: nowIso,
    });

    refreshedOrder = (await getOrderById(orderId)) || null;
  }

  return { success: true, order: refreshedOrder };
}

/* ==========================================================================
   Promotions (Live Supabase with Local Fallback)
   ========================================================================== */

export async function getPromotions(): Promise<Promotion[]> {
  if (isSupabaseConfigured) {
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
        return data.map(normalizePromotion);
      }
    } catch (err) {
      console.warn("[db] Failed to fetch promotions from Supabase:", err);
    }
  }

  const local = await readDb();
  return local.promotions;
}

export async function updatePromotions(promotions: Promotion[]): Promise<Promotion[]> {
  try {
    for (const promo of promotions) {
      if (promo.id) {
        await (supabase.from("promotions" as any) as any)
          .update({
            name: promo.name,
            description: promo.description,
            discount_type: promo.discountType,
            discount_value: promo.discountValue,
            start_date: promo.startDate,
            end_date: promo.endDate,
            status: promo.status || "active",
            min_order_amount: promo.minOrderAmount || null,
          })
          .eq("id", promo.id);
      }
    }
  } catch (err) {
    console.warn("[db] Failed to update promotions in Supabase:", err);
  }

  const db = await readDb();
  db.promotions = promotions;
  await writeDb(db);
  return db.promotions;
}

export async function createPromotion(promo: Promotion): Promise<Promotion> {
  try {
    const { data, error } = await (supabase.from("promotions" as any) as any)
      .insert({
        name: promo.name,
        description: promo.description,
        discount_type: promo.discountType,
        discount_value: promo.discountValue,
        start_date: promo.startDate,
        end_date: promo.endDate,
        status: promo.status || "active",
        min_order_amount: promo.minOrderAmount || null,
      })
      .select("*, categories(*)")
      .single();

    if (!error && data) {
      return normalizePromotion(data);
    }
  } catch (err) {
    console.warn("[db] Failed to insert promotion to Supabase:", err);
  }

  const db = await readDb();
  db.promotions = [promo, ...db.promotions];
  await writeDb(db);
  return promo;
}

export async function deletePromotion(id: string): Promise<boolean> {
  try {
    const { error } = await (supabase.from("promotions" as any) as any).delete().eq("id", id);
    if (!error) return true;
  } catch (err) {
    console.warn(`[db] Failed to delete promotion ${id} from Supabase:`, err);
  }

  const db = await readDb();
  const initialCount = db.promotions.length;
  db.promotions = db.promotions.filter((p) => p.id !== id);
  if (db.promotions.length === initialCount) return false;
  await writeDb(db);
  return true;
}

/* ==========================================================================
   Store Settings (Live Supabase with Local Fallback)
   ========================================================================== */

export async function getSettings(): Promise<NebaSettings> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase.from("store_settings" as any) as any)
        .select(
          "id, cafe_name, phone, email, address, opening_hours, delivery_fee, cafe_latitude, cafe_longitude, price_per_km, min_delivery_fee, max_delivery_distance_km, delivery_enabled, rounding_rule, updated_at",
        )
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return normalizeStoreSettings(data);
      }
      if (error) {
        console.warn("[db] Failed to fetch store settings from Supabase:", error.message);
      }
    } catch (err) {
      console.warn("[db] Failed to fetch store settings from Supabase:", err);
    }
  }

  const local = await readDb();
  return normalizeStoreSettings(local.settings as any);
}

export async function updateSettings(updates: Partial<NebaSettings>): Promise<NebaSettings> {
  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.cafeName !== undefined) payload["cafe_name"] = updates.cafeName.trim();
    if (updates.phone !== undefined) payload["phone"] = updates.phone.trim();
    if (updates.email !== undefined) payload["email"] = updates.email.trim();
    if (updates.address !== undefined) payload["address"] = updates.address.trim();
    if (updates.openingHours !== undefined) payload["opening_hours"] = updates.openingHours.trim();
    if (updates.deliveryFee !== undefined) payload["delivery_fee"] = Number(updates.deliveryFee);

    if (updates.cafeLatitude !== undefined) {
      payload["cafe_latitude"] =
        updates.cafeLatitude === null || updates.cafeLatitude === undefined
          ? null
          : Number(updates.cafeLatitude);
    }
    if (updates.cafeLongitude !== undefined) {
      payload["cafe_longitude"] =
        updates.cafeLongitude === null || updates.cafeLongitude === undefined
          ? null
          : Number(updates.cafeLongitude);
    }
    if (updates.pricePerKm !== undefined) {
      payload["price_per_km"] = Number(updates.pricePerKm);
    }
    if (updates.minDeliveryFee !== undefined) {
      payload["min_delivery_fee"] = Number(updates.minDeliveryFee);
    }
    if (updates.maxDeliveryDistanceKm !== undefined) {
      payload["max_delivery_distance_km"] = Number(updates.maxDeliveryDistanceKm);
    }
    if (updates.deliveryEnabled !== undefined) {
      payload["delivery_enabled"] = Boolean(updates.deliveryEnabled);
    }
    if (updates.roundingRule !== undefined) {
      payload["rounding_rule"] = updates.roundingRule;
    }

    const { data: existingSettings } = await (supabase.from("store_settings" as any) as any)
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existingSettings?.id) {
      const { data, error } = await (supabase.from("store_settings" as any) as any)
        .update(payload)
        .eq("id", existingSettings.id)
        .select()
        .maybeSingle();

      if (!error && data) {
        return getSettings();
      }
      if (error) {
        console.warn("[db] Failed to update store settings in Supabase:", error.message);
      }
    }
  } catch (err) {
    console.warn("[db] Failed to update store settings in Supabase:", err);
  }

  const db = await readDb();
  db.settings = {
    ...db.settings,
    ...updates,
  };
  await writeDb(db);
  return db.settings;
}

/* ==========================================================================
   6. Website Content (Live Supabase with Local Fallback)
   ========================================================================== */

export async function getAboutContent(): Promise<AboutContent> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase.from("about_content" as any) as any)
        .select(
          "id, homepage_hero_image, about_hero_image, about_title, about_description, story_title, story_content, story_image, value_1_title, value_1_description, value_2_title, value_2_description, value_3_title, value_3_description, updated_at",
        )
        .eq("id", 1)
        .maybeSingle();

      if (!error && data) {
        return normalizeAboutContent(data);
      }
    } catch (err) {
      console.warn("[db] Failed to fetch about content from Supabase:", err);
    }
  }

  try {
    const local = await readDb();
    if (local.about_content) {
      return normalizeAboutContent(local.about_content);
    }
  } catch (err) {
    console.warn("[db] Failed to read local db.json for about content:", err);
  }

  return { ...DEFAULT_ABOUT_CONTENT };
}

export async function updateAboutContent(
  updates: Partial<AboutContent>,
  token?: string,
): Promise<AboutContent> {
  const nowIso = new Date().toISOString();
  const payload: Record<string, any> = {
    updated_at: nowIso,
  };

  if (updates.homepage_hero_image !== undefined)
    payload["homepage_hero_image"] = updates.homepage_hero_image;
  if (updates.about_hero_image !== undefined)
    payload["about_hero_image"] = updates.about_hero_image;
  if (updates.about_title !== undefined) payload["about_title"] = updates.about_title.trim();
  if (updates.about_description !== undefined)
    payload["about_description"] = updates.about_description.trim();
  if (updates.story_title !== undefined) payload["story_title"] = updates.story_title.trim();
  if (updates.story_content !== undefined) payload["story_content"] = updates.story_content.trim();
  if (updates.story_image !== undefined) payload["story_image"] = updates.story_image;
  if (updates.value_1_title !== undefined) payload["value_1_title"] = updates.value_1_title.trim();
  if (updates.value_1_description !== undefined)
    payload["value_1_description"] = updates.value_1_description.trim();
  if (updates.value_2_title !== undefined) payload["value_2_title"] = updates.value_2_title.trim();
  if (updates.value_2_description !== undefined)
    payload["value_2_description"] = updates.value_2_description.trim();
  if (updates.value_3_title !== undefined) payload["value_3_title"] = updates.value_3_title.trim();
  if (updates.value_3_description !== undefined)
    payload["value_3_description"] = updates.value_3_description.trim();

  try {
    const client = token ? createScopedClient(token) : supabase;
    const { data, error } = await (client.from("about_content" as any) as any)
      .update(payload)
      .eq("id", 1)
      .select()
      .maybeSingle();

    if (!error && data) {
      try {
        const db = await readDb();
        db.about_content = normalizeAboutContent({
          ...(db.about_content || DEFAULT_ABOUT_CONTENT),
          ...payload,
        });
        await writeDb(db);
      } catch {
        // ignore local mirror errors if Supabase succeeded
      }
      return normalizeAboutContent(data);
    }
    if (error) {
      console.warn("[db] Supabase about_content update returned error:", error.message);
      if (token) {
        throw new Error(`Database update failed: ${error.message}`);
      }
    }
  } catch (err) {
    console.warn("[db] Failed to update about content in Supabase:", err);
    if (token) {
      throw err;
    }
  }

  // Fallback to local db.json
  const db = await readDb();
  db.about_content = normalizeAboutContent({
    ...(db.about_content || DEFAULT_ABOUT_CONTENT),
    ...payload,
  });
  await writeDb(db);
  return db.about_content;
}

/* ==========================================================================
   Contact Messages (Supabase public.contact_messages)
   ========================================================================== */

/**
 * Inserts a new contact message submitted from the public contact page.
 * Uses pure INSERT without .select() to adhere to strict anonymous RLS policies.
 */
export async function createContactMessage(
  input: CreateContactMessageInput,
  client: any = supabase,
): Promise<{ success: boolean; id: string }> {
  const dbClient = client || supabase;
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const payload = {
    id,
    name: input.name.trim(),
    email: input.email.trim(),
    message: input.message.trim(),
    is_read: false,
    created_at: nowIso,
  };

  const { error } = await (dbClient.from("contact_messages" as any) as any).insert(payload);

  if (error) {
    console.error("[db] Failed to insert contact message:", error.message);
    throw new Error(`Failed to save contact message: ${error.message}`);
  }

  return { success: true, id };
}

/**
 * Retrieves all contact messages for authenticated ADMIN / STAFF users.
 * Ordered by submission date (newest first).
 */
export async function getContactMessages(client: any = supabase): Promise<ContactMessage[]> {
  const dbClient = client || supabase;
  const { data, error } = await (dbClient.from("contact_messages" as any) as any)
    .select("id, name, email, message, is_read, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[db] Failed to fetch contact messages:", error.message);
    throw new Error(`Failed to load contact messages: ${error.message}`);
  }

  return (data || []) as ContactMessage[];
}

/**
 * Updates the read status of a contact message (ADMIN / STAFF only).
 */
export async function updateContactMessageReadStatus(
  id: string,
  isRead: boolean,
  client: any = supabase,
): Promise<ContactMessage | null> {
  const dbClient = client || supabase;
  const { data, error } = await (dbClient.from("contact_messages" as any) as any)
    .update({ is_read: isRead })
    .eq("id", id)
    .select("id, name, email, message, is_read, created_at")
    .maybeSingle();

  if (error) {
    console.error(`[db] Failed to update contact message ${id}:`, error.message);
    throw new Error(`Failed to update message: ${error.message}`);
  }

  return (data || null) as ContactMessage | null;
}

/**
 * Deletes a contact message (ADMIN / STAFF only).
 */
export async function deleteContactMessage(id: string, client: any = supabase): Promise<boolean> {
  const dbClient = client || supabase;
  const { error } = await (dbClient.from("contact_messages" as any) as any).delete().eq("id", id);

  if (error) {
    console.error(`[db] Failed to delete contact message ${id}:`, error.message);
    throw new Error(`Failed to delete message: ${error.message}`);
  }

  return true;
}
