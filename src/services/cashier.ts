import { supabase } from "@/lib/supabase";
import type {
  CashierStaffProfile,
  PendingPaymentReviewItem,
  PaymentReviewHistoryItem,
  CashierOverviewMetrics,
  CashierNotification,
} from "@/lib/cashier";

async function getAuthHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("No active session. Please sign in.");
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export type CashierMeResponse =
  | { success: true; profile: CashierStaffProfile; role: string }
  | { success: false; status: string; role?: string; message: string };

export async function fetchCashierMe(): Promise<CashierMeResponse> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/me", { headers });
  const data = await res.json();
  if (!res.ok) {
    return {
      success: false,
      status: data.status || "error",
      role: data.role,
      message: data.message || data.error || "Failed to verify cashier profile.",
    };
  }
  return data;
}

export async function fetchPendingReviews(): Promise<PendingPaymentReviewItem[]> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/pending", { headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Error ${res.status}: Failed to fetch pending reviews.`);
  }
  return res.json();
}

export async function fetchReviewHistory(): Promise<PaymentReviewHistoryItem[]> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/history", { headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Error ${res.status}: Failed to fetch review history.`);
  }
  return res.json();
}

export async function fetchCashierMetrics(): Promise<CashierOverviewMetrics> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/metrics", { headers });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Error ${res.status}: Failed to fetch metrics.`);
  }
  return res.json();
}

export async function fetchProofSignedUrl(proofId: string): Promise<string> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/proof-url", {
    method: "POST",
    headers,
    body: JSON.stringify({ proofId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Failed to generate proof preview URL.");
  }
  const data = await res.json();
  return data.signedUrl;
}

export async function submitPaymentApproval(
  proofId: string,
  notes?: string,
): Promise<{ success: boolean; message: string; reviewId: string }> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/reviews/approve", {
    method: "POST",
    headers,
    body: JSON.stringify({ proofId, notes }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to approve payment.");
  }
  return data;
}

export async function submitPaymentRejection(
  proofId: string,
  reason: string,
): Promise<{ success: boolean; message: string; reviewId: string }> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/reviews/reject", {
    method: "POST",
    headers,
    body: JSON.stringify({ proofId, reason }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to reject payment.");
  }
  return data;
}

export async function fetchCashierNotifications(): Promise<CashierNotification[]> {
  const headers = await getAuthHeader();
  const res = await fetch("/api/cashier/notifications", { headers });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export async function markCashierNotificationRead(notificationId: string): Promise<void> {
  const headers = await getAuthHeader();
  await fetch(`/api/cashier/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "PATCH",
    headers,
  });
}
