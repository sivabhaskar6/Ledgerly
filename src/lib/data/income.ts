import type { SupabaseClient } from "@supabase/supabase-js";
import { toIncomeRow, type IncomeFormValues } from "@/lib/validations/income";
import { presetRange, todayISO } from "@/lib/utils/dates";

export type Income = { id: string; title: string; source: string; note: string | null; occurred_on: string; amount_paise: number; created_at: string };
export const INCOME_PAGE_SIZE = 20;

export async function fetchIncome(db: SupabaseClient, page: number) {
  const from = page * INCOME_PAGE_SIZE;
  const { data, count, error } = await db.from("income").select("*", { count: "exact" })
    .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(from, from + INCOME_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as Income[], count: count ?? 0 };
}

export async function fetchIncomeSummary(db: SupabaseClient) {
  const m = presetRange("month"); const y = presetRange("year");
  const { data, error } = await db.rpc("income_summary", { p_today: todayISO(), p_month_start: m.from, p_month_end: m.to, p_year_start: y.from, p_year_end: y.to });
  if (error) throw error;
  const r = (data as { today_paise: number; month_paise: number; year_paise: number }[])[0];
  return { today: Number(r?.today_paise ?? 0), month: Number(r?.month_paise ?? 0), year: Number(r?.year_paise ?? 0) };
}

export async function createIncome(db: SupabaseClient, v: IncomeFormValues) {
  const { data: { user }, error: uerr } = await db.auth.getUser();
  if (uerr || !user) throw new Error("Your session has expired. Log in again.");
  const { error } = await db.from("income").insert({ ...toIncomeRow(v), user_id: user.id });
  if (error) throw error;
}
export async function updateIncome(db: SupabaseClient, id: string, v: IncomeFormValues) {
  const { data, error } = await db.from("income").update(toIncomeRow(v)).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This income entry no longer exists.");
}
export async function deleteIncome(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("income").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This income entry was already deleted.");
}
