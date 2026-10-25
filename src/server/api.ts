import {
  getPaymentAccountSettingsFromDb,
  updatePaymentAccountSettingsInDb,
  createOrder,
  createProduct,
  createPromotion,
  deleteProduct,
  deletePromotion,
  getAboutContent,
  getCategories,
  getCustomerProfileByUserId,
  getCustomers,
  getOrderById,
  getOrders,
  getOrdersForCustomerUser,
  getProductById,
  getProducts,
  getPromotions,
  getSettings,
  syncCustomerProfile,
  updateOrderPayment,
  updateAboutContent,
  updateOrderStatus,
  updateProduct,
  updatePromotions,
  updateSettings,
  createContactMessage,
  getContactMessages,
  updateContactMessageReadStatus,
  deleteContactMessage,
  createPaymentProof,
  testCashierReview,
  recordWaiterDecision,
  recordWaiterPaymentCollection,
  updateOrderPaymentMethod,
} from "./db";
import { validateContactInput, type ContactMessage } from "@/lib/contact";
import { isValidUUID, type AboutContent } from "@/lib/content";
import type { Order, OrderStatus } from "@/lib/orders";
import type { Promotion } from "@/lib/promotions";
import { createScopedClient, supabase, type UserRole } from "@/lib/supabase";
import { serverSupabase } from "./supabase";
import {
  getRegisteredStaffList,
  registerStaffMember,
  updateStaffActiveStatus,
  updateStaffPassword,
} from "./staff";
import {
  getAdminPaymentAccounts,
  getPublicPaymentAccounts,
  upsertPaymentAccount,
} from "./payment-accounts";
import {
  resolveCashierMe,
  getPendingPaymentReviews,
  getPaymentReviewHistory,
  getCashierOverviewMetrics,
  getProofSignedUrl,
  approvePaymentProof,
  rejectPaymentProof,
  getCashierNotifications,
  markNotificationAsRead,
} from "./cashier";
import {
  resolveWaiterUser,
  getWaiterProfile,
  updateWaiterAvailability,
  getWaiterMetrics,
  getWaiterOrders,
  approveWaiterOrder,
  rejectWaiterOrder,
  submitWaiterPaymentProof,
  getWaiterPayments,
  getWaiterNotifications,
  markWaiterNotificationRead,
  getAvailableWaiters,
} from "./waiter";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function badRequest(message: string): Response {
  return json({ error: "Bad Request", message }, 400);
}

function unauthorized(message = "Unauthorized"): Response {
  return json({ error: "Unauthorized", message }, 401);
}

function forbidden(message = "Forbidden"): Response {
  return json({ error: "Forbidden", message }, 403);
}

function notFound(message = "Resource not found"): Response {
  return json({ error: "Not Found", message }, 404);
}

function serverError(error: unknown): Response {
  console.error("[api] Unhandled server error:", error);
  const message = error instanceof Error ? error.message : "Internal Server Error";
  return json({ error: "Internal Server Error", message }, 500);
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string | null;
  phone?: string | null;
  token: string;
}

/**
 * Extracts the Supabase access token from Authorization header (case-insensitive)
 * or cookie fallback.
 */
function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }

  // Check Cookie header fallback
  const cookieHeader = request.headers.get("cookie") || request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.split("=");
      if (!name) continue;
      const val = decodeURIComponent(rest.join("="));
      if (!val) continue;

      if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && parsed[0]) return parsed[0];
          if (parsed.access_token) return parsed.access_token;
        } catch {
          if (val.startsWith("base64-")) {
            try {
              const decoded = Buffer.from(val.replace("base64-", ""), "base64").toString("utf-8");
              const parsed = JSON.parse(decoded);
              if (parsed.access_token) return parsed.access_token;
            } catch {
              /* ignore decode error */
            }
          }
        }
      } else if (name === "sb-access-token" || name === "supabase-auth-token") {
        return val;
      }
    }
  }

  return null;
}

/**
 * Resolves the authenticated Supabase user from the request Authorization Bearer token or session cookie,
 * fetches their role from public.users / staff_profiles, and returns verified identity.
 */
export async function resolveAuthUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    let user = null;
    let userError = null;

    if (serverSupabase?.auth) {
      const res = await serverSupabase.auth.getUser(token);
      user = res.data?.user;
      userError = res.error;
    }
    if (!user && supabase?.auth) {
      const res = await supabase.auth.getUser(token);
      user = res.data?.user;
      userError = res.error || userError;
    }

    if (userError || !user || !user.id) {
      if (userError) {
        console.warn(`[api:resolveAuthUser] Token validation failed: ${userError.message}`);
      }
      return null;
    }

    let role: UserRole = "CUSTOMER";
    let fullName: string | null = null;
    let phone: string | null = null;

    // 1. Primary check: public.staff_profiles for active operational roles (admin, manager, owner, cashier, waiter, staff)
    try {
      const { data: staffProfile } = await (serverSupabase.from("staff_profiles" as any) as any)
        .select("role, full_name, phone, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (staffProfile && staffProfile.is_active) {
        const staffRole = (staffProfile.role || "").toLowerCase().trim();
        if (["admin", "manager", "owner"].includes(staffRole)) {
          role = "ADMIN";
        } else if (["cashier", "waiter", "kitchen", "staff"].includes(staffRole)) {
          role = "STAFF";
        }
        if (staffProfile.full_name) fullName = staffProfile.full_name;
        if (staffProfile.phone) phone = staffProfile.phone;
      }
    } catch {
      /* ignore lookup failure */
    }

    // 2. Fallback check: public.users if not resolved as active staff
    if (role === "CUSTOMER") {
      try {
        const { data: profile } = await (serverSupabase.from("users" as any) as any)
          .select("role, full_name, phone")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          const userRole = (profile.role || "").toUpperCase().trim();
          if (userRole === "ADMIN") role = "ADMIN";
          else if (userRole === "STAFF") role = "STAFF";
          if (profile.full_name) fullName = fullName || profile.full_name;
          if (profile.phone) phone = phone || profile.phone;
        }
      } catch {
        /* ignore lookup failure */
      }
    }

    // 3. Fallback to token-scoped RPC is_admin_or_staff
    if (role === "CUSTOMER") {
      try {
        const scopedClient = createScopedClient(token);
        const { data: isStaff } = await (scopedClient.rpc("is_admin_or_staff" as any) as any);
        if (isStaff === true) {
          role = "STAFF";
        }
      } catch {
        /* ignore rpc failure */
      }
    }

    if (!fullName) {
      fullName =
        (user.user_metadata?.["full_name"] as string) ||
        (user.user_metadata?.["name"] as string) ||
        null;
    }
    if (!phone) {
      phone = (user.user_metadata?.["phone"] as string) || null;
    }

    return {
      id: user.id,
      email: user.email || "",
      role,
      fullName,
      phone,
      token,
    };
  } catch (err) {
    console.warn("[api] resolveAuthUser error:", err);
    return null;
  }
}

/**
 * Validates the request bearer token against Supabase Auth and checks for ADMIN role in public.users
 * using a token-scoped client to satisfy PostgREST Row-Level Security.
 * Returns the verified token if authorized, or null if unauthorized.
 */
async function verifyAdminUser(request: Request): Promise<string | null> {
  const authUser = await resolveAuthUser(request);
  if (!authUser) return null;
  return authUser.role === "ADMIN" ? authUser.token : null;
}

/**
 * Main HTTP router for /api/* requests.
 */
export async function handleApiRequest(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  try {
    /* ----------------------------------------------------------------------
       1. Categories: GET /api/categories
       ---------------------------------------------------------------------- */
    if (pathname === "/api/categories") {
      if (method === "GET") {
        const categories = await getCategories();
        return json(categories);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       1b. Customers: GET /api/customers
       Returns every customer with their full order history.
       Requires authenticated ADMIN or STAFF role via Bearer token.
       Executes query using createScopedClient(token) so RLS enforces
       public.is_admin_or_staff() without service-role key.
       ---------------------------------------------------------------------- */
    if (pathname === "/api/customers") {
      if (method === "GET") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can access customer data");
        }

        try {
          const customers = await getCustomers(serverSupabase);
          return json(customers);
        } catch (err: any) {
          console.error("[api] /api/customers error:", err);
          return json({ error: err.message || "Failed to load customer profiles from database" }, 500);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       2. Products:
          GET    /api/products
          POST   /api/products
          GET    /api/products/:id
          PUT    /api/products/:id
          PATCH  /api/products/:id
          DELETE /api/products/:id
       ---------------------------------------------------------------------- */
    if (pathname === "/api/products") {
      if (method === "GET") {
        const category = url.searchParams.get("category") || undefined;
        const availableParam = url.searchParams.get("available");
        const available = availableParam !== null ? availableParam === "true" : undefined;
        const products = await getProducts({ category, available });
        return json(products);
      }

      if (method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can create products");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !body.name || body.price === undefined) {
          return badRequest("Missing required fields: 'name' and 'price'");
        }
        const created = await createProduct(body);
        return json(created, 201);
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch) {
      const productId = decodeURIComponent(productMatch[1]!);

      if (method === "GET") {
        const product = await getProductById(productId);
        if (!product) return notFound(`Product '${productId}' not found`);
        return json(product);
      }

      if (method === "PUT" || method === "PATCH") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can update products");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid JSON body");
        }
        const updated = await updateProduct(productId, body);
        if (!updated) return notFound(`Product '${productId}' not found`);
        return json(updated);
      }

      if (method === "DELETE") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can delete products");
        }

        const deleted = await deleteProduct(productId);
        if (!deleted) return notFound(`Product '${productId}' not found`);
        return json({ success: true, deletedId: productId });
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       3. Orders:
          GET   /api/orders
          POST  /api/orders
          GET   /api/orders/:id
          PATCH /api/orders/:id
          PUT   /api/orders/:id
       ---------------------------------------------------------------------- */
    if (pathname === "/api/orders") {
      if (method === "GET") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required to access order history");
        }

        // Admin and Staff: authorized operational orders
        if (authUser.role === "ADMIN" || authUser.role === "STAFF") {
          const phone = url.searchParams.get("phone") || undefined;
          const orders = await getOrders(phone ? { phone } : undefined, serverSupabase);
          return json(orders);
        }

        // Customer: return only customer's own orders (phone query param cannot bypass)
        const scopedClient = createScopedClient(authUser.token);
        const orders = await getOrdersForCustomerUser(authUser.id, scopedClient);
        return json(orders);
      }

      if (method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !Array.isArray(body.lines) || !body.method) {
          return badRequest("Invalid order data. 'lines' array and 'method' are required.");
        }
        const authUser = await resolveAuthUser(request);
        const scopedClient = authUser?.token ? createScopedClient(authUser.token) : undefined;
        try {
          const created = await createOrder(
            {
              ...body,
              authUserId: authUser?.id || undefined,
              authUserEmail: authUser?.email || undefined,
            },
            scopedClient,
          );
          return json(created, 201);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to create order";
          console.error("[api] Order creation error:", err);
          const isInternal =
            message.startsWith("Failed to create order:") ||
            message.startsWith("Failed to create customer") ||
            message.startsWith("Failed to create payment") ||
            message.startsWith("Failed to generate order number");
          const statusCode = isInternal ? 500 : 400;
          return json(
            { error: isInternal ? "Order Creation Failed" : "Invalid Order Request", message },
            statusCode,
          );
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       3b. Customer Profile:
           GET /api/customer/profile
           PUT /api/customer/profile
       ---------------------------------------------------------------------- */
    if (pathname === "/api/customer/profile") {
      const authUser = await resolveAuthUser(request);
      if (!authUser) {
        return unauthorized("Authentication required");
      }

      if (method === "GET") {
        const scopedClient = createScopedClient(authUser.token);
        const profile = await getCustomerProfileByUserId(authUser.id, scopedClient);
        return json({
          user: profile.user || {
            id: authUser.id,
            email: authUser.email,
            role: authUser.role,
            full_name: authUser.fullName,
            phone: authUser.phone,
          },
          customer: profile.customer,
        });
      }

      if (method === "PUT" || method === "PATCH") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid profile payload");
        }

        const fullName =
          typeof body.full_name === "string"
            ? body.full_name.trim()
            : typeof body.name === "string"
              ? body.name.trim()
              : undefined;
        const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;

        await syncCustomerProfile(authUser.id, authUser.email, {
          full_name: fullName,
          phone,
        });

        const updated = await getCustomerProfileByUserId(authUser.id);
        return json({
          user: updated.user,
          customer: updated.customer,
        });
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       3c. Admin Payments: GET /api/admin/payments
       Returns all payment transactions for authorized Admin & Staff.
       ---------------------------------------------------------------------- */
    if (pathname === "/api/admin/payments") {
      if (method === "GET") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can access payment records");
        }

        const { data, error } = await (serverSupabase.from("payments" as any) as any)
          .select(
            `
            id,
            order_id,
            method,
            status,
            amount,
            transaction_reference,
            paid_at,
            created_at,
            orders (
              id,
              order_number,
              customer_id,
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
              customers (
                id,
                name,
                phone,
                email
              ),
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
              )
            )
          `,
          )
          .order("created_at", { ascending: false });

        if (error) {
          return json({ error: "Failed to fetch payments", message: error.message }, 500);
        }

        return json(data || []);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       3d. Admin Sales Monitoring: GET /api/admin/sales-monitoring
       Returns orders, proofs, and reviews datasets for authorized Admin & Staff.
       ---------------------------------------------------------------------- */
    if (pathname === "/api/admin/sales-monitoring") {
      if (method === "GET") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can access financial monitoring");
        }

        const [ordersRes, proofsRes, reviewsRes] = await Promise.allSettled([
          (serverSupabase.from("orders" as any) as any)
            .select(
              `
              id,
              order_number,
              customer_name,
              customer_phone,
              method,
              status,
              waiter_id,
              table_number,
              delivery_address,
              subtotal,
              discount_amount,
              delivery_fee,
              total_amount,
              created_at,
              updated_at,
              staff_profiles (
                user_id,
                full_name,
                role
              ),
              order_items (
                id,
                order_id,
                product_id,
                name,
                unit_price,
                quantity,
                line_total
              ),
              payments (
                id,
                order_id,
                method,
                status,
                amount,
                transaction_reference,
                paid_at,
                created_at
              )
            `,
            )
            .order("created_at", { ascending: false }),

          (serverSupabase.from("payment_proofs" as any) as any)
            .select(
              `
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
            `,
            )
            .order("submitted_at", { ascending: false }),

          (serverSupabase.from("payment_reviews" as any) as any)
            .select(
              `
              id,
              payment_proof_id,
              cashier_id,
              decision,
              reason,
              reviewed_at
            `,
            )
            .order("reviewed_at", { ascending: false }),
        ]);

        const orders =
          ordersRes.status === "fulfilled" && Array.isArray((ordersRes.value as any)?.data)
            ? (ordersRes.value as any).data
            : [];
        const proofs =
          proofsRes.status === "fulfilled" && Array.isArray((proofsRes.value as any)?.data)
            ? (proofsRes.value as any).data
            : [];
        const reviews =
          reviewsRes.status === "fulfilled" && Array.isArray((reviewsRes.value as any)?.data)
            ? (reviewsRes.value as any).data
            : [];

        return json({ orders, proofs, reviews });
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       3e. Admin Staff Management & Registration:
           GET   /api/admin/staff
           POST  /api/admin/staff (or /api/admin/staff/register)
           PATCH /api/admin/staff/status (or /api/admin/staff/:id/status)
       Only authorized administrators may access staff registration and management.
       ---------------------------------------------------------------------- */
    if (pathname === "/api/admin/staff" || pathname === "/api/admin/staff/register") {
      const authUser = await resolveAuthUser(request);
      if (!authUser) {
        return unauthorized("Authentication required to access staff management");
      }
      if (authUser.role !== "ADMIN") {
        return forbidden("Only administrators can manage staff registrations");
      }

      // GET /api/admin/staff
      if (method === "GET") {
        try {
          const staff = await getRegisteredStaffList();
          return json(staff);
        } catch (err: unknown) {
          return serverError(err);
        }
      }

      // POST /api/admin/staff
      if (method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid registration request payload");
        }

        try {
          const newStaff = await registerStaffMember(
            {
              name: String(body.name || ""),
              email: String(body.email || ""),
              password: String(body.password || ""),
              role: body.role,
              phone: body.phone ? String(body.phone).trim() : undefined,
            },
            authUser.id,
          );
          return json({ success: true, staff: newStaff }, 201);
        } catch (err: any) {
          const status = err.statusCode || 500;
          if (status === 400) return badRequest(err.message);
          if (status === 409) return json({ error: err.message, message: err.message }, 409);
          if (status === 403) return forbidden(err.message);
          return serverError(err);
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/admin/staff/status") {
      if (method === "PATCH" || method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN") {
          return forbidden("Only administrators can change staff account status");
        }

        const body = await request.json().catch(() => null);
        if (!body || !body.userId || body.isActive === undefined) {
          return badRequest("Fields 'userId' and 'isActive' boolean are required");
        }

        try {
          const result = await updateStaffActiveStatus(
            String(body.userId),
            Boolean(body.isActive),
            authUser.id,
          );
          return json(result);
        } catch (err: any) {
          const status = err.statusCode || 500;
          if (status === 400) return badRequest(err.message);
          if (status === 403) return forbidden(err.message);
          if (status === 404) return notFound(err.message);
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const staffStatusMatch = pathname.match(/^\/api\/admin\/staff\/([^/]+)\/status$/);
    if (staffStatusMatch) {
      const targetUserId = decodeURIComponent(staffStatusMatch[1]!);
      if (method === "PATCH" || method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN") {
          return forbidden("Only administrators can change staff account status");
        }

        const body = await request.json().catch(() => null);
        const isActive =
          body?.isActive !== undefined
            ? Boolean(body.isActive)
            : body?.is_active !== undefined
              ? Boolean(body.is_active)
              : undefined;

        if (isActive === undefined) {
          return badRequest("Field 'isActive' boolean is required");
        }

        try {
          const result = await updateStaffActiveStatus(targetUserId, isActive, authUser.id);
          return json(result);
        } catch (err: any) {
          const status = err.statusCode || 500;
          if (status === 400) return badRequest(err.message);
          if (status === 403) return forbidden(err.message);
          if (status === 404) return notFound(err.message);
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/admin/staff/password") {
      if (method === "PATCH" || method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN") {
          return forbidden("Only administrators can update staff passwords");
        }

        const body = await request.json().catch(() => null);
        if (!body || !body.userId || !body.password) {
          return badRequest("Fields 'userId' and 'password' are required");
        }

        const cleanPassword = String(body.password).trim();
        if (cleanPassword.length < 6) {
          return badRequest("Password must be at least 6 characters long");
        }

        try {
          const result = await updateStaffPassword(
            String(body.userId),
            cleanPassword,
            authUser.id,
          );
          return json(result);
        } catch (err: any) {
          const status = err.statusCode || 500;
          if (status === 400) return badRequest(err.message);
          if (status === 403) return forbidden(err.message);
          if (status === 404) return notFound(err.message);
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const staffPasswordMatch = pathname.match(/^\/api\/admin\/staff\/([^/]+)\/password$/);
    if (staffPasswordMatch) {
      const targetUserId = decodeURIComponent(staffPasswordMatch[1]!);
      if (method === "PATCH" || method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN") {
          return forbidden("Only administrators can update staff passwords");
        }

        const body = await request.json().catch(() => null);
        if (!body || !body.password) {
          return badRequest("Field 'password' is required");
        }

        const cleanPassword = String(body.password).trim();
        if (cleanPassword.length < 6) {
          return badRequest("Password must be at least 6 characters long");
        }

        try {
          const result = await updateStaffPassword(targetUserId, cleanPassword, authUser.id);
          return json(result);
        } catch (err: any) {
          const status = err.statusCode || 500;
          if (status === 400) return badRequest(err.message);
          if (status === 403) return forbidden(err.message);
          if (status === 404) return notFound(err.message);
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       3g. Admin Account & Profile Management:
           GET    /api/admin/account
           PATCH  /api/admin/account
           POST   /api/admin/account/avatar
           DELETE /api/admin/account/avatar
       ---------------------------------------------------------------------- */
    if (pathname === "/api/admin/account") {
      const authUser = await resolveAuthUser(request);
      if (!authUser) {
        return unauthorized("Authentication required to access account profile");
      }
      if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
        return forbidden("Staff or administrator authorization required");
      }

      if (method === "GET") {
        try {
          // 1. Fetch staff profile if exists
          let staffProfile: {
            full_name?: string | null;
            phone?: string | null;
            role?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
          } | null = null;
          try {
            const { data } = await (serverSupabase.from("staff_profiles" as any) as any)
              .select("full_name, phone, role, created_at, updated_at")
              .eq("user_id", authUser.id)
              .maybeSingle();
            staffProfile = data;
          } catch {
            /* ignore lookup failure */
          }

          // 2. Fetch users record if exists
          let userRecord: {
            full_name?: string | null;
            phone?: string | null;
            avatar_url?: string | null;
            role?: string | null;
            created_at?: string | null;
            updated_at?: string | null;
          } | null = null;
          try {
            const { data } = await (serverSupabase.from("users" as any) as any)
              .select("full_name, phone, avatar_url, role, created_at, updated_at")
              .eq("id", authUser.id)
              .maybeSingle();
            userRecord = data;
          } catch {
            /* ignore lookup failure */
          }

          // 3. Fetch auth user details from Supabase Auth
          let authUserMeta: Record<string, unknown> = {};
          let authCreatedAt: string | null = null;
          let authLastSignIn: string | null = null;
          try {
            const { data: authRecord } = await serverSupabase.auth.admin.getUserById(authUser.id);
            if (authRecord?.user) {
              authUserMeta = (authRecord.user.user_metadata as Record<string, unknown>) || {};
              authCreatedAt = authRecord.user.created_at || null;
              authLastSignIn = authRecord.user.last_sign_in_at || null;
            }
          } catch {
            /* ignore auth lookup failure */
          }

          const profile = {
            id: authUser.id,
            email: authUser.email,
            role: authUser.role,
            fullName:
              staffProfile?.full_name ||
              userRecord?.full_name ||
              (authUserMeta["full_name"] as string) ||
              authUser.fullName ||
              "",
            phone:
              staffProfile?.phone ||
              userRecord?.phone ||
              (authUserMeta["phone"] as string) ||
              authUser.phone ||
              "",
            avatarUrl: userRecord?.avatar_url || (authUserMeta["avatar_url"] as string) || null,
            accountCreatedAt: authCreatedAt || userRecord?.created_at || null,
            lastSignInAt: authLastSignIn,
            dbCreatedAt: staffProfile?.created_at || userRecord?.created_at || null,
            dbUpdatedAt: staffProfile?.updated_at || userRecord?.updated_at || null,
          };

          return json({ success: true, data: profile });
        } catch (err) {
          return serverError(err);
        }
      }

      if (method === "PATCH" || method === "PUT") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid profile update payload");
        }

        const fullName =
          typeof body.fullName === "string"
            ? body.fullName.trim()
            : typeof body.full_name === "string"
              ? body.full_name.trim()
              : undefined;
        const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
        const avatarUrl =
          body.avatarUrl !== undefined
            ? body.avatarUrl
            : body.avatar_url !== undefined
              ? body.avatar_url
              : undefined;

        if (fullName !== undefined && fullName.length === 0) {
          return badRequest("Full name cannot be empty");
        }

        try {
          // Update staff_profiles if present
          try {
            const spUpdates: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            };
            if (fullName !== undefined) spUpdates["full_name"] = fullName;
            if (phone !== undefined) spUpdates["phone"] = phone;
            await (serverSupabase.from("staff_profiles" as any) as any)
              .update(spUpdates)
              .eq("user_id", authUser.id);
          } catch {
            /* ignore update failure */
          }

          // Update users if present
          try {
            const uUpdates: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            };
            if (fullName !== undefined) uUpdates["full_name"] = fullName;
            if (phone !== undefined) uUpdates["phone"] = phone;
            if (avatarUrl !== undefined) uUpdates["avatar_url"] = avatarUrl;
            await (serverSupabase.from("users" as any) as any)
              .update(uUpdates)
              .eq("id", authUser.id);
          } catch {
            /* ignore update failure */
          }

          // Update auth user metadata
          try {
            const metaUpdates: Record<string, unknown> = {};
            if (fullName !== undefined) metaUpdates["full_name"] = fullName;
            if (phone !== undefined) metaUpdates["phone"] = phone;
            if (avatarUrl !== undefined) metaUpdates["avatar_url"] = avatarUrl;
            if (Object.keys(metaUpdates).length > 0) {
              await serverSupabase.auth.admin.updateUserById(authUser.id, {
                user_metadata: metaUpdates,
              });
            }
          } catch {
            /* ignore auth metadata update failure */
          }

          return json({ success: true, message: "Profile updated successfully" });
        } catch (err) {
          return serverError(err);
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/admin/account/avatar") {
      const authUser = await resolveAuthUser(request);
      if (!authUser) {
        return unauthorized("Authentication required to manage avatar");
      }
      if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
        return forbidden("Staff or administrator authorization required");
      }

      if (method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid avatar upload payload");
        }

        const dataUrl = body.dataUrl || body.data || body.fileData;
        const previousAvatarUrl = body.previousAvatarUrl;

        if (!dataUrl || typeof dataUrl !== "string") {
          return badRequest("Missing avatar image data");
        }

        const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || !matches[1] || !matches[2]) {
          return badRequest("Invalid base64 image data URL format");
        }

        const mimeType = matches[1].toLowerCase();
        const base64Data = matches[2];

        const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
        if (!allowedMimes.includes(mimeType)) {
          return badRequest("Only JPG, PNG, and WEBP images are supported");
        }

        let extension = "jpg";
        if (mimeType.includes("png")) extension = "png";
        else if (mimeType.includes("webp")) extension = "webp";

        const buffer = Buffer.from(base64Data, "base64");
        if (buffer.length > 5 * 1024 * 1024) {
          return badRequest("Avatar image exceeds 5 MB size limit");
        }

        const uniqueFilename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
        const storagePath = `avatars/${authUser.id}/${uniqueFilename}`;

        // Ensure avatars bucket exists
        try {
          await serverSupabase.storage.createBucket("avatars", {
            public: true,
            fileSizeLimit: 5242880,
            allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
          });
        } catch {
          /* already exists */
        }

        const { error: uploadError } = await serverSupabase.storage
          .from("avatars")
          .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: true,
          });

        if (uploadError) {
          return serverError(new Error(`Storage upload failed: ${uploadError.message}`));
        }

        const { data: urlData } = serverSupabase.storage.from("avatars").getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;

        // Update database and auth metadata with publicUrl
        try {
          await (serverSupabase.from("users" as any) as any)
            .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
            .eq("id", authUser.id);
        } catch {
          /* ignore */
        }

        try {
          await serverSupabase.auth.admin.updateUserById(authUser.id, {
            user_metadata: { avatar_url: publicUrl },
          });
        } catch {
          /* ignore */
        }

        // Clean up previous avatar if safe
        if (previousAvatarUrl && typeof previousAvatarUrl === "string") {
          try {
            const marker = "/avatars/";
            const idx = previousAvatarUrl.indexOf(marker);
            if (idx !== -1) {
              const oldPath = previousAvatarUrl.slice(idx + marker.length).split("?")[0];
              if (
                oldPath &&
                oldPath.startsWith(`avatars/${authUser.id}/`) &&
                oldPath !== storagePath
              ) {
                await serverSupabase.storage.from("avatars").remove([oldPath]);
              }
            }
          } catch {
            /* ignore cleanup failure */
          }
        }

        return json({ success: true, avatarUrl: publicUrl });
      }

      if (method === "DELETE") {
        const body = await request.json().catch(() => ({}));
        const currentAvatarUrl = body?.currentAvatarUrl || body?.avatarUrl;

        // Clear in database
        try {
          await (serverSupabase.from("users" as any) as any)
            .update({ avatar_url: null, updated_at: new Date().toISOString() })
            .eq("id", authUser.id);
        } catch {
          /* ignore */
        }

        try {
          await serverSupabase.auth.admin.updateUserById(authUser.id, {
            user_metadata: { avatar_url: null },
          });
        } catch {
          /* ignore */
        }

        // Remove from storage if path points to this user's avatar
        if (currentAvatarUrl && typeof currentAvatarUrl === "string") {
          try {
            const marker = "/avatars/";
            const idx = currentAvatarUrl.indexOf(marker);
            if (idx !== -1) {
              const oldPath = currentAvatarUrl.slice(idx + marker.length).split("?")[0];
              if (oldPath && oldPath.startsWith(`avatars/${authUser.id}/`)) {
                await serverSupabase.storage.from("avatars").remove([oldPath]);
              }
            }
          } catch {
            /* ignore */
          }
        }

        return json({
          success: true,
          avatarUrl: null,
          message: "Avatar removed successfully",
        });
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       3f. Receiving Accounts Management (public.payment_account_settings):
           GET  /api/payment-accounts (public active list for checkout)
           GET  /api/admin/payment-accounts (admin list)
           POST /api/admin/payment-accounts (admin upsert)
           PATCH /api/admin/payment-accounts/:id (admin update)
       ---------------------------------------------------------------------- */
    
    /* ----------------------------------------------------------------------
       Payment Account Settings:
           GET /api/payment-settings (Public read of active payment accounts)
           PUT /api/admin/payment-settings (Admin update of account details)
       ---------------------------------------------------------------------- */
    if (pathname === "/api/payment-settings") {
      if (method === "GET") {
        try {
          const rows = await getPaymentAccountSettingsFromDb();
          return json({ success: true, data: rows });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to load payment settings";
          return json({ success: false, error: "Payment Settings Unavailable", message }, 500);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/admin/payment-settings") {
      if (method === "PUT" || method === "PATCH") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required to update payment accounts");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators can update payment accounts");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !body.payment_method || !body.account_number || !body.account_owner_name) {
          return badRequest("Missing required fields: payment_method, account_number, account_owner_name");
        }

        try {
          const updated = await updatePaymentAccountSettingsInDb({
            payment_method: body.payment_method,
            account_number: body.account_number,
            account_owner_name: body.account_owner_name,
            is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
          });
          return json({ success: true, data: updated });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to update payment setting";
          return json({ success: false, error: "Update Failed", message }, 500);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/payment-accounts") {
      if (method === "GET") {
        try {
          const accounts = await getPublicPaymentAccounts();
          return json(accounts);
        } catch (err: unknown) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/admin/payment-accounts") {
      const authUser = await resolveAuthUser(request);
      if (!authUser) {
        return unauthorized("Authentication required to access receiving accounts");
      }
      if (authUser.role !== "ADMIN") {
        return forbidden("Only administrators can view or manage receiving accounts");
      }

      if (method === "GET") {
        try {
          const accounts = await getAdminPaymentAccounts();
          return json(accounts);
        } catch (err: unknown) {
          return serverError(err);
        }
      }

      if (method === "POST" || method === "PUT") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid receiving account payload");
        }

        try {
          const saved = await upsertPaymentAccount({
            id: body.id ? String(body.id) : undefined,
            payment_method: String(body.payment_method || body.paymentMethod || ""),
            account_number: String(body.account_number || body.accountNumber || ""),
            account_owner_name: String(body.account_owner_name || body.accountOwnerName || ""),
            is_active:
              body.is_active !== undefined
                ? Boolean(body.is_active)
                : body.isActive !== undefined
                  ? Boolean(body.isActive)
                  : true,
          });
          return json({ success: true, account: saved });
        } catch (err: any) {
          const status = err.statusCode || 500;
          if (status === 400) return badRequest(err.message);
          if (status === 409) return json({ error: err.message, message: err.message }, 409);
          if (status === 403) return forbidden(err.message);
          return serverError(err);
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    const paymentAccountMatch = pathname.match(/^\/api\/admin\/payment-accounts\/([^/]+)$/);
    if (paymentAccountMatch) {
      const targetId = decodeURIComponent(paymentAccountMatch[1]!);
      if (method === "PATCH" || method === "PUT" || method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN") {
          return forbidden("Only administrators can update receiving accounts");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid receiving account payload");
        }

        try {
          const saved = await upsertPaymentAccount({
            id: targetId,
            payment_method: String(body.payment_method || body.paymentMethod || ""),
            account_number: String(body.account_number || body.accountNumber || ""),
            account_owner_name: String(body.account_owner_name || body.accountOwnerName || ""),
            is_active:
              body.is_active !== undefined
                ? Boolean(body.is_active)
                : body.isActive !== undefined
                  ? Boolean(body.isActive)
                  : undefined,
          });
          return json({ success: true, account: saved });
        } catch (err: any) {
          const status = err.statusCode || 500;
          if (status === 400) return badRequest(err.message);
          if (status === 409) return json({ error: err.message, message: err.message }, 409);
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const orderPaymentMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment$/);
    if (orderPaymentMatch) {
      const orderId = decodeURIComponent(orderPaymentMatch[1]!);
      if (method === "PATCH" || method === "POST" || method === "PUT") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required to update order payment");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can update order payment status");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !body.paymentStatus) {
          return badRequest("Field 'paymentStatus' ('paid', 'pending', or 'failed') is required.");
        }
        const updated = await updateOrderPayment(orderId, {
          paymentStatus: body.paymentStatus,
          paymentMethod: body.paymentMethod,
          transactionReference: body.transactionReference,
        });
        if (!updated) return notFound(`Order '${orderId}' not found`);
        return json(updated);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }


    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (orderMatch) {
      const orderId = decodeURIComponent(orderMatch[1]!);

      if (method === "GET") {
        const authUser = await resolveAuthUser(request);
        const scopedClient = authUser?.token ? createScopedClient(authUser.token) : undefined;
        const order = await getOrderById(orderId, scopedClient);
        if (!order) return notFound(`Order '${orderId}' not found`);

        // If caller is an authenticated CUSTOMER, verify they own this order
        if (authUser && authUser.role === "CUSTOMER") {
          const customerOrders = await getOrdersForCustomerUser(authUser.id, scopedClient);
          const ownsOrder = customerOrders.some(
            (o) => o.id === order.id || o.number === order.number,
          );
          if (!ownsOrder) {
            return notFound(`Order '${orderId}' not found`);
          }
        }
        return json(order);
      }

      if (method === "PATCH" || method === "PUT") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid request body");
        }

        const scopedClient = createScopedClient(authUser.token);
        let updated: Order | null = null;

        if (body.status) {
          // Verify role: ONLY ADMIN or STAFF may update order status
          if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
            return forbidden("Only administrators and staff can update order status.");
          }

          const VALID_STATUSES: OrderStatus[] = [
            "received",
            "confirmed",
            "preparing",
            "ready",
            "out-for-delivery",
            "delivered",
            "completed",
          ];

          if (!VALID_STATUSES.includes(body.status as OrderStatus)) {
            return badRequest(
              `Invalid status '${body.status}'. Valid statuses: ${VALID_STATUSES.join(", ")}`,
            );
          }

          try {
            updated = await updateOrderStatus(
              orderId,
              body.status as OrderStatus,
              scopedClient,
              authUser.id,
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to update status";
            return json({ error: "Update Status Failed", message }, 500);
          }
        }

        if (body.paymentStatus) {
          if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
            return forbidden("Only administrators and staff can update payment status.");
          }
          updated = await updateOrderPayment(orderId, {
            paymentStatus: body.paymentStatus,
            paymentMethod: body.paymentMethod,
            transactionReference: body.transactionReference,
          });
        }

        if (!body.status && !body.paymentStatus) {
          return badRequest("Field 'status' or 'paymentStatus' is required to update order.");
        }

        if (!updated) return notFound(`Order '${orderId}' not found`);
        return json(updated);
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       4. Promotions:
          GET  /api/promotions
          PUT  /api/promotions
          POST /api/promotions
       ---------------------------------------------------------------------- */
    if (pathname === "/api/promotions") {
      if (method === "GET") {
        const promotions = await getPromotions();
        return json(promotions);
      }

      if (method === "PUT") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can update promotions");
        }

        const body = await request.json().catch(() => null);
        if (Array.isArray(body)) {
          const updated = await updatePromotions(body as Promotion[]);
          return json(updated);
        }
        if (body && typeof body === "object" && body.id) {
          const existing = await getPromotions();
          const next = existing.map((p) => (p.id === body.id ? { ...p, ...body } : p));
          const updated = await updatePromotions(next);
          return json(updated);
        }
        return badRequest("Expected an array of promotions or a promotion object with an 'id'");
      }

      if (method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can create promotions");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !body.name || body.discountValue === undefined) {
          return badRequest("Missing required fields: 'name' and 'discountValue'");
        }
        const newPromo: Promotion = {
          id: body.id || `promo-${Date.now().toString(36)}`,
          name: body.name,
          description: body.description || "",
          imageUrl: body.imageUrl || null,
          discountType: body.discountType || "percentage",
          discountValue: Number(body.discountValue) || 0,
          applicableProductIds: Array.isArray(body.applicableProductIds)
            ? body.applicableProductIds
            : ["*"],
          applicableCategorySlug: body.applicableCategorySlug,
          startDate: body.startDate || new Date().toISOString().split("T")[0]!,
          endDate: body.endDate || "2099-12-31",
          status: body.status || "active",
          minOrderAmount: body.minOrderAmount,
          createdAt: new Date().toISOString(),
        };
        const created = await createPromotion(newPromo);
        return json(created, 201);
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    const promoMatch = pathname.match(/^\/api\/promotions\/([^/]+)$/);
    if (promoMatch) {
      const promoId = decodeURIComponent(promoMatch[1]!);
      if (method === "DELETE") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can delete promotions");
        }

        const deleted = await deletePromotion(promoId);
        if (!deleted) return notFound(`Promotion '${promoId}' not found`);
        return json({ success: true, deletedId: promoId });
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       5. Settings:
          GET /api/settings
          PUT /api/settings
       ---------------------------------------------------------------------- */
    if (pathname === "/api/settings") {
      if (method === "GET") {
        const settings = await getSettings();
        return json(settings);
      }

      if (method === "PUT" || method === "PATCH") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can update store settings");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid JSON body");
        }

        // Validate values before saving
        if (body.cafeName !== undefined && (!body.cafeName || !body.cafeName.trim())) {
          return badRequest("Café name cannot be empty");
        }
        if (
          body.pricePerKm !== undefined &&
          (isNaN(Number(body.pricePerKm)) || Number(body.pricePerKm) < 0)
        ) {
          return badRequest("Price per KM cannot be negative");
        }
        if (
          body.minDeliveryFee !== undefined &&
          (isNaN(Number(body.minDeliveryFee)) || Number(body.minDeliveryFee) < 0)
        ) {
          return badRequest("Minimum delivery fee cannot be negative");
        }
        if (
          body.maxDeliveryDistanceKm !== undefined &&
          (isNaN(Number(body.maxDeliveryDistanceKm)) || Number(body.maxDeliveryDistanceKm) <= 0)
        ) {
          return badRequest("Maximum delivery distance must be greater than 0");
        }
        if (body.cafeLatitude !== undefined && body.cafeLatitude !== null) {
          const lat = Number(body.cafeLatitude);
          if (isNaN(lat) || lat < -90 || lat > 90) {
            return badRequest("Café latitude must be between -90 and 90 degrees");
          }
        }
        if (body.cafeLongitude !== undefined && body.cafeLongitude !== null) {
          const lng = Number(body.cafeLongitude);
          if (isNaN(lng) || lng < -180 || lng > 180) {
            return badRequest("Café longitude must be between -180 and 180 degrees");
          }
        }
        const validRules = ["none", "nearest_1", "nearest_5", "ceil"];
        if (body.roundingRule !== undefined && !validRules.includes(body.roundingRule)) {
          return badRequest("Invalid rounding rule selected");
        }

        const updated = await updateSettings(body);
        return json(updated);
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       6. Website Content:
          GET /api/content
          PUT /api/content
       ---------------------------------------------------------------------- */
    if (pathname === "/api/content") {
      if (method === "GET") {
        const content = await getAboutContent();
        return json(content);
      }

      if (method === "PUT" || method === "PATCH") {
        const token = await verifyAdminUser(request);
        if (!token) {
          return json(
            { error: "Forbidden", message: "Only administrators can update website content." },
            403,
          );
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid JSON body");
        }

        // Validate body.id if explicitly provided
        if (body.id !== undefined && body.id !== null) {
          const idStr = String(body.id).trim();
          if (!isValidUUID(idStr)) {
            return badRequest(`Invalid content record ID "${body.id}": a valid UUID is required`);
          }
        }

        // Sanitize payload to allowed editable fields
        const allowedUpdates: Partial<AboutContent> = {};
        if (body.id && isValidUUID(String(body.id))) {
          allowedUpdates.id = String(body.id).trim();
        }
        if (body.homepage_hero_image !== undefined)
          allowedUpdates.homepage_hero_image = body.homepage_hero_image;
        if (body.about_hero_image !== undefined)
          allowedUpdates.about_hero_image = body.about_hero_image;
        if (typeof body.about_title === "string") allowedUpdates.about_title = body.about_title;
        if (typeof body.about_description === "string")
          allowedUpdates.about_description = body.about_description;
        if (typeof body.story_title === "string") allowedUpdates.story_title = body.story_title;
        if (typeof body.story_content === "string")
          allowedUpdates.story_content = body.story_content;
        if (body.story_image !== undefined) allowedUpdates.story_image = body.story_image;
        if (typeof body.value_1_title === "string")
          allowedUpdates.value_1_title = body.value_1_title;
        if (typeof body.value_1_description === "string")
          allowedUpdates.value_1_description = body.value_1_description;
        if (typeof body.value_2_title === "string")
          allowedUpdates.value_2_title = body.value_2_title;
        if (typeof body.value_2_description === "string")
          allowedUpdates.value_2_description = body.value_2_description;
        if (typeof body.value_3_title === "string")
          allowedUpdates.value_3_title = body.value_3_title;
        if (typeof body.value_3_description === "string")
          allowedUpdates.value_3_description = body.value_3_description;

        try {
          const updated = await updateAboutContent(allowedUpdates, token);
          return json(updated);
        } catch (err: any) {
          console.error("[api] /api/about update error:", err);
          return json(
            { error: "Database update failed", message: err.message || "Failed to update website content" },
            500,
          );
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       7. Contact Messages:
          POST   /api/contact
          GET    /api/contact-messages
          PATCH  /api/contact-messages/:id
          DELETE /api/contact-messages/:id
       ---------------------------------------------------------------------- */
    if (pathname === "/api/contact") {
      if (method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid JSON body");
        }

        const validation = validateContactInput(body);
        if (!validation.valid) {
          const firstError = Object.values(validation.errors)[0] || "Validation failed";
          return json(
            { error: "Validation Error", message: firstError, errors: validation.errors },
            400,
          );
        }

        try {
          const result = await createContactMessage(
            {
              name: body.name,
              email: body.email,
              message: body.message,
            },
            serverSupabase,
          );
          return json(
            { success: true, message: "Contact message sent successfully", id: result.id },
            201,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to save contact message";
          console.error("[api] Contact message creation error:", err);
          return json({ error: "Internal Server Error", message }, 500);
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/contact-messages" || pathname === "/api/admin/contact-messages") {
      if (method === "GET") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required to access contact messages");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can access contact messages");
        }

        try {
          const messages = await getContactMessages(serverSupabase);
          return json(messages);
        } catch (err: any) {
          console.error("[api] /api/contact-messages fetch error:", err);
          return json({ error: err.message || "Failed to load contact messages" }, 500);
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    const contactMessageMatch = pathname.match(/^\/api\/(?:admin\/)?contact-messages\/([^/]+)$/);
    if (contactMessageMatch) {
      const messageId = decodeURIComponent(contactMessageMatch[1]!);

      if (method === "PATCH" || method === "PUT") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can update contact messages");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid request body");
        }

        const isRead =
          body.isRead !== undefined
            ? Boolean(body.isRead)
            : body.is_read !== undefined
              ? Boolean(body.is_read)
              : undefined;

        if (isRead === undefined) {
          return badRequest("Field 'isRead' or 'is_read' boolean is required");
        }

        try {
          const updated = await updateContactMessageReadStatus(messageId, isRead, serverSupabase);
          if (!updated) {
            return notFound(`Contact message '${messageId}' not found`);
          }
          return json(updated);
        } catch (err: any) {
          console.error(`[api] /api/contact-messages/${messageId} update error:`, err);
          return json({ error: err.message || "Failed to update contact message" }, 500);
        }
      }

      if (method === "DELETE") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can delete contact messages");
        }

        try {
          await deleteContactMessage(messageId, serverSupabase);
          return json({ success: true, deletedId: messageId });
        } catch (err: any) {
          console.error(`[api] /api/contact-messages/${messageId} delete error:`, err);
          return json({ error: err.message || "Failed to delete contact message" }, 500);
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       8. Cashier Operations:
          GET   /api/cashier/me
          GET   /api/cashier/pending
          GET   /api/cashier/history
          GET   /api/cashier/metrics
          POST  /api/cashier/proof-url
          POST  /api/cashier/reviews/approve
          POST  /api/cashier/reviews/reject
          GET   /api/cashier/notifications
          PATCH /api/cashier/notifications/:id/read
       ---------------------------------------------------------------------- */
    if (pathname === "/api/cashier/me") {
      if (method === "GET") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: meResult.status,
              role: (meResult as any).role,
              message: meResult.message,
            },
            status,
          );
        }
        return json({
          success: true,
          profile: meResult.profile,
          role: meResult.role,
        });
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/cashier/pending") {
      if (method === "GET") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            { error: status === 401 ? "Unauthorized" : "Forbidden", message: meResult.message },
            status,
          );
        }
        try {
          const items = await getPendingPaymentReviews();
          return json(items);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/cashier/history") {
      if (method === "GET") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            { error: status === 401 ? "Unauthorized" : "Forbidden", message: meResult.message },
            status,
          );
        }
        try {
          const history = await getPaymentReviewHistory();
          return json(history);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/cashier/metrics") {
      if (method === "GET") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            { error: status === 401 ? "Unauthorized" : "Forbidden", message: meResult.message },
            status,
          );
        }
        try {
          const metrics = await getCashierOverviewMetrics();
          return json(metrics);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/cashier/proof-url") {
      if (method === "POST") {
        const authUser = await resolveAuthUser(request);
        let allowed = Boolean(authUser && authUser.role === "ADMIN");
        if (!allowed) {
          const meResult = await resolveCashierMe(request);
          if (meResult.success) {
            allowed = true;
          }
        }
        if (!allowed) {
          return unauthorized("Cashier or Administrator authentication required");
        }
        const body = await request.json().catch(() => null);
        if (!body?.proofId || typeof body.proofId !== "string") {
          return badRequest("Field 'proofId' is required");
        }
        try {
          const signedUrl = await getProofSignedUrl(body.proofId);
          return json({ signedUrl });
        } catch (err: any) {
          return json({ error: "Proof URL Generation Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/cashier/reviews/approve") {
      if (method === "POST") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            { error: status === 401 ? "Unauthorized" : "Forbidden", message: meResult.message },
            status,
          );
        }
        const body = await request.json().catch(() => null);
        if (!body?.proofId || typeof body.proofId !== "string") {
          return badRequest("Field 'proofId' is required");
        }
        try {
          const result = await approvePaymentProof(
            body.proofId,
            meResult.profile.user_id,
            body.notes,
          );
          return json(result);
        } catch (err: any) {
          return json({ error: "Payment Approval Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/cashier/reviews/reject") {
      if (method === "POST") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            { error: status === 401 ? "Unauthorized" : "Forbidden", message: meResult.message },
            status,
          );
        }
        const body = await request.json().catch(() => null);
        if (!body?.proofId || typeof body.proofId !== "string") {
          return badRequest("Field 'proofId' is required");
        }
        if (!body?.reason || typeof body.reason !== "string" || !body.reason.trim()) {
          return badRequest("A clear rejection reason is required");
        }
        try {
          const result = await rejectPaymentProof(
            body.proofId,
            meResult.profile.user_id,
            body.reason,
          );
          return json(result);
        } catch (err: any) {
          return json({ error: "Payment Rejection Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/cashier/notifications") {
      if (method === "GET") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            { error: status === 401 ? "Unauthorized" : "Forbidden", message: meResult.message },
            status,
          );
        }
        try {
          const notifications = await getCashierNotifications(meResult.profile.user_id);
          return json(notifications);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const cashierNotifMatch = pathname.match(/^\/api\/cashier\/notifications\/([^/]+)\/read$/);
    if (cashierNotifMatch) {
      const notificationId = decodeURIComponent(cashierNotifMatch[1]!);
      if (method === "PATCH" || method === "POST") {
        const meResult = await resolveCashierMe(request);
        if (!meResult.success) {
          const status = meResult.status === "unauthenticated" ? 401 : 403;
          return json(
            { error: status === 401 ? "Unauthorized" : "Forbidden", message: meResult.message },
            status,
          );
        }
        try {
          await markNotificationAsRead(notificationId, meResult.profile.user_id);
          return json({ success: true, notificationId });
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       9. Waiter Station Operations & Floor Management:
          GET   /api/waiters/available
          GET   /api/waiter/profile
          PATCH /api/waiter/profile
          GET   /api/waiter/metrics
          GET   /api/waiter/orders
          POST  /api/waiter/orders/:id/approve
          POST  /api/waiter/orders/:id/reject
          POST  /api/waiter/orders/:id/payment-proof
          GET   /api/waiter/payments
          GET   /api/waiter/notifications
          PATCH /api/waiter/notifications/:id
          PATCH /api/waiter/notifications/:id/read
          POST  /api/orders/:id/waiter-decision
          POST  /api/orders/:id/waiter-payment-collection
          POST  /api/orders/:id/payment-method
          POST  /api/orders/:id/payment-proof
       ---------------------------------------------------------------------- */
    if (pathname === "/api/waiters/available") {
      if (method === "GET") {
        try {
          const waiters = await getAvailableWaiters();
          return json(waiters);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/profile") {
      if (method === "GET") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        try {
          const profile = await getWaiterProfile(waiterAuth.staff.userId);
          return json({
            user: profile || {
              userId: waiterAuth.staff.userId,
              fullName: waiterAuth.staff.fullName,
              phone: waiterAuth.staff.phone,
              role: waiterAuth.staff.role,
              isAvailable: waiterAuth.staff.isAvailable,
              isActive: waiterAuth.staff.isActive,
            },
          });
        } catch (err: any) {
          return serverError(err);
        }
      }

      if (method === "PATCH") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        const body = await request.json().catch(() => null);
        if (typeof body?.isAvailable !== "boolean") {
          return badRequest("Field 'isAvailable' boolean is required");
        }
        try {
          const result = await updateWaiterAvailability(waiterAuth.staff.userId, body.isAvailable);
          return json(result);
        } catch (err: any) {
          return serverError(err);
        }
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/metrics") {
      if (method === "GET") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        try {
          const metrics = await getWaiterMetrics(waiterAuth.staff);
          return json(metrics);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/orders") {
      if (method === "GET") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        try {
          const statusFilter = url.searchParams.get("status") || undefined;
          const searchFilter = url.searchParams.get("search") || undefined;
          const dateFilter = url.searchParams.get("date") || undefined;
          const orders = await getWaiterOrders(waiterAuth.staff, {
            status: statusFilter,
            search: searchFilter,
            date: dateFilter,
          });
          return json(orders);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterApproveMatch = pathname.match(/^\/api\/waiter\/orders\/([^/]+)\/approve$/);
    if (waiterApproveMatch) {
      const orderId = decodeURIComponent(waiterApproveMatch[1]!);
      if (method === "POST") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        const body = await request.json().catch(() => ({}));
        try {
          const updated = await approveWaiterOrder(waiterAuth.staff, orderId, body?.comments);
          return json(updated);
        } catch (err: any) {
          return json({ error: "Order Approval Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterRejectMatch = pathname.match(/^\/api\/waiter\/orders\/([^/]+)\/reject$/);
    if (waiterRejectMatch) {
      const orderId = decodeURIComponent(waiterRejectMatch[1]!);
      if (method === "POST") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        const body = await request.json().catch(() => null);
        if (!body?.reason || typeof body.reason !== "string" || !body.reason.trim()) {
          return badRequest("A clear rejection reason is required");
        }
        try {
          const updated = await rejectWaiterOrder(waiterAuth.staff, orderId, body.reason.trim());
          return json(updated);
        } catch (err: any) {
          return json({ error: "Order Rejection Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterPaymentProofMatch = pathname.match(/^\/api\/waiter\/orders\/([^/]+)\/payment-proof$/);
    if (waiterPaymentProofMatch) {
      const orderId = decodeURIComponent(waiterPaymentProofMatch[1]!);
      if (method === "POST") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid payment proof submission payload");
        }
        try {
          const updated = await submitWaiterPaymentProof(waiterAuth.staff, orderId, {
            submittedAmount: Number(body.submittedAmount) || 0,
            paymentMethod: body.paymentMethod || "Mobile Payment",
            transactionReference: body.transactionReference || null,
            notes: body.notes || null,
            screenshotPath: body.screenshotPath || null,
            imageBase64: body.imageBase64 || null,
            mimeType: body.mimeType || null,
          });
          return json(updated);
        } catch (err: any) {
          return json({ error: "Payment Proof Submission Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/payments") {
      if (method === "GET") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        try {
          const payments = await getWaiterPayments(waiterAuth.staff);
          return json(payments);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/notifications") {
      if (method === "GET") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        try {
          const notifications = await getWaiterNotifications(waiterAuth.staff.userId);
          return json(notifications);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterNotifMatch = pathname.match(/^\/api\/waiter\/notifications\/([^/]+)(\/read)?$/);
    if (waiterNotifMatch) {
      const notificationId = decodeURIComponent(waiterNotifMatch[1]!);
      if (method === "PATCH" || method === "POST") {
        const waiterAuth = await resolveWaiterUser(request);
        if (!waiterAuth.success) {
          const status = waiterAuth.status === "unauthenticated" ? 401 : 403;
          return json(
            {
              error: status === 401 ? "Unauthorized" : "Forbidden",
              success: false,
              status: waiterAuth.status,
              role: (waiterAuth as any).role,
              message: waiterAuth.message,
            },
            status,
          );
        }
        try {
          const res = await markWaiterNotificationRead(waiterAuth.staff.userId, notificationId);
          return json(res);
        } catch (err: any) {
          return serverError(err);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       9b. Order Operational Actions (Floor & Checkout Integrations):
          POST /api/orders/:id/waiter-decision
          POST /api/orders/:id/waiter-payment-collection
          POST /api/orders/:id/payment-method
          POST /api/orders/:id/payment-proof
       ---------------------------------------------------------------------- */
    const orderWaiterDecisionMatch = pathname.match(/^\/api\/orders\/([^/]+)\/waiter-decision$/);
    if (orderWaiterDecisionMatch) {
      const orderId = decodeURIComponent(orderWaiterDecisionMatch[1]!);
      if (method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Floor staff or administrator authorization required");
        }
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !["approved", "rejected"].includes(body.decision)) {
          return badRequest("Field 'decision' must be 'approved' or 'rejected'");
        }
        try {
          const updated = await recordWaiterDecision({
            orderId,
            waiterId: authUser.id,
            decision: body.decision,
            comments: body.comments || body.reason,
          });
          return json(updated);
        } catch (err: any) {
          return json({ error: "Waiter Decision Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const orderWaiterPaymentColMatch = pathname.match(/^\/api\/orders\/([^/]+)\/waiter-payment-collection$/);
    if (orderWaiterPaymentColMatch) {
      const orderId = decodeURIComponent(orderWaiterPaymentColMatch[1]!);
      if (method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Floor staff or administrator authorization required");
        }
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !body.transactionReference) {
          return badRequest("Field 'transactionReference' is required");
        }
        try {
          const updated = await recordWaiterPaymentCollection({
            orderId,
            waiterId: authUser.id,
            transactionReference: String(body.transactionReference).trim(),
            ...(body.notes ? { notes: String(body.notes).trim() } : {}),
          });
          return json(updated);
        } catch (err: any) {
          return json({ error: "Payment Collection Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const orderPaymentMethodMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment-method$/);
    if (orderPaymentMethodMatch) {
      const orderId = decodeURIComponent(orderPaymentMethodMatch[1]!);
      if (method === "POST" || method === "PATCH") {
        const body = await request.json().catch(() => null);
        if (!body?.paymentMethod) {
          return badRequest("Field 'paymentMethod' is required");
        }
        try {
          const updated = await updateOrderPaymentMethod({
            orderId,
            paymentMethod: String(body.paymentMethod),
          });
          return json(updated);
        } catch (err: any) {
          return json({ error: "Update Payment Method Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const orderPaymentProofMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment-proof$/);
    if (orderPaymentProofMatch) {
      const orderId = decodeURIComponent(orderPaymentProofMatch[1]!);
      if (method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid payment proof submission payload");
        }

        let screenshotPath = body.screenshotPath;
        if (!screenshotPath && body.imageBase64) {
          try {
            const base64Data = body.imageBase64.includes(",")
              ? body.imageBase64.split(",")[1]!
              : body.imageBase64;
            const buffer = Buffer.from(base64Data, "base64");
            const ext = body.mimeType?.includes("png")
              ? "png"
              : body.mimeType?.includes("webp")
                ? "webp"
                : "jpg";
            const storagePath = `proofs/${orderId}/${Date.now()}.${ext}`;

            try {
              await serverSupabase.storage.createBucket("payment-proofs", { public: true });
            } catch {
              /* ignore if exists */
            }

            const { error: uploadError } = await serverSupabase.storage
              .from("payment-proofs")
              .upload(storagePath, buffer, {
                contentType: body.mimeType || "image/jpeg",
                upsert: true,
              });

            if (!uploadError) {
              screenshotPath = storagePath;
            }
          } catch (uploadEx) {
            console.warn("[api] Error uploading payment proof image:", uploadEx);
          }
        }

        if (!screenshotPath) {
          screenshotPath = `proofs/order-${orderId}.png`;
        }

        try {
          const updated = await createPaymentProof(orderId, {
            screenshotPath,
            transactionReference: body.transactionReference || null,
            ...(Number(body.submittedAmount) > 0
              ? { submittedAmount: Number(body.submittedAmount) }
              : {}),
            ...(body.paymentMethod ? { paymentMethod: String(body.paymentMethod) } : {}),
          });
          return json(updated);
        } catch (err: any) {
          return json({ error: "Payment Proof Submission Failed", message: err.message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    return notFound(`Endpoint '${pathname}' not found`);
  } catch (error) {
    return serverError(error);
  }
}

