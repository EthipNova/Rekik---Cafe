/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * NEBA Café — Client-Side Waiter Service Layer (src/lib/waiter.ts)
 * ============================================================================
 * Consumes /api/waiter/* endpoints with authenticated Supabase Bearer tokens
 * and provides responsive helper methods for the Waiter Dashboard.
 */

import { supabase } from "./supabase";
import type {
  WaiterProfile,
  WaiterOrder,
  WaiterMetrics,
  WaiterNotification,
  OrderDbStatus,
  WaiterDecision,
  OrderDbMethod,
} from "@/types/waiter";

export type { WaiterProfile, WaiterOrder, WaiterMetrics, WaiterNotification };

export class WaiterApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "WaiterApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Executes an authenticated request with the active user session token.
 */
async function waiterRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  // Attach session token
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    /* ignore */
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    const message =
      (typeof errorData === "object" && errorData?.message) ||
      (typeof errorData === "object" && errorData?.error) ||
      `Request failed with status ${response.status}`;
    throw new WaiterApiError(message, response.status, errorData);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Verifies whether the current authenticated user has an active waiter or admin profile.
 */
export async function fetchWaiterProfile(): Promise<WaiterProfile | null> {
  try {
    const data = await waiterRequest<{ user: WaiterProfile }>("/api/waiter/profile");
    return data?.user || null;
  } catch (err: any) {
    if (err instanceof WaiterApiError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    // Direct Supabase fallback
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;

      const { data: profile } = await supabase
        .from("staff_profiles" as any)
        .select("user_id, full_name, phone, role, is_available, is_active, created_at")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profile && (profile as any).is_active && ((profile as any).role === "waiter" || (profile as any).role === "admin")) {
        return {
          userId: (profile as any).user_id,
          fullName: (profile as any).full_name,
          phone: (profile as any).phone,
          role: (profile as any).role,
          isAvailable: Boolean((profile as any).is_available),
          isActive: Boolean((profile as any).is_active),
          email: session.user.email ?? undefined,
          createdAt: (profile as any).created_at ?? undefined,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

/**
 * Toggles waiter on-duty availability.
 */
export async function updateWaiterAvailability(
  isAvailable: boolean,
): Promise<{ success: boolean; isAvailable: boolean }> {
  return waiterRequest<{ success: boolean; isAvailable: boolean }>("/api/waiter/profile", {
    method: "PATCH",
    body: JSON.stringify({ isAvailable }),
  });
}

/**
 * Fetches real metrics for the waiter station.
 */
export async function fetchWaiterMetrics(): Promise<WaiterMetrics> {
  return waiterRequest<WaiterMetrics>("/api/waiter/metrics");
}

/**
 * Fetches filtered list of orders for the waiter station.
 */
export async function fetchWaiterOrders(filters?: {
  status?: string | undefined;
  search?: string | undefined;
  date?: string | undefined;
}): Promise<WaiterOrder[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.date) params.set("date", filters.date);

  const query = params.toString();
  return waiterRequest<WaiterOrder[]>(`/api/waiter/orders${query ? `?${query}` : ""}`);
}

/**
 * Approves an order. Atomically updates order state, registers approval and log records.
 */
export async function approveWaiterOrder(
  orderId: string,
  comments?: string,
): Promise<WaiterOrder> {
  return waiterRequest<WaiterOrder>(`/api/waiter/orders/${encodeURIComponent(orderId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ comments }),
  });
}

/**
 * Rejects an order with a mandatory reason.
 */
export async function rejectWaiterOrder(
  orderId: string,
  reason: string,
): Promise<WaiterOrder> {
  return waiterRequest<WaiterOrder>(`/api/waiter/orders/${encodeURIComponent(orderId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/**
 * Fetches orders with payment tracking status.
 */
export async function fetchWaiterPayments(): Promise<WaiterOrder[]> {
  return waiterRequest<WaiterOrder[]>("/api/waiter/payments");
}

/**
 * Fetches real notifications for the authenticated waiter.
 */
export async function fetchWaiterNotifications(): Promise<WaiterNotification[]> {
  return waiterRequest<WaiterNotification[]>("/api/waiter/notifications");
}

/**
 * Marks a notification as read.
 */
export async function markWaiterNotificationRead(
  notificationId: string,
): Promise<{ success: boolean }> {
  return waiterRequest<{ success: boolean }>(
    `/api/waiter/notifications/${encodeURIComponent(notificationId)}`,
    {
      method: "PATCH",
    },
  );
}

/**
 * Fetches available waiters for customer table selection during checkout.
 */
export async function fetchAvailableWaiters(): Promise<
  { userId: string; fullName: string; phone: string | null }[]
> {
  try {
    return await waiterRequest<{ userId: string; fullName: string; phone: string | null }[]>(
      "/api/waiters/available",
    );
  } catch {
    return [];
  }
}

/* ==========================================================================
   Display and Badge Helpers
   ========================================================================== */

export function getOrderStatusBadge(status: OrderDbStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "confirmed":
      return {
        label: "Confirmed",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
      };
    case "preparing":
      return {
        label: "Preparing",
        className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
      };
    case "ready":
      return {
        label: "Ready for Service",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      };
    case "delivered":
      return {
        label: "Delivered",
        className: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30",
      };
    case "completed":
      return {
        label: "Completed",
        className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
      };
    case "cancelled":
    case "rejected":
      return {
        label: "Rejected / Cancelled",
        className: "bg-destructive/10 text-destructive border-destructive/30",
      };
    default:
      return {
        label: status,
        className: "bg-muted text-muted-foreground border-border",
      };
  }
}

export function getWaiterDecisionBadge(decision: WaiterDecision): {
  label: string;
  className: string;
} {
  switch (decision) {
    case "pending":
      return {
        label: "Awaiting Review",
        className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 font-medium",
      };
    case "approved":
      return {
        label: "Approved",
        className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-medium",
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "bg-destructive/15 text-destructive border-destructive/30 font-medium",
      };
  }
}

export function getMethodLabel(method: OrderDbMethod): {
  label: string;
  color: string;
} {
  switch (method) {
    case "dine_in":
      return { label: "Dine-in", color: "bg-primary/10 text-primary border-primary/20" };
    case "pickup":
      return { label: "Takeaway", color: "bg-accent/15 text-accent-foreground border-accent/25" };
    case "delivery":
      return { label: "Delivery", color: "bg-secondary text-secondary-foreground border-secondary" };
  }
}

export function formatTimeAgo(isoString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return isoString;
  }
}
