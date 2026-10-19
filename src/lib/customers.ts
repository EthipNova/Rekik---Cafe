/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Order, OrderItem, OrderMethod, OrderStatus } from "./orders";
import { supabase } from "./supabase";

/**
 * Fetches all customer profiles with order history from the server API.
 * Routes through GET /api/customers → server/api.ts.
 * Sends the authenticated admin/staff bearer token to satisfy server authorization and RLS.
 */
export async function fetchAdminCustomers(): Promise<{
  data: DerivedCustomer[] | null;
  error: Error | null;
}> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        data: null,
        error: new Error("Authentication required: No active admin or staff session found."),
      };
    }

    const response = await fetch("/api/customers", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(
          (body as any)?.message || `GET /api/customers returned HTTP ${response.status}`,
        ),
      };
    }

    const raw: unknown[] = await response.json();
    if (!Array.isArray(raw)) {
      return { data: [], error: null };
    }

    const customers: DerivedCustomer[] = raw.map(normalizeCustomerRecord);
    return { data: customers, error: null };
  } catch (err: any) {
    return {
      data: null,
      error:
        err instanceof Error
          ? err
          : new Error("An unexpected error occurred while fetching customers"),
    };
  }
}

export type DerivedCustomer = {
  id: string;
  name: string;
  phone: string;
  rawPhone: string;
  orderCount: number;
  totalSpent: number;
  firstOrderDate: string;
  lastOrderDate: string;
  lastOrderStatus: OrderStatus;
  preferredMethod: OrderMethod;
  orders: Order[];
  tables: string[];
  addresses: string[];
  isReturning: boolean;
  isRecent: boolean;
};

/**
 * Formats monetary amounts in Ethiopian Birr (ETB).
 * Decoupled from menu-data to prevent unnecessary data dependencies.
 */
export const formatETB = (amount: number): string => `${amount.toLocaleString("en-US")} ETB`;

/**
 * Normalizes phone numbers for reliable deduplication and search.
 * Handles local Ethiopia prefixes (09..., +251..., 251...) and whitespace/hyphens.
 */
export function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-().]/g, "").trim();
  if (cleaned.startsWith("+251")) {
    cleaned = "0" + cleaned.slice(4);
  } else if (cleaned.startsWith("251")) {
    cleaned = "0" + cleaned.slice(3);
  }
  return cleaned;
}

/**
 * Partially masks phone numbers for list display to adhere to privacy practices.
 * e.g. "0911234567" -> "09••••••67".
 */
export function maskPhone(phone?: string | null): string {
  if (!phone || phone === "Not provided" || phone.trim() === "") {
    return "Not provided";
  }
  const trimmed = phone.trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  const start = trimmed.slice(0, 2);
  const end = trimmed.slice(-2);
  return `${start}••••••${end}`;
}

/**
 * Determines whether a customer order is recent (within the last 30 days).
 */
export function isRecentCustomer(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return false;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - time <= thirtyDaysMs;
}

/**
 * Formats relative dates (e.g., Today, Yesterday, 3 days ago, or Oct 12).
 */
export function formatCustomerRelativeDate(dateStr?: string | null): string {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Formats full timestamp for customer details and history cards.
 */
export function formatCustomerFullDateTime(dateStr?: string | null): string {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} · ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Calculates the preferred fulfillment method across a set of customer orders.
 */
export function derivePreferredMethod(orders: Order[]): OrderMethod {
  if (!orders.length) return "dine-in";
  const counts: Record<OrderMethod, number> = {
    "dine-in": 0,
    takeaway: 0,
    delivery: 0,
  };

  for (const o of orders) {
    if (o && o.method && o.method in counts) {
      counts[o.method]++;
    }
  }

  let topMethod: OrderMethod = orders[0]?.method || "dine-in";
  let maxCount = -1;

  for (const method of ["dine-in", "takeaway", "delivery"] as const) {
    if (counts[method] > maxCount) {
      maxCount = counts[method];
      topMethod = method;
    }
  }

  return topMethod;
}

/**
 * Normalizes a raw order from Supabase into the application Order model.
 * Selects the latest payment attempt based on created_at (avoiding payments[0] assumptions).
 */
function normalizeCustomerOrder(rawCustomer: any, rawOrder: any): Order {
  const rawPayments = Array.isArray(rawOrder.payments) ? rawOrder.payments : [];
  let paymentStatus: "paid" | "pending" | "failed" = "pending";
  let paymentMethod = "Mobile Payment";

  if (rawPayments.length > 0) {
    // Sort descending by created_at to select latest payment attempt
    const sortedPayments = [...rawPayments].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime() || 0;
      const timeB = new Date(b.created_at || 0).getTime() || 0;
      return timeB - timeA;
    });

    const latest = sortedPayments[0];
    if (latest) {
      if (latest.status === "paid") {
        paymentStatus = "paid";
      } else if (latest.status === "failed") {
        paymentStatus = "failed";
      } else {
        paymentStatus = "pending";
      }

      if (latest.method) {
        paymentMethod = latest.method;
      }
    }
  }

  const rawItems = Array.isArray(rawOrder.order_items) ? rawOrder.order_items : [];
  const items: OrderItem[] = rawItems.map((item: any) => ({
    productId: item.product_id || item.id || "",
    name: item.name || "Item",
    quantity: Number(item.quantity) || 1,
    price: Number(item.unit_price) || 0,
  }));

  const total = Number(rawOrder.total_amount) || 0;
  const subtotal = Number(rawOrder.subtotal) || total;
  const discount = Number(rawOrder.discount_amount) || 0;
  const delivery = Number(rawOrder.delivery_fee) || 0;

  return {
    id: rawOrder.id,
    number: rawOrder.order_number || `#${String(rawOrder.id).slice(0, 6)}`,
    createdAt: rawOrder.created_at || new Date().toISOString(),
    method: (rawOrder.method as OrderMethod) || "dine-in",
    status: (rawOrder.status as OrderStatus) || "received",
    paymentStatus,
    paymentMethod,
    customer: {
      name: rawCustomer.name || rawOrder.customer_name || "Customer",
      phone: rawCustomer.phone || rawOrder.customer_phone || "",
      ...(rawOrder.table_number?.trim() ? { table: rawOrder.table_number.trim() } : {}),
      ...(rawOrder.delivery_address?.trim() ? { address: rawOrder.delivery_address.trim() } : {}),
    },
    items,
    subtotal,
    discount,
    delivery,
    total,
  };
}

/**
 * Normalizes a raw customer record and its related orders and addresses from Supabase.
 */
function normalizeCustomerRecord(rawCustomer: any): DerivedCustomer {
  const rawOrders = Array.isArray(rawCustomer.orders) ? rawCustomer.orders : [];

  // Normalize each order and sort newest first
  const normalizedOrders: Order[] = rawOrders
    .map((o: any) => normalizeCustomerOrder(rawCustomer, o))
    .sort((a: Order, b: Order) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });

  const orderCount = normalizedOrders.length;
  const totalSpent = normalizedOrders.reduce((sum, o) => sum + o.total, 0);

  const fallbackDate = rawCustomer.created_at || new Date().toISOString();
  const lastOrderDate = normalizedOrders[0]?.createdAt || fallbackDate;
  const firstOrderDate = normalizedOrders[normalizedOrders.length - 1]?.createdAt || fallbackDate;
  const lastOrderStatus: OrderStatus = normalizedOrders[0]?.status || "received";

  const preferredMethod: OrderMethod = derivePreferredMethod(normalizedOrders);

  // Distinct known dining tables
  const tables = Array.from(
    new Set(
      normalizedOrders
        .map((o) => o.customer?.table)
        .filter((t): t is string => Boolean(t && t.trim())),
    ),
  );

  // Deduplicated addresses: union of customer_addresses and order delivery addresses
  const savedAddresses = (
    Array.isArray(rawCustomer.customer_addresses) ? rawCustomer.customer_addresses : []
  )
    .map((addr: any) => addr.address_line?.trim())
    .filter((a: any): a is string => Boolean(a));

  const orderAddresses = normalizedOrders
    .map((o) => o.customer?.address?.trim())
    .filter((a): a is string => Boolean(a));

  const addresses = Array.from(new Set([...savedAddresses, ...orderAddresses]));

  const isReturning = orderCount > 1;
  const isRecent = orderCount > 0 && isRecentCustomer(lastOrderDate);

  const name = rawCustomer.name?.trim() || "Customer";
  const phone = rawCustomer.phone?.trim() || "Not provided";
  const rawPhone = rawCustomer.phone?.trim() || "";

  return {
    id: rawCustomer.id,
    name,
    phone,
    rawPhone,
    orderCount,
    totalSpent,
    firstOrderDate,
    lastOrderDate,
    lastOrderStatus,
    preferredMethod,
    orders: normalizedOrders,
    tables,
    addresses,
    isReturning,
    isRecent,
  };
}

/**
 * Pure aggregation function: Groups raw orders into unique customer records.
 * Retained for backward-compatibility with any component that passes raw orders.
 */
export function aggregateCustomers(orders: Order[]): DerivedCustomer[] {
  if (!Array.isArray(orders) || orders.length === 0) {
    return [];
  }

  const groups = new Map<string, Order[]>();

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;

    const rawPhone = order.customer?.phone;
    const normalized = normalizePhone(rawPhone);
    const rawName = order.customer?.name?.trim();

    let groupKey: string;
    if (normalized.length > 0) {
      groupKey = `phone:${normalized}`;
    } else if (
      rawName &&
      rawName.toLowerCase() !== "dine-in guest" &&
      rawName.toLowerCase() !== "guest diner"
    ) {
      groupKey = `name:${rawName.toLowerCase()}`;
    } else {
      groupKey = `order:${order.id || order.number || Math.random().toString(36)}`;
    }

    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(order);
    } else {
      groups.set(groupKey, [order]);
    }
  }

  const customers: DerivedCustomer[] = [];

  for (const [id, customerOrders] of groups.entries()) {
    // Sort customer's orders newest first
    const sortedOrders = [...customerOrders].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });

    // Pick latest non-empty name
    let name = "Customer";
    for (const o of sortedOrders) {
      const n = o.customer?.name?.trim();
      if (n && n.toLowerCase() !== "dine-in guest" && n.toLowerCase() !== "guest diner") {
        name = n;
        break;
      }
    }
    if (name === "Customer") {
      for (const o of sortedOrders) {
        const n = o.customer?.name?.trim();
        if (n) {
          name = n;
          break;
        }
      }
    }

    let phone = "Not provided";
    let rawPhone = "";
    for (const o of sortedOrders) {
      const p = o.customer?.phone?.trim();
      if (p) {
        phone = p;
        rawPhone = p;
        break;
      }
    }

    // Total spending
    const totalSpent = sortedOrders.reduce((sum, o) => {
      const val = typeof o.total === "number" && !isNaN(o.total) ? o.total : 0;
      return sum + val;
    }, 0);

    // Dates
    const lastOrder = sortedOrders[0];
    const firstOrder = sortedOrders[sortedOrders.length - 1];
    const lastOrderDate = lastOrder?.createdAt || new Date().toISOString();
    const firstOrderDate = firstOrder?.createdAt || lastOrderDate;
    const lastOrderStatus = lastOrder?.status || "received";

    // Preferred fulfillment method
    const preferredMethod = derivePreferredMethod(sortedOrders);

    // Known tables
    const tables = Array.from(
      new Set(
        sortedOrders
          .map((o) => o.customer?.table)
          .filter((t): t is string => Boolean(t && t.trim())),
      ),
    );

    // Known delivery addresses
    const addresses = Array.from(
      new Set(
        sortedOrders
          .map((o) => o.customer?.address)
          .filter((a): a is string => Boolean(a && a.trim())),
      ),
    );

    const isReturning = sortedOrders.length > 1;
    const isRecent = isRecentCustomer(lastOrderDate);

    customers.push({
      id,
      name,
      phone,
      rawPhone,
      orderCount: sortedOrders.length,
      totalSpent,
      firstOrderDate,
      lastOrderDate,
      lastOrderStatus,
      preferredMethod,
      orders: sortedOrders,
      tables,
      addresses,
      isReturning,
      isRecent,
    });
  }

  return customers;
}
