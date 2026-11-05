/**
 * ============================================================================
 * Rekik Café — Shared Expense Types & Constants
 * File: src/types/expenses.ts
 * ============================================================================
 * Shared between client routes, services, and server handlers.
 */

export const EXPENSE_CATEGORIES = [
  "Ingredients & Raw Materials",
  "Staff Salaries",
  "Rent",
  "Utilities",
  "Maintenance",
  "Equipment & Supplies",
  "Marketing & Promotions",
  "Taxes & Licenses",
  "Other Expenses",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseRecord {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  paymentMethod?: string | null | undefined;
  receiptUrl?: string | null | undefined;
  notes?: string | null | undefined;
  recordedBy?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  description: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  paymentMethod?: string | undefined;
  receiptUrl?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateExpenseInput {
  description?: string | undefined;
  category?: ExpenseCategory | undefined;
  amount?: number | undefined;
  expenseDate?: string | undefined;
  paymentMethod?: string | null | undefined;
  receiptUrl?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface ExpenseFilter {
  startDate?: string | undefined;
  endDate?: string | undefined;
  category?: string | undefined;
  search?: string | undefined;
}

export interface ExpenseSummary {
  totalAmount: number;
  todayAmount: number;
  monthAmount: number;
  categoryBreakdown: Record<string, number>;
}
