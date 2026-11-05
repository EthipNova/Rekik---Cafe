/**
 * ============================================================================
 * Rekik Café — Client Expense Service
 * File: src/services/expenses.ts
 * ============================================================================
 * Consumes /api/admin/expenses endpoints with authorization tokens and strong typing.
 */

import { supabase } from "@/lib/supabase";
import type {
  ExpenseRecord,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFilter,
  ExpenseSummary,
} from "@/types/expenses";

export type {
  ExpenseRecord,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFilter,
  ExpenseSummary,
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const session = (await supabase.auth.getSession()).data.session;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function fetchExpenses(
  filter?: ExpenseFilter,
): Promise<{ success: boolean; expenses: ExpenseRecord[]; summary?: ExpenseSummary; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (filter?.startDate) params.set("startDate", filter.startDate);
    if (filter?.endDate) params.set("endDate", filter.endDate);
    if (filter?.category && filter.category !== "all") params.set("category", filter.category);
    if (filter?.search) params.set("search", filter.search);

    const headers = await getAuthHeaders();
    const url = `/api/admin/expenses${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        expenses: [],
        error: errData.message || `Request failed with status ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      summary: data.summary,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load expenses";
    return { success: false, expenses: [], error: msg };
  }
}

export async function createExpenseRecord(
  input: CreateExpenseInput,
): Promise<{ success: boolean; expense?: ExpenseRecord; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/admin/expenses", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.message || "Failed to create expense" };
    }

    return { success: true, expense: data.expense };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error creating expense";
    return { success: false, error: msg };
  }
}

export async function updateExpenseRecord(
  id: string,
  input: UpdateExpenseInput,
): Promise<{ success: boolean; expense?: ExpenseRecord; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/expenses/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(input),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.message || "Failed to update expense" };
    }

    return { success: true, expense: data.expense };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error updating expense";
    return { success: false, error: msg };
  }
}

export async function deleteExpenseRecord(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/expenses/${id}`, {
      method: "DELETE",
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.message || "Failed to delete expense" };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error deleting expense";
    return { success: false, error: msg };
  }
}
