import type { SupabaseClient } from "@supabase/supabase-js";
import { toIncomeRow, type IncomeFormValues } from "@/lib/validations/income";
import { presetRange, todayISO } from "@/lib/utils/dates";
import { makeFnoIncomeTitle, syncUnsyncedFnoTrades } from "@/lib/data/fno";

export type Income = {
  id: string;
  title: string;
  source: string;
  note: string | null;
  occurred_on: string;
  amount_paise: number;
  created_at: string;
};

export const INCOME_PAGE_SIZE = 20;

export async function fetchIncome(db: SupabaseClient, page: number) {
  // 1. Attempt to sync any unsynced F&O trades into the database income table
  await syncUnsyncedFnoTrades(db).catch(() => 0);

  const from = page * INCOME_PAGE_SIZE;
  const { data, count, error } = await db
    .from("income")
    .select("*", { count: "exact" })
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + INCOME_PAGE_SIZE - 1);

  if (error) throw error;

  let rows = (data ?? []) as Income[];
  let totalCount = count ?? 0;

  // 2. Fallback synthesis for any unsynced trades (e.g. if database check constraint is pending)
  try {
    const { data: unsyncedTrades } = await db
      .from("fno_trades")
      .select("id, symbol, instrument_type, strike_price_paise, net_pnl_paise, occurred_on, note, created_at")
      .is("income_id", null)
      .neq("net_pnl_paise", 0)
      .order("occurred_on", { ascending: false });

    if (unsyncedTrades && unsyncedTrades.length > 0) {
      const syntheticRows: Income[] = unsyncedTrades.map((t) => ({
        id: `fno_${t.id}`,
        title: makeFnoIncomeTitle({
          symbol: t.symbol,
          strike_price_paise: t.strike_price_paise,
          instrument_type: t.instrument_type,
          net_pnl_paise: t.net_pnl_paise,
        }),
        source: "fno_trading",
        occurred_on: t.occurred_on,
        amount_paise: t.net_pnl_paise,
        note: t.note || (t.net_pnl_paise >= 0 ? "Realized F&O profit" : "Realized F&O loss"),
        created_at: t.created_at,
      }));

      const combined = [...rows, ...syntheticRows].sort((a, b) => {
        if (a.occurred_on !== b.occurred_on) {
          return b.occurred_on.localeCompare(a.occurred_on);
        }
        return b.created_at.localeCompare(a.created_at);
      });

      totalCount += syntheticRows.length;
      rows = combined.slice(from, from + INCOME_PAGE_SIZE);
    }
  } catch {
    // fno_trades table might not exist yet
  }

  return { rows, count: totalCount };
}

export async function fetchIncomeSummary(db: SupabaseClient) {
  const m = presetRange("month");
  const y = presetRange("year");
  const today = todayISO();

  // Try to sync any unsynced F&O trades first
  await syncUnsyncedFnoTrades(db).catch(() => 0);

  let todayPaise = 0;
  let monthPaise = 0;
  let yearPaise = 0;

  try {
    const { data, error } = await db.rpc("income_summary", {
      p_today: today,
      p_month_start: m.from,
      p_month_end: m.to,
      p_year_start: y.from,
      p_year_end: y.to,
    });
    if (!error && data) {
      const r = (data as { today_paise: number; month_paise: number; year_paise: number }[])[0];
      todayPaise = Number(r?.today_paise ?? 0);
      monthPaise = Number(r?.month_paise ?? 0);
      yearPaise = Number(r?.year_paise ?? 0);
    } else {
      // Direct sum fallback if RPC is unavailable
      const { data: incRows } = await db.from("income").select("amount_paise, occurred_on");
      if (incRows) {
        for (const row of incRows) {
          const amt = Number(row.amount_paise || 0);
          if (row.occurred_on === today) todayPaise += amt;
          if (row.occurred_on >= m.from && row.occurred_on <= m.to) monthPaise += amt;
          if (row.occurred_on >= y.from && row.occurred_on <= y.to) yearPaise += amt;
        }
      }
    }
  } catch {
    // Continue
  }

  // Factor in any remaining unsynced F&O trades (where income_id is null)
  try {
    const { data: unsyncedTrades } = await db
      .from("fno_trades")
      .select("net_pnl_paise, occurred_on")
      .is("income_id", null);

    if (unsyncedTrades) {
      for (const t of unsyncedTrades) {
        const net = Number(t.net_pnl_paise || 0);
        if (t.occurred_on === today) todayPaise += net;
        if (t.occurred_on >= m.from && t.occurred_on <= m.to) monthPaise += net;
        if (t.occurred_on >= y.from && t.occurred_on <= y.to) yearPaise += net;
      }
    }
  } catch {
    // fno_trades table might not exist
  }

  return { today: todayPaise, month: monthPaise, year: yearPaise };
}

export async function createIncome(db: SupabaseClient, v: IncomeFormValues) {
  const {
    data: { user },
    error: uerr,
  } = await db.auth.getUser();
  if (uerr || !user) throw new Error("Your session has expired. Log in again.");

  const row = toIncomeRow(v);

  const { error } = await db.from("income").insert({ ...row, user_id: user.id });
  if (error) throw error;
}

export async function updateIncome(db: SupabaseClient, id: string, v: IncomeFormValues) {
  if (id.startsWith("fno_")) {
    throw new Error("This entry is managed by the F&O Trading Journal. Please edit it under F&O.");
  }
  const { data, error } = await db.from("income").update(toIncomeRow(v)).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This income entry no longer exists.");
}

export async function deleteIncome(db: SupabaseClient, id: string) {
  if (id.startsWith("fno_")) {
    const tradeId = id.slice(4);
    const { error } = await db.from("fno_trades").delete().eq("id", tradeId);
    if (error) throw error;
    return;
  }

  // If this income entry was linked to an F&O trade, unlink it
  try {
    await db.from("fno_trades").update({ income_id: null }).eq("income_id", id);
  } catch {
    // ignore
  }

  const { data, error } = await db.from("income").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This income entry was already deleted.");
}
