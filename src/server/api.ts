import {
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
import { serverSupabase } from "./supabase";
import { validateContactInput } from "@/lib/contact";
import type { AboutContent } from "@/lib/content";
import type { Order, OrderStatus } from "@/lib/orders";
import type { Promotion } from "@/lib/promotions";
import { createScopedClient, supabase, type UserRole } from "@/lib/supabase";
import {
  resolveStaffUser,
  getWaiterProfile,
  updateWaiterAvailability,
  getWaiterMetrics,
  getWaiterOrders,
  approveWaiterOrder,
  rejectWaiterOrder,
  getWaiterPayments,
  getWaiterNotifications,
  markWaiterNotificationRead,
  getAvailableWaiters,
  submitWaiterPaymentProof,
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
 * Resolves the authenticated Supabase user from the request Authorization Bearer token,
 * fetches their role from public.users (or defaults to CUSTOMER), and returns verified identity.
 */
export async function resolveAuthUser(request: Request): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user || !user.id) return null;

    let role: UserRole = "CUSTOMER";
    let fullName: string | null = null;
    let phone: string | null = null;

    try {
      const scopedClient = createScopedClient(token);
      const { data: profile } = await scopedClient
        .from("users")
        .select("role, full_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        if (profile.role) role = profile.role as UserRole;
        if (profile.full_name) fullName = profile.full_name;
        if (profile.phone) phone = profile.phone;
      }
    } catch {
      /* ignore lookup failure */
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

        const scopedClient = createScopedClient(authUser.token);
        const customers = await getCustomers(scopedClient);
        return json(customers);
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
          const scopedClient = createScopedClient(authUser.token);
          const orders = await getOrders(phone ? { phone } : undefined, scopedClient);
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

    const orderPaymentProofMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment-proof$/);
    if (orderPaymentProofMatch) {
      const orderId = decodeURIComponent(orderPaymentProofMatch[1]!);
      if (method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid payment proof payload");
        }

        let screenshotPath = body.screenshotPath;
        if (body.imageBase64 && typeof body.imageBase64 === "string") {
          try {
            const rawBase64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
            const buffer = Buffer.from(rawBase64, "base64");
            const ext = body.mimeType?.includes("png") ? "png" : "jpg";
            const storagePath = `proofs/${orderId}_${Date.now()}.${ext}`;
            const { error: uploadErr } = await serverSupabase.storage
              .from("payment-proofs")
              .upload(storagePath, buffer, {
                contentType: body.mimeType || "image/jpeg",
                upsert: true,
              });
            if (uploadErr) {
              console.warn("[api] Storage upload warning:", uploadErr.message);
              screenshotPath = storagePath;
            } else {
              screenshotPath = storagePath;
            }
          } catch (upEx) {
            console.warn("[api] Image decode exception:", upEx);
            screenshotPath = `proofs/${orderId}_receipt.jpg`;
          }
        }

        if (!screenshotPath) {
          return badRequest("A screenshot receipt or file is required.");
        }

        try {
          const updated = await createPaymentProof(orderId, {
            screenshotPath,
            submittedAmount: body.submittedAmount,
            transactionReference: body.transactionReference,
            paymentMethod: body.paymentMethod,
          });
          return json(updated);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to record payment proof";
          return badRequest(msg);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterDecisionMatch = pathname.match(/^\/api\/orders\/([^/]+)\/waiter-decision$/);
    if (waiterDecisionMatch) {
      const orderId = decodeURIComponent(waiterDecisionMatch[1]!);
      if (method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required to record waiter decision");
        }
        if (authUser.role !== "STAFF" && authUser.role !== "ADMIN") {
          return forbidden("Only assigned waiters or authorized staff can record order decisions");
        }

        const body = await request.json().catch(() => null);
        if (!body || (body.decision !== "approved" && body.decision !== "rejected")) {
          return badRequest("Field 'decision' must be either 'approved' or 'rejected'.");
        }

        try {
          const updated = await recordWaiterDecision({
            orderId,
            waiterId: authUser.id,
            decision: body.decision,
            comments: body.comments,
          });
          return json(updated);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to record waiter decision";
          return json({ error: "Decision Failed", message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterPaymentCollectionMatch = pathname.match(/^\/api\/orders\/([^/]+)\/waiter-payment-collection$/);
    if (waiterPaymentCollectionMatch) {
      const orderId = decodeURIComponent(waiterPaymentCollectionMatch[1]!);
      if (method === "POST") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required to record payment collection");
        }
        if (authUser.role !== "STAFF" && authUser.role !== "ADMIN") {
          return forbidden("Only assigned waiters or authorized staff can record payment collection");
        }

        const body = await request.json().catch(() => null);
        if (!body || !body.transactionReference || !body.transactionReference.trim()) {
          return badRequest("Field 'transactionReference' is required.");
        }

        try {
          const updated = await recordWaiterPaymentCollection({
            orderId,
            waiterId: authUser.id,
            transactionReference: body.transactionReference,
            notes: body.notes,
          });
          return json(updated);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to record payment collection";
          return json({ error: "Collection Failed", message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const paymentMethodMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payment-method$/);
    if (paymentMethodMatch) {
      const orderId = decodeURIComponent(paymentMethodMatch[1]!);
      if (method === "POST" || method === "PATCH") {
        const authUser = await resolveAuthUser(request);
        const body = await request.json().catch(() => null);
        if (!body || !body.paymentMethod || !body.paymentMethod.trim()) {
          return badRequest("Field 'paymentMethod' is required.");
        }

        try {
          const updated = await updateOrderPaymentMethod({
            orderId,
            paymentMethod: body.paymentMethod,
            ...(authUser?.id ? { userId: authUser.id } : {}),
          });
          return json(updated);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to update payment method";
          return json({ error: "Update Failed", message }, 400);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/test/cashier-review") {
      if (method === "POST") {
        const body = await request.json().catch(() => null);
        if (
          !body ||
          !body.orderId ||
          !body.decision ||
          (body.decision !== "approved" && body.decision !== "rejected")
        ) {
          return badRequest("Fields 'orderId' and 'decision' ('approved' | 'rejected') are required.");
        }
        try {
          const updated = await testCashierReview(body.orderId, {
            decision: body.decision,
            rejectionReason: body.rejectionReason,
          });
          return json(updated);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Test cashier review failed";
          return badRequest(msg);
        }
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

        // Sanitize payload to ONLY allowed editable fields (protect id and updated_at)
        const allowedUpdates: Partial<AboutContent> = {};
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

        const updated = await updateAboutContent(allowedUpdates, token);
        return json(updated);
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
          const result = await createContactMessage({
            name: body.name,
            email: body.email,
            message: body.message,
          });
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

    if (pathname === "/api/contact-messages") {
      if (method === "GET") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required to access contact messages");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can access contact messages");
        }

        const scopedClient = createScopedClient(authUser.token);
        const messages = await getContactMessages(scopedClient);
        return json(messages);
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    const contactMessageMatch = pathname.match(/^\/api\/contact-messages\/([^/]+)$/);
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

        const scopedClient = createScopedClient(authUser.token);
        const updated = await updateContactMessageReadStatus(messageId, isRead, scopedClient);
        if (!updated) {
          return notFound(`Contact message '${messageId}' not found`);
        }
        return json(updated);
      }

      if (method === "DELETE") {
        const authUser = await resolveAuthUser(request);
        if (!authUser) {
          return unauthorized("Authentication required");
        }
        if (authUser.role !== "ADMIN" && authUser.role !== "STAFF") {
          return forbidden("Only administrators and staff can delete contact messages");
        }

        const scopedClient = createScopedClient(authUser.token);
        await deleteContactMessage(messageId, scopedClient);
        return json({ success: true, deletedId: messageId });
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       7. Available Waiters (Public/Customer Table Selection):
          GET /api/waiters/available
       ---------------------------------------------------------------------- */
    if (pathname === "/api/waiters/available") {
      if (method === "GET") {
        const availableWaiters = await getAvailableWaiters();
        return json(availableWaiters);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    /* ----------------------------------------------------------------------
       8. Waiter Operations:
          GET   /api/waiter/profile
          PATCH /api/waiter/profile
          GET   /api/waiter/metrics
          GET   /api/waiter/orders
          POST  /api/waiter/orders/:id/approve
          POST  /api/waiter/orders/:id/reject
          GET   /api/waiter/payments
          GET   /api/waiter/notifications
          PATCH /api/waiter/notifications/:id
       ---------------------------------------------------------------------- */
    if (pathname === "/api/waiter/profile") {
      const staffUser = await resolveStaffUser(request);
      if (!staffUser) {
        return unauthorized("Valid waiter or admin credentials required");
      }

      if (method === "GET") {
        const profile = await getWaiterProfile(staffUser.userId);
        return json({
          user: {
            ...profile,
            email: staffUser.email,
          },
        });
      }

      if (method === "PATCH") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.isAvailable !== "boolean") {
          return badRequest("Field 'isAvailable' (boolean) is required");
        }
        const updated = await updateWaiterAvailability(staffUser.userId, body.isAvailable);
        return json(updated);
      }

      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/metrics") {
      if (method === "GET") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }
        const metrics = await getWaiterMetrics(staffUser);
        return json(metrics);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/orders") {
      if (method === "GET") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }
        const filters: { status?: string; search?: string; date?: string } = {};
        const status = url.searchParams.get("status");
        if (status) filters.status = status;
        const search = url.searchParams.get("search");
        if (search) filters.search = search;
        const date = url.searchParams.get("date");
        if (date) filters.date = date;
        const orders = await getWaiterOrders(staffUser, filters);
        return json(orders);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterApproveMatch = pathname.match(/^\/api\/waiter\/orders\/([^/]+)\/approve$/);
    if (waiterApproveMatch) {
      const orderId = decodeURIComponent(waiterApproveMatch[1]!);
      if (method === "POST") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }
        const body = await request.json().catch(() => ({}));
        try {
          const approved = await approveWaiterOrder(staffUser, orderId, body?.comments);
          return json(approved);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to approve order";
          return badRequest(msg);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterRejectMatch = pathname.match(/^\/api\/waiter\/orders\/([^/]+)\/reject$/);
    if (waiterRejectMatch) {
      const orderId = decodeURIComponent(waiterRejectMatch[1]!);
      if (method === "POST") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }
        const body = await request.json().catch(() => null);
        if (!body || !body.reason || !body.reason.trim()) {
          return badRequest("A rejection reason is strictly required.");
        }
        try {
          const rejected = await rejectWaiterOrder(staffUser, orderId, body.reason.trim());
          return json(rejected);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to reject order";
          return badRequest(msg);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterPaymentProofMatch = pathname.match(/^\/api\/waiter\/orders\/([^/]+)\/payment-proof$/);
    if (waiterPaymentProofMatch) {
      const orderId = decodeURIComponent(waiterPaymentProofMatch[1]!);
      if (method === "POST") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return badRequest("Invalid payment proof payload");
        }

        const submittedAmount = Number(body.submittedAmount);
        if (isNaN(submittedAmount) || submittedAmount <= 0) {
          return badRequest("A valid positive payment amount is required.");
        }

        const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
        if (!paymentMethod) {
          return badRequest("A supported payment method is required.");
        }

        let screenshotPath = body.screenshotPath;
        if (body.imageBase64 && typeof body.imageBase64 === "string") {
          try {
            const rawBase64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
            const buffer = Buffer.from(rawBase64, "base64");
            if (buffer.length > 5 * 1024 * 1024) {
              return badRequest("Payment receipt file size exceeds the 5MB maximum limit.");
            }
            const ext = body.mimeType?.includes("png")
              ? "png"
              : body.mimeType?.includes("webp")
                ? "webp"
                : "jpg";
            const storagePath = `proofs/${orderId}_waiter_${Date.now()}.${ext}`;
            const { error: uploadErr } = await serverSupabase.storage
              .from("payment-proofs")
              .upload(storagePath, buffer, {
                contentType: body.mimeType || "image/jpeg",
                upsert: true,
              });
            if (uploadErr) {
              console.warn("[api] Storage upload warning:", uploadErr.message);
              return badRequest(`Storage upload failed: ${uploadErr.message}`);
            }
            screenshotPath = storagePath;
          } catch (upEx) {
            console.warn("[api] Image decode exception:", upEx);
            return badRequest("Failed to process payment evidence image file.");
          }
        }

        if (!screenshotPath) {
          return badRequest("Payment evidence photo/screenshot is strictly required.");
        }

        const cleanTxRef =
          typeof body.transactionReference === "string" && body.transactionReference.trim()
            ? body.transactionReference.trim()
            : null;

        try {
          const updatedOrder = await submitWaiterPaymentProof(staffUser, orderId, {
            screenshotPath,
            submittedAmount,
            paymentMethod,
            transactionReference: cleanTxRef,
            notes: body.notes || null,
          });
          return json(updatedOrder);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to record payment proof";
          return badRequest(msg);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/payments") {
      if (method === "GET") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }
        const payments = await getWaiterPayments(staffUser);
        return json(payments);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (pathname === "/api/waiter/notifications") {
      if (method === "GET") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }
        const notifications = await getWaiterNotifications(staffUser.userId);
        return json(notifications);
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    const waiterNotifReadMatch = pathname.match(/^\/api\/waiter\/notifications\/([^/]+)$/);
    if (waiterNotifReadMatch) {
      const notifId = decodeURIComponent(waiterNotifReadMatch[1]!);
      if (method === "PATCH") {
        const staffUser = await resolveStaffUser(request);
        if (!staffUser) {
          return unauthorized("Valid waiter or admin credentials required");
        }
        try {
          const result = await markWaiterNotificationRead(staffUser.userId, notifId);
          return json(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to update notification";
          return badRequest(msg);
        }
      }
      return json({ error: "Method Not Allowed" }, 405);
    }

    return notFound(`Endpoint '${pathname}' not found`);
  } catch (error) {
    return serverError(error);
  }
}
