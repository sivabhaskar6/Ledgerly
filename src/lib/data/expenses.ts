import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, Category, ExpenseWithRefs } from "@/types/db";
import { toExpenseRow, type ExpenseFormValues } from "@/lib/validations/expense";

export const PAGE_SIZE = 20;
export type SortKey = "date" | "amount";
export type ExpenseFilters = {
  q: string; category: string; account: string; from: string; to: string;
  sort: SortKey; dir: "asc" | "desc"; page: number;
};
export const DEFAULT_FILTERS: ExpenseFilters = { q: "", category: "", account: "", from: "", to: "", sort: "date", dir: "desc", page: 0 };

const SELECT = "*, category:categories(name), account:accounts(name)";

/** Strip characters that would break PostgREST's or() syntax and escape LIKE wildcards. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*]/g, " ").replace(/[%_\\]/g, (c) => `\\${c}`).replace(/\s+/g, " ").trim();
}

export async function fetchExpenses(db: SupabaseClient, f: ExpenseFilters) {
  let query = db.from("transactions").select(SELECT, { count: "exact" }).is("deleted_at", null);
  if (f.category) query = query.eq("category_id", f.category);
  if (f.account) query = query.eq("account_id", f.account);
  if (f.from) query = query.gte("occurred_on", f.from);
  if (f.to) query = query.lte("occurred_on", f.to);
  const q = sanitizeSearch(f.q);
  if (q) query = query.or(`title.ilike.%${q}%,note.ilike.%${q}%`);
  query = f.sort === "amount"
    ? query.order("amount_paise", { ascending: f.dir === "asc" }).order("occurred_on", { ascending: false })
    : query.order("occurred_on", { ascending: f.dir === "asc" }).order("created_at", { ascending: false });
  const from = f.page * PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as ExpenseWithRefs[], count: count ?? 0 };
}

export async function fetchSummary(db: SupabaseClient, f: ExpenseFilters, today: string, monthStart: string, monthEnd: string) {
  const { data, error } = await db.rpc("expense_summary", {
    p_from: f.from || null, p_to: f.to || null, p_category: f.category || null, p_account: f.account || null,
    p_search: sanitizeSearch(f.q) || null,
    p_today: today, p_month_start: monthStart, p_month_end: monthEnd,
  });
  if (error) throw error;
  const r = (data as { total_paise: number; tx_count: number; today_paise: number; month_paise: number }[])[0];
  return { total: Number(r?.total_paise ?? 0), count: Number(r?.tx_count ?? 0), today: Number(r?.today_paise ?? 0), month: Number(r?.month_paise ?? 0) };
}

export async function fetchCategories(db: SupabaseClient): Promise<Category[]> {
  const { data, error } = await db.from("categories").select("*").order("name");
  if (error) throw error;
  return data as Category[];
}
export async function fetchAccounts(db: SupabaseClient): Promise<Account[]> {
  const { data, error } = await db.from("accounts").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return data as Account[];
}

async function currentUserId(db: SupabaseClient) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Log in again.");
  return user.id;
}

export async function createExpense(db: SupabaseClient, v: ExpenseFormValues) {
  const user_id = await currentUserId(db);
  const { error } = await db.from("transactions").insert({ ...toExpenseRow(v), user_id });
  if (error) throw error;
}

export async function updateExpense(db: SupabaseClient, id: string, v: ExpenseFormValues) {
  const { data, error } = await db.from("transactions").update(toExpenseRow(v)).eq("id", id).is("deleted_at", null).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This expense no longer exists or was deleted.");
}

/** Soft delete: moves the expense to Recently deleted. Nothing is removed permanently. */
export async function softDeleteExpense(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This expense was already deleted.");
}

export async function fetchDeleted(db: SupabaseClient) {
  const { data, error } = await db.from("transactions").select(SELECT).not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExpenseWithRefs[];
}

export async function restoreExpense(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("transactions").update({ deleted_at: null }).eq("id", id).not("deleted_at", "is", null).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This expense could not be restored.");
}

/** Permanent deletion; the database policy only allows it for rows already in the trash. */
export async function permanentlyDeleteExpense(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("transactions").delete().eq("id", id).not("deleted_at", "is", null).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This expense could not be deleted permanently.");
}

export function errorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  const raw = e instanceof Error && e.message ? e.message : (typeof e === "object" && e && "message" in e && typeof (e as { message: unknown }).message === "string") ? (e as { message: string }).message : "";
  if (raw) {
    if (/schema cache/i.test(raw)) {
      return "Database table not found in Supabase. Please run migration 0004_accounts_investments_imports.sql in your Supabase SQL Editor.";
    }
    if (/fetch|network/i.test(raw)) return "Could not reach the server. Check your connection and try again.";
    return raw;
  }
  return fallback;
}
