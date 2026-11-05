/**
 * ============================================================================
 * Rekik Café — Server Expense Management Service
 * File: src/server/expenses.ts
 * ============================================================================
 * Provides authoritative expense recording, categorization, and financial
 * aggregation for Rekik Café with dual Supabase + persistent local storage
 * guarantees.
 */

import fs from "node:fs";
import path from "node:path";
import { serverSupabase } from "./supabase";

export const EXPENSE_CATEGORIES = [
  "Ingredients & Raw Materials",
  "Staff Salaries",
  "Rent",
  "Utilities",
  "Maintenance",
  "Other Expenses",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

export interface ExpenseRecord {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  paymentMethod: string;
  receiptUrl: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  description: string;
  category: string;
  amount: number;
  expenseDate?: string | null;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
}

export interface UpdateExpenseInput {
  description?: string;
  category?: string;
  amount?: number;
  expenseDate?: string;
  paymentMethod?: string;
  receiptUrl?: string | null;
  notes?: string | null;
}

export interface ExpenseFilter {
  startDate?: string | undefined;
  endDate?: string | undefined;
  category?: string | undefined;
  search?: string | undefined;
}

export interface CategoryExpenseBreakdown {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface ExpenseSummary {
  totalAmount: number;
  todayAmount: number;
  thisMonthAmount: number;
  count: number;
  categoryBreakdown: CategoryExpenseBreakdown[];
}

/**
 * Resolves path to persistent data/db.json.
 */
function getDbJsonPath(): string {
  const cwd = process.cwd();
  return path.resolve(cwd, "data", "db.json");
}

/**
 * Reads local fallback expenses from data/db.json.
 */
function readLocalExpenses(): ExpenseRecord[] {
  try {
    const p = getDbJsonPath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.expenses)) {
      return data.expenses;
    }
  } catch (err) {
    console.warn("[expenses] Failed to read local expenses from db.json:", err);
  }
  return [];
}

/**
 * Writes local fallback expenses to data/db.json.
 */
function writeLocalExpenses(expenses: ExpenseRecord[]): void {
  try {
    const p = getDbJsonPath();
    let currentData: Record<string, unknown> = {};
    if (fs.existsSync(p)) {
      try {
        currentData = JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {
        currentData = {};
      }
    }
    currentData["expenses"] = expenses;
    fs.writeFileSync(p, JSON.stringify(currentData, null, 2), "utf-8");
  } catch (err) {
    console.error("[expenses] Failed to write local expenses to db.json:", err);
  }
}

/**
 * Validates expense creation/update inputs.
 */
export function validateExpenseInput(input: Partial<CreateExpenseInput>): {
  valid: boolean;
  error?: string;
} {
  if (input.description !== undefined) {
    const desc = (input.description || "").trim();
    if (!desc || desc.length < 2) {
      return { valid: false, error: "Expense description is required (at least 2 characters)." };
    }
  }

  if (input.amount !== undefined) {
    const amt = Number(input.amount);
    if (isNaN(amt) || amt <= 0) {
      return { valid: false, error: "Expense amount must be a positive number greater than 0." };
    }
  }

  if (input.category !== undefined) {
    const cat = (input.category || "").trim();
    if (!cat) {
      return { valid: false, error: "Please select or provide an expense category." };
    }
  }

  return { valid: true };
}

/**
 * Maps Supabase row to ExpenseRecord.
 */
function mapRowToExpense(row: any): ExpenseRecord {
  return {
    id: String(row.id),
    description: String(row.description || ""),
    category: String(row.category || "Other Expenses"),
    amount: Number(row.amount) || 0,
    expenseDate: String(row.expense_date || new Date().toISOString().slice(0, 10)),
    paymentMethod: String(row.payment_method || "Cash"),
    receiptUrl: row.receipt_url || null,
    notes: row.notes || null,
    createdBy: row.created_by || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

/**
 * Fetches expenses with optional date, category, and search filters.
 */
export async function getExpenses(filter?: ExpenseFilter): Promise<ExpenseRecord[]> {
  let records: ExpenseRecord[] = [];
  let fetchedFromDb = false;

  try {
    let query = (serverSupabase.from("expenses" as any) as any)
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filter?.startDate) {
      query = query.gte("expense_date", filter.startDate);
    }
    if (filter?.endDate) {
      query = query.lte("expense_date", filter.endDate);
    }
    if (filter?.category && filter.category !== "all") {
      query = query.eq("category", filter.category);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      records = data.map(mapRowToExpense);
      fetchedFromDb = true;
      // Mirror to local storage
      const local = readLocalExpenses();
      const dbIds = new Set(records.map((r) => r.id));
      const combined = [...records, ...local.filter((l) => !dbIds.has(l.id))];
      writeLocalExpenses(combined);
    }
  } catch {
    fetchedFromDb = false;
  }

  if (!fetchedFromDb) {
    records = readLocalExpenses();
    if (filter?.startDate) {
      records = records.filter((r) => r.expenseDate >= filter.startDate!);
    }
    if (filter?.endDate) {
      records = records.filter((r) => r.expenseDate <= filter.endDate!);
    }
    if (filter?.category && filter.category !== "all") {
      records = records.filter((r) => r.category.toLowerCase() === filter.category!.toLowerCase());
    }
  }

  // Client-side text search if requested
  if (filter?.search && filter.search.trim()) {
    const q = filter.search.trim().toLowerCase();
    records = records.filter(
      (r) =>
        r.description.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.paymentMethod.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q)),
    );
  }

  return records;
}

/**
 * Retrieves a single expense record by ID.
 */
export async function getExpenseById(id: string): Promise<ExpenseRecord | null> {
  try {
    const { data, error } = await (serverSupabase.from("expenses" as any) as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!error && data) {
      return mapRowToExpense(data);
    }
  } catch {
    /* fallback to local */
  }

  const local = readLocalExpenses();
  return local.find((e) => e.id === id) || null;
}

/**
 * Creates a new expense record.
 */
export async function createExpense(
  input: CreateExpenseInput,
  adminUserId?: string,
): Promise<ExpenseRecord> {
  const validation = validateExpenseInput(input);
  if (!validation.valid) {
    const err = new Error(validation.error);
    (err as any).statusCode = 400;
    throw err;
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const expenseDate = (input.expenseDate || "").trim() || todayStr;
  const newId = crypto.randomUUID();

  const record: ExpenseRecord = {
    id: newId,
    description: input.description.trim(),
    category: input.category.trim(),
    amount: Number(Number(input.amount).toFixed(2)),
    expenseDate,
    paymentMethod: (input.paymentMethod || "Cash").trim(),
    receiptUrl: input.receiptUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    createdBy: adminUserId || null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // Attempt write to Supabase
  try {
    const { data, error } = await (serverSupabase.from("expenses" as any) as any)
      .insert({
        id: record.id,
        description: record.description,
        category: record.category,
        amount: record.amount,
        expense_date: record.expenseDate,
        payment_method: record.paymentMethod,
        receipt_url: record.receiptUrl,
        notes: record.notes,
        created_by: record.createdBy,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      const persisted = mapRowToExpense(data);
      const local = readLocalExpenses();
      writeLocalExpenses([persisted, ...local.filter((l) => l.id !== persisted.id)]);
      return persisted;
    }
  } catch (err) {
    console.warn("[expenses] Supabase insert fallback to local:", err);
  }

  // Persistent fallback in data/db.json
  const local = readLocalExpenses();
  const updatedLocal = [record, ...local.filter((l) => l.id !== record.id)];
  writeLocalExpenses(updatedLocal);
  return record;
}

/**
 * Updates an existing expense record.
 */
export async function updateExpense(
  id: string,
  input: UpdateExpenseInput,
  adminUserId?: string,
): Promise<ExpenseRecord> {
  const validation = validateExpenseInput(input);
  if (!validation.valid) {
    const err = new Error(validation.error);
    (err as any).statusCode = 400;
    throw err;
  }

  const existing = await getExpenseById(id);
  if (!existing) {
    const err = new Error("Expense record not found.");
    (err as any).statusCode = 404;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const updated: ExpenseRecord = {
    ...existing,
    description: input.description !== undefined ? input.description.trim() : existing.description,
    category: input.category !== undefined ? input.category.trim() : existing.category,
    amount: input.amount !== undefined ? Number(Number(input.amount).toFixed(2)) : existing.amount,
    expenseDate: input.expenseDate !== undefined ? input.expenseDate.trim() : existing.expenseDate,
    paymentMethod:
      input.paymentMethod !== undefined ? input.paymentMethod.trim() : existing.paymentMethod,
    receiptUrl: input.receiptUrl !== undefined ? input.receiptUrl?.trim() || null : existing.receiptUrl,
    notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    updatedAt: nowIso,
  };

  try {
    const { data, error } = await (serverSupabase.from("expenses" as any) as any)
      .update({
        description: updated.description,
        category: updated.category,
        amount: updated.amount,
        expense_date: updated.expenseDate,
        payment_method: updated.paymentMethod,
        receipt_url: updated.receiptUrl,
        notes: updated.notes,
        updated_at: updated.updatedAt,
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (!error && data) {
      const persisted = mapRowToExpense(data);
      const local = readLocalExpenses();
      writeLocalExpenses(local.map((l) => (l.id === id ? persisted : l)));
      return persisted;
    }
  } catch (err) {
    console.warn("[expenses] Supabase update fallback to local:", err);
  }

  // Local fallback
  const local = readLocalExpenses();
  const updatedLocal = local.map((l) => (l.id === id ? updated : l));
  writeLocalExpenses(updatedLocal);
  return updated;
}

/**
 * Deletes an expense record.
 */
export async function deleteExpense(
  id: string,
  adminUserId?: string,
): Promise<{ success: boolean; id: string }> {
  try {
    await (serverSupabase.from("expenses" as any) as any).delete().eq("id", id);
  } catch (err) {
    console.warn("[expenses] Supabase delete fallback to local:", err);
  }

  const local = readLocalExpenses();
  writeLocalExpenses(local.filter((l) => l.id !== id));
  return { success: true, id };
}

/**
 * Computes expense KPI summary and category breakdown.
 */
export async function getExpenseSummary(
  startDate?: string,
  endDate?: string,
): Promise<ExpenseSummary> {
  const all = await getExpenses();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

  // Target period
  let periodExpenses = all;
  if (startDate) {
    periodExpenses = periodExpenses.filter((e) => e.expenseDate >= startDate);
  }
  if (endDate) {
    periodExpenses = periodExpenses.filter((e) => e.expenseDate <= endDate);
  }

  const totalAmount = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Today
  const todayAmount = all
    .filter((e) => e.expenseDate === todayStr)
    .reduce((sum, e) => sum + e.amount, 0);

  // This Month
  const thisMonthAmount = all
    .filter((e) => e.expenseDate.startsWith(currentMonthPrefix))
    .reduce((sum, e) => sum + e.amount, 0);

  // Category breakdown
  const catMap = new Map<string, { amount: number; count: number }>();
  for (const cat of EXPENSE_CATEGORIES) {
    catMap.set(cat, { amount: 0, count: 0 });
  }

  for (const exp of periodExpenses) {
    const existing = catMap.get(exp.category) || { amount: 0, count: 0 };
    catMap.set(exp.category, {
      amount: existing.amount + exp.amount,
      count: existing.count + 1,
    });
  }

  const categoryBreakdown: CategoryExpenseBreakdown[] = Array.from(catMap.entries())
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
    }))
    .filter((b) => b.count > 0 || EXPENSE_CATEGORIES.includes(b.category as any))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalAmount,
    todayAmount,
    thisMonthAmount,
    count: periodExpenses.length,
    categoryBreakdown,
  };
}
